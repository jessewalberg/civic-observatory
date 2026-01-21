import { query } from "../../_generated/server";
import { v } from "convex/values";

export const getByWorkosUserId = query({
  args: {
    workosUserId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("by_workosUserId", (q) => q.eq("workosUserId", args.workosUserId))
      .first();
  },
});
