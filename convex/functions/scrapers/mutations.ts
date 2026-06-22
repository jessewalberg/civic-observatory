import { v } from "convex/values";
import { internal } from "../../_generated/api";
import type { Doc, Id } from "../../_generated/dataModel";
import { internalMutation, type MutationCtx } from "../../_generated/server";
import { createMeetingSlug, createMunicipalitySlug } from "../../lib/seoSlugs";
import { normalizeUrl } from "../../scrapers/utils";

// ═══════════════════════════════════════════════════════════════
// CREATE SCRAPE JOB - Create a new scrape job record
// ═══════════════════════════════════════════════════════════════
export const createScrapeJob = internalMutation({
	args: {
		municipalityId: v.id("municipalities"),
		triggeredBy: v.union(
			v.literal("cron"),
			v.literal("manual"),
			v.literal("webhook"),
		),
		triggeredByUserId: v.optional(v.id("users")),
	},
	handler: async (ctx, args) => {
		const jobId = await ctx.db.insert("scrapeJobs", {
			municipalityId: args.municipalityId,
			status: "pending",
			triggeredBy: args.triggeredBy,
			triggeredByUserId: args.triggeredByUserId,
			createdAt: Date.now(),
		});

		return jobId;
	},
});

// ═══════════════════════════════════════════════════════════════
// UPDATE SCRAPE JOB STATUS - Update job status and results
// ═══════════════════════════════════════════════════════════════
export const updateScrapeJobStatus = internalMutation({
	args: {
		jobId: v.id("scrapeJobs"),
		status: v.union(
			v.literal("pending"),
			v.literal("running"),
			v.literal("completed"),
			v.literal("failed"),
			v.literal("partial"),
		),
		startedAt: v.optional(v.number()),
		completedAt: v.optional(v.number()),
		meetingsFound: v.optional(v.number()),
		meetingsCreated: v.optional(v.number()),
		meetingsSkipped: v.optional(v.number()),
		meetingsFailed: v.optional(v.number()),
		errors: v.optional(
			v.array(
				v.object({
					message: v.string(),
					url: v.optional(v.string()),
					timestamp: v.number(),
				}),
			),
		),
	},
	handler: async (ctx, args) => {
		const { jobId, ...updates } = args;

		// Remove undefined values
		const cleanUpdates: Record<string, unknown> = {};
		for (const [key, value] of Object.entries(updates)) {
			if (value !== undefined) {
				cleanUpdates[key] = value;
			}
		}

		await ctx.db.patch(jobId, cleanUpdates);
	},
});

// ═══════════════════════════════════════════════════════════════
// UPDATE MUNICIPALITY SCRAPE STATUS - Update after scraping
// ═══════════════════════════════════════════════════════════════
export const updateMunicipalityScrapeStatus = internalMutation({
	args: {
		municipalityId: v.id("municipalities"),
		status: v.union(
			v.literal("success"),
			v.literal("failed"),
			v.literal("partial"),
		),
		error: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const updates: Record<string, unknown> = {
			lastScrapedAt: Date.now(),
			lastScrapeStatus: args.status,
			updatedAt: Date.now(),
		};

		if (args.error) {
			updates.lastScrapeError = args.error;
		} else {
			updates.lastScrapeError = undefined;
		}

		await ctx.db.patch(args.municipalityId, updates);
	},
});

// ═══════════════════════════════════════════════════════════════
// CREATE MEETING FROM SCRAPE - Create meeting from scraped data
// ═══════════════════════════════════════════════════════════════
export const createMeetingFromScrape = internalMutation({
	args: {
		municipalityId: v.id("municipalities"),
		title: v.string(),
		meetingType: v.union(
			v.literal("city_council"),
			v.literal("school_board"),
			v.literal("planning_commission"),
			v.literal("zoning_board"),
			v.literal("budget_committee"),
			v.literal("other"),
		),
		meetingDate: v.number(),
		sourceUrl: v.string(),
		rawContent: v.optional(v.string()),
		contentHash: v.optional(v.string()),
		scrapeJobId: v.id("scrapeJobs"),
	},
	handler: async (ctx, args) => {
		const municipality = await ctx.db.get(args.municipalityId);
		const sourceIsListingPage =
			municipality?.meetingsPageUrl !== undefined &&
			normalizeUrl(args.sourceUrl) ===
				normalizeUrl(municipality.meetingsPageUrl);

		const hasInlineContent = Boolean(
			args.rawContent && args.rawContent.trim().length > 0,
		);
		const shouldProcess =
			hasInlineContent ||
			isLikelyDocumentUrl(args.sourceUrl) ||
			!sourceIsListingPage;
		if (!municipality) {
			throw new Error("Municipality not found");
		}
		const slug = await createUniqueMeetingSlug(ctx, {
			municipality,
			title: args.title,
			meetingDate: args.meetingDate,
		});

		const meetingId = await ctx.db.insert("meetings", {
			municipalityId: args.municipalityId,
			title: args.title,
			slug,
			meetingType: args.meetingType,
			meetingDate: args.meetingDate,
			sourceUrl: args.sourceUrl,
			sourceType: "scraped",
			rawContent: args.rawContent,
			contentHash: args.contentHash,
			status: shouldProcess ? "pending" : "skipped",
			scrapeJobId: args.scrapeJobId,
			createdAt: Date.now(),
			updatedAt: Date.now(),
		});

		return meetingId;
	},
});

export const refreshExistingMeetingFromScrape = internalMutation({
	args: {
		meetingId: v.id("meetings"),
		sourceUrl: v.string(),
		contentHash: v.optional(v.string()),
		rawContent: v.optional(v.string()),
		scrapeJobId: v.optional(v.id("scrapeJobs")),
	},
	handler: async (ctx, args) => {
		const meeting = await ctx.db.get(args.meetingId);
		if (!meeting) {
			throw new Error("Meeting not found");
		}

		const municipality = await ctx.db.get(meeting.municipalityId);
		if (!municipality) {
			throw new Error("Municipality not found");
		}

		const sourceIsListingPage =
			municipality.meetingsPageUrl !== undefined &&
			normalizeUrl(args.sourceUrl) ===
				normalizeUrl(municipality.meetingsPageUrl);
		const hasInlineContent = Boolean(
			args.rawContent && args.rawContent.trim().length > 0,
		);
		const shouldProcess =
			hasInlineContent ||
			isLikelyDocumentUrl(args.sourceUrl) ||
			!sourceIsListingPage;

		const updates: Record<string, unknown> = {
			sourceUrl: args.sourceUrl,
			updatedAt: Date.now(),
		};

		if (args.contentHash !== undefined) updates.contentHash = args.contentHash;
		if (args.rawContent !== undefined) updates.rawContent = args.rawContent;
		if (args.scrapeJobId !== undefined) updates.scrapeJobId = args.scrapeJobId;

		const shouldRequeue =
			(meeting.status === "failed" || meeting.status === "skipped") &&
			shouldProcess;
		if (shouldRequeue) {
			updates.status = "pending";
			updates.processingError = undefined;
		}

		await ctx.db.patch(args.meetingId, updates);

		if (shouldRequeue) {
			await ctx.scheduler.runAfter(
				0,
				internal.functions.ai.summarize.summarizeMeeting,
				{
					meetingId: args.meetingId,
					kind: meeting.meetingDate > Date.now() ? "agenda_preview" : "summary",
				},
			);
		}

		return { requeued: shouldRequeue };
	},
});

function isLikelyDocumentUrl(url: string): boolean {
	return (
		/\.pdf(\?|#|$)/i.test(url) ||
		/\/ViewFile/i.test(url) ||
		/\/View\.ashx/i.test(url)
	);
}

async function createUniqueMeetingSlug(
	ctx: MutationCtx,
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
		const existing = await ctx.db
			.query("meetings")
			.withIndex("by_slug", (q) => q.eq("slug", candidate))
			.first();

		if (!existing || existing._id === currentId) {
			return candidate;
		}

		candidate = `${baseSlug}-${suffix}`;
		suffix++;
	}
}

// ═══════════════════════════════════════════════════════════════
// ADD SCRAPE JOB ERROR - Append error to job's error list
// ═══════════════════════════════════════════════════════════════
export const addScrapeJobError = internalMutation({
	args: {
		jobId: v.id("scrapeJobs"),
		error: v.object({
			message: v.string(),
			url: v.optional(v.string()),
			timestamp: v.number(),
		}),
	},
	handler: async (ctx, args) => {
		const job = await ctx.db.get(args.jobId);
		if (!job) return;

		const errors = job.errors ?? [];
		errors.push(args.error);

		await ctx.db.patch(args.jobId, { errors });
	},
});

export const saveValidationRun = internalMutation({
	args: {
		municipalityId: v.optional(v.id("municipalities")),
		sourceUrl: v.string(),
		configuredPlatform: v.optional(
			v.union(
				v.literal("granicus"),
				v.literal("civicplus"),
				v.literal("generic"),
				v.literal("manual"),
			),
		),
		detectedPlatform: v.union(
			v.literal("granicus"),
			v.literal("civicplus"),
			v.literal("generic"),
			v.literal("manual"),
		),
		selectedPlatform: v.optional(
			v.union(
				v.literal("granicus"),
				v.literal("civicplus"),
				v.literal("generic"),
				v.literal("manual"),
			),
		),
		status: v.union(
			v.literal("passed"),
			v.literal("partial"),
			v.literal("failed"),
		),
		checks: v.array(
			v.object({
				name: v.union(
					v.literal("platform_detection"),
					v.literal("source_reachable"),
					v.literal("meeting_extraction"),
					v.literal("document_links"),
					v.literal("duplicate_behavior"),
					v.literal("summary_readiness"),
				),
				status: v.union(
					v.literal("pass"),
					v.literal("warning"),
					v.literal("fail"),
					v.literal("not_applicable"),
				),
				message: v.string(),
				details: v.optional(
					v.array(v.object({ label: v.string(), value: v.string() })),
				),
			}),
		),
		stats: v.object({
			meetingsFound: v.number(),
			documentReady: v.number(),
			summaryReady: v.number(),
			duplicates: v.number(),
			errors: v.number(),
		}),
		meetingSample: v.array(
			v.object({
				title: v.string(),
				meetingDate: v.number(),
				sourceUrl: v.string(),
				documentUrl: v.optional(v.string()),
				hasRawContent: v.boolean(),
				documentReady: v.boolean(),
				summaryReady: v.boolean(),
				duplicate: v.boolean(),
			}),
		),
		errors: v.array(
			v.object({
				message: v.string(),
				url: v.optional(v.string()),
				code: v.optional(
					v.union(
						v.literal("network"),
						v.literal("parse"),
						v.literal("timeout"),
						v.literal("auth"),
						v.literal("rate_limit"),
						v.literal("unknown"),
					),
				),
				timestamp: v.number(),
			}),
		),
		triggeredByUserId: v.optional(v.id("users")),
		createdAt: v.number(),
		completedAt: v.number(),
		durationMs: v.number(),
	},
	handler: async (ctx, args) => {
		return await ctx.db.insert("scraperValidationRuns", args);
	},
});
