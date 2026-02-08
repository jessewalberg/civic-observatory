import { v } from "convex/values";
import { query } from "../../_generated/server";

// ═══════════════════════════════════════════════════════════════
// SUMMARIES QUERIES
// Queries for retrieving AI-generated meeting summaries
// ═══════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
// GET SUMMARY BY MEETING - Retrieve the summary for a specific meeting
// Used on meeting detail pages to display the AI summary
// ═══════════════════════════════════════════════════════════════
export const getSummaryByMeeting = query({
	args: {
		meetingId: v.id("meetings"),
	},
	handler: async (ctx, args) => {
		const summary = await ctx.db
			.query("summaries")
			.withIndex("by_meeting", (q) => q.eq("meetingId", args.meetingId))
			.first();

		return summary;
	},
});

// ═══════════════════════════════════════════════════════════════
// GET RECENT SUMMARIES - Most recently generated summaries
// Used on landing page and explore for "Latest" sections
// ═══════════════════════════════════════════════════════════════
export const getRecentSummaries = query({
	args: {
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const limit = args.limit ?? 10;

		const summaries = await ctx.db.query("summaries").order("desc").take(limit);

		// Enrich with meeting and municipality data
		const enriched = await Promise.all(
			summaries.map(async (summary) => {
				const meeting = await ctx.db.get(summary.meetingId);
				const municipality = meeting
					? await ctx.db.get(meeting.municipalityId)
					: null;

				return {
					...summary,
					meeting,
					municipality,
				};
			}),
		);

		return enriched;
	},
});

// ═══════════════════════════════════════════════════════════════
// LIST SUMMARIES BY TOPICS - Find summaries containing specific topics
// Used for topic-based filtering and recommendations
// ═══════════════════════════════════════════════════════════════
export const listSummariesByTopics = query({
	args: {
		topics: v.array(v.string()),
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const limit = args.limit ?? 20;

		const allSummaries = await ctx.db.query("summaries").collect();

		// Filter summaries that contain any of the requested topics
		const matching = allSummaries.filter((summary) =>
			args.topics.some((topic) =>
				summary.topics
					.map((t) => t.toLowerCase())
					.includes(topic.toLowerCase()),
			),
		);

		return matching.sort((a, b) => b.createdAt - a.createdAt).slice(0, limit);
	},
});