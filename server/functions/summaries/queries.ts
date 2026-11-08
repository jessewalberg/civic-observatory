import { z } from "zod";
import { entityId } from "../../id";
import { getCurrentUser } from "../../lib/auth";
import type { Doc, Id } from "../../model";
import { defineRead, type ServiceContext } from "../../procedure";
import { isCoveragePublic } from "../municipalities/coveragePublication";
import {
	buildPublicCoverageBadge,
	toSafePublicMunicipality,
	withPublicCoverageBadge,
} from "../municipalities/publicCoverageBadge";
// ═══════════════════════════════════════════════════════════════
// SUMMARIES QUERIES
// Queries for retrieving AI-generated meeting summaries
// ═══════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════
// GET SUMMARY BY MEETING - Retrieve the summary for a specific meeting
// Used on meeting detail pages to display the AI summary
// ═══════════════════════════════════════════════════════════════
export const getSummaryByMeeting = defineRead({
	args: {
		meetingId: entityId("meetings"),
	},
	handler: async (ctx, args) => {
		const summary = await getFinalSummaryForMeeting(ctx, args.meetingId);
		if (!summary) return null;
		return (await isMeetingVisible(ctx, args.meetingId)) ? summary : null;
	},
});
// ═══════════════════════════════════════════════════════════════
// GET RECENT SUMMARIES - Most recently generated summaries
// Used on landing page and explore for "Latest" sections
// ═══════════════════════════════════════════════════════════════
export const getRecentSummaries = defineRead({
	args: {
		limit: z.number().optional(),
	},
	handler: async (ctx, args) => {
		const limit = args.limit ?? 10;
		const summaries = (
			await ctx.data.select("summaries").direction("desc").all()
		).filter(isFinalSummary);
		const includeInternal = await canReadInternalCoverage(ctx);
		// Enrich with meeting and municipality data
		const enriched = await Promise.all(
			summaries.map(async (summary) => {
				const meeting = await ctx.data.find(summary.meetingId);
				const municipality = meeting
					? await ctx.data.find(meeting.municipalityId)
					: null;
				return {
					...summary,
					meeting,
					municipality: municipality
						? includeInternal
							? withPublicCoverageBadge(municipality)
							: toSafePublicMunicipality(municipality)
						: null,
				};
			}),
		);
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
export const listSummariesByTopics = defineRead({
	args: {
		topics: z.array(z.string()),
		limit: z.number().optional(),
	},
	handler: async (ctx, args) => {
		const limit = args.limit ?? 20;
		const allSummaries = (await ctx.data.select("summaries").all()).filter(
			isFinalSummary,
		);
		// Filter summaries that contain any of the requested topics
		const includeInternal = await canReadInternalCoverage(ctx);
		const visibleSummaries = (
			await Promise.all(
				allSummaries.map(async (summary) => {
					const meeting = await ctx.data.find(summary.meetingId);
					const municipality = meeting
						? await ctx.data.find(meeting.municipalityId)
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
export const searchPublicSummaries = defineRead({
	args: {
		query: z.string().optional(),
		limit: z.number().optional(),
	},
	handler: async (ctx, args) => {
		return await listPublicSummaryResults(ctx, {
			query: args.query,
			limit: args.limit,
		});
	},
});
export const listPublicTopicFeed = defineRead({
	args: {
		topic: z.string(),
		limit: z.number().optional(),
	},
	handler: async (ctx, args) => {
		return await listPublicSummaryResults(ctx, {
			topic: canonicalTopic(args.topic),
			limit: args.limit,
		});
	},
});
async function getFinalSummaryForMeeting(
	ctx: ServiceContext,
	meetingId: Id<"meetings">,
) {
	const summaries = await ctx.data
		.select("summaries")
		.orderBy(["meetingId", "_creationTime", "_id"])
		.where("meetingId", "=", meetingId)
		.all();
	return summaries.find(isFinalSummary) ?? null;
}
function isFinalSummary(summary: Doc<"summaries">): boolean {
	return (summary.kind ?? "summary") === "summary";
}
async function canReadInternalCoverage(ctx: ServiceContext): Promise<boolean> {
	const caller = await getCurrentUser(ctx);
	return Boolean(caller?.isAdmin);
}
async function isMeetingVisible(
	ctx: ServiceContext,
	meetingId: Id<"meetings">,
): Promise<boolean> {
	const meeting = await ctx.data.find(meetingId);
	if (!meeting) return false;
	const municipality = await ctx.data.find(meeting.municipalityId);
	if (!municipality) return false;
	if (isCoveragePublic(municipality)) return true;
	return await canReadInternalCoverage(ctx);
}
type PublicSummaryResult = {
	meetingId: Id<"meetings">;
	meetingSlug?: string;
	title: string;
	meetingDate: number;
	meetingType: Doc<"meetings">["meetingType"];
	status: Doc<"meetings">["status"];
	summaryId: Id<"summaries">;
	summarySnippet: string;
	topics: string[];
	municipality: {
		id: Id<"municipalities">;
		slug?: string;
		name: string;
		state: string;
		coverageBadge: ReturnType<typeof buildPublicCoverageBadge>;
	};
};
async function listPublicSummaryResults(
	ctx: ServiceContext,
	args: {
		query?: string;
		topic?: string;
		limit?: number;
	},
): Promise<PublicSummaryResult[]> {
	const limit = Math.min(Math.max(args.limit ?? 20, 1), 50);
	const normalizedQuery = normalizeSearchText(args.query ?? "");
	const normalizedTopic = args.topic ? canonicalTopic(args.topic) : null;
	const summarizedMeetings = await ctx.data
		.select("meetings")
		.orderBy(["status", "_creationTime", "_id"])
		.where("status", "=", "summarized")
		.all();
	summarizedMeetings.sort((a, b) => b.meetingDate - a.meetingDate);
	const results: PublicSummaryResult[] = [];
	for (const meeting of summarizedMeetings) {
		const municipality = await ctx.data.find(meeting.municipalityId);
		if (!municipality || !isCoveragePublic(municipality)) continue;
		const summary = await getFinalSummaryForMeeting(ctx, meeting._id);
		if (!summary) continue;
		if (
			normalizedTopic &&
			!summary.topics.some((topic) => canonicalTopic(topic) === normalizedTopic)
		) {
			continue;
		}
		const searchableText = summarySearchText({
			summary,
			meeting,
			municipality,
		});
		if (normalizedQuery && !searchableText.includes(normalizedQuery)) {
			continue;
		}
		results.push({
			meetingId: meeting._id,
			meetingSlug: meeting.slug,
			title: meeting.title,
			meetingDate: meeting.meetingDate,
			meetingType: meeting.meetingType,
			status: meeting.status,
			summaryId: summary._id,
			summarySnippet: summarySnippet(summary, normalizedQuery),
			topics: summary.topics,
			municipality: {
				id: municipality._id,
				slug: municipality.slug,
				name: municipality.name,
				state: municipality.state,
				coverageBadge: buildPublicCoverageBadge(municipality),
			},
		});
		if (!normalizedQuery && !normalizedTopic && results.length >= limit) {
			break;
		}
	}
	return results.slice(0, limit);
}
function summarySearchText({
	summary,
	meeting,
	municipality,
}: {
	summary: Doc<"summaries">;
	meeting: Doc<"meetings">;
	municipality: Doc<"municipalities">;
}): string {
	return normalizeSearchText(
		[
			municipality.name,
			municipality.state,
			meeting.title,
			meeting.meetingType,
			summary.executiveSummary,
			...summary.topics,
			...summary.keyDecisions.map(
				(decision) => `${decision.title} ${decision.description}`,
			),
			...summary.discussionTopics.map(
				(topic) => `${topic.topic} ${topic.summary} ${topic.category}`,
			),
			...(summary.publicComments
				? [summary.publicComments.summary, ...summary.publicComments.themes]
				: []),
			...summary.upcomingItems.map((item) => item.title),
		].join(" "),
	);
}
function summarySnippet(summary: Doc<"summaries">, query: string): string {
	const text = summary.executiveSummary.trim();
	if (!text) return "";
	if (!query) return truncate(text, 220);
	const normalizedText = normalizeSearchText(text);
	const index = normalizedText.indexOf(query);
	if (index === -1) return truncate(text, 220);
	const start = Math.max(0, index - 80);
	const end = Math.min(text.length, index + query.length + 140);
	const prefix = start > 0 ? "..." : "";
	const suffix = end < text.length ? "..." : "";
	return `${prefix}${text.slice(start, end).trim()}${suffix}`;
}
function truncate(value: string, maxLength: number): string {
	if (value.length <= maxLength) return value;
	return `${value.slice(0, maxLength - 3).trim()}...`;
}
function canonicalTopic(value: string): string {
	const normalized = normalizeSearchText(value).replaceAll(" ", "-");
	const aliases: Record<string, string> = {
		"budget-finance": "budget",
		budgets: "budget",
		finance: "budget",
		schools: "education",
		school: "education",
		education: "education",
		"public-safety": "safety",
		safety: "safety",
		police: "safety",
		"housing-development": "housing",
		development: "housing",
		planning: "zoning",
		"zoning-planning": "zoning",
		transit: "transportation",
	};
	return aliases[normalized] ?? normalized;
}
function normalizeSearchText(value: string): string {
	return value
		.toLowerCase()
		.replace(/&/g, " ")
		.replace(/[^a-z0-9]+/g, " ")
		.trim()
		.replace(/\s+/g, " ");
}
