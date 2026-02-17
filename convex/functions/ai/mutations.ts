import { v } from "convex/values";
import { internalMutation, mutation } from "../../_generated/server";

// ═══════════════════════════════════════════════════════════════
// UPDATE MEETING STATUS - Update processing status
// ═══════════════════════════════════════════════════════════════
export const updateMeetingStatus = internalMutation({
	args: {
		meetingId: v.id("meetings"),
		status: v.union(
			v.literal("pending"),
			v.literal("processing"),
			v.literal("summarized"),
			v.literal("failed"),
			v.literal("skipped"),
		),
		error: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const meeting = await ctx.db.get(args.meetingId);
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

		await ctx.db.patch(args.meetingId, updates);
	},
});

// ═══════════════════════════════════════════════════════════════
// CREATE SUMMARY - Create a new summary for a meeting
// ═══════════════════════════════════════════════════════════════
export const createSummary = internalMutation({
	args: {
		meetingId: v.id("meetings"),
		summary: v.object({
			executiveSummary: v.string(),
			keyDecisions: v.array(
				v.object({
					title: v.string(),
					description: v.string(),
					voteResult: v.optional(
						v.object({
							yes: v.number(),
							no: v.number(),
							abstain: v.number(),
							passed: v.boolean(),
						}),
					),
					topics: v.array(v.string()),
					importance: v.optional(
						v.union(v.literal("high"), v.literal("medium"), v.literal("low")),
					),
				}),
			),
			discussionTopics: v.array(
				v.object({
					topic: v.string(),
					summary: v.string(),
					category: v.string(),
				}),
			),
			publicComments: v.optional(
				v.object({
					count: v.number(),
					summary: v.string(),
					themes: v.array(v.string()),
					sentiment: v.optional(
						v.union(
							v.literal("positive"),
							v.literal("negative"),
							v.literal("mixed"),
							v.literal("neutral"),
						),
					),
				}),
			),
			upcomingItems: v.array(
				v.object({
					title: v.string(),
					expectedDate: v.optional(v.string()),
				}),
			),
			topics: v.array(v.string()),
			sentiment: v.optional(
				v.union(
					v.literal("routine"),
					v.literal("contentious"),
					v.literal("celebratory"),
					v.literal("urgent"),
				),
			),
			modelUsed: v.string(),
			promptVersion: v.string(),
			processingTimeMs: v.number(),
		}),
	},
	handler: async (ctx, args) => {
		// Check for existing summary
		const existing = await ctx.db
			.query("summaries")
			.withIndex("by_meeting", (q) => q.eq("meetingId", args.meetingId))
			.first();

		// Determine version
		const version = existing ? existing.version + 1 : 1;

		// Delete old summary if exists (we only keep latest)
		if (existing) {
			await ctx.db.delete(existing._id);
		}

		// Create new summary
		const summaryId = await ctx.db.insert("summaries", {
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

export const migrateNormalizeTopics = mutation({
	args: {
		cursor: v.optional(v.string()),
		batchSize: v.optional(v.number()),
		dryRun: v.optional(v.boolean()),
	},
	handler: async (ctx, args) => {
		const batchSize = args.batchSize ?? 100;
		const dryRun = args.dryRun ?? false;

		const query = ctx.db.query("summaries");
		const results = await query.collect();

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
					await ctx.db.patch(summary._id, {
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

export const migrateMeetingTypes = mutation({
	args: {
		dryRun: v.optional(v.boolean()),
	},
	handler: async (ctx, args) => {
		const dryRun = args.dryRun ?? false;
		const allMeetings = await ctx.db.query("meetings").collect();

		let updated = 0;
		let skipped = 0;
		const changes: Array<{ title: string; from: string; to: string }> = [];

		for (const meeting of allMeetings) {
			const inferred = inferMeetingType(meeting.title);
			if (inferred !== meeting.meetingType) {
				if (!dryRun) {
					await ctx.db.patch(meeting._id, { meetingType: inferred });
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
export const updateMeetingContent = internalMutation({
	args: {
		meetingId: v.id("meetings"),
		rawContent: v.string(),
	},
	handler: async (ctx, args) => {
		const meeting = await ctx.db.get(args.meetingId);
		if (!meeting) {
			throw new Error("Meeting not found");
		}

		await ctx.db.patch(args.meetingId, {
			rawContent: args.rawContent,
			updatedAt: Date.now(),
		});
	},
});
