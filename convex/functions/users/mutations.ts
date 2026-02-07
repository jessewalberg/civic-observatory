import { v } from "convex/values";
import { mutation } from "../../_generated/server";

export const upsertOnLogin = mutation({
	args: {
		workosUserId: v.string(),
		email: v.string(),
		name: v.optional(v.string()),
		avatarUrl: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
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
		requestingWorkosUserId: v.string(),
	},
	handler: async (ctx, args) => {
		// Check if requester is admin
		const requester = await ctx.db
			.query("users")
			.withIndex("by_workos_id", (q) =>
				q.eq("workosUserId", args.requestingWorkosUserId),
			)
			.first();

		if (!requester?.isAdmin) {
			throw new Error("Only admins can modify admin status");
		}

		await ctx.db.patch(args.userId, { isAdmin: args.isAdmin });
	},
});

// Update user tier (admin only)
export const adminUpdateUser = mutation({
	args: {
		userId: v.id("users"),
		tier: v.optional(v.union(v.literal("free"), v.literal("pro"))),
		isAdmin: v.optional(v.boolean()),
		requestingWorkosUserId: v.string(),
	},
	handler: async (ctx, args) => {
		// Check if requester is admin
		const requester = await ctx.db
			.query("users")
			.withIndex("by_workos_id", (q) =>
				q.eq("workosUserId", args.requestingWorkosUserId),
			)
			.first();

		if (!requester?.isAdmin) {
			throw new Error("Admin access required");
		}

		const updates: { tier?: "free" | "pro"; isAdmin?: boolean } = {};
		if (args.tier !== undefined) updates.tier = args.tier;
		if (args.isAdmin !== undefined) updates.isAdmin = args.isAdmin;

		if (Object.keys(updates).length > 0) {
			await ctx.db.patch(args.userId, updates);
		}
	},
});
