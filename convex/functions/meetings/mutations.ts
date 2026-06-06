import { v } from "convex/values";
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import {
	internalMutation,
	type MutationCtx,
	mutation,
} from "../../_generated/server";
import { getCurrentUser, requireAdmin } from "../../lib/auth";

// Meeting type validator
const meetingTypeValidator = v.union(
	v.literal("city_council"),
	v.literal("school_board"),
	v.literal("planning_commission"),
	v.literal("zoning_board"),
	v.literal("budget_committee"),
	v.literal("other"),
);

// Status validator
const statusValidator = v.union(
	v.literal("pending"),
	v.literal("processing"),
	v.literal("summarized"),
	v.literal("failed"),
	v.literal("skipped"),
);

// ═══════════════════════════════════════════════════════════════
// CREATE - New meeting from user upload
// ═══════════════════════════════════════════════════════════════
export const create = mutation({
	args: {
		municipalityId: v.id("municipalities"),
		title: v.string(),
		meetingType: meetingTypeValidator,
		meetingDate: v.number(),
		rawContent: v.optional(v.string()),
		documentStorageId: v.optional(v.id("_storage")),
		sourceUrl: v.optional(v.string()),
		// Auth: identity-first; legacy workosUserId ignored under Clerk.
		workosUserId: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const user = await getCurrentUser(ctx, args.workosUserId);

		if (!user) {
			throw new Error("User not found. Please sign in.");
		}

		// Verify municipality exists
		const municipality = await ctx.db.get(args.municipalityId);
		if (!municipality) {
			throw new Error("Municipality not found");
		}

		// Generate content hash if we have content
		let contentHash: string | undefined;
		if (args.rawContent) {
			// Simple hash - in production, use crypto.subtle.digest
			contentHash = await generateContentHash(args.rawContent);
		}

		// Check for duplicate content
		if (contentHash) {
			const existing = await ctx.db
				.query("meetings")
				.withIndex("by_content_hash", (q) => q.eq("contentHash", contentHash))
				.first();

			if (existing && existing.municipalityId === args.municipalityId) {
				throw new Error("A meeting with this content already exists");
			}
		}

		const now = Date.now();

		// Create the meeting
		const meetingId = await ctx.db.insert("meetings", {
			municipalityId: args.municipalityId,
			title: args.title,
			meetingType: args.meetingType,
			meetingDate: args.meetingDate,
			sourceUrl: args.sourceUrl,
			sourceType: "uploaded",
			rawContent: args.rawContent,
			documentStorageId: args.documentStorageId,
			contentHash,
			status: "pending",
			processingAttempts: 0,
			uploadedByUserId: user._id,
			createdAt: now,
			updatedAt: now,
		});

		// Record usage (monthly window for uploads)
		const windowStart = getMonthStart();
		const existingUsage = await ctx.db
			.query("usageRecords")
			.withIndex("by_user_action_window", (q) =>
				q
					.eq("userId", user._id)
					.eq("action", "meeting_upload")
					.eq("windowType", "month")
					.eq("windowStart", windowStart),
			)
			.first();

		if (existingUsage) {
			await ctx.db.patch(existingUsage._id, {
				count: existingUsage.count + 1,
			});
		} else {
			await ctx.db.insert("usageRecords", {
				userId: user._id,
				action: "meeting_upload",
				windowType: "month",
				windowStart,
				count: 1,
			});
		}

		// Schedule AI summarization for past meetings only.
		// Future meetings are stored as agenda previews until the meeting date.
		if (args.meetingDate <= Date.now()) {
			await ctx.scheduler.runAfter(
				0,
				internal.functions.ai.summarize.summarizeMeeting,
				{ meetingId },
			);
		}

		return meetingId;
	},
});

// ═══════════════════════════════════════════════════════════════
// UPDATE STATUS - Change processing status
// ═══════════════════════════════════════════════════════════════
export const updateStatus = mutation({
	args: {
		meetingId: v.id("meetings"),
		status: statusValidator,
		processingError: v.optional(v.string()),
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

		if (args.processingError !== undefined) {
			updates.processingError = args.processingError;
		}

		// Increment processing attempts if moving to processing
		if (args.status === "processing") {
			updates.processingAttempts = (meeting.processingAttempts ?? 0) + 1;
		}

		await ctx.db.patch(args.meetingId, updates);

		// Re-queue processing when a meeting is moved back to pending (past meetings only).
		if (args.status === "pending" && meeting.meetingDate <= Date.now()) {
			await ctx.scheduler.runAfter(
				0,
				internal.functions.ai.summarize.summarizeMeeting,
				{
					meetingId: args.meetingId,
				},
			);
		}
	},
});

// ═══════════════════════════════════════════════════════════════
// CREATE FROM SCRAPE - Internal, from scraper
// ═══════════════════════════════════════════════════════════════
export const createFromScrape = internalMutation({
	args: {
		municipalityId: v.id("municipalities"),
		title: v.string(),
		meetingType: meetingTypeValidator,
		meetingDate: v.number(),
		sourceUrl: v.string(),
		rawContent: v.optional(v.string()),
		contentHash: v.optional(v.string()),
		scrapeJobId: v.id("scrapeJobs"),
	},
	handler: async (ctx, args) => {
		// Check for existing meeting with same source URL
		const existingByUrl = await ctx.db
			.query("meetings")
			.filter((q) => q.eq(q.field("sourceUrl"), args.sourceUrl))
			.first();

		if (existingByUrl) {
			// Already exists, skip
			return {
				status: "skipped" as const,
				reason: "duplicate_url",
				meetingId: existingByUrl._id,
			};
		}

		// Check for duplicate content hash
		if (args.contentHash) {
			const existingByHash = await ctx.db
				.query("meetings")
				.withIndex("by_content_hash", (q) =>
					q.eq("contentHash", args.contentHash),
				)
				.first();

			if (
				existingByHash &&
				existingByHash.municipalityId === args.municipalityId
			) {
				return {
					status: "skipped" as const,
					reason: "duplicate_content",
					meetingId: existingByHash._id,
				};
			}
		}

		const now = Date.now();

		// Create the meeting
		const meetingId = await ctx.db.insert("meetings", {
			municipalityId: args.municipalityId,
			title: args.title,
			meetingType: args.meetingType,
			meetingDate: args.meetingDate,
			sourceUrl: args.sourceUrl,
			sourceType: "scraped",
			rawContent: args.rawContent,
			contentHash: args.contentHash,
			status: "pending",
			processingAttempts: 0,
			scrapeJobId: args.scrapeJobId,
			createdAt: now,
			updatedAt: now,
		});

		return { status: "created" as const, meetingId };
	},
});

// ═══════════════════════════════════════════════════════════════
// DELETE - Remove a meeting (admin only)
// ═══════════════════════════════════════════════════════════════
export const remove = mutation({
	args: {
		meetingId: v.id("meetings"),
		workosUserId: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const user = await getCurrentUser(ctx, args.workosUserId);

		if (!user) {
			throw new Error("User not found. Please sign in.");
		}

		// Check admin status
		if (!user.isAdmin) {
			throw new Error("Only administrators can delete meetings");
		}

		const meeting = await ctx.db.get(args.meetingId);
		if (!meeting) {
			throw new Error("Meeting not found");
		}

		// Delete associated summary
		const summary = await ctx.db
			.query("summaries")
			.withIndex("by_meeting", (q) => q.eq("meetingId", args.meetingId))
			.first();

		if (summary) {
			await ctx.db.delete(summary._id);
		}

		// Delete associated alerts
		const alerts = await ctx.db
			.query("alerts")
			.filter((q) => q.eq(q.field("meetingId"), args.meetingId))
			.collect();

		for (const alert of alerts) {
			await ctx.db.delete(alert._id);
		}

		// Delete the meeting
		await ctx.db.delete(args.meetingId);

		return { success: true };
	},
});

// ═══════════════════════════════════════════════════════════════
// RETRY PROCESSING - Retry a failed meeting
// ═══════════════════════════════════════════════════════════════
export const retryProcessing = mutation({
	args: {
		meetingId: v.id("meetings"),
		workosUserId: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		// Get user
		const user = await getCurrentUser(ctx, args.workosUserId);

		if (!user) {
			throw new Error("User not found. Please sign in.");
		}

		const meeting = await ctx.db.get(args.meetingId);
		if (!meeting) {
			throw new Error("Meeting not found");
		}

		// Only retry failed meetings
		if (meeting.status !== "failed") {
			throw new Error("Can only retry failed meetings");
		}

		// Check if user uploaded this meeting or is admin
		if (meeting.uploadedByUserId !== user._id && !user.isAdmin) {
			throw new Error("You can only retry your own uploads");
		}

		// Reset to pending
		await ctx.db.patch(args.meetingId, {
			status: "pending",
			processingError: undefined,
			updatedAt: Date.now(),
		});

		// Schedule AI summarization
		await ctx.scheduler.runAfter(
			0,
			internal.functions.ai.summarize.summarizeMeeting,
			{ meetingId: args.meetingId },
		);

		return { success: true };
	},
});

// ═══════════════════════════════════════════════════════════════
// ADMIN REQUEUE MEETING - Requeue one meeting for summarization
// ═══════════════════════════════════════════════════════════════
export const adminRequeueMeeting = mutation({
	args: {
		meetingId: v.id("meetings"),
		requestingWorkosUserId: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		await requireAdminUser(ctx, args.requestingWorkosUserId);

		const meeting = await ctx.db.get(args.meetingId);
		if (!meeting) {
			throw new Error("Meeting not found");
		}

		const existingSummary = await ctx.db
			.query("summaries")
			.withIndex("by_meeting", (q) => q.eq("meetingId", args.meetingId))
			.first();
		if (existingSummary) {
			throw new Error("Meeting already has a summary");
		}

		if (
			(!meeting.rawContent || meeting.rawContent.trim().length === 0) &&
			(!meeting.sourceUrl || meeting.sourceUrl.trim().length === 0) &&
			!meeting.documentStorageId
		) {
			throw new Error("Meeting has no available content source");
		}

		await ctx.db.patch(args.meetingId, {
			status: "pending",
			processingError: undefined,
			updatedAt: Date.now(),
		});

		await ctx.scheduler.runAfter(
			0,
			internal.functions.ai.summarize.summarizeMeeting,
			{ meetingId: args.meetingId },
		);

		return { success: true };
	},
});

// ═══════════════════════════════════════════════════════════════
// ADMIN REQUEUE MUNICIPALITY CANDIDATES - Bulk requeue
// ═══════════════════════════════════════════════════════════════
export const adminRequeueMunicipalityCandidates = mutation({
	args: {
		municipalityId: v.id("municipalities"),
		requestingWorkosUserId: v.optional(v.string()),
		limit: v.optional(v.number()),
		dryRun: v.optional(v.boolean()),
	},
	handler: async (ctx, args) => {
		await requireAdminUser(ctx, args.requestingWorkosUserId);

		const municipality = await ctx.db.get(args.municipalityId);
		if (!municipality) {
			throw new Error("Municipality not found");
		}

		const limit = Math.max(1, Math.min(args.limit ?? 100, 500));
		const dryRun = args.dryRun === true;

		const meetings = await ctx.db
			.query("meetings")
			.withIndex("by_municipality_date", (q) =>
				q.eq("municipalityId", args.municipalityId),
			)
			.order("desc")
			.collect();

		const candidates: Array<(typeof meetings)[number]> = [];

		for (const meeting of meetings) {
			if (!isRequeueStatus(meeting.status)) {
				continue;
			}

			if (!meeting.sourceUrl || meeting.sourceUrl.trim().length === 0) {
				continue;
			}

			const meetingsPageUrl = municipality.meetingsPageUrl;
			const sourceEqualsMeetingsPage = meetingsPageUrl
				? normalizeUrl(meeting.sourceUrl) === normalizeUrl(meetingsPageUrl)
				: false;

			if (!isLikelyDocumentUrl(meeting.sourceUrl) && sourceEqualsMeetingsPage) {
				continue;
			}

			const existingSummary = await ctx.db
				.query("summaries")
				.withIndex("by_meeting", (q) => q.eq("meetingId", meeting._id))
				.first();
			if (existingSummary) {
				continue;
			}

			candidates.push(meeting);
		}

		const selected = candidates.slice(0, limit);
		const failures: Array<{
			id: Id<"meetings">;
			title: string;
			error: string;
		}> = [];
		let requeuedCount = 0;

		if (!dryRun) {
			for (const meeting of selected) {
				try {
					await ctx.db.patch(meeting._id, {
						status: "pending",
						processingError: undefined,
						updatedAt: Date.now(),
					});

					await ctx.scheduler.runAfter(
						0,
						internal.functions.ai.summarize.summarizeMeeting,
						{ meetingId: meeting._id },
					);

					requeuedCount++;
				} catch (error) {
					const message =
						error instanceof Error ? error.message : "Unknown requeue error";
					failures.push({
						id: meeting._id,
						title: meeting.title,
						error: message,
					});
				}
			}
		}

		return {
			dryRun,
			scannedMeetings: meetings.length,
			totalCandidates: candidates.length,
			selectedCount: selected.length,
			requeuedCount: dryRun ? 0 : requeuedCount,
			failedCount: dryRun ? 0 : failures.length,
			partial: !dryRun && failures.length > 0,
			failures: failures.slice(0, 25),
			preview: selected.slice(0, 25).map((meeting) => ({
				id: meeting._id,
				title: meeting.title,
				status: meeting.status,
				meetingDate: meeting.meetingDate,
				sourceUrl: meeting.sourceUrl ?? null,
				processingError: meeting.processingError ?? null,
			})),
		};
	},
});

// ═══════════════════════════════════════════════════════════════
// ADMIN UNSTICK MUNICIPALITY PROCESSING - Reset stuck processing rows
// ═══════════════════════════════════════════════════════════════
export const adminUnstickMunicipalityProcessing = mutation({
	args: {
		municipalityId: v.id("municipalities"),
		requestingWorkosUserId: v.optional(v.string()),
		olderThanMinutes: v.optional(v.number()),
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		await requireAdminUser(ctx, args.requestingWorkosUserId);

		const municipality = await ctx.db.get(args.municipalityId);
		if (!municipality) {
			throw new Error("Municipality not found");
		}

		const limit = Math.max(1, Math.min(args.limit ?? 500, 1000));
		const olderThanMinutes = Math.max(
			0,
			Math.min(args.olderThanMinutes ?? 10, 7 * 24 * 60),
		);
		const cutoff = Date.now() - olderThanMinutes * 60 * 1000;

		const meetings = await ctx.db
			.query("meetings")
			.withIndex("by_municipality_date", (q) =>
				q.eq("municipalityId", args.municipalityId),
			)
			.order("desc")
			.collect();

		const processing = meetings.filter((m) => m.status === "processing");
		const selected = processing
			.filter((m) => (m.updatedAt ?? m.createdAt) <= cutoff)
			.slice(0, limit);

		let requeued = 0;
		const failures: Array<{
			id: Id<"meetings">;
			title: string;
			error: string;
		}> = [];

		for (const meeting of selected) {
			try {
				const existingSummary = await ctx.db
					.query("summaries")
					.withIndex("by_meeting", (q) => q.eq("meetingId", meeting._id))
					.first();
				if (existingSummary) {
					continue;
				}

				await ctx.db.patch(meeting._id, {
					status: "pending",
					processingError: undefined,
					updatedAt: Date.now(),
				});

				await ctx.scheduler.runAfter(
					0,
					internal.functions.ai.summarize.summarizeMeeting,
					{ meetingId: meeting._id },
				);
				requeued++;
			} catch (error) {
				failures.push({
					id: meeting._id,
					title: meeting.title,
					error: error instanceof Error ? error.message : "Unknown error",
				});
			}
		}

		return {
			processingCount: processing.length,
			selectedCount: selected.length,
			requeuedCount: requeued,
			failedCount: failures.length,
			olderThanMinutes,
			preview: selected.slice(0, 25).map((m) => ({
				id: m._id,
				title: m.title,
				status: m.status,
				updatedAt: m.updatedAt ?? m.createdAt,
				processingError: m.processingError ?? null,
			})),
			failures: failures.slice(0, 25),
		};
	},
});

// ═══════════════════════════════════════════════════════════════
// ADMIN REPAIR MUNICIPALITY DATA - Normalize statuses + requeue
// ═══════════════════════════════════════════════════════════════
export const adminRepairMunicipalityData = mutation({
	args: {
		municipalityId: v.id("municipalities"),
		requestingWorkosUserId: v.optional(v.string()),
		staleProcessingMinutes: v.optional(v.number()),
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		await requireAdminUser(ctx, args.requestingWorkosUserId);

		const municipality = await ctx.db.get(args.municipalityId);
		if (!municipality) {
			throw new Error("Municipality not found");
		}

		const limit = Math.max(1, Math.min(args.limit ?? 1000, 2000));
		const staleMinutes = Math.max(
			0,
			Math.min(args.staleProcessingMinutes ?? 10, 7 * 24 * 60),
		);
		const cutoff = Date.now() - staleMinutes * 60 * 1000;

		const meetings = await ctx.db
			.query("meetings")
			.withIndex("by_municipality_date", (q) =>
				q.eq("municipalityId", args.municipalityId),
			)
			.order("desc")
			.take(limit);

		let normalizedToSummarized = 0;
		let resetStaleProcessing = 0;
		let repairedInvalidSummarized = 0;
		let requeuedFailedOrSkipped = 0;
		let ensuredPendingQueued = 0;
		let skippedNoSource = 0;
		const failures: Array<{
			id: Id<"meetings">;
			title: string;
			error: string;
		}> = [];

		for (const meeting of meetings) {
			try {
				const summary = await ctx.db
					.query("summaries")
					.withIndex("by_meeting", (q) => q.eq("meetingId", meeting._id))
					.first();

				const hasSummary = Boolean(summary);
				const hasAnySource =
					(meeting.rawContent?.trim().length ?? 0) > 0 ||
					(meeting.sourceUrl?.trim().length ?? 0) > 0 ||
					Boolean(meeting.documentStorageId);
				const isStaleProcessing =
					meeting.status === "processing" &&
					(meeting.updatedAt ?? meeting.createdAt) <= cutoff;

				if (hasSummary) {
					if (meeting.status !== "summarized") {
						await ctx.db.patch(meeting._id, {
							status: "summarized",
							processingError: undefined,
							updatedAt: Date.now(),
						});
						normalizedToSummarized++;
					}
					continue;
				}

				// Status says summarized but summary row is missing: repair and retry.
				if (meeting.status === "summarized") {
					if (!hasAnySource) {
						skippedNoSource++;
						continue;
					}
					await ctx.db.patch(meeting._id, {
						status: "pending",
						processingError: undefined,
						updatedAt: Date.now(),
					});
					await ctx.scheduler.runAfter(
						0,
						internal.functions.ai.summarize.summarizeMeeting,
						{ meetingId: meeting._id },
					);
					repairedInvalidSummarized++;
					continue;
				}

				if (isStaleProcessing) {
					if (!hasAnySource) {
						skippedNoSource++;
						continue;
					}
					await ctx.db.patch(meeting._id, {
						status: "pending",
						processingError: undefined,
						updatedAt: Date.now(),
					});
					await ctx.scheduler.runAfter(
						0,
						internal.functions.ai.summarize.summarizeMeeting,
						{ meetingId: meeting._id },
					);
					resetStaleProcessing++;
					continue;
				}

				if (meeting.status === "failed" || meeting.status === "skipped") {
					if (!hasAnySource) {
						skippedNoSource++;
						continue;
					}
					await ctx.db.patch(meeting._id, {
						status: "pending",
						processingError: undefined,
						updatedAt: Date.now(),
					});
					await ctx.scheduler.runAfter(
						0,
						internal.functions.ai.summarize.summarizeMeeting,
						{ meetingId: meeting._id },
					);
					requeuedFailedOrSkipped++;
					continue;
				}

				// Ensure pending items are actually queued at least once.
				if (meeting.status === "pending" && hasAnySource) {
					await ctx.scheduler.runAfter(
						0,
						internal.functions.ai.summarize.summarizeMeeting,
						{ meetingId: meeting._id },
					);
					ensuredPendingQueued++;
				}
			} catch (error) {
				failures.push({
					id: meeting._id,
					title: meeting.title,
					error: error instanceof Error ? error.message : "Unknown error",
				});
			}
		}

		return {
			municipalityId: args.municipalityId,
			scanned: meetings.length,
			staleProcessingMinutes: staleMinutes,
			normalizedToSummarized,
			repairedInvalidSummarized,
			resetStaleProcessing,
			requeuedFailedOrSkipped,
			ensuredPendingQueued,
			skippedNoSource,
			failedCount: failures.length,
			failures: failures.slice(0, 25),
		};
	},
});

// ═══════════════════════════════════════════════════════════════
// Helper: Generate content hash
// ═══════════════════════════════════════════════════════════════
async function generateContentHash(content: string): Promise<string> {
	// Simple hash for now - normalize whitespace and create basic hash
	const normalized = content.trim().replace(/\s+/g, " ").toLowerCase();

	// Simple string hash (in production, use crypto.subtle.digest)
	let hash = 0;
	for (let i = 0; i < normalized.length; i++) {
		const char = normalized.charCodeAt(i);
		hash = (hash << 5) - hash + char;
		hash = hash & hash; // Convert to 32bit integer
	}

	return `hash_${Math.abs(hash).toString(16)}`;
}

// ═══════════════════════════════════════════════════════════════
// Helper: Get start of current month
// ═══════════════════════════════════════════════════════════════
function getMonthStart(): number {
	const now = new Date();
	return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
}

async function requireAdminUser(ctx: MutationCtx, workosUserId?: string) {
	// Identity-first via the shared bridge; legacy workosUserId only consulted
	// when no Clerk identity is present. Removed in Phase 5.
	return await requireAdmin(ctx, workosUserId, "Admin access required");
}

function isRequeueStatus(
	status: "pending" | "processing" | "summarized" | "failed" | "skipped",
) {
	return status === "failed" || status === "skipped";
}

function normalizeUrl(url: string): string {
	try {
		const parsed = new URL(url);
		const path = parsed.pathname.replace(/\/+$/, "") || "/";
		return `${parsed.protocol}//${parsed.host.toLowerCase()}${path}${parsed.search}`;
	} catch {
		return url.toLowerCase().trim();
	}
}

function isLikelyDocumentUrl(url: string): boolean {
	return (
		/\.pdf(\?|#|$)/i.test(url) ||
		/\/ViewFile/i.test(url) ||
		/\/View\.ashx/i.test(url)
	);
}
