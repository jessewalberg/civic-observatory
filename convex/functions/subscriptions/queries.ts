import { v } from "convex/values";
import { internalQuery, query } from "../../_generated/server";
import { getCurrentUser } from "../../lib/auth";
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
export const listByUser = query({
	args: {},
	handler: async (ctx) => {
		const user = await getCurrentUser(ctx);
		if (!user) {
			return [];
		}

		const subscriptions = await ctx.db
			.query("subscriptions")
			.withIndex("by_user", (q) => q.eq("userId", user._id))
			.collect();

		// Get municipality info for each subscription
		const withMunicipalities = await Promise.all(
			subscriptions.map(async (sub) => {
				const municipality = await ctx.db.get(sub.municipalityId);
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
export const getForMunicipality = query({
	args: {
		municipalityId: v.id("municipalities"),
	},
	handler: async (ctx, args) => {
		const user = await getCurrentUser(ctx);
		if (!user) {
			return null;
		}

		const municipality = await ctx.db.get(args.municipalityId);
		if (!municipality || !isCoveragePublic(municipality)) {
			return null;
		}

		return await ctx.db
			.query("subscriptions")
			.withIndex("by_user_municipality", (q) =>
				q.eq("userId", user._id).eq("municipalityId", args.municipalityId),
			)
			.first();
	},
});

// ═══════════════════════════════════════════════════════════════
// GET BY ID - Get a single subscription
// ═══════════════════════════════════════════════════════════════
export const getById = query({
	args: {
		subscriptionId: v.id("subscriptions"),
	},
	handler: async (ctx, args) => {
		const user = await getCurrentUser(ctx);
		if (!user) {
			return null;
		}

		const subscription = await ctx.db.get(args.subscriptionId);
		if (!subscription) return null;
		if (subscription.userId !== user._id) return null;

		const municipality = await ctx.db.get(subscription.municipalityId);

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
export const countByUser = query({
	args: {},
	handler: async (ctx) => {
		const user = await getCurrentUser(ctx);
		if (!user) {
			return { total: 0, active: 0 };
		}

		const subscriptions = await ctx.db
			.query("subscriptions")
			.withIndex("by_user", (q) => q.eq("userId", user._id))
			.collect();

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
export const getMatchingForSummary = internalQuery({
	args: {
		summaryId: v.id("summaries"),
		meetingId: v.id("meetings"),
	},
	handler: async (ctx, args) => {
		// Get the meeting and summary
		const meeting = await ctx.db.get(args.meetingId);
		if (!meeting) return [];

		const municipality = await ctx.db.get(meeting.municipalityId);
		if (!municipality || !isCoveragePublic(municipality)) return [];

		const summary = await ctx.db.get(args.summaryId);
		if (!summary) return [];

		const subscriptions = await ctx.db
			.query("subscriptions")
			.withIndex("by_municipality", (q) =>
				q.eq("municipalityId", meeting.municipalityId),
			)
			.collect();
		const alertKind: SubscriptionAlertKind =
			summary.kind === "agenda_preview" ? "agenda_preview" : "summary";

		const results = [];
		for (const subscription of subscriptions) {
			const [user, existingAlert] = await Promise.all([
				ctx.db.get(subscription.userId),
				ctx.db
					.query("alerts")
					.withIndex("by_subscription_summary", (q) =>
						q
							.eq("subscriptionId", subscription._id)
							.eq("summaryId", args.summaryId),
					)
					.first(),
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
export const getByFrequency = internalQuery({
	args: {
		frequency: v.union(
			v.literal("immediate"),
			v.literal("daily"),
			v.literal("weekly"),
		),
	},
	handler: async (ctx, args) => {
		// Get all active subscriptions with the given frequency
		const subscriptions = await ctx.db.query("subscriptions").collect();

		const visibleSubscriptions = await Promise.all(
			subscriptions.map(async (sub) => {
				if (
					!sub.isActive ||
					!sub.emailEnabled ||
					sub.alertFrequency !== args.frequency
				) {
					return null;
				}
				const municipality = await ctx.db.get(sub.municipalityId);
				return municipality && isCoveragePublic(municipality) ? sub : null;
			}),
		);

		return visibleSubscriptions.filter(
			(subscription): subscription is (typeof subscriptions)[number] =>
				Boolean(subscription),
		);
	},
});
