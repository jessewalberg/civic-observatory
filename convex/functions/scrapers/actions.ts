"use node";

import { v } from "convex/values";
import { internal } from "../../_generated/api";
import { internalAction } from "../../_generated/server";

// Initialize scrapers when this module loads
import "../../scrapers/init";
import type { Id } from "../../_generated/dataModel";
import { findScraperForUrl, getScraper } from "../../scrapers/registry";
import type { ScraperConfig, ScraperError } from "../../scrapers/types";

// Result types for actions
interface RunScraperResult {
	success: boolean;
	error?: string;
	jobId?: Id<"scrapeJobs">;
	stats?: {
		found: number;
		created: number;
		skipped: number;
		failed: number;
	};
}

interface ScrapeAllDueResult {
	scheduled: number;
	municipalities: Array<{ municipalityId: string; name: string }>;
}

// ═══════════════════════════════════════════════════════════════
// RUN SCRAPER - Main action to scrape a municipality
// ═══════════════════════════════════════════════════════════════
export const runScraper = internalAction({
	args: {
		municipalityId: v.id("municipalities"),
		triggeredBy: v.union(
			v.literal("cron"),
			v.literal("manual"),
			v.literal("webhook"),
		),
		triggeredByUserId: v.optional(v.id("users")),
	},
	handler: async (ctx, args): Promise<RunScraperResult> => {
		// 1. Create scrape job
		const jobId = await ctx.runMutation(
			internal.functions.scrapers.mutations.createScrapeJob,
			{
				municipalityId: args.municipalityId,
				triggeredBy: args.triggeredBy,
				triggeredByUserId: args.triggeredByUserId,
			},
		);

		// 2. Get municipality config
		const municipality = await ctx.runQuery(
			internal.functions.scrapers.queries.getMunicipalityForScraping,
			{ municipalityId: args.municipalityId },
		);

		if (!municipality) {
			await ctx.runMutation(
				internal.functions.scrapers.mutations.updateScrapeJobStatus,
				{
					jobId,
					status: "failed",
					completedAt: Date.now(),
					errors: [
						{
							message: "Municipality not found",
							timestamp: Date.now(),
						},
					],
				},
			);
			return { success: false, error: "Municipality not found" };
		}

		if (!municipality.meetingsPageUrl) {
			await ctx.runMutation(
				internal.functions.scrapers.mutations.updateScrapeJobStatus,
				{
					jobId,
					status: "failed",
					completedAt: Date.now(),
					errors: [
						{
							message: "No meetings page URL configured",
							timestamp: Date.now(),
						},
					],
				},
			);
			return { success: false, error: "No meetings page URL configured" };
		}

		// 3. Mark job as running
		await ctx.runMutation(
			internal.functions.scrapers.mutations.updateScrapeJobStatus,
			{
				jobId,
				status: "running",
				startedAt: Date.now(),
			},
		);

		try {
			// 4. Select scraper
			const scraper =
				getScraper(municipality.platform) ||
				findScraperForUrl(municipality.meetingsPageUrl);

			if (!scraper) {
				throw new Error(
					`No scraper available for platform: ${municipality.platform}`,
				);
			}

			// 5. Build scraper config from municipality settings
			const scraperConfig: ScraperConfig | undefined = municipality.scrapeConfig
				? {
						meetingListSelector: municipality.scrapeConfig.meetingListSelector,
						meetingLinkSelector: municipality.scrapeConfig.meetingLinkSelector,
						dateSelector: municipality.scrapeConfig.dateSelector,
						dateFormat: municipality.scrapeConfig.dateFormat,
						contentSelector: municipality.scrapeConfig.contentSelector,
						frequencyHours: municipality.scrapeConfig.frequencyHours,
					}
				: undefined;

			// 6. Run scrape
			const result = await scraper.scrape(
				municipality.meetingsPageUrl,
				scraperConfig,
			);

			// 7. Process each meeting
			let meetingsCreated = 0;
			let meetingsSkipped = 0;
			let meetingsFailed = 0;

			for (const meeting of result.meetings) {
				try {
					// Check for duplicates
					const existing = await ctx.runQuery(
						internal.functions.scrapers.queries.checkMeetingExists,
						{
							municipalityId: args.municipalityId,
							contentHash: meeting.contentHash,
							sourceUrl: meeting.sourceUrl,
						},
					);

					if (existing.exists) {
						meetingsSkipped++;
						continue;
					}

					// Extract content if we have a document URL
					let rawContent = meeting.rawContent;
					if (!rawContent && meeting.documentUrl) {
						// For PDFs, we'll handle extraction during summarization
						// For HTML pages, try to extract now
						if (!meeting.documentUrl.toLowerCase().includes(".pdf")) {
							rawContent =
								(await scraper.extractContent(
									meeting.documentUrl,
									scraperConfig,
								)) ?? undefined;
						}
					}

					// Create meeting record
					const meetingId = await ctx.runMutation(
						internal.functions.scrapers.mutations.createMeetingFromScrape,
						{
							municipalityId: args.municipalityId,
							title: meeting.title,
							meetingType: meeting.meetingType,
							meetingDate: meeting.meetingDate,
							sourceUrl: meeting.sourceUrl,
							rawContent,
							contentHash: meeting.contentHash,
							scrapeJobId: jobId,
						},
					);

					// Schedule summarization if we have content
					if (rawContent) {
						await ctx.scheduler.runAfter(
							0,
							internal.functions.ai.summarize.summarizeMeeting,
							{ meetingId },
						);
					}

					meetingsCreated++;
				} catch (error) {
					meetingsFailed++;
					await ctx.runMutation(
						internal.functions.scrapers.mutations.addScrapeJobError,
						{
							jobId,
							error: {
								message:
									error instanceof Error
										? error.message
										: "Failed to process meeting",
								url: meeting.sourceUrl,
								timestamp: Date.now(),
							},
						},
					);
				}
			}

			// 8. Determine final status
			const hasErrors = result.errors.length > 0 || meetingsFailed > 0;
			const hasSuccesses = meetingsCreated > 0;
			const finalStatus = hasErrors
				? hasSuccesses
					? "partial"
					: "failed"
				: "completed";

			// 9. Update job results
			await ctx.runMutation(
				internal.functions.scrapers.mutations.updateScrapeJobStatus,
				{
					jobId,
					status: finalStatus,
					completedAt: Date.now(),
					meetingsFound: result.stats.found,
					meetingsCreated,
					meetingsSkipped,
					meetingsFailed,
					errors: result.errors.map((e: ScraperError) => ({
						message: e.message,
						url: e.url,
						timestamp: e.timestamp,
					})),
				},
			);

			// 10. Update municipality status
			const municipalityStatus =
				finalStatus === "completed" ? "success" : finalStatus;
			await ctx.runMutation(
				internal.functions.scrapers.mutations.updateMunicipalityScrapeStatus,
				{
					municipalityId: args.municipalityId,
					status: municipalityStatus as "success" | "failed" | "partial",
					error:
						result.errors.length > 0 ? result.errors[0].message : undefined,
				},
			);

			return {
				success: true,
				jobId,
				stats: {
					found: result.stats.found,
					created: meetingsCreated,
					skipped: meetingsSkipped,
					failed: meetingsFailed,
				},
			};
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : "Unknown error";

			// Update job as failed
			await ctx.runMutation(
				internal.functions.scrapers.mutations.updateScrapeJobStatus,
				{
					jobId,
					status: "failed",
					completedAt: Date.now(),
					errors: [
						{
							message: errorMessage,
							timestamp: Date.now(),
						},
					],
				},
			);

			// Update municipality status
			await ctx.runMutation(
				internal.functions.scrapers.mutations.updateMunicipalityScrapeStatus,
				{
					municipalityId: args.municipalityId,
					status: "failed",
					error: errorMessage,
				},
			);

			return { success: false, error: errorMessage };
		}
	},
});

// ═══════════════════════════════════════════════════════════════
// SCRAPE ALL DUE - Find and scrape all municipalities due
// ═══════════════════════════════════════════════════════════════
export const scrapeAllDue = internalAction({
	args: {
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args): Promise<ScrapeAllDueResult> => {
		const limit = args.limit ?? 10;

		// Get municipalities due for scraping
		const dueMunicipalities = await ctx.runQuery(
			internal.functions.scrapers.queries.getDueMunicipalities,
			{ limit },
		);

		if (dueMunicipalities.length === 0) {
			return { scheduled: 0, municipalities: [] };
		}

		// Schedule scraping with staggered timing (30 seconds apart)
		const scheduled: Array<{ municipalityId: string; name: string }> = [];

		for (let i = 0; i < dueMunicipalities.length; i++) {
			const municipality = dueMunicipalities[i];
			const delayMs = i * 30 * 1000; // 30 seconds between each

			await ctx.scheduler.runAfter(
				delayMs,
				internal.functions.scrapers.actions.runScraper,
				{
					municipalityId: municipality._id,
					triggeredBy: "cron",
				},
			);

			scheduled.push({
				municipalityId: municipality._id,
				name: municipality.name,
			});
		}

		return {
			scheduled: scheduled.length,
			municipalities: scheduled,
		};
	},
});

// ═══════════════════════════════════════════════════════════════
// SCRAPE SINGLE - Manually trigger scrape for one municipality
// ═══════════════════════════════════════════════════════════════
export const scrapeSingle = internalAction({
	args: {
		municipalityId: v.id("municipalities"),
		userId: v.optional(v.id("users")),
	},
	handler: async (ctx, args): Promise<RunScraperResult> => {
		return await ctx.runAction(internal.functions.scrapers.actions.runScraper, {
			municipalityId: args.municipalityId,
			triggeredBy: "manual",
			triggeredByUserId: args.userId,
		});
	},
});
