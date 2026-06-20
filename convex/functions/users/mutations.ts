import { v } from "convex/values";
import { mutation } from "../../_generated/server";
import {
	ensureCurrentUserFromIdentity,
	getCurrentUser,
	requireAdmin,
} from "../../lib/auth";

/**
 * Phase-2/6 identity bootstrap: on the first authenticated Clerk call, create
 * a fresh app user keyed by the Clerk subject. There is deliberately no
 * claim-by-email and no WorkOS-era fallback.
 */
export const ensureFromIdentity = mutation({
	args: {},
	handler: async (ctx) => {
		return (await ensureCurrentUserFromIdentity(ctx))._id;
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
