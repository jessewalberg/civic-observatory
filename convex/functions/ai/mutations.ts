import { v } from "convex/values";
import { internalMutation } from "../../_generated/server";

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
