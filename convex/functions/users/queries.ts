import { v } from "convex/values";
import { internalQuery, query } from "../../_generated/server";
import { getCurrentUser } from "../../lib/auth";

export const getByWorkosUserId = query({
	args: {
		// Legacy (no-identity) callers only; IGNORED when a Clerk identity is
		// present — otherwise any signed-in user could read any row by guessing
		// a workosUserId. Under Clerk this returns the caller's OWN user.
		workosUserId: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		return await getCurrentUser(ctx, args.workosUserId);
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
/**
 * Identity-first caller resolution for ACTIONS (plan §3 Phase 2). An action's
 * ctx.auth identity propagates through ctx.runQuery, so an action can resolve
 * its caller by calling this and ignoring any client-supplied workosUserId when
 * a Clerk identity is present. Returns null when neither resolves.
 */
export const getCurrentInternal = internalQuery({
	args: { workosUserId: v.optional(v.string()) },
	handler: async (ctx, args) => {
		return await getCurrentUser(ctx, args.workosUserId);
	},
});

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
		// Legacy (no-identity) callers only; IGNORED when a Clerk identity is
		// present. Removed in Phase 5.
		workosUserId: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const user = await getCurrentUser(ctx, args.workosUserId);
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
	args: {
		workosUserId: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const users = await ctx.db.query("users").collect();
		const adminCount = users.filter((u) => u.isAdmin === true).length;
		const hasAnyAdmin = adminCount > 0;

		let requesterExists = false;
		let requesterIsAdmin = false;

		const requester = await getCurrentUser(ctx, args.workosUserId);
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
		// Legacy (no-identity) callers only; IGNORED when a Clerk identity is
		// present. Removed in Phase 5.
		requestingWorkosUserId: v.optional(v.string()),
		limit: v.optional(v.number()),
		offset: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const caller = await getCurrentUser(ctx, args.requestingWorkosUserId);

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
		// Legacy (no-identity) callers only; IGNORED when a Clerk identity is
		// present. Removed in Phase 5.
		requestingWorkosUserId: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const caller = await getCurrentUser(ctx, args.requestingWorkosUserId);

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
