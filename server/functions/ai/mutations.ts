import { z } from "zod";
import { entityId } from "../../id";
import { defineWrite, privateWrite } from "../../procedure";

const summaryKindValidator = z.union([
	z.literal("summary"),
	z.literal("agenda_preview"),
]);
// ═══════════════════════════════════════════════════════════════
// UPDATE MEETING STATUS - Update processing status
// ═══════════════════════════════════════════════════════════════
export const updateMeetingStatus = privateWrite({
	args: {
		meetingId: entityId("meetings"),
		status: z.union([
			z.literal("pending"),
			z.literal("processing"),
			z.literal("summarized"),
			z.literal("failed"),
			z.literal("skipped"),
		]),
		error: z.string().optional(),
	},
	handler: async (ctx, args) => {
		const meeting = await ctx.data.find(args.meetingId);
		if (!meeting) {
			throw new Error("Meeting not found");
		}
		const updates: Record<string, unknown> = {
			status: args.status,
			updatedAt: Date.now(),
		};
		if (args.error !== undefined) {
			updates.processingError = args.error;
		}
		// Clear error when moving to processing or pending
		if (args.status === "processing" || args.status === "pending") {
			updates.processingError = undefined;
		}
		// Increment processing attempts when moving to processing
		if (args.status === "processing") {
			updates.processingAttempts = (meeting.processingAttempts ?? 0) + 1;
		}
		await ctx.data.update(args.meetingId, updates);
	},
});
// ═══════════════════════════════════════════════════════════════
// CREATE SUMMARY - Create a new summary for a meeting
// ═══════════════════════════════════════════════════════════════
export const createSummary = privateWrite({
	args: {
		meetingId: entityId("meetings"),
		kind: summaryKindValidator.optional(),
		summary: z.object({
			executiveSummary: z.string(),
			keyDecisions: z.array(
				z.object({
					title: z.string(),
					description: z.string(),
					voteResult: z
						.object({
							yes: z.number(),
							no: z.number(),
							abstain: z.number(),
							passed: z.boolean(),
						})
						.optional(),
					topics: z.array(z.string()),
					importance: z
						.union([z.literal("high"), z.literal("medium"), z.literal("low")])
						.optional(),
				}),
			),
			discussionTopics: z.array(
				z.object({
					topic: z.string(),
					summary: z.string(),
					category: z.string(),
				}),
			),
			publicComments: z
				.object({
					count: z.number(),
					summary: z.string(),
					themes: z.array(z.string()),
					sentiment: z
						.union([
							z.literal("positive"),
							z.literal("negative"),
							z.literal("mixed"),
							z.literal("neutral"),
						])
						.optional(),
				})
				.optional(),
			upcomingItems: z.array(
				z.object({ title: z.string(), expectedDate: z.string().optional() }),
			),
			topics: z.array(z.string()),
			sentiment: z
				.union([
					z.literal("routine"),
					z.literal("contentious"),
					z.literal("celebratory"),
					z.literal("urgent"),
				])
				.optional(),
			modelUsed: z.string(),
			promptVersion: z.string(),
			processingTimeMs: z.number(),
		}),
	},
	handler: async (ctx, args) => {
		const meeting = await ctx.data.find(args.meetingId);
		if (!meeting) {
			throw new Error("Meeting not found");
		}
		const summaryKind = args.kind ?? "summary";
		const existingSummaries = await ctx.data
			.select("summaries")
			.orderBy(["meetingId", "_creationTime", "_id"])
			.where("meetingId", "=", args.meetingId)
			.all();
		const existingSameKind = existingSummaries.filter(
			(summary) => (summary.kind ?? "summary") === summaryKind,
		);
		const version =
			existingSameKind.length > 0
				? Math.max(...existingSameKind.map((summary) => summary.version)) + 1
				: 1;
		for (const existing of existingSameKind) {
			await ctx.data.remove(existing._id);
		}
		// Create new summary
		const summaryId = await ctx.data.add("summaries", {
			meetingId: args.meetingId,
			version,
			executiveSummary: args.summary.executiveSummary,
			keyDecisions: args.summary.keyDecisions,
			discussionTopics: args.summary.discussionTopics,
			publicComments: args.summary.publicComments,
			upcomingItems: args.summary.upcomingItems,
			topics: args.summary.topics,
			sentiment: args.summary.sentiment,
			modelUsed: args.summary.modelUsed,
			promptVersion: args.summary.promptVersion,
			processingTimeMs: args.summary.processingTimeMs,
			municipalityId: meeting.municipalityId,
			meetingDate: meeting.meetingDate,
			sourceUrl: meeting.sourceUrl,
			sourceType: meeting.sourceType,
			sourceContentHash: meeting.contentHash,
			kind: summaryKind,
			status: "summarized",
			createdAt: Date.now(),
		});
		return summaryId;
	},
});
// ═══════════════════════════════════════════════════════════════
// MIGRATE: Normalize all summary topics to canonical set
// ═══════════════════════════════════════════════════════════════
const VALID_TOPICS = new Set([
	"budget",
	"zoning",
	"infrastructure",
	"safety",
	"education",
	"environment",
	"housing",
	"transportation",
	"other",
]);
const TOPIC_ALIASES: Record<string, string> = {
	public_safety: "safety",
	police: "safety",
	fire: "safety",
	healthcare: "safety",
	emergency_planning: "safety",
	emergency: "safety",
	public_health: "safety",
	utilities: "infrastructure",
	water: "infrastructure",
	sewer: "infrastructure",
	facilities: "infrastructure",
	communications: "infrastructure",
	parks: "environment",
	recreation: "environment",
	beach_access: "environment",
	conservation: "environment",
	sustainability: "environment",
	economic_dev: "budget",
	finance: "budget",
	finance_committee: "budget",
	taxes: "budget",
	annual_meeting: "budget",
	planning: "zoning",
	development: "zoning",
	land_use: "zoning",
	charter_revision: "zoning",
	municipal_governance: "zoning",
	town_charter: "zoning",
	schools: "education",
	transit: "transportation",
	traffic: "transportation",
	roads: "transportation",
	elections: "other",
	public_participation: "other",
	meeting_administration: "other",
	administration: "other",
};
function migNormalizeTopic(raw: string): string {
	const lower = raw.toLowerCase().trim();
	if (VALID_TOPICS.has(lower)) return lower;
	if (TOPIC_ALIASES[lower]) return TOPIC_ALIASES[lower];
	return "other";
}
function migNormalizeTopics(raw: string[]): string[] {
	const mapped = raw.map(migNormalizeTopic);
	const unique = [...new Set(mapped)];
	if (unique.length > 1) return unique.filter((t) => t !== "other");
	return unique;
}
export const migrateNormalizeTopics = defineWrite({
	args: {
		cursor: z.string().optional(),
		batchSize: z.number().optional(),
		dryRun: z.boolean().optional(),
	},
	handler: async (ctx, args) => {
		const batchSize = args.batchSize ?? 100;
		const dryRun = args.dryRun ?? false;
		const query = ctx.data.select("summaries");
		const results = await query.all();
		// Manual cursor: skip past already-processed IDs
		let startIdx = 0;
		if (args.cursor) {
			const idx = results.findIndex((s) => s._id === args.cursor);
			if (idx >= 0) startIdx = idx + 1;
		}
		const batch = results.slice(startIdx, startIdx + batchSize);
		let updated = 0;
		let skipped = 0;
		let nextCursor: string | null = null;
		for (const summary of batch) {
			const newTopics = migNormalizeTopics(summary.topics);
			const newKeyDecisions = summary.keyDecisions.map((kd) => ({
				...kd,
				topics: migNormalizeTopics(kd.topics),
			}));
			const newDiscussionTopics = summary.discussionTopics.map((dt) => ({
				...dt,
				category: migNormalizeTopic(dt.category),
			}));
			// Check if anything changed
			const topicsChanged =
				JSON.stringify(newTopics) !== JSON.stringify(summary.topics);
			const decisionsChanged =
				JSON.stringify(newKeyDecisions) !==
				JSON.stringify(summary.keyDecisions);
			const discussionChanged =
				JSON.stringify(newDiscussionTopics) !==
				JSON.stringify(summary.discussionTopics);
			if (topicsChanged || decisionsChanged || discussionChanged) {
				if (!dryRun) {
					await ctx.data.update(summary._id, {
						topics: newTopics,
						keyDecisions: newKeyDecisions,
						discussionTopics: newDiscussionTopics,
					});
				}
				updated++;
			} else {
				skipped++;
			}
			nextCursor = summary._id;
		}
		const hasMore = startIdx + batchSize < results.length;
		return {
			updated,
			skipped,
			batchProcessed: batch.length,
			totalSummaries: results.length,
			hasMore,
			nextCursor: hasMore ? nextCursor : null,
			dryRun,
		};
	},
});

// ═══════════════════════════════════════════════════════════════
// MIGRATE: Re-infer meeting types from titles
// ═══════════════════════════════════════════════════════════════
import { inferMeetingType } from "../../scrapers/utils";
export const migrateMeetingTypes = defineWrite({
	args: {
		dryRun: z.boolean().optional(),
	},
	handler: async (ctx, args) => {
		const dryRun = args.dryRun ?? false;
		const allMeetings = await ctx.data.select("meetings").all();
		let updated = 0;
		let skipped = 0;
		const changes: Array<{
			title: string;
			from: string;
			to: string;
		}> = [];
		for (const meeting of allMeetings) {
			const inferred = inferMeetingType(meeting.title);
			if (inferred !== meeting.meetingType) {
				if (!dryRun) {
					await ctx.data.update(meeting._id, { meetingType: inferred });
				}
				changes.push({
					title: meeting.title.substring(0, 60),
					from: meeting.meetingType,
					to: inferred,
				});
				updated++;
			} else {
				skipped++;
			}
		}
		return {
			total: allMeetings.length,
			updated,
			skipped,
			dryRun,
			sampleChanges: changes.slice(0, 20),
		};
	},
});
// ═══════════════════════════════════════════════════════════════
// UPDATE MEETING CONTENT - Update rawContent after extraction
// ═══════════════════════════════════════════════════════════════
export const updateMeetingContent = privateWrite({
	args: {
		meetingId: entityId("meetings"),
		rawContent: z.string(),
	},
	handler: async (ctx, args) => {
		const meeting = await ctx.data.find(args.meetingId);
		if (!meeting) {
			throw new Error("Meeting not found");
		}
		await ctx.data.update(args.meetingId, {
			rawContent: args.rawContent,
			updatedAt: Date.now(),
		});
	},
});
