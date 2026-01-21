import { mutation } from "../../_generated/server";
import { v } from "convex/values";

const FREE_DAILY_LIMIT = 3;
const ANONYMOUS_DAILY_LIMIT = 2;

export const checkAndIncrement = mutation({
  args: {
    identifier: v.string(),
    hasUnlimitedAccess: v.boolean(),
  },
  handler: async (ctx, args) => {
    // Users with unlimited access always pass
    if (args.hasUnlimitedAccess) {
      return { allowed: true, remaining: Infinity };
    }

    const today = new Date().toISOString().split("T")[0];
    const isSignedIn = args.identifier.startsWith("user:");
    const limit = isSignedIn ? FREE_DAILY_LIMIT : ANONYMOUS_DAILY_LIMIT;

    const existing = await ctx.db
      .query("dailyUsage")
      .withIndex("by_identifier_date", (q) =>
        q.eq("identifier", args.identifier).eq("date", today)
      )
      .first();

    const currentCount = existing?.summaryCount ?? 0;

    if (currentCount >= limit) {
      return { allowed: false, remaining: 0 };
    }

    if (existing) {
      await ctx.db.patch(existing._id, {
        summaryCount: currentCount + 1,
      });
    } else {
      await ctx.db.insert("dailyUsage", {
        identifier: args.identifier,
        date: today,
        summaryCount: 1,
      });
    }

    return { allowed: true, remaining: limit - currentCount - 1 };
  },
});
