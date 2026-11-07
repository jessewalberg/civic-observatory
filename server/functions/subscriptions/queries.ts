import { z } from "zod";
import { entityId } from "../../id";
import { getCurrentUser } from "../../lib/auth";
import { defineRead, privateRead } from "../../procedure";
import {
	getCoverageStatus,
	isCoveragePublic,
} from "../municipalities/coveragePublication";
import {
	evaluateSubscriptionSummaryMatch,
	type SubscriptionAlertKind,
} from "./matching";
// ═══════════════════════════════════════════════════════════════
// LIST BY USER - Get all subscriptions for a user
// ═══════════════════════════════════════════════════════════════
export const listByUser = defineRead({
	args: {},
	handler: async (ctx) => {
		const user = await getCurrentUser(ctx);
		if (!user) {
			return [];
		}
		const subscriptions = await ctx.data
			.select("subscriptions")
			.orderBy(["userId", "_creationTime", "_id"])
			.where("userId", "=", user._id)
			.all();
		// Get municipality info for each subscription
		const withMunicipalities = await Promise.all(
			subscriptions.map(async (sub) => {
				const municipality = await ctx.data.find(sub.municipalityId);
				return {
					...sub,
					municipality: municipality
						? {
								_id: municipality._id,
								name: municipality.name,
								state: municipality.state,
								coverageStatus: getCoverageStatus(municipality),
							}
						: null,
				};
			}),
		);
		return withMunicipalities;
	},
});
// ═══════════════════════════════════════════════════════════════
// GET FOR MUNICIPALITY - Check if user is subscribed to a municipality
// ═══════════════════════════════════════════════════════════════
export const getForMunicipality = defineRead({
	args: {
		municipalityId: entityId("municipalities"),
	},
	handler: async (ctx, args) => {
		const user = await getCurrentUser(ctx);
		if (!user) {
			return null;
		}
		const municipality = await ctx.data.find(args.municipalityId);
		if (!municipality || !isCoveragePublic(municipality)) {
			return null;
		}
		return await ctx.data
			.select("subscriptions")
			.orderBy(["userId", "municipalityId", "_creationTime", "_id"])
			.where("userId", "=", user._id)
			.where("municipalityId", "=", args.municipalityId)
			.one();
	},
});
// ═══════════════════════════════════════════════════════════════
// GET BY ID - Get a single subscription
// ═══════════════════════════════════════════════════════════════
export const getById = defineRead({
	args: {
		subscriptionId: entityId("subscriptions"),
	},
	handler: async (ctx, args) => {
		const user = await getCurrentUser(ctx);
		if (!user) {
			return null;
		}
		const subscription = await ctx.data.find(args.subscriptionId);
		if (!subscription) return null;
		if (subscription.userId !== user._id) return null;
		const municipality = await ctx.data.find(subscription.municipalityId);
		return {
			...subscription,
			municipality: municipality
				? {
						_id: municipality._id,
						name: municipality.name,
						state: municipality.state,
						coverageStatus: getCoverageStatus(municipality),
					}
				: null,
		};
	},
});
// ═══════════════════════════════════════════════════════════════
// COUNT BY USER - Get subscription count for limit checking
// ═══════════════════════════════════════════════════════════════
export const countByUser = defineRead({
	args: {},
	handler: async (ctx) => {
		const user = await getCurrentUser(ctx);
		if (!user) {
			return { total: 0, active: 0 };
		}
		const subscriptions = await ctx.data
			.select("subscriptions")
			.orderBy(["userId", "_creationTime", "_id"])
			.where("userId", "=", user._id)
			.all();
		return {
			total: subscriptions.length,
			active: subscriptions.filter((s) => s.isActive).length,
		};
	},
});
// ═══════════════════════════════════════════════════════════════
// GET MATCHING FOR SUMMARY - Find subscriptions that match a summary (internal)
// Used by alert generation system
// ═══════════════════════════════════════════════════════════════
export const getMatchingForSummary = privateRead({
	args: {
		summaryId: entityId("summaries"),
		meetingId: entityId("meetings"),
	},
	handler: async (ctx, args) => {
		// Get the meeting and summary
		const meeting = await ctx.data.find(args.meetingId);
		if (!meeting) return [];
		const municipality = await ctx.data.find(meeting.municipalityId);
		if (!municipality || !isCoveragePublic(municipality)) return [];
		const summary = await ctx.data.find(args.summaryId);
		if (!summary) return [];
		const subscriptions = await ctx.data
			.select("subscriptions")
			.orderBy(["municipalityId", "_creationTime", "_id"])
			.where("municipalityId", "=", meeting.municipalityId)
			.all();
		const alertKind: SubscriptionAlertKind =
			summary.kind === "agenda_preview" ? "agenda_preview" : "summary";
		const results = [];
		for (const subscription of subscriptions) {
			const [user, existingAlert] = await Promise.all([
				ctx.data.find(subscription.userId),
				ctx.data
					.select("alerts")
					.orderBy(["subscriptionId", "summaryId", "_creationTime", "_id"])
					.where("subscriptionId", "=", subscription._id)
					.where("summaryId", "=", args.summaryId)
					.one(),
			]);
			const match = evaluateSubscriptionSummaryMatch({
				subscription,
				user,
				meeting,
				summary,
				alertKind,
				hasExistingAlert: Boolean(existingAlert),
			});
			if (!match.matches) {
				continue;
			}
			results.push({
				subscription,
				matchedTopics: match.matchedTopics,
				matchedKeywords: match.matchedKeywords,
			});
		}
		return results;
	},
});
// ═══════════════════════════════════════════════════════════════
// GET BY FREQUENCY - Get subscriptions by alert frequency (internal)
// Used by digest email crons
// ═══════════════════════════════════════════════════════════════
export const getByFrequency = privateRead({
	args: {
		frequency: z.union([
			z.literal("immediate"),
			z.literal("daily"),
			z.literal("weekly"),
		]),
	},
	handler: async (ctx, args) => {
		// Get all active subscriptions with the given frequency
		const subscriptions = await ctx.data.select("subscriptions").all();
		const visibleSubscriptions = await Promise.all(
			subscriptions.map(async (sub) => {
				if (
					!sub.isActive ||
					!sub.emailEnabled ||
					sub.alertFrequency !== args.frequency
				) {
					return null;
				}
				const municipality = await ctx.data.find(sub.municipalityId);
				return municipality && isCoveragePublic(municipality) ? sub : null;
			}),
		);
		return visibleSubscriptions.filter(
			(subscription): subscription is (typeof subscriptions)[number] =>
				Boolean(subscription),
		);
	},
});
