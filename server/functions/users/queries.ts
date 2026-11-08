import { z } from "zod";
import { entityId } from "../../id";
import { getCurrentUser } from "../../lib/auth";
import { defineRead, privateRead } from "../../procedure";
export const getById = defineRead({
	args: {
		userId: entityId("users"),
	},
	handler: async (ctx, args) => {
		return await ctx.data.find(args.userId);
	},
});
export const getByEmail = defineRead({
	args: {
		email: z.string(),
	},
	handler: async (ctx, args) => {
		return await ctx.data
			.select("users")
			.orderBy(["email", "_creationTime", "_id"])
			.where("email", "=", args.email)
			.one();
	},
});
/**
 * Identity-first caller resolution for ACTIONS. An action's ctx.auth identity
 * propagates through ctx.runQuery, so an action resolves its caller by calling
 * this. Returns null when unauthenticated / no matching row.
 */
export const getCurrentInternal = privateRead({
	args: {},
	handler: async (ctx) => {
		return await getCurrentUser(ctx);
	},
});
export const isAdmin = defineRead({
	args: {},
	handler: async (ctx) => {
		const user = await getCurrentUser(ctx);
		return user?.isAdmin === true;
	},
});
export const current = defineRead({
	args: {},
	handler: async (ctx) => {
		return await getCurrentUser(ctx);
	},
});
// Admin bootstrap status
export const getAdminBootstrapStatus = defineRead({
	args: {},
	handler: async (ctx) => {
		const users = await ctx.data.select("users").all();
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
export const listAll = defineRead({
	args: {
		limit: z.number().optional(),
		offset: z.number().optional(),
	},
	handler: async (ctx, args) => {
		const caller = await getCurrentUser(ctx);
		if (!caller?.isAdmin) {
			return [];
		}
		const limit = args.limit ?? 50;
		const allUsers = await ctx.data.select("users").direction("desc").all();
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
export const getAdminStats = defineRead({
	args: {},
	handler: async (ctx) => {
		const caller = await getCurrentUser(ctx);
		if (!caller?.isAdmin) {
			return null;
		}
		const users = await ctx.data.select("users").all();
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
