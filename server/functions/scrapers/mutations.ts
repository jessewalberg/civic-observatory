import { z } from "zod";
import { internal } from "../../api";
import { entityId } from "../../id";
import { createMeetingSlug, createMunicipalitySlug } from "../../lib/seoSlugs";
import type { Doc, Id } from "../../model";
import { privateWrite, type ServiceContext } from "../../procedure";
import { normalizeUrl } from "../../scrapers/utils";
// ═══════════════════════════════════════════════════════════════
// CREATE SCRAPE JOB - Create a new scrape job record
// ═══════════════════════════════════════════════════════════════
export const createScrapeJob = privateWrite({
	args: {
		municipalityId: entityId("municipalities"),
		triggeredBy: z.union([
			z.literal("cron"),
			z.literal("manual"),
			z.literal("webhook"),
		]),
		triggeredByUserId: entityId("users").optional(),
	},
	handler: async (ctx, args) => {
		const jobId = await ctx.data.add("scrapeJobs", {
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
export const updateScrapeJobStatus = privateWrite({
	args: {
		jobId: entityId("scrapeJobs"),
		status: z.union([
			z.literal("pending"),
			z.literal("running"),
			z.literal("completed"),
			z.literal("failed"),
			z.literal("partial"),
		]),
		startedAt: z.number().optional(),
		completedAt: z.number().optional(),
		meetingsFound: z.number().optional(),
		meetingsCreated: z.number().optional(),
		meetingsSkipped: z.number().optional(),
		meetingsFailed: z.number().optional(),
		errors: z
			.array(
				z.object({
					message: z.string(),
					url: z.string().optional(),
					timestamp: z.number(),
				}),
			)
			.optional(),
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
		await ctx.data.update(jobId, cleanUpdates);
	},
});
// ═══════════════════════════════════════════════════════════════
// UPDATE MUNICIPALITY SCRAPE STATUS - Update after scraping
// ═══════════════════════════════════════════════════════════════
export const updateMunicipalityScrapeStatus = privateWrite({
	args: {
		municipalityId: entityId("municipalities"),
		status: z.union([
			z.literal("success"),
			z.literal("failed"),
			z.literal("partial"),
		]),
		error: z.string().optional(),
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
		await ctx.data.update(args.municipalityId, updates);
	},
});
// ═══════════════════════════════════════════════════════════════
// CREATE MEETING FROM SCRAPE - Create meeting from scraped data
// ═══════════════════════════════════════════════════════════════
export const createMeetingFromScrape = privateWrite({
	args: {
		municipalityId: entityId("municipalities"),
		title: z.string(),
		meetingType: z.union([
			z.literal("city_council"),
			z.literal("school_board"),
			z.literal("planning_commission"),
			z.literal("zoning_board"),
			z.literal("budget_committee"),
			z.literal("other"),
		]),
		meetingDate: z.number(),
		sourceUrl: z.string(),
		rawContent: z.string().optional(),
		contentHash: z.string().optional(),
		scrapeJobId: entityId("scrapeJobs"),
	},
	handler: async (ctx, args) => {
		const municipality = await ctx.data.find(args.municipalityId);
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
			status: shouldProcess ? "pending" : "skipped",
			scrapeJobId: args.scrapeJobId,
			createdAt: Date.now(),
			updatedAt: Date.now(),
		});
		return meetingId;
	},
});
export const refreshExistingMeetingFromScrape = privateWrite({
	args: {
		meetingId: entityId("meetings"),
		sourceUrl: z.string(),
		contentHash: z.string().optional(),
		rawContent: z.string().optional(),
		scrapeJobId: entityId("scrapeJobs").optional(),
	},
	handler: async (ctx, args) => {
		const meeting = await ctx.data.find(args.meetingId);
		if (!meeting) {
			throw new Error("Meeting not found");
		}
		const municipality = await ctx.data.find(meeting.municipalityId);
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
		await ctx.data.update(args.meetingId, updates);
		if (shouldRequeue) {
			await ctx.jobs.enqueue(
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
// ADD SCRAPE JOB ERROR - Append error to job's error list
// ═══════════════════════════════════════════════════════════════
export const addScrapeJobError = privateWrite({
	args: {
		jobId: entityId("scrapeJobs"),
		error: z.object({
			message: z.string(),
			url: z.string().optional(),
			timestamp: z.number(),
		}),
	},
	handler: async (ctx, args) => {
		const job = await ctx.data.find(args.jobId);
		if (!job) return;
		const errors = job.errors ?? [];
		errors.push(args.error);
		await ctx.data.update(args.jobId, { errors });
	},
});
export const saveValidationRun = privateWrite({
	args: {
		municipalityId: entityId("municipalities").optional(),
		sourceUrl: z.string(),
		configuredPlatform: z
			.union([
				z.literal("granicus"),
				z.literal("civicplus"),
				z.literal("generic"),
				z.literal("manual"),
			])
			.optional(),
		detectedPlatform: z.union([
			z.literal("granicus"),
			z.literal("civicplus"),
			z.literal("generic"),
			z.literal("manual"),
		]),
		selectedPlatform: z
			.union([
				z.literal("granicus"),
				z.literal("civicplus"),
				z.literal("generic"),
				z.literal("manual"),
			])
			.optional(),
		status: z.union([
			z.literal("passed"),
			z.literal("partial"),
			z.literal("failed"),
		]),
		checks: z.array(
			z.object({
				name: z.union([
					z.literal("platform_detection"),
					z.literal("source_reachable"),
					z.literal("meeting_extraction"),
					z.literal("document_links"),
					z.literal("duplicate_behavior"),
					z.literal("summary_readiness"),
				]),
				status: z.union([
					z.literal("pass"),
					z.literal("warning"),
					z.literal("fail"),
					z.literal("not_applicable"),
				]),
				message: z.string(),
				details: z
					.array(z.object({ label: z.string(), value: z.string() }))
					.optional(),
			}),
		),
		stats: z.object({
			meetingsFound: z.number(),
			documentReady: z.number(),
			summaryReady: z.number(),
			duplicates: z.number(),
			errors: z.number(),
		}),
		meetingSample: z.array(
			z.object({
				title: z.string(),
				meetingDate: z.number(),
				sourceUrl: z.string(),
				documentUrl: z.string().optional(),
				hasRawContent: z.boolean(),
				documentReady: z.boolean(),
				summaryReady: z.boolean(),
				duplicate: z.boolean(),
			}),
		),
		errors: z.array(
			z.object({
				message: z.string(),
				url: z.string().optional(),
				code: z
					.union([
						z.literal("network"),
						z.literal("parse"),
						z.literal("timeout"),
						z.literal("auth"),
						z.literal("rate_limit"),
						z.literal("unknown"),
					])
					.optional(),
				timestamp: z.number(),
			}),
		),
		triggeredByUserId: entityId("users").optional(),
		createdAt: z.number(),
		completedAt: z.number(),
		durationMs: z.number(),
	},
	handler: async (ctx, args) => {
		return await ctx.data.add("scraperValidationRuns", args);
	},
});
