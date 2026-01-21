import { mutation } from "../../_generated/server";
import { v } from "convex/values";

export const upsertOnLogin = mutation({
  args: {
    workosUserId: v.string(),
    email: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_workosUserId", (q) => q.eq("workosUserId", args.workosUserId))
      .first();

    if (existing) {
      // Update email if changed
      if (existing.email !== args.email) {
        await ctx.db.patch(existing._id, { email: args.email });
      }
      return existing._id;
    }

    // Create new user
    return await ctx.db.insert("users", {
      workosUserId: args.workosUserId,
      email: args.email,
      tier: "free",
      role: "user",
      createdAt: Date.now(),
    });
  },
});
