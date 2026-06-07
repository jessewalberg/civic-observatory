import { v } from "convex/values";
import { internalMutation, mutation } from "../../_generated/server";
import { getCurrentUser } from "../../lib/auth";

// ═══════════════════════════════════════════════════════════════
// RECORD USAGE - Increment usage count for an action (public)
// ═══════════════════════════════════════════════════════════════
export const recordUsage = mutation({
	args: {
		action: v.union(
			v.literal("summary_view"),
			v.literal("meeting_upload"),
			v.literal("api_request"),
			v.literal("alert_sent"),
		),
		windowType: v.union(
			v.literal("hour"),
			v.literal("day"),
			v.literal("month"),
		),
	},
	handler: async (ctx, args) => {
		// Get user
		const user = await getCurrentUser(ctx);

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
					.eq("windowStart", windowStart),
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
// RECORD USAGE INTERNAL - For server-side tracking with userId
// ═══════════════════════════════════════════════════════════════
export const recordUsageInternal = internalMutation({
	args: {
		userId: v.id("users"),
		action: v.union(
			v.literal("summary_view"),
			v.literal("meeting_upload"),
			v.literal("api_request"),
			v.literal("alert_sent"),
		),
		windowType: v.union(
			v.literal("hour"),
			v.literal("day"),
			v.literal("month"),
		),
	},
	handler: async (ctx, args) => {
		const windowStart = getWindowStart(args.windowType);

		// Find existing record
		const existing = await ctx.db
			.query("usageRecords")
			.withIndex("by_user_action_window", (q) =>
				q
					.eq("userId", args.userId)
					.eq("action", args.action)
					.eq("windowType", args.windowType)
					.eq("windowStart", windowStart),
			)
			.first();

		if (existing) {
			await ctx.db.patch(existing._id, {
				count: existing.count + 1,
			});
			return { count: existing.count + 1 };
		}

		await ctx.db.insert("usageRecords", {
			userId: args.userId,
			action: args.action,
			windowType: args.windowType,
			windowStart,
			count: 1,
		});

		return { count: 1 };
	},
});

// ═══════════════════════════════════════════════════════════════
// RECORD ANONYMOUS USAGE - Track by IP hash for anonymous users
// ═══════════════════════════════════════════════════════════════
export const recordAnonymousUsage = internalMutation({
	args: {
		ipHash: v.string(),
		action: v.union(
			v.literal("summary_view"),
			v.literal("meeting_upload"),
			v.literal("api_request"),
			v.literal("alert_sent"),
		),
		windowType: v.union(
			v.literal("hour"),
			v.literal("day"),
			v.literal("month"),
		),
	},
	handler: async (ctx, args) => {
		const windowStart = getWindowStart(args.windowType);

		// Find existing record
		const existing = await ctx.db
			.query("usageRecords")
			.withIndex("by_ip_action_window", (q) =>
				q
					.eq("ipHash", args.ipHash)
					.eq("action", args.action)
					.eq("windowType", args.windowType)
					.eq("windowStart", windowStart),
			)
			.first();

		if (existing) {
			await ctx.db.patch(existing._id, {
				count: existing.count + 1,
			});
			return { count: existing.count + 1 };
		}

		await ctx.db.insert("usageRecords", {
			ipHash: args.ipHash,
			action: args.action,
			windowType: args.windowType,
			windowStart,
			count: 1,
		});

		return { count: 1 };
	},
});

// ═══════════════════════════════════════════════════════════════
// DELETE OLD RECORDS - Clean up old usage records
// ═══════════════════════════════════════════════════════════════
export const deleteOld = internalMutation({
	args: {
		olderThanDays: v.number(),
	},
	handler: async (ctx, args) => {
		const cutoff = Date.now() - args.olderThanDays * 24 * 60 * 60 * 1000;

		const oldRecords = await ctx.db
			.query("usageRecords")
			.filter((q) => q.lt(q.field("windowStart"), cutoff))
			.take(1000);

		let deleted = 0;
		for (const record of oldRecords) {
			await ctx.db.delete(record._id);
			deleted++;
		}

		return { deleted };
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
				now.getHours(),
			).getTime();
		case "day":
			return new Date(
				now.getFullYear(),
				now.getMonth(),
				now.getDate(),
			).getTime();
		case "month":
			return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
	}
}
