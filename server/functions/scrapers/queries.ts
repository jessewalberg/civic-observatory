import { z } from "zod";
import { entityId } from "../../id";
import { getCurrentUser } from "../../lib/auth";
import { defineRead, privateRead } from "../../procedure";
import { normalizeMeetingSourceUrl } from "../../scrapers/utils";
// ═══════════════════════════════════════════════════════════════
// GET MUNICIPALITY FOR SCRAPING - Get municipality with scrape config
// ═══════════════════════════════════════════════════════════════
export const getMunicipalityForScraping = privateRead({
	args: {
		municipalityId: entityId("municipalities"),
	},
	handler: async (ctx, args) => {
		return await ctx.data.find(args.municipalityId);
	},
});
// ═══════════════════════════════════════════════════════════════
// GET DUE MUNICIPALITIES - Find municipalities due for scraping
// ═══════════════════════════════════════════════════════════════
export const getDueMunicipalities = privateRead({
	args: {
		limit: z.number().optional(),
	},
	handler: async (ctx, args) => {
		const limit = args.limit ?? 10;
		const now = Date.now();
		// Get active municipalities that aren't manual-only
		const municipalities = await ctx.data
			.select("municipalities")
			.orderBy(["isActive", "_creationTime", "_id"])
			.where("isActive", "=", true)
			.all();
		// Filter to those due for scraping
		const due = municipalities.filter((m) => {
			// Skip manual-only municipalities
			if (m.platform === "manual") return false;
			// Skip if no meetings page URL
			if (!m.meetingsPageUrl) return false;
			// Check if scraping is due
			const frequencyMs =
				(m.scrapeConfig?.frequencyHours ?? 24) * 60 * 60 * 1000;
			const lastScraped = m.lastScrapedAt ?? 0;
			return now - lastScraped >= frequencyMs;
		});
		// Sort by last scraped (oldest first) and limit
		return due
			.sort((a, b) => (a.lastScrapedAt ?? 0) - (b.lastScrapedAt ?? 0))
			.slice(0, limit);
	},
});
// ═══════════════════════════════════════════════════════════════
// GET FILTERED MUNICIPALITIES - For batch re-scrape operations
// ═══════════════════════════════════════════════════════════════
export const getFilteredMunicipalities = privateRead({
	args: {
		platform: z.string().optional(),
		state: z.string().optional(),
		failedOnly: z.boolean().optional(),
		limit: z.number().optional(),
	},
	handler: async (ctx, args) => {
		const limit = args.limit ?? 50;
		// Get active municipalities
		const municipalities = await ctx.data
			.select("municipalities")
			.orderBy(["isActive", "_creationTime", "_id"])
			.where("isActive", "=", true)
			.all();
		const filtered = municipalities.filter((m) => {
			if (m.platform === "manual") return false;
			if (!m.meetingsPageUrl) return false;
			if (args.platform && m.platform !== args.platform) return false;
			if (args.state && m.state !== args.state) return false;
			if (args.failedOnly && m.lastScrapeStatus !== "failed") return false;
			return true;
		});
		// Sort by last scraped (oldest first)
		return filtered
			.sort((a, b) => (a.lastScrapedAt ?? 0) - (b.lastScrapedAt ?? 0))
			.slice(0, limit);
	},
});
// ═══════════════════════════════════════════════════════════════
// GET JOB - Get a scrape job by ID (internal, for actions)
// ═══════════════════════════════════════════════════════════════
export const getJob = privateRead({
	args: {
		jobId: entityId("scrapeJobs"),
	},
	handler: async (ctx, args) => {
		return await ctx.data.find(args.jobId);
	},
});
// ═══════════════════════════════════════════════════════════════
// CHECK MEETING EXISTS - Check if meeting already exists (dedup)
// ═══════════════════════════════════════════════════════════════
export const checkMeetingExists = privateRead({
	args: {
		municipalityId: entityId("municipalities"),
		contentHash: z.string().optional(),
		sourceUrl: z.string().optional(),
		alternateSourceUrls: z.array(z.string()).optional(),
	},
	handler: async (ctx, args) => {
		// Check by content hash first, scoped to the municipality. Hashes are not
		// globally unique enough to dedupe across different towns.
		if (args.contentHash) {
			const byHashMatches = await ctx.data
				.select("meetings")
				.orderBy(["contentHash", "_creationTime", "_id"])
				.where("contentHash", "=", args.contentHash)
				.all();
			const byHash = byHashMatches.find(
				(meeting) => meeting.municipalityId === args.municipalityId,
			);
			if (byHash) {
				return { exists: true, meetingId: byHash._id, reason: "content_hash" };
			}
		}
		// Check by source URL
		const sourceUrlCandidates = [
			args.sourceUrl,
			...(args.alternateSourceUrls ?? []),
		].filter((url): url is string => Boolean(url?.trim()));
		if (sourceUrlCandidates.length > 0) {
			const meetings = await ctx.data
				.select("meetings")
				.orderBy(["municipalityId", "_creationTime", "_id"])
				.where("municipalityId", "=", args.municipalityId)
				.all();
			const normalizedSourceUrls = new Set(
				sourceUrlCandidates.map((url) => normalizeMeetingSourceUrl(url)),
			);
			const byUrl = meetings.find(
				(m) =>
					m.sourceUrl &&
					normalizedSourceUrls.has(normalizeMeetingSourceUrl(m.sourceUrl)),
			);
			if (byUrl) {
				return { exists: true, meetingId: byUrl._id, reason: "source_url" };
			}
		}
		return { exists: false };
	},
});
// ═══════════════════════════════════════════════════════════════
// GET SCRAPE JOB - Get a scrape job by ID
// ═══════════════════════════════════════════════════════════════
export const getScrapeJob = privateRead({
	args: {
		jobId: entityId("scrapeJobs"),
	},
	handler: async (ctx, args) => {
		return await ctx.data.find(args.jobId);
	},
});
// ═══════════════════════════════════════════════════════════════
// GET RECENT SCRAPE JOBS - Get recent jobs for a municipality
// ═══════════════════════════════════════════════════════════════
export const getRecentScrapeJobs = privateRead({
	args: {
		municipalityId: entityId("municipalities"),
		limit: z.number().optional(),
	},
	handler: async (ctx, args) => {
		const limit = args.limit ?? 10;
		return await ctx.data
			.select("scrapeJobs")
			.orderBy(["municipalityId", "_creationTime", "_id"])
			.where("municipalityId", "=", args.municipalityId)
			.direction("desc")
			.limit(limit);
	},
});
export const listValidationRuns = defineRead({
	args: {
		municipalityId: entityId("municipalities").optional(),
		limit: z.number().optional(),
	},
	handler: async (ctx, args) => {
		const caller = await getCurrentUser(ctx);
		if (!caller?.isAdmin) return null;
		const limit = Math.min(args.limit ?? 20, 100);
		const runs = args.municipalityId
			? await ctx.data
					.select("scraperValidationRuns")
					.orderBy(["municipalityId", "createdAt", "_creationTime", "_id"])
					.where("municipalityId", "=", args.municipalityId)
					.direction("desc")
					.limit(limit)
			: await ctx.data
					.select("scraperValidationRuns")
					.orderBy(["createdAt", "_creationTime", "_id"])
					.direction("desc")
					.limit(limit);
		const municipalityIds = [
			...new Set(
				runs.flatMap((run) => (run.municipalityId ? [run.municipalityId] : [])),
			),
		];
		const municipalities = await Promise.all(
			municipalityIds.map((id) => ctx.data.find(id)),
		);
		const municipalityMap = new Map(
			municipalities
				.filter((municipality) => municipality !== null)
				.map((municipality) => [
					municipality._id,
					{
						name: municipality.name,
						state: municipality.state,
						platform: municipality.platform,
					},
				]),
		);
		return runs.map((run) => ({
			...run,
			municipality: run.municipalityId
				? (municipalityMap.get(run.municipalityId) ?? null)
				: null,
		}));
	},
});
