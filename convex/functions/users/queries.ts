import { query, internalQuery } from "../../_generated/server";
import { v } from "convex/values";

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
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 100;
    return await ctx.db.query("users").order("desc").take(limit);
  },
});

// Get admin stats
export const getAdminStats = query({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query("users").collect();

    const totalUsers = users.length;
    const freeUsers = users.filter((u) => u.tier === "free").length;
    const proUsers = users.filter((u) => u.tier === "pro").length;
    const adminUsers = users.filter((u) => u.isAdmin === true).length;

    // Users in last 7 days
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const newUsersThisWeek = users.filter((u) => u.createdAt > weekAgo).length;
    const activeUsersThisWeek = users.filter((u) => u.lastLoginAt > weekAgo).length;

    return {
      totalUsers,
      freeUsers,
      proUsers,
      adminUsers,
      newUsersThisWeek,
      activeUsersThisWeek,
    };
  },
});
