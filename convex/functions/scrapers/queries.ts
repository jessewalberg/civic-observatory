import { v } from "convex/values";
import { internalQuery } from "../../_generated/server";

// ═══════════════════════════════════════════════════════════════
// GET MUNICIPALITY FOR SCRAPING - Get municipality with scrape config
// ═══════════════════════════════════════════════════════════════
export const getMunicipalityForScraping = internalQuery({
	args: {
		municipalityId: v.id("municipalities"),
	},
	handler: async (ctx, args) => {
		return await ctx.db.get(args.municipalityId);
	},
});

// ═══════════════════════════════════════════════════════════════
// GET DUE MUNICIPALITIES - Find municipalities due for scraping
// ═══════════════════════════════════════════════════════════════
export const getDueMunicipalities = internalQuery({
	args: {
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const limit = args.limit ?? 10;
		const now = Date.now();

		// Get active municipalities that aren't manual-only
		const municipalities = await ctx.db
			.query("municipalities")
			.withIndex("by_active", (q) => q.eq("isActive", true))
			.collect();

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
// CHECK MEETING EXISTS - Check if meeting already exists (dedup)
// ═══════════════════════════════════════════════════════════════
export const checkMeetingExists = internalQuery({
	args: {
		municipalityId: v.id("municipalities"),
		contentHash: v.optional(v.string()),
		sourceUrl: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		// Check by content hash first (most reliable)
		if (args.contentHash) {
			const byHash = await ctx.db
				.query("meetings")
				.withIndex("by_content_hash", (q) =>
					q.eq("contentHash", args.contentHash),
				)
				.first();

			if (byHash) {
				return { exists: true, meetingId: byHash._id, reason: "content_hash" };
			}
		}

		// Check by source URL
		if (args.sourceUrl) {
			const meetings = await ctx.db
				.query("meetings")
				.withIndex("by_municipality", (q) =>
					q.eq("municipalityId", args.municipalityId),
				)
				.collect();

			const byUrl = meetings.find((m) => m.sourceUrl === args.sourceUrl);
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
export const getScrapeJob = internalQuery({
	args: {
		jobId: v.id("scrapeJobs"),
	},
	handler: async (ctx, args) => {
		return await ctx.db.get(args.jobId);
	},
});

// ═══════════════════════════════════════════════════════════════
// GET RECENT SCRAPE JOBS - Get recent jobs for a municipality
// ═══════════════════════════════════════════════════════════════
export const getRecentScrapeJobs = internalQuery({
	args: {
		municipalityId: v.id("municipalities"),
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const limit = args.limit ?? 10;

		return await ctx.db
			.query("scrapeJobs")
			.withIndex("by_municipality", (q) =>
				q.eq("municipalityId", args.municipalityId),
			)
			.order("desc")
			.take(limit);
	},
});
