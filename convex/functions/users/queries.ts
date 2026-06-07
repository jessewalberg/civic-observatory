import { v } from "convex/values";
import { internalQuery, query } from "../../_generated/server";
import { getCurrentUser } from "../../lib/auth";

export const getById = query({
	args: {
		userId: v.id("users"),
	},
	handler: async (ctx, args) => {
		return await ctx.db.get(args.userId);
	},
});

export const getByEmail = query({
	args: {
		email: v.string(),
	},
	handler: async (ctx, args) => {
		return await ctx.db
			.query("users")
			.withIndex("by_email", (q) => q.eq("email", args.email))
			.first();
	},
});

/**
 * Identity-first caller resolution for ACTIONS. An action's ctx.auth identity
 * propagates through ctx.runQuery, so an action resolves its caller by calling
 * this. Returns null when unauthenticated / no matching row.
 */
export const getCurrentInternal = internalQuery({
	args: {},
	handler: async (ctx) => {
		return await getCurrentUser(ctx);
	},
});

// Check whether the current Clerk caller is an admin
export const isAdmin = query({
	args: {},
	handler: async (ctx) => {
		const user = await getCurrentUser(ctx);
		return user?.isAdmin === true;
	},
});

/** Phase 2: the identity-resolved caller (null when signed out / unclaimed). */
export const current = query({
	args: {},
	handler: async (ctx) => {
		return await getCurrentUser(ctx);
	},
});

// Admin bootstrap status
export const getAdminBootstrapStatus = query({
	args: {},
	handler: async (ctx) => {
		const users = await ctx.db.query("users").collect();
		const adminCount = users.filter((u) => u.isAdmin === true).length;
		const hasAnyAdmin = adminCount > 0;

		let requesterExists = false;
		let requesterIsAdmin = false;

		const requester = await getCurrentUser(ctx);
		requesterExists = Boolean(requester);
		requesterIsAdmin = requester?.isAdmin === true;

		return {
			totalUsers: users.length,
			adminCount,
			hasAnyAdmin,
			requesterExists,
			requesterIsAdmin,
			canClaimInitialAdmin: requesterExists && !hasAnyAdmin,
		};
	},
});

// Get all users (admin only)
export const listAll = query({
	args: {
		limit: v.optional(v.number()),
		offset: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const caller = await getCurrentUser(ctx);

		if (!caller?.isAdmin) {
			return [];
		}

		const limit = args.limit ?? 50;
		const allUsers = await ctx.db.query("users").order("desc").collect();

		// Apply offset and limit for pagination
		const offset = args.offset ?? 0;
		const paginatedUsers = allUsers.slice(offset, offset + limit);

		return {
			users: paginatedUsers,
			total: allUsers.length,
			hasMore: offset + limit < allUsers.length,
		};
	},
});

// Get admin stats (admin only)
export const getAdminStats = query({
	args: {},
	handler: async (ctx) => {
		const caller = await getCurrentUser(ctx);

		if (!caller?.isAdmin) {
			return null;
		}

		const users = await ctx.db.query("users").collect();

		const totalUsers = users.length;
		const freeUsers = users.filter((u) => u.tier === "free").length;
		const proUsers = users.filter((u) => u.tier === "pro").length;
		const adminUsers = users.filter((u) => u.isAdmin === true).length;

		// Users in last 7 days
		const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
		const newUsersThisWeek = users.filter((u) => u.createdAt > weekAgo).length;
		const activeUsersThisWeek = users.filter(
			(u) => u.lastLoginAt > weekAgo,
		).length;

		// Users in last 30 days
		const monthAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
		const newUsersThisMonth = users.filter(
			(u) => u.createdAt > monthAgo,
		).length;
		const activeUsersThisMonth = users.filter(
			(u) => u.lastLoginAt > monthAgo,
		).length;

		return {
			totalUsers,
			freeUsers,
			proUsers,
			adminUsers,
			newUsersThisWeek,
			activeUsersThisWeek,
			newUsersThisMonth,
			activeUsersThisMonth,
		};
	},
});
