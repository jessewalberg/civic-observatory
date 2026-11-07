import { z } from "zod";
import { internal } from "../../api";
import { sql } from "../../database";
import { entityId } from "../../id";
import { getCurrentUser, requireAdmin } from "../../lib/auth";
import { createMeetingSlug, createMunicipalitySlug } from "../../lib/seoSlugs";
import type { Doc, Id } from "../../model";
import {
	defineWrite,
	privateWrite,
	type ServiceContext,
} from "../../procedure";

// Meeting type validator
const meetingTypeValidator = z.union([
	z.literal("city_council"),
	z.literal("school_board"),
	z.literal("planning_commission"),
	z.literal("zoning_board"),
	z.literal("budget_committee"),
	z.literal("other"),
]);
// Status validator
const statusValidator = z.union([
	z.literal("pending"),
	z.literal("processing"),
	z.literal("summarized"),
	z.literal("failed"),
	z.literal("skipped"),
]);
// ═══════════════════════════════════════════════════════════════
// CREATE - New meeting from user upload
// ═══════════════════════════════════════════════════════════════
export const create = defineWrite({
	args: {
		municipalityId: entityId("municipalities"),
		title: z.string(),
		meetingType: meetingTypeValidator,
		meetingDate: z.number(),
		rawContent: z.string().optional(),
		documentId: entityId("_storage").optional(),
		sourceUrl: z.string().optional(),
	},
	handler: async (ctx, args) => {
		const user = await getCurrentUser(ctx);
		if (!user) {
			throw new Error("User not found. Please sign in.");
		}
		// Verify municipality exists
		const municipality = await ctx.data.find(args.municipalityId);
		if (!municipality) {
			throw new Error("Municipality not found");
		}
		if (args.documentId) {
			const document = await ctx.env.DB.prepare(
				"SELECT owner_id FROM documents WHERE id=?",
			)
				.bind(args.documentId)
				.first<{
					owner_id: string;
				}>();
			if (!document || document.owner_id !== ctx.identity?.subject)
				throw new Error("Document does not belong to the current account");
		}
		// Generate content hash if we have content
		let contentHash: string | undefined;
		if (args.rawContent) {
			// Simple hash - in production, use crypto.subtle.digest
			contentHash = await generateContentHash(args.rawContent);
		}
		// Check for duplicate content
		if (contentHash) {
			const existing = await ctx.data
				.select("meetings")
				.orderBy(["contentHash", "_creationTime", "_id"])
				.where("contentHash", "=", contentHash)
				.one();
			if (existing && existing.municipalityId === args.municipalityId) {
				throw new Error("A meeting with this content already exists");
			}
		}
		const now = Date.now();
		const slug = await createUniqueMeetingSlug(ctx, {
			municipality,
			title: args.title,
			meetingDate: args.meetingDate,
		});
		// Create the meeting
		const meetingId = await ctx.data.add("meetings", {
			municipalityId: args.municipalityId,
			title: args.title,
			slug,
			meetingType: args.meetingType,
			meetingDate: args.meetingDate,
			sourceUrl: args.sourceUrl,
			sourceType: "uploaded",
			rawContent: args.rawContent,
			documentId: args.documentId,
			contentHash,
			status: "pending",
			processingAttempts: 0,
			uploadedByUserId: user._id,
			createdAt: now,
			updatedAt: now,
		});
		// Record usage (monthly window for uploads)
		const windowStart = getMonthStart();
		const existingUsage = await ctx.data
			.select("usageRecords")
			.orderBy([
				"userId",
				"action",
				"windowType",
				"windowStart",
				"_creationTime",
				"_id",
			])
			.where("userId", "=", user._id)
			.where("action", "=", "meeting_upload")
			.where("windowType", "=", "month")
			.where("windowStart", "=", windowStart)
			.one();
		if (existingUsage) {
			await ctx.data.update(existingUsage._id, {
				count: existingUsage.count + 1,
			});
		} else {
			await ctx.data.add("usageRecords", {
				userId: user._id,
				action: "meeting_upload",
				windowType: "month",
				windowStart,
				count: 1,
			});
		}
		const hasContentSource = Boolean(
			args.rawContent?.trim() || args.documentId || args.sourceUrl?.trim(),
		);
		if (args.meetingDate <= now || hasContentSource) {
			await ctx.jobs.enqueue(
				0,
				internal.functions.ai.summarize.summarizeMeeting,
				summarizeArgsForMeeting(meetingId, args.meetingDate),
			);
		}
		return meetingId;
	},
});
// ═══════════════════════════════════════════════════════════════
// UPDATE STATUS - Change processing status
// ═══════════════════════════════════════════════════════════════
// Backend-only (no client callers): a public mutation here let any client
// pipeline calls it server-side; clients use the admin-gated requeue path.
export const updateStatus = privateWrite({
	args: {
		meetingId: entityId("meetings"),
		status: statusValidator,
		processingError: z.string().optional(),
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
		if (args.processingError !== undefined) {
			updates.processingError = args.processingError;
		}
		// Increment processing attempts if moving to processing
		if (args.status === "processing") {
			updates.processingAttempts = (meeting.processingAttempts ?? 0) + 1;
		}
		await ctx.data.update(args.meetingId, updates);
		// Re-queue processing when a meeting is moved back to pending (past meetings only).
		if (args.status === "pending" && meeting.meetingDate <= Date.now()) {
			await ctx.jobs.enqueue(
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
export const createFromScrape = privateWrite({
	args: {
		municipalityId: entityId("municipalities"),
		title: z.string(),
		meetingType: meetingTypeValidator,
		meetingDate: z.number(),
		sourceUrl: z.string(),
		rawContent: z.string().optional(),
		contentHash: z.string().optional(),
		scrapeJobId: entityId("scrapeJobs"),
	},
	handler: async (ctx, args) => {
		// Check for existing meeting with same source URL
		const existingByUrl = await ctx.data
			.select("meetings")
			.where(sql.eq(sql.column("sourceUrl"), args.sourceUrl))
			.one();
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
			const existingByHash = await ctx.data
				.select("meetings")
				.orderBy(["contentHash", "_creationTime", "_id"])
				.where("contentHash", "=", args.contentHash)
				.one();
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
		const municipality = await ctx.data.find(args.municipalityId);
		if (!municipality) {
			throw new Error("Municipality not found");
		}
		const slug = await createUniqueMeetingSlug(ctx, {
			municipality,
			title: args.title,
			meetingDate: args.meetingDate,
		});
		// Create the meeting
		const meetingId = await ctx.data.add("meetings", {
			municipalityId: args.municipalityId,
			title: args.title,
			slug,
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
export const remove = defineWrite({
	args: {
		meetingId: entityId("meetings"),
	},
	handler: async (ctx, args) => {
		const user = await getCurrentUser(ctx);
		if (!user) {
			throw new Error("User not found. Please sign in.");
		}
		// Check admin status
		if (!user.isAdmin) {
			throw new Error("Only administrators can delete meetings");
		}
		const meeting = await ctx.data.find(args.meetingId);
		if (!meeting) {
			throw new Error("Meeting not found");
		}
		// Delete associated summaries
		const summaries = await ctx.data
			.select("summaries")
			.orderBy(["meetingId", "_creationTime", "_id"])
			.where("meetingId", "=", args.meetingId)
			.all();
		for (const summary of summaries) {
			await ctx.data.remove(summary._id);
		}
		// Delete associated alerts
		const alerts = await ctx.data
			.select("alerts")
			.where(sql.eq(sql.column("meetingId"), args.meetingId))
			.all();
		for (const alert of alerts) {
			await ctx.data.remove(alert._id);
		}
		// Delete the meeting
		await ctx.data.remove(args.meetingId);
		return { success: true };
	},
});
// ═══════════════════════════════════════════════════════════════
// RETRY PROCESSING - Retry a failed meeting
// ═══════════════════════════════════════════════════════════════
export const retryProcessing = defineWrite({
	args: {
		meetingId: entityId("meetings"),
	},
	handler: async (ctx, args) => {
		// Get user
		const user = await getCurrentUser(ctx);
		if (!user) {
			throw new Error("User not found. Please sign in.");
		}
		const meeting = await ctx.data.find(args.meetingId);
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
		await ctx.data.update(args.meetingId, {
			status: "pending",
			processingError: undefined,
			updatedAt: Date.now(),
		});
		// Schedule AI summarization
		await ctx.jobs.enqueue(
			0,
			internal.functions.ai.summarize.summarizeMeeting,
			summarizeArgsForMeeting(args.meetingId, meeting.meetingDate),
		);
		return { success: true };
	},
});
// ═══════════════════════════════════════════════════════════════
// ADMIN REQUEUE MEETING - Requeue one meeting for summarization
// ═══════════════════════════════════════════════════════════════
export const adminRequeueMeeting = defineWrite({
	args: {
		meetingId: entityId("meetings"),
	},
	handler: async (ctx, args) => {
		await requireAdminUser(ctx);
		const meeting = await ctx.data.find(args.meetingId);
		if (!meeting) {
			throw new Error("Meeting not found");
		}
		const existingSummary = await getFinalSummaryForMeeting(
			ctx,
			args.meetingId,
		);
		if (existingSummary) {
			throw new Error("Meeting already has a summary");
		}
		if (
			(!meeting.rawContent || meeting.rawContent.trim().length === 0) &&
			(!meeting.sourceUrl || meeting.sourceUrl.trim().length === 0) &&
			!meeting.documentId
		) {
			throw new Error("Meeting has no available content source");
		}
		await ctx.data.update(args.meetingId, {
			status: "pending",
			processingError: undefined,
			updatedAt: Date.now(),
		});
		await ctx.jobs.enqueue(
			0,
			internal.functions.ai.summarize.summarizeMeeting,
			summarizeArgsForMeeting(args.meetingId, meeting.meetingDate),
		);
		return { success: true };
	},
});
// ═══════════════════════════════════════════════════════════════
// ADMIN REQUEUE MUNICIPALITY CANDIDATES - Bulk requeue
// ═══════════════════════════════════════════════════════════════
export const adminRequeueMunicipalityCandidates = defineWrite({
	args: {
		municipalityId: entityId("municipalities"),
		limit: z.number().optional(),
		dryRun: z.boolean().optional(),
	},
	handler: async (ctx, args) => {
		await requireAdminUser(ctx);
		const municipality = await ctx.data.find(args.municipalityId);
		if (!municipality) {
			throw new Error("Municipality not found");
		}
		const limit = Math.max(1, Math.min(args.limit ?? 100, 500));
		const dryRun = args.dryRun === true;
		const meetings = await ctx.data
			.select("meetings")
			.orderBy(["municipalityId", "meetingDate", "_creationTime", "_id"])
			.where("municipalityId", "=", args.municipalityId)
			.direction("desc")
			.all();
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
			const existingSummary = await getFinalSummaryForMeeting(ctx, meeting._id);
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
					await ctx.data.update(meeting._id, {
						status: "pending",
						processingError: undefined,
						updatedAt: Date.now(),
					});
					await ctx.jobs.enqueue(
						0,
						internal.functions.ai.summarize.summarizeMeeting,
						summarizeArgsForMeeting(meeting._id, meeting.meetingDate),
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
export const adminUnstickMunicipalityProcessing = defineWrite({
	args: {
		municipalityId: entityId("municipalities"),
		olderThanMinutes: z.number().optional(),
		limit: z.number().optional(),
	},
	handler: async (ctx, args) => {
		await requireAdminUser(ctx);
		const municipality = await ctx.data.find(args.municipalityId);
		if (!municipality) {
			throw new Error("Municipality not found");
		}
		const limit = Math.max(1, Math.min(args.limit ?? 500, 1000));
		const olderThanMinutes = Math.max(
			0,
			Math.min(args.olderThanMinutes ?? 10, 7 * 24 * 60),
		);
		const cutoff = Date.now() - olderThanMinutes * 60 * 1000;
		const meetings = await ctx.data
			.select("meetings")
			.orderBy(["municipalityId", "meetingDate", "_creationTime", "_id"])
			.where("municipalityId", "=", args.municipalityId)
			.direction("desc")
			.all();
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
				const existingSummary = await getFinalSummaryForMeeting(
					ctx,
					meeting._id,
				);
				if (existingSummary) {
					continue;
				}
				await ctx.data.update(meeting._id, {
					status: "pending",
					processingError: undefined,
					updatedAt: Date.now(),
				});
				await ctx.jobs.enqueue(
					0,
					internal.functions.ai.summarize.summarizeMeeting,
					summarizeArgsForMeeting(meeting._id, meeting.meetingDate),
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
export const adminRepairMunicipalityData = defineWrite({
	args: {
		municipalityId: entityId("municipalities"),
		staleProcessingMinutes: z.number().optional(),
		limit: z.number().optional(),
	},
	handler: async (ctx, args) => {
		await requireAdminUser(ctx);
		const municipality = await ctx.data.find(args.municipalityId);
		if (!municipality) {
			throw new Error("Municipality not found");
		}
		const limit = Math.max(1, Math.min(args.limit ?? 1000, 2000));
		const staleMinutes = Math.max(
			0,
			Math.min(args.staleProcessingMinutes ?? 10, 7 * 24 * 60),
		);
		const cutoff = Date.now() - staleMinutes * 60 * 1000;
		const meetings = await ctx.data
			.select("meetings")
			.orderBy(["municipalityId", "meetingDate", "_creationTime", "_id"])
			.where("municipalityId", "=", args.municipalityId)
			.direction("desc")
			.limit(limit);
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
				const summary = await getFinalSummaryForMeeting(ctx, meeting._id);
				const hasSummary = Boolean(summary);
				const hasAnySource =
					(meeting.rawContent?.trim().length ?? 0) > 0 ||
					(meeting.sourceUrl?.trim().length ?? 0) > 0 ||
					Boolean(meeting.documentId);
				const isStaleProcessing =
					meeting.status === "processing" &&
					(meeting.updatedAt ?? meeting.createdAt) <= cutoff;
				if (hasSummary) {
					if (meeting.status !== "summarized") {
						await ctx.data.update(meeting._id, {
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
					await ctx.data.update(meeting._id, {
						status: "pending",
						processingError: undefined,
						updatedAt: Date.now(),
					});
					await ctx.jobs.enqueue(
						0,
						internal.functions.ai.summarize.summarizeMeeting,
						summarizeArgsForMeeting(meeting._id, meeting.meetingDate),
					);
					repairedInvalidSummarized++;
					continue;
				}
				if (isStaleProcessing) {
					if (!hasAnySource) {
						skippedNoSource++;
						continue;
					}
					await ctx.data.update(meeting._id, {
						status: "pending",
						processingError: undefined,
						updatedAt: Date.now(),
					});
					await ctx.jobs.enqueue(
						0,
						internal.functions.ai.summarize.summarizeMeeting,
						summarizeArgsForMeeting(meeting._id, meeting.meetingDate),
					);
					resetStaleProcessing++;
					continue;
				}
				if (meeting.status === "failed" || meeting.status === "skipped") {
					if (!hasAnySource) {
						skippedNoSource++;
						continue;
					}
					await ctx.data.update(meeting._id, {
						status: "pending",
						processingError: undefined,
						updatedAt: Date.now(),
					});
					await ctx.jobs.enqueue(
						0,
						internal.functions.ai.summarize.summarizeMeeting,
						summarizeArgsForMeeting(meeting._id, meeting.meetingDate),
					);
					requeuedFailedOrSkipped++;
					continue;
				}
				// Ensure pending items are actually queued at least once.
				if (meeting.status === "pending" && hasAnySource) {
					await ctx.jobs.enqueue(
						0,
						internal.functions.ai.summarize.summarizeMeeting,
						summarizeArgsForMeeting(meeting._id, meeting.meetingDate),
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
async function createUniqueMeetingSlug(
	ctx: ServiceContext,
	{
		municipality,
		title,
		meetingDate,
		currentId,
	}: {
		municipality: Doc<"municipalities">;
		title: string;
		meetingDate: number;
		currentId?: Id<"meetings">;
	},
): Promise<string> {
	const municipalitySlug =
		municipality.slug ??
		createMunicipalitySlug({
			name: municipality.name,
			state: municipality.state,
		});
	const baseSlug = createMeetingSlug({
		municipalitySlug,
		title,
		meetingDate,
	});
	let candidate = baseSlug;
	let suffix = 2;
	while (true) {
		const existing = await ctx.data
			.select("meetings")
			.orderBy(["slug", "_creationTime", "_id"])
			.where("slug", "=", candidate)
			.one();
		if (!existing || existing._id === currentId) {
			return candidate;
		}
		candidate = `${baseSlug}-${suffix}`;
		suffix++;
	}
}
// ═══════════════════════════════════════════════════════════════
// Helper: Get start of current month
// ═══════════════════════════════════════════════════════════════
function getMonthStart(): number {
	const now = new Date();
	return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
}
async function requireAdminUser(ctx: ServiceContext) {
	// Identity-first admin check via the shared bridge.
	return await requireAdmin(ctx, "Admin access required");
}
function isRequeueStatus(
	status: "pending" | "processing" | "summarized" | "failed" | "skipped",
) {
	return status === "failed" || status === "skipped";
}
function summarizeArgsForMeeting(
	meetingId: Id<"meetings">,
	meetingDate: number,
) {
	return {
		meetingId,
		kind: meetingDate > Date.now() ? "agenda_preview" : "summary",
	} as const;
}
async function getFinalSummaryForMeeting(
	ctx: ServiceContext,
	meetingId: Id<"meetings">,
) {
	const summaries = await ctx.data
		.select("summaries")
		.orderBy(["meetingId", "_creationTime", "_id"])
		.where("meetingId", "=", meetingId)
		.all();
	return summaries.find((summary) => (summary.kind ?? "summary") === "summary");
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
