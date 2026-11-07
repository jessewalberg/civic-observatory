import { z } from "zod";
import { entityId } from "../../id";
import { getCurrentUser } from "../../lib/auth";
import { defineRead, privateRead } from "../../procedure";

const statusValidator = z.union([
	z.literal("requested"),
	z.literal("discovered"),
	z.literal("probed"),
	z.literal("active"),
	z.literal("rejected"),
]);
const priorityValidator = z.union([
	z.literal("low"),
	z.literal("medium"),
	z.literal("high"),
]);
const MAX_LIMIT = 100;
export const listForAdmin = defineRead({
	args: {
		status: statusValidator.optional(),
		priority: priorityValidator.optional(),
		limit: z.number().optional(),
	},
	handler: async (ctx, args) => {
		const caller = await getCurrentUser(ctx);
		if (!caller?.isAdmin) return null;
		const limit = clampLimit(args.limit);
		const status = args.status;
		const requests =
			status !== undefined
				? await ctx.data
						.select("coverageRequests")
						.orderBy(["status", "_creationTime", "_id"])
						.where("status", "=", status)
						.all()
				: await ctx.data.select("coverageRequests").all();
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
export const listMine = defineRead({
	args: {
		limit: z.number().optional(),
	},
	handler: async (ctx, args) => {
		const caller = await getCurrentUser(ctx);
		if (!caller) return [];
		return await ctx.data
			.select("coverageRequests")
			.orderBy(["requesterUserId", "_creationTime", "_id"])
			.where("requesterUserId", "=", caller._id)
			.direction("desc")
			.limit(clampLimit(args.limit));
	},
});
export const getForNotification = privateRead({
	args: {
		requestId: entityId("coverageRequests"),
	},
	handler: async (ctx, args) => {
		return await ctx.data.find(args.requestId);
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
