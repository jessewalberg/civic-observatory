import { v } from "convex/values";
import { mutation } from "../../_generated/server";
import { getCurrentUser, getIdentity, requireAdmin } from "../../lib/auth";

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

		// CREATE-ONLY, keyed on the Clerk subject. No claim-by-email (that would
		// be a row-takeover primitive). First Clerk login always makes a FRESH
		// user; WorkOS-era history is not carried over — owner accepted, no
		// backwards compat (ADR-0001 / migration plan 2026-06-06).
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
	},
	handler: async (ctx, args) => {
		await requireAdmin(ctx, "Only admins can modify admin status");
		await ctx.db.patch(args.userId, { isAdmin: args.isAdmin });
	},
});

// Claim initial admin if the system currently has zero admins.
export const claimInitialAdmin = mutation({
	args: {},
	handler: async (ctx) => {
		const requester = await getCurrentUser(ctx);

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
	},
	handler: async (ctx, args) => {
		await requireAdmin(ctx, "Admin access required");

		const updates: { tier?: "free" | "pro"; isAdmin?: boolean } = {};
		if (args.tier !== undefined) updates.tier = args.tier;
		if (args.isAdmin !== undefined) updates.isAdmin = args.isAdmin;

		if (Object.keys(updates).length > 0) {
			await ctx.db.patch(args.userId, updates);
		}
	},
});
