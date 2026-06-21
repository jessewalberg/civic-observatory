import { v } from "convex/values";
import type { Id } from "../../_generated/dataModel";
import { type QueryCtx, query } from "../../_generated/server";
import { getCurrentUser } from "../../lib/auth";
import { isCoveragePublic } from "../municipalities/coveragePublication";

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

		if (!summary) return null;
		return (await isMeetingVisible(ctx, args.meetingId)) ? summary : null;
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

		const summaries = await ctx.db.query("summaries").order("desc").collect();

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

		const includeInternal = await canReadInternalCoverage(ctx);
		return enriched
			.filter(({ municipality }) =>
				municipality
					? includeInternal || isCoveragePublic(municipality)
					: false,
			)
			.slice(0, limit);
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
		const includeInternal = await canReadInternalCoverage(ctx);
		const visibleSummaries = (
			await Promise.all(
				allSummaries.map(async (summary) => {
					const meeting = await ctx.db.get(summary.meetingId);
					const municipality = meeting
						? await ctx.db.get(meeting.municipalityId)
						: null;
					if (
						!municipality ||
						(!includeInternal && !isCoveragePublic(municipality))
					) {
						return null;
					}
					return summary;
				}),
			)
		).filter((summary): summary is (typeof allSummaries)[number] =>
			Boolean(summary),
		);
		const matching = visibleSummaries.filter((summary) =>
			args.topics.some((topic) =>
				summary.topics
					.map((t) => t.toLowerCase())
					.includes(topic.toLowerCase()),
			),
		);

		return matching.sort((a, b) => b.createdAt - a.createdAt).slice(0, limit);
	},
});

async function canReadInternalCoverage(ctx: QueryCtx): Promise<boolean> {
	const caller = await getCurrentUser(ctx);
	return Boolean(caller?.isAdmin);
}

async function isMeetingVisible(
	ctx: QueryCtx,
	meetingId: Id<"meetings">,
): Promise<boolean> {
	const meeting = await ctx.db.get(meetingId);
	if (!meeting) return false;

	const municipality = await ctx.db.get(meeting.municipalityId);
	if (!municipality) return false;
	if (isCoveragePublic(municipality)) return true;
	return await canReadInternalCoverage(ctx);
}
