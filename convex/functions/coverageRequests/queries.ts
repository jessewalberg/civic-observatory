import { v } from "convex/values";
import { internalQuery, query } from "../../_generated/server";
import { getCurrentUser } from "../../lib/auth";

const statusValidator = v.union(
	v.literal("requested"),
	v.literal("discovered"),
	v.literal("probed"),
	v.literal("active"),
	v.literal("rejected"),
);

const priorityValidator = v.union(
	v.literal("low"),
	v.literal("medium"),
	v.literal("high"),
);

const MAX_LIMIT = 100;

export const listForAdmin = query({
	args: {
		status: v.optional(statusValidator),
		priority: v.optional(priorityValidator),
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const caller = await getCurrentUser(ctx);
		if (!caller?.isAdmin) return null;

		const limit = clampLimit(args.limit);
		const status = args.status;
		const requests =
			status !== undefined
				? await ctx.db
						.query("coverageRequests")
						.withIndex("by_status", (q) => q.eq("status", status))
						.collect()
				: await ctx.db.query("coverageRequests").collect();

		return requests
			.filter((request) =>
				args.priority ? request.priority === args.priority : true,
			)
			.sort((a, b) => {
				const priorityRank =
					priorityOrder(b.priority) - priorityOrder(a.priority);
				if (priorityRank !== 0) return priorityRank;
				return b.updatedAt - a.updatedAt;
			})
			.slice(0, limit);
	},
});

export const listMine = query({
	args: {
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const caller = await getCurrentUser(ctx);
		if (!caller) return [];

		return await ctx.db
			.query("coverageRequests")
			.withIndex("by_requester_user", (q) =>
				q.eq("requesterUserId", caller._id),
			)
			.order("desc")
			.take(clampLimit(args.limit));
	},
});

export const getForNotification = internalQuery({
	args: {
		requestId: v.id("coverageRequests"),
	},
	handler: async (ctx, args) => {
		return await ctx.db.get(args.requestId);
	},
});

function clampLimit(value: number | undefined): number {
	if (value === undefined) return 50;
	return Math.max(1, Math.min(Math.floor(value), MAX_LIMIT));
}

function priorityOrder(priority: "low" | "medium" | "high"): number {
	const rank = { low: 0, medium: 1, high: 2 };
	return rank[priority];
}
