import { mutation } from "../../_generated/server";
import { v } from "convex/values";
import { SUBSCRIPTION_LIMITS } from "../../lib/constants/limits";

// ═══════════════════════════════════════════════════════════════
// CREATE - Create a new subscription with limit check
// ═══════════════════════════════════════════════════════════════
export const create = mutation({
  args: {
    userId: v.id("users"),
    municipalityId: v.id("municipalities"),
    topicFilters: v.optional(v.array(v.string())),
    meetingTypes: v.optional(v.array(v.string())),
    keywordsInclude: v.optional(v.array(v.string())),
    keywordsExclude: v.optional(v.array(v.string())),
    alertFrequency: v.union(
      v.literal("immediate"),
      v.literal("daily"),
      v.literal("weekly")
    ),
    emailEnabled: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    // Get user to check tier
    const user = await ctx.db.get(args.userId);
    if (!user) {
      throw new Error("User not found");
    }

    // Get subscription limit for user's tier
    const tier = user.tier || "free";
    const limit = SUBSCRIPTION_LIMITS[tier]?.subscriptions ?? 0;

    // Count existing subscriptions
    const existingSubscriptions = await ctx.db
      .query("subscriptions")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    // Check limit
    if (limit !== Infinity && existingSubscriptions.length >= limit) {
      throw new Error(
        `Subscription limit reached. ${tier === "free" ? "Upgrade to Pro for unlimited subscriptions." : ""}`
      );
    }

    // Check if already subscribed to this municipality
    const existingForMunicipality = existingSubscriptions.find(
      (sub) => sub.municipalityId === args.municipalityId
    );
    if (existingForMunicipality) {
      throw new Error("Already subscribed to this municipality");
    }

    // Verify municipality exists
    const municipality = await ctx.db.get(args.municipalityId);
    if (!municipality) {
      throw new Error("Municipality not found");
    }

    // Create subscription
    const subscriptionId = await ctx.db.insert("subscriptions", {
      userId: args.userId,
      municipalityId: args.municipalityId,
      topicFilters: args.topicFilters,
      meetingTypes: args.meetingTypes,
      keywordsInclude: args.keywordsInclude,
      keywordsExclude: args.keywordsExclude,
      alertFrequency: args.alertFrequency,
      emailEnabled: args.emailEnabled ?? true,
      isActive: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    return subscriptionId;
  },
});

// ═══════════════════════════════════════════════════════════════
// UPDATE - Update subscription filters and frequency
// ═══════════════════════════════════════════════════════════════
export const update = mutation({
  args: {
    subscriptionId: v.id("subscriptions"),
    userId: v.id("users"), // For authorization
    topicFilters: v.optional(v.array(v.string())),
    meetingTypes: v.optional(v.array(v.string())),
    keywordsInclude: v.optional(v.array(v.string())),
    keywordsExclude: v.optional(v.array(v.string())),
    alertFrequency: v.optional(
      v.union(
        v.literal("immediate"),
        v.literal("daily"),
        v.literal("weekly")
      )
    ),
    emailEnabled: v.optional(v.boolean()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    // Get subscription
    const subscription = await ctx.db.get(args.subscriptionId);
    if (!subscription) {
      throw new Error("Subscription not found");
    }

    // Verify ownership
    if (subscription.userId !== args.userId) {
      throw new Error("Not authorized to update this subscription");
    }

    // Build updates
    const updates: Record<string, unknown> = {
      updatedAt: Date.now(),
    };

    if (args.topicFilters !== undefined) {
      updates.topicFilters = args.topicFilters;
    }
    if (args.meetingTypes !== undefined) {
      updates.meetingTypes = args.meetingTypes;
    }
    if (args.keywordsInclude !== undefined) {
      updates.keywordsInclude = args.keywordsInclude;
    }
    if (args.keywordsExclude !== undefined) {
      updates.keywordsExclude = args.keywordsExclude;
    }
    if (args.alertFrequency !== undefined) {
      updates.alertFrequency = args.alertFrequency;
    }
    if (args.emailEnabled !== undefined) {
      updates.emailEnabled = args.emailEnabled;
    }
    if (args.isActive !== undefined) {
      updates.isActive = args.isActive;
    }

    await ctx.db.patch(args.subscriptionId, updates);

    return { success: true };
  },
});

// ═══════════════════════════════════════════════════════════════
// DELETE - Delete subscription and cancel pending alerts
// ═══════════════════════════════════════════════════════════════
export const remove = mutation({
  args: {
    subscriptionId: v.id("subscriptions"),
    userId: v.id("users"), // For authorization
  },
  handler: async (ctx, args) => {
    // Get subscription
    const subscription = await ctx.db.get(args.subscriptionId);
    if (!subscription) {
      throw new Error("Subscription not found");
    }

    // Verify ownership
    if (subscription.userId !== args.userId) {
      throw new Error("Not authorized to delete this subscription");
    }

    // Cancel any pending alerts for this subscription
    const pendingAlerts = await ctx.db
      .query("alerts")
      .filter((q) =>
        q.and(
          q.eq(q.field("subscriptionId"), args.subscriptionId),
          q.or(
            q.eq(q.field("status"), "pending"),
            q.eq(q.field("status"), "queued")
          )
        )
      )
      .collect();

    // Mark pending alerts as skipped
    for (const alert of pendingAlerts) {
      await ctx.db.patch(alert._id, {
        status: "skipped",
      });
    }

    // Delete the subscription
    await ctx.db.delete(args.subscriptionId);

    return { success: true, cancelledAlerts: pendingAlerts.length };
  },
});

// ═══════════════════════════════════════════════════════════════
// TOGGLE ACTIVE - Quick toggle for subscription active status
// ═══════════════════════════════════════════════════════════════
export const toggleActive = mutation({
  args: {
    subscriptionId: v.id("subscriptions"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const subscription = await ctx.db.get(args.subscriptionId);
    if (!subscription) {
      throw new Error("Subscription not found");
    }

    if (subscription.userId !== args.userId) {
      throw new Error("Not authorized to update this subscription");
    }

    await ctx.db.patch(args.subscriptionId, {
      isActive: !subscription.isActive,
      updatedAt: Date.now(),
    });

    return { isActive: !subscription.isActive };
  },
});

// ═══════════════════════════════════════════════════════════════
// UPDATE FREQUENCY - Quick update for alert frequency
// ═══════════════════════════════════════════════════════════════
export const updateFrequency = mutation({
  args: {
    subscriptionId: v.id("subscriptions"),
    userId: v.id("users"),
    alertFrequency: v.union(
      v.literal("immediate"),
      v.literal("daily"),
      v.literal("weekly")
    ),
  },
  handler: async (ctx, args) => {
    const subscription = await ctx.db.get(args.subscriptionId);
    if (!subscription) {
      throw new Error("Subscription not found");
    }

    if (subscription.userId !== args.userId) {
      throw new Error("Not authorized to update this subscription");
    }

    // Check if user can use immediate alerts (Pro only)
    if (args.alertFrequency === "immediate") {
      const user = await ctx.db.get(args.userId);
      if (user?.tier !== "pro") {
        throw new Error("Immediate alerts are only available for Pro users");
      }
    }

    await ctx.db.patch(args.subscriptionId, {
      alertFrequency: args.alertFrequency,
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});
