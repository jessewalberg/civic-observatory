import { mutation } from "../../_generated/server";
import { v } from "convex/values";

// ═══════════════════════════════════════════════════════════════
// RECORD USAGE - Increment usage count for an action
// ═══════════════════════════════════════════════════════════════
export const recordUsage = mutation({
  args: {
    workosUserId: v.string(),
    action: v.union(
      v.literal("summary_view"),
      v.literal("meeting_upload"),
      v.literal("api_request"),
      v.literal("alert_sent")
    ),
    windowType: v.union(v.literal("hour"), v.literal("day"), v.literal("month")),
  },
  handler: async (ctx, args) => {
    // Get user
    const user = await ctx.db
      .query("users")
      .withIndex("by_workos_id", (q) => q.eq("workosUserId", args.workosUserId))
      .first();

    if (!user) {
      throw new Error("User not found");
    }

    const windowStart = getWindowStart(args.windowType);

    // Find existing record
    const existing = await ctx.db
      .query("usageRecords")
      .withIndex("by_user_action_window", (q) =>
        q
          .eq("userId", user._id)
          .eq("action", args.action)
          .eq("windowType", args.windowType)
          .eq("windowStart", windowStart)
      )
      .first();

    if (existing) {
      // Increment existing record
      await ctx.db.patch(existing._id, {
        count: existing.count + 1,
      });
      return { count: existing.count + 1 };
    }

    // Create new record
    await ctx.db.insert("usageRecords", {
      userId: user._id,
      action: args.action,
      windowType: args.windowType,
      windowStart,
      count: 1,
    });

    return { count: 1 };
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
