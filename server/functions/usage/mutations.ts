import { z } from "zod";
import { sql } from "../../database";
import { entityId } from "../../id";
import { getCurrentUser } from "../../lib/auth";
import { defineWrite, privateWrite } from "../../procedure";
// ═══════════════════════════════════════════════════════════════
// RECORD USAGE - Increment usage count for an action (public)
// ═══════════════════════════════════════════════════════════════
export const recordUsage = defineWrite({
	args: {
		action: z.union([
			z.literal("summary_view"),
			z.literal("meeting_upload"),
			z.literal("api_request"),
			z.literal("alert_sent"),
		]),
		windowType: z.union([
			z.literal("hour"),
			z.literal("day"),
			z.literal("month"),
		]),
	},
	handler: async (ctx, args) => {
		// Get user
		const user = await getCurrentUser(ctx);
		if (!user) {
			throw new Error("User not found");
		}
		const windowStart = getWindowStart(args.windowType);
		// Find existing record
		const existing = await ctx.data
			.select("usageRecords")
			.orderBy([
				"userId",
				"action",
				"windowType",
				"windowStart",
				"_creationTime",
				"_id",
			])
			.where("userId", "=", user._id)
			.where("action", "=", args.action)
			.where("windowType", "=", args.windowType)
			.where("windowStart", "=", windowStart)
			.one();
		if (existing) {
			// Increment existing record
			await ctx.data.update(existing._id, {
				count: existing.count + 1,
			});
			return { count: existing.count + 1 };
		}
		// Create new record
		await ctx.data.add("usageRecords", {
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
export const recordUsageInternal = privateWrite({
	args: {
		userId: entityId("users"),
		action: z.union([
			z.literal("summary_view"),
			z.literal("meeting_upload"),
			z.literal("api_request"),
			z.literal("alert_sent"),
		]),
		windowType: z.union([
			z.literal("hour"),
			z.literal("day"),
			z.literal("month"),
		]),
	},
	handler: async (ctx, args) => {
		const windowStart = getWindowStart(args.windowType);
		// Find existing record
		const existing = await ctx.data
			.select("usageRecords")
			.orderBy([
				"userId",
				"action",
				"windowType",
				"windowStart",
				"_creationTime",
				"_id",
			])
			.where("userId", "=", args.userId)
			.where("action", "=", args.action)
			.where("windowType", "=", args.windowType)
			.where("windowStart", "=", windowStart)
			.one();
		if (existing) {
			await ctx.data.update(existing._id, {
				count: existing.count + 1,
			});
			return { count: existing.count + 1 };
		}
		await ctx.data.add("usageRecords", {
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
export const recordAnonymousUsage = privateWrite({
	args: {
		ipHash: z.string(),
		action: z.union([
			z.literal("summary_view"),
			z.literal("meeting_upload"),
			z.literal("api_request"),
			z.literal("alert_sent"),
		]),
		windowType: z.union([
			z.literal("hour"),
			z.literal("day"),
			z.literal("month"),
		]),
	},
	handler: async (ctx, args) => {
		const windowStart = getWindowStart(args.windowType);
		// Find existing record
		const existing = await ctx.data
			.select("usageRecords")
			.orderBy([
				"ipHash",
				"action",
				"windowType",
				"windowStart",
				"_creationTime",
				"_id",
			])
			.where("ipHash", "=", args.ipHash)
			.where("action", "=", args.action)
			.where("windowType", "=", args.windowType)
			.where("windowStart", "=", windowStart)
			.one();
		if (existing) {
			await ctx.data.update(existing._id, {
				count: existing.count + 1,
			});
			return { count: existing.count + 1 };
		}
		await ctx.data.add("usageRecords", {
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
export const deleteOld = privateWrite({
	args: {
		olderThanDays: z.number(),
	},
	handler: async (ctx, args) => {
		const cutoff = Date.now() - args.olderThanDays * 24 * 60 * 60 * 1000;
		const oldRecords = await ctx.data
			.select("usageRecords")
			.where(sql.lt(sql.column("windowStart"), cutoff))
			.limit(1000);
		let deleted = 0;
		for (const record of oldRecords) {
			await ctx.data.remove(record._id);
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
