import { mutation } from "../../_generated/server";
import { v } from "convex/values";
import { LIMITS } from "../../lib/constants/limits";

// Get the start of the current day in UTC
function getDayStart(): number {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  ).getTime();
}

// Get the start of the current month in UTC
function getMonthStart(): number {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
  ).getTime();
}

export const recordUsage = mutation({
  args: {
    userId: v.optional(v.id("users")),
    ipHash: v.optional(v.string()),
    action: v.union(
      v.literal("summary_view"),
      v.literal("meeting_upload"),
      v.literal("api_request"),
      v.literal("alert_sent")
    ),
    windowType: v.union(
      v.literal("hour"),
      v.literal("day"),
      v.literal("month")
    ),
  },
  handler: async (ctx, args) => {
    const windowStart =
      args.windowType === "month" ? getMonthStart() : getDayStart();

    // Find existing record
    let existing;
    if (args.userId) {
      existing = await ctx.db
        .query("usageRecords")
        .withIndex("by_user_action_window", (q) =>
          q
            .eq("userId", args.userId)
            .eq("action", args.action)
            .eq("windowType", args.windowType)
            .eq("windowStart", windowStart)
        )
        .first();
    } else if (args.ipHash) {
      existing = await ctx.db
        .query("usageRecords")
        .withIndex("by_ip_action_window", (q) =>
          q
            .eq("ipHash", args.ipHash)
            .eq("action", args.action)
            .eq("windowType", args.windowType)
            .eq("windowStart", windowStart)
        )
        .first();
    }

    if (existing) {
      await ctx.db.patch(existing._id, {
        count: existing.count + 1,
      });
      return existing.count + 1;
    }

    await ctx.db.insert("usageRecords", {
      userId: args.userId,
      ipHash: args.ipHash,
      action: args.action,
      windowType: args.windowType,
      windowStart,
      count: 1,
    });
    return 1;
  },
});

export const checkAndRecordUsage = mutation({
  args: {
    userId: v.optional(v.id("users")),
    ipHash: v.optional(v.string()),
    tier: v.union(
      v.literal("anonymous"),
      v.literal("free"),
      v.literal("pro")
    ),
    action: v.union(
      v.literal("summary_view"),
      v.literal("meeting_upload"),
      v.literal("api_request"),
      v.literal("alert_sent")
    ),
  },
  handler: async (ctx, args) => {
    const tierLimits = LIMITS[args.tier];
    const actionLimits = tierLimits[args.action as keyof typeof tierLimits] as
      | { hour?: number; day?: number; month?: number }
      | undefined;

    if (!actionLimits) {
      // No limit defined for this action/tier combo - allow
      return { allowed: true, remaining: Infinity };
    }

    // Check each window type that has a limit
    for (const [windowType, limit] of Object.entries(actionLimits) as [
      "hour" | "day" | "month",
      number
    ][]) {
      if (limit === Infinity) continue;

      const windowStart =
        windowType === "month" ? getMonthStart() : getDayStart();

      let existing;
      if (args.userId) {
        existing = await ctx.db
          .query("usageRecords")
          .withIndex("by_user_action_window", (q) =>
            q
              .eq("userId", args.userId)
              .eq("action", args.action)
              .eq("windowType", windowType)
              .eq("windowStart", windowStart)
          )
          .first();
      } else if (args.ipHash) {
        existing = await ctx.db
          .query("usageRecords")
          .withIndex("by_ip_action_window", (q) =>
            q
              .eq("ipHash", args.ipHash)
              .eq("action", args.action)
              .eq("windowType", windowType)
              .eq("windowStart", windowStart)
          )
          .first();
      }

      const currentCount = existing?.count ?? 0;

      if (currentCount >= limit) {
        return {
          allowed: false,
          remaining: 0,
          limit,
          windowType,
        };
      }
    }

    // All limits passed - record the usage
    const windowStart = getDayStart();
    const windowType = "day" as const;

    let existing;
    if (args.userId) {
      existing = await ctx.db
        .query("usageRecords")
        .withIndex("by_user_action_window", (q) =>
          q
            .eq("userId", args.userId)
            .eq("action", args.action)
            .eq("windowType", windowType)
            .eq("windowStart", windowStart)
        )
        .first();
    } else if (args.ipHash) {
      existing = await ctx.db
        .query("usageRecords")
        .withIndex("by_ip_action_window", (q) =>
          q
            .eq("ipHash", args.ipHash)
            .eq("action", args.action)
            .eq("windowType", windowType)
            .eq("windowStart", windowStart)
        )
        .first();
    }

    if (existing) {
      await ctx.db.patch(existing._id, {
        count: existing.count + 1,
      });
    } else {
      await ctx.db.insert("usageRecords", {
        userId: args.userId,
        ipHash: args.ipHash,
        action: args.action,
        windowType,
        windowStart,
        count: 1,
      });
    }

    const dayLimit = actionLimits.day ?? Infinity;
    const currentCount = existing?.count ?? 0;

    return {
      allowed: true,
      remaining: dayLimit === Infinity ? Infinity : dayLimit - currentCount - 1,
      limit: dayLimit,
      windowType: "day",
    };
  },
});
