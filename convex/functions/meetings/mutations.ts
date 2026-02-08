import { v } from "convex/values";
import { internal } from "../../_generated/api";
import { internalMutation, mutation } from "../../_generated/server";

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
		// Auth: workosUserId passed from client
		workosUserId: v.string(),
	},
	handler: async (ctx, args) => {
		// Get user from workos ID
		const user = await ctx.db
			.query("users")
			.withIndex("by_workos_id", (q) => q.eq("workosUserId", args.workosUserId))
			.first();

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

		// Schedule AI summarization
		await ctx.scheduler.runAfter(
			0,
			internal.functions.ai.summarize.summarizeMeeting,
			{ meetingId },
		);

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
		workosUserId: v.string(),
	},
	handler: async (ctx, args) => {
		// Get user from workos ID
		const user = await ctx.db
			.query("users")
			.withIndex("by_workos_id", (q) => q.eq("workosUserId", args.workosUserId))
			.first();

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
		workosUserId: v.string(),
	},
	handler: async (ctx, args) => {
		// Get user
		const user = await ctx.db
			.query("users")
			.withIndex("by_workos_id", (q) => q.eq("workosUserId", args.workosUserId))
			.first();

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
