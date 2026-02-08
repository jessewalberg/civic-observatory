import { v } from "convex/values";
import { internalQuery, query } from "../../_generated/server";

export const getByWorkosUserId = query({
	args: {
		workosUserId: v.string(),
	},
	handler: async (ctx, args) => {
		return await ctx.db
			.query("users")
			.withIndex("by_workos_id", (q) => q.eq("workosUserId", args.workosUserId))
			.first();
	},
});

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

// Internal version for use in actions
export const getByWorkosUserIdInternal = internalQuery({
	args: {
		workosUserId: v.string(),
	},
	handler: async (ctx, args) => {
		return await ctx.db
			.query("users")
			.withIndex("by_workos_id", (q) => q.eq("workosUserId", args.workosUserId))
			.first();
	},
});

// Check if user is admin by workos ID
export const isAdmin = query({
	args: {
		workosUserId: v.string(),
	},
	handler: async (ctx, args) => {
		const user = await ctx.db
			.query("users")
			.withIndex("by_workos_id", (q) => q.eq("workosUserId", args.workosUserId))
			.first();
		return user?.isAdmin === true;
	},
});

// Get all users (admin only)
export const listAll = query({
	args: {
		requestingWorkosUserId: v.string(),
		limit: v.optional(v.number()),
		offset: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		// Check if requester is admin
		const caller = await ctx.db
			.query("users")
			.withIndex("by_workos_id", (q) =>
				q.eq("workosUserId", args.requestingWorkosUserId),
			)
			.first();

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
	args: {
		requestingWorkosUserId: v.string(),
	},
	handler: async (ctx, args) => {
		// Check if requester is admin
		const caller = await ctx.db
			.query("users")
			.withIndex("by_workos_id", (q) =>
				q.eq("workosUserId", args.requestingWorkosUserId),
			)
			.first();

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
