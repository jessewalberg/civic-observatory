import { v } from "convex/values";
import type { Doc } from "../../_generated/dataModel";
import { query } from "../../_generated/server";
import { LIMITS } from "../../lib/constants/limits";

// Get the start of the current day in UTC
function getDayStart(): number {
	const now = new Date();
	return new Date(
		Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
	).getTime();
}

// Get the start of the current month in UTC
function getMonthStart(): number {
	const now = new Date();
	return new Date(
		Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
	).getTime();
}

export const getUsage = query({
	args: {
		userId: v.optional(v.id("users")),
		ipHash: v.optional(v.string()),
		tier: v.union(v.literal("anonymous"), v.literal("free"), v.literal("pro")),
		action: v.union(
			v.literal("summary_view"),
			v.literal("meeting_upload"),
			v.literal("api_request"),
			v.literal("alert_sent"),
		),
	},
	handler: async (ctx, args) => {
		const tierLimits = LIMITS[args.tier];
		const actionLimits = tierLimits[args.action as keyof typeof tierLimits];

		if (!actionLimits) {
			return {
				used: 0,
				limit: Infinity,
				remaining: Infinity,
				windowType: "day" as const,
			};
		}

		// Get usage for day window
		const dayStart = getDayStart();
		let dayUsage: Doc<"usageRecords"> | null = null;

		if (args.userId) {
			dayUsage = await ctx.db
				.query("usageRecords")
				.withIndex("by_user_action_window", (q) =>
					q
						.eq("userId", args.userId)
						.eq("action", args.action)
						.eq("windowType", "day")
						.eq("windowStart", dayStart),
				)
				.first();
		} else if (args.ipHash) {
			dayUsage = await ctx.db
				.query("usageRecords")
				.withIndex("by_ip_action_window", (q) =>
					q
						.eq("ipHash", args.ipHash)
						.eq("action", args.action)
						.eq("windowType", "day")
						.eq("windowStart", dayStart),
				)
				.first();
		}

		const dayLimit = (actionLimits as { day?: number }).day ?? Infinity;
		const used = dayUsage?.count ?? 0;

		return {
			used,
			limit: dayLimit,
			remaining:
				dayLimit === Infinity ? Infinity : Math.max(0, dayLimit - used),
			windowType: "day" as const,
		};
	},
});

export const checkLimit = query({
	args: {
		userId: v.optional(v.id("users")),
		ipHash: v.optional(v.string()),
		tier: v.union(v.literal("anonymous"), v.literal("free"), v.literal("pro")),
		action: v.union(
			v.literal("summary_view"),
			v.literal("meeting_upload"),
			v.literal("api_request"),
			v.literal("alert_sent"),
		),
	},
	handler: async (ctx, args) => {
		const tierLimits = LIMITS[args.tier];
		const actionLimits = tierLimits[args.action as keyof typeof tierLimits];

		if (!actionLimits) {
			return { allowed: true, remaining: Infinity };
		}

		// Check day limit
		if ((actionLimits as { day?: number }).day !== undefined) {
			const dayStart = getDayStart();
			let dayUsage: Doc<"usageRecords"> | null = null;

			if (args.userId) {
				dayUsage = await ctx.db
					.query("usageRecords")
					.withIndex("by_user_action_window", (q) =>
						q
							.eq("userId", args.userId)
							.eq("action", args.action)
							.eq("windowType", "day")
							.eq("windowStart", dayStart),
					)
					.first();
			} else if (args.ipHash) {
				dayUsage = await ctx.db
					.query("usageRecords")
					.withIndex("by_ip_action_window", (q) =>
						q
							.eq("ipHash", args.ipHash)
							.eq("action", args.action)
							.eq("windowType", "day")
							.eq("windowStart", dayStart),
					)
					.first();
			}

			const dayLimit = (actionLimits as { day: number }).day;
			const used = dayUsage?.count ?? 0;

			if (dayLimit !== Infinity && used >= dayLimit) {
				return {
					allowed: false,
					remaining: 0,
					limit: dayLimit,
					windowType: "day",
				};
			}

			return {
				allowed: true,
				remaining: dayLimit === Infinity ? Infinity : dayLimit - used,
				limit: dayLimit,
				windowType: "day",
			};
		}

		// Check month limit
		const monthLimitValue = (actionLimits as { month?: number }).month;
		if (monthLimitValue !== undefined) {
			const monthStart = getMonthStart();
			let monthUsage: Doc<"usageRecords"> | null = null;

			if (args.userId) {
				monthUsage = await ctx.db
					.query("usageRecords")
					.withIndex("by_user_action_window", (q) =>
						q
							.eq("userId", args.userId)
							.eq("action", args.action)
							.eq("windowType", "month")
							.eq("windowStart", monthStart),
					)
					.first();
			} else if (args.ipHash) {
				monthUsage = await ctx.db
					.query("usageRecords")
					.withIndex("by_ip_action_window", (q) =>
						q
							.eq("ipHash", args.ipHash)
							.eq("action", args.action)
							.eq("windowType", "month")
							.eq("windowStart", monthStart),
					)
					.first();
			}

			const used = monthUsage?.count ?? 0;

			if (used >= monthLimitValue) {
				return {
					allowed: false,
					remaining: 0,
					limit: monthLimitValue,
					windowType: "month",
				};
			}

			return {
				allowed: true,
				remaining: monthLimitValue - used,
				limit: monthLimitValue,
				windowType: "month",
			};
		}

		return { allowed: true, remaining: Infinity };
	},
});
