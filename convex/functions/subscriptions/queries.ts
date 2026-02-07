import { v } from "convex/values";
import { internalQuery, query } from "../../_generated/server";

// ═══════════════════════════════════════════════════════════════
// LIST BY USER - Get all subscriptions for a user
// ═══════════════════════════════════════════════════════════════
export const listByUser = query({
	args: {
		userId: v.id("users"),
	},
	handler: async (ctx, args) => {
		const subscriptions = await ctx.db
			.query("subscriptions")
			.withIndex("by_user", (q) => q.eq("userId", args.userId))
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
		userId: v.id("users"),
		municipalityId: v.id("municipalities"),
	},
	handler: async (ctx, args) => {
		return await ctx.db
			.query("subscriptions")
			.withIndex("by_user_municipality", (q) =>
				q.eq("userId", args.userId).eq("municipalityId", args.municipalityId),
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
		const subscription = await ctx.db.get(args.subscriptionId);
		if (!subscription) return null;

		const municipality = await ctx.db.get(subscription.municipalityId);

		return {
			...subscription,
			municipality: municipality
				? {
						_id: municipality._id,
						name: municipality.name,
						state: municipality.state,
					}
				: null,
		};
	},
});

// ═══════════════════════════════════════════════════════════════
// COUNT BY USER - Get subscription count for limit checking
// ═══════════════════════════════════════════════════════════════
export const countByUser = query({
	args: {
		userId: v.id("users"),
	},
	handler: async (ctx, args) => {
		const subscriptions = await ctx.db
			.query("subscriptions")
			.withIndex("by_user", (q) => q.eq("userId", args.userId))
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

		const summary = await ctx.db.get(args.summaryId);
		if (!summary) return [];

		// Get all active subscriptions for this municipality
		const subscriptions = await ctx.db
			.query("subscriptions")
			.withIndex("by_municipality", (q) =>
				q.eq("municipalityId", meeting.municipalityId),
			)
			.collect();

		// Filter to active subscriptions that match
		const matchingSubscriptions = subscriptions.filter((sub) => {
			// Must be active
			if (!sub.isActive) return false;

			// Check meeting type filter
			if (sub.meetingTypes && sub.meetingTypes.length > 0) {
				if (!sub.meetingTypes.includes(meeting.meetingType)) {
					return false;
				}
			}

			// Check topic filter
			if (sub.topicFilters && sub.topicFilters.length > 0) {
				const hasMatchingTopic = sub.topicFilters.some((filter) =>
					summary.topics.some((topic) =>
						topic.toLowerCase().includes(filter.toLowerCase()),
					),
				);
				if (!hasMatchingTopic) return false;
			}

			// Check exclude keywords
			if (sub.keywordsExclude && sub.keywordsExclude.length > 0) {
				const contentToSearch = [
					summary.executiveSummary,
					...summary.topics,
					...summary.keyDecisions.map((d) => `${d.title} ${d.description}`),
				]
					.join(" ")
					.toLowerCase();

				const hasExcludedKeyword = sub.keywordsExclude.some((keyword) =>
					contentToSearch.includes(keyword.toLowerCase()),
				);
				if (hasExcludedKeyword) return false;
			}

			// Check include keywords (if specified, must match at least one)
			if (sub.keywordsInclude && sub.keywordsInclude.length > 0) {
				const contentToSearch = [
					summary.executiveSummary,
					...summary.topics,
					...summary.keyDecisions.map((d) => `${d.title} ${d.description}`),
				]
					.join(" ")
					.toLowerCase();

				const hasIncludedKeyword = sub.keywordsInclude.some((keyword) =>
					contentToSearch.includes(keyword.toLowerCase()),
				);
				if (!hasIncludedKeyword) return false;
			}

			return true;
		});

		// Build results with matched info
		return matchingSubscriptions.map((sub) => {
			// Find matched topics
			const matchedTopics = sub.topicFilters
				? sub.topicFilters.filter((filter) =>
						summary.topics.some((topic) =>
							topic.toLowerCase().includes(filter.toLowerCase()),
						),
					)
				: summary.topics.slice(0, 3); // Default to first 3 topics if no filter

			// Find matched keywords
			const contentToSearch = [
				summary.executiveSummary,
				...summary.topics,
				...summary.keyDecisions.map((d) => `${d.title} ${d.description}`),
			]
				.join(" ")
				.toLowerCase();

			const matchedKeywords = sub.keywordsInclude
				? sub.keywordsInclude.filter((keyword) =>
						contentToSearch.includes(keyword.toLowerCase()),
					)
				: undefined;

			return {
				subscription: sub,
				matchedTopics,
				matchedKeywords,
			};
		});
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

		return subscriptions.filter(
			(sub) =>
				sub.isActive &&
				sub.emailEnabled &&
				sub.alertFrequency === args.frequency,
		);
	},
});
