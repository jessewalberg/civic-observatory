import { mutation } from "../../_generated/server";
import { v } from "convex/values";

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
