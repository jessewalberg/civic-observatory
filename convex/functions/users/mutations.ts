import { v } from "convex/values";
import { mutation } from "../../_generated/server";
import { getCurrentUser, getIdentity, requireAdmin } from "../../lib/auth";

export const upsertOnLogin = mutation({
	args: {
		workosUserId: v.string(),
		email: v.string(),
		name: v.optional(v.string()),
		avatarUrl: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		// Legacy WorkOS callback ONLY. Under a Clerk identity the login path is
		// ensureFromIdentity; allowing this would let a Clerk-authenticated caller
		// rewrite an arbitrary WorkOS-era row's email (by client-supplied
		// workosUserId) and then claim it by email. Refuse.
		if (await getIdentity(ctx)) {
			throw new Error("upsertOnLogin is disabled under Clerk; use ensureFromIdentity");
		}
		const existing = await ctx.db
			.query("users")
			.withIndex("by_workos_id", (q) => q.eq("workosUserId", args.workosUserId))
			.first();

		const now = Date.now();

		if (existing) {
			// Update on login
			await ctx.db.patch(existing._id, {
				email: args.email,
				name: args.name,
				avatarUrl: args.avatarUrl,
				lastLoginAt: now,
			});
			return existing._id;
		}

		// Create new user
		return await ctx.db.insert("users", {
			workosUserId: args.workosUserId,
			email: args.email,
			name: args.name,
			avatarUrl: args.avatarUrl,
			tier: "free",
			createdAt: now,
			lastLoginAt: now,
		});
	},
});

/**
 * Phase-2 lazy claim/create (plan §2.6 option b): on the first authenticated
 * Clerk call, link the identity to an existing row (matched by email, only if
 * that row is not already owned by another Clerk user) or create a fresh one.
 * Identity-only — there is deliberately NO legacy fallback here.
 */
export const ensureFromIdentity = mutation({
	args: {},
	handler: async (ctx) => {
		const identity = await getIdentity(ctx);
		if (!identity) {
			throw new Error("Not authenticated");
		}
		const now = Date.now();

		const byClerkId = await ctx.db
			.query("users")
			.withIndex("by_clerk_id", (q) => q.eq("clerkUserId", identity.subject))
			.unique();
		if (byClerkId) {
			await ctx.db.patch(byClerkId._id, { lastLoginAt: now });
			return byClerkId._id;
		}

		// CREATE-ONLY. No claim-by-email: upsertOnLogin is an unauthenticated
		// public mutation (the WorkOS callback runs pre-session), so any caller
		// can rewrite an arbitrary row's email and then claim it — a row-takeover
		// primitive. First Clerk login always makes a FRESH user; WorkOS-era
		// history is not carried over (owner accepted, no backwards compat). See
		// the migration plan's 2026-06-06 remapping decision.
		const email = identity.email;
		return await ctx.db.insert("users", {
			clerkUserId: identity.subject,
			email: email ?? "",
			name: typeof identity.name === "string" ? identity.name : undefined,
			tier: "free",
			createdAt: now,
			lastLoginAt: now,
		});
	},
});

export const updateTier = mutation({
	args: {
		userId: v.id("users"),
		tier: v.union(v.literal("free"), v.literal("pro")),
		stripeCustomerId: v.optional(v.string()),
		stripeSubscriptionId: v.optional(v.string()),
		stripeCurrentPeriodEnd: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const { userId, ...updates } = args;
		await ctx.db.patch(userId, updates);
	},
});

// Set admin status (admin only)
export const setAdminStatus = mutation({
	args: {
		userId: v.id("users"),
		isAdmin: v.boolean(),
		// Legacy (no-identity) callers only; IGNORED when a Clerk identity is
		// present. Removed in Phase 5.
		requestingWorkosUserId: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		await requireAdmin(ctx, args.requestingWorkosUserId, "Only admins can modify admin status");
		await ctx.db.patch(args.userId, { isAdmin: args.isAdmin });
	},
});

// Claim initial admin if the system currently has zero admins.
export const claimInitialAdmin = mutation({
	args: {
		// Legacy (no-identity) callers only; IGNORED when a Clerk identity is
		// present. Removed in Phase 5.
		requestingWorkosUserId: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const requester = await getCurrentUser(ctx, args.requestingWorkosUserId);

		if (!requester) {
			throw new Error("User not found. Please sign in first.");
		}

		const existingAdmin = await ctx.db
			.query("users")
			.filter((q) => q.eq(q.field("isAdmin"), true))
			.first();

		if (existingAdmin) {
			throw new Error("An admin already exists. Ask an admin to grant access.");
		}

		await ctx.db.patch(requester._id, { isAdmin: true });

		return {
			success: true,
			userId: requester._id,
		};
	},
});

// Update user tier (admin only)
export const adminUpdateUser = mutation({
	args: {
		userId: v.id("users"),
		tier: v.optional(v.union(v.literal("free"), v.literal("pro"))),
		isAdmin: v.optional(v.boolean()),
		// Legacy (no-identity) callers only; IGNORED when a Clerk identity is
		// present. Removed in Phase 5.
		requestingWorkosUserId: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		await requireAdmin(ctx, args.requestingWorkosUserId, "Admin access required");

		const updates: { tier?: "free" | "pro"; isAdmin?: boolean } = {};
		if (args.tier !== undefined) updates.tier = args.tier;
		if (args.isAdmin !== undefined) updates.isAdmin = args.isAdmin;

		if (Object.keys(updates).length > 0) {
			await ctx.db.patch(args.userId, updates);
		}
	},
});
