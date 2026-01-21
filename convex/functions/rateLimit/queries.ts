import { query } from "../../_generated/server";
import { v } from "convex/values";

const FREE_DAILY_LIMIT = 3;
const ANONYMOUS_DAILY_LIMIT = 2;

export const getUsage = query({
  args: {
    identifier: v.string(),
  },
  handler: async (ctx, args) => {
    const today = new Date().toISOString().split("T")[0];
    const isSignedIn = args.identifier.startsWith("user:");
    const limit = isSignedIn ? FREE_DAILY_LIMIT : ANONYMOUS_DAILY_LIMIT;

    const existing = await ctx.db
      .query("dailyUsage")
      .withIndex("by_identifier_date", (q) =>
        q.eq("identifier", args.identifier).eq("date", today)
      )
      .first();

    const used = existing?.summaryCount ?? 0;

    return {
      used,
      limit,
      remaining: Math.max(0, limit - used),
    };
  },
});
