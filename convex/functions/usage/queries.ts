import { query } from "../../_generated/server";
import { v } from "convex/values";
import { LIMITS, type Tier, type Action } from "../../lib/constants/limits";

// ═══════════════════════════════════════════════════════════════
// GET USAGE COUNT - Current usage for a user/action/window
// ═══════════════════════════════════════════════════════════════
export const getUsageCount = query({
  args: {
    workosUserId: v.optional(v.string()),
    action: v.union(
      v.literal("summary_view"),
      v.literal("meeting_upload"),
      v.literal("api_request"),
      v.literal("alert_sent")
    ),
    windowType: v.union(v.literal("hour"), v.literal("day"), v.literal("month")),
  },
  handler: async (ctx, args) => {
    if (!args.workosUserId) {
      return { count: 0, windowStart: 0 };
    }

    const workosUserId = args.workosUserId;

    // Get user
    const user = await ctx.db
      .query("users")
      .withIndex("by_workos_id", (q) => q.eq("workosUserId", workosUserId))
      .first();

    if (!user) {
      return { count: 0, windowStart: 0 };
    }

    const windowStart = getWindowStart(args.windowType);

    const record = await ctx.db
      .query("usageRecords")
      .withIndex("by_user_action_window", (q) =>
        q
          .eq("userId", user._id)
          .eq("action", args.action)
          .eq("windowType", args.windowType)
          .eq("windowStart", windowStart)
      )
      .first();

    return {
      count: record?.count ?? 0,
      windowStart,
    };
  },
});

// ═══════════════════════════════════════════════════════════════
// CHECK LIMIT - Check if user can perform an action
// ═══════════════════════════════════════════════════════════════
export const checkLimit = query({
  args: {
    workosUserId: v.optional(v.string()),
    action: v.union(
      v.literal("summary_view"),
      v.literal("meeting_upload"),
      v.literal("api_request"),
      v.literal("alert_sent")
    ),
  },
  handler: async (ctx, args) => {
    // Determine tier
    let tier: Tier = "anonymous";
    let userId = null;

    if (args.workosUserId) {
      const workosUserId = args.workosUserId;
      const user = await ctx.db
        .query("users")
        .withIndex("by_workos_id", (q) => q.eq("workosUserId", workosUserId))
        .first();

      if (user) {
        tier = user.tier as Tier;
        userId = user._id;
      }
    }

    // Get limits for this tier/action
    const tierLimits = LIMITS[tier];
    const actionLimits = tierLimits[args.action as keyof typeof tierLimits];

    if (!actionLimits) {
      // Action not allowed for this tier
      return {
        allowed: false,
        reason: "Action not available for your tier",
        currentUsage: 0,
        limit: 0,
        remaining: 0,
        tier,
      };
    }

    // Get the window type and limit
    const [windowType, limit] = Object.entries(actionLimits)[0] as [
      "hour" | "day" | "month",
      number
    ];

    // Unlimited
    if (limit === Infinity) {
      return {
        allowed: true,
        currentUsage: 0,
        limit: Infinity,
        remaining: Infinity,
        tier,
      };
    }

    // Get current usage
    if (!userId) {
      return {
        allowed: true,
        currentUsage: 0,
        limit,
        remaining: limit,
        tier,
      };
    }

    const windowStart = getWindowStart(windowType);

    const record = await ctx.db
      .query("usageRecords")
      .withIndex("by_user_action_window", (q) =>
        q
          .eq("userId", userId)
          .eq("action", args.action)
          .eq("windowType", windowType)
          .eq("windowStart", windowStart)
      )
      .first();

    const currentUsage = record?.count ?? 0;
    const remaining = Math.max(0, limit - currentUsage);

    return {
      allowed: currentUsage < limit,
      currentUsage,
      limit,
      remaining,
      tier,
      windowType,
      resetsAt: getWindowEnd(windowType, windowStart),
    };
  },
});

// ═══════════════════════════════════════════════════════════════
// GET USER USAGE SUMMARY - All usage for a user
// ═══════════════════════════════════════════════════════════════
export const getUserUsageSummary = query({
  args: {
    workosUserId: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_workos_id", (q) => q.eq("workosUserId", args.workosUserId))
      .first();

    if (!user) {
      return null;
    }

    const tier = user.tier as Tier;
    const tierLimits = LIMITS[tier];

    const summary: Record<
      string,
      {
        current: number;
        limit: number;
        remaining: number;
        windowType: string;
        resetsAt: number;
      }
    > = {};

    for (const [action, limits] of Object.entries(tierLimits)) {
      const [windowType, limit] = Object.entries(limits)[0] as [
        "hour" | "day" | "month",
        number
      ];

      const windowStart = getWindowStart(windowType as "hour" | "day" | "month");

      const record = await ctx.db
        .query("usageRecords")
        .withIndex("by_user_action_window", (q) =>
          q
            .eq("userId", user._id)
            .eq("action", action as Action)
            .eq("windowType", windowType)
            .eq("windowStart", windowStart)
        )
        .first();

      const current = record?.count ?? 0;

      summary[action] = {
        current,
        limit: limit === Infinity ? -1 : limit, // -1 represents unlimited
        remaining: limit === Infinity ? -1 : Math.max(0, limit - current),
        windowType,
        resetsAt: getWindowEnd(windowType as "hour" | "day" | "month", windowStart),
      };
    }

    return {
      tier,
      usage: summary,
    };
  },
});

// ═══════════════════════════════════════════════════════════════
// Helper functions
// ═══════════════════════════════════════════════════════════════
function getWindowStart(windowType: "hour" | "day" | "month"): number {
  const now = new Date();

  switch (windowType) {
    case "hour":
      return new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        now.getHours()
      ).getTime();
    case "day":
      return new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate()
      ).getTime();
    case "month":
      return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  }
}

function getWindowEnd(
  windowType: "hour" | "day" | "month",
  windowStart: number
): number {
  const start = new Date(windowStart);

  switch (windowType) {
    case "hour":
      return new Date(
        start.getFullYear(),
        start.getMonth(),
        start.getDate(),
        start.getHours() + 1
      ).getTime();
    case "day":
      return new Date(
        start.getFullYear(),
        start.getMonth(),
        start.getDate() + 1
      ).getTime();
    case "month":
      return new Date(start.getFullYear(), start.getMonth() + 1, 1).getTime();
  }
}
