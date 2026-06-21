import { v } from "convex/values";
import type { Id } from "../../_generated/dataModel";
import { query } from "../../_generated/server";
import { getCurrentUser } from "../../lib/auth";
import { buildMunicipalityCoverageHealth } from "./coverageHealth";
import { buildMunicipalityOnboardingChecklist } from "./onboardingChecklist";

// ═══════════════════════════════════════════════════════════════
// LIST - All municipalities with optional state filter
// ═══════════════════════════════════════════════════════════════
export const list = query({
	args: {
		state: v.optional(v.string()),
		activeOnly: v.optional(v.boolean()),
	},
	handler: async (ctx, args) => {
		// Filter by state if provided
		const allMunicipalities = args.state
			? await ctx.db
					.query("municipalities")
					.withIndex("by_state", (q) => q.eq("state", args.state as string))
					.collect()
			: await ctx.db.query("municipalities").collect();

		// Filter by active status if requested, then sort by name
		const filtered = args.activeOnly
			? allMunicipalities.filter((m) => m.isActive)
			: allMunicipalities;

		return filtered.sort((a, b) => a.name.localeCompare(b.name));
	},
});

// ═══════════════════════════════════════════════════════════════
// GET - Single municipality by ID
// ═══════════════════════════════════════════════════════════════
export const get = query({
	args: {
		id: v.id("municipalities"),
	},
	handler: async (ctx, args) => {
		return await ctx.db.get(args.id);
	},
});

export const getBySlug = query({
	args: {
		slug: v.string(),
	},
	handler: async (ctx, args) => {
		return await ctx.db
			.query("municipalities")
			.withIndex("by_slug", (q) => q.eq("slug", args.slug))
			.first();
	},
});

export const getByIdentifier = query({
	args: {
		identifier: v.string(),
	},
	handler: async (ctx, args) => {
		const bySlug = await ctx.db
			.query("municipalities")
			.withIndex("by_slug", (q) => q.eq("slug", args.identifier))
			.first();

		if (bySlug) {
			return bySlug;
		}

		try {
			return await ctx.db.get(args.identifier as Id<"municipalities">);
		} catch {
			return null;
		}
	},
});

// ═══════════════════════════════════════════════════════════════
// GET WITH MEETINGS - Municipality with recent meetings
// ═══════════════════════════════════════════════════════════════
export const getWithMeetings = query({
	args: {
		id: v.id("municipalities"),
		meetingLimit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const municipality = await ctx.db.get(args.id);
		if (!municipality) return null;

		const limit = args.meetingLimit ?? 10;

		// Get recent meetings for this municipality
		const meetings = await ctx.db
			.query("meetings")
			.withIndex("by_municipality_date", (q) => q.eq("municipalityId", args.id))
			.order("desc")
			.take(limit);

		// Get summaries for these meetings
		const meetingsWithSummaries = await Promise.all(
			meetings.map(async (meeting) => {
				const summary = await ctx.db
					.query("summaries")
					.withIndex("by_meeting", (q) => q.eq("meetingId", meeting._id))
					.first();
				return { ...meeting, summary };
			}),
		);

		return {
			...municipality,
			meetings: meetingsWithSummaries,
		};
	},
});

// ═══════════════════════════════════════════════════════════════
// SEARCH - Full-text search by name
// ═══════════════════════════════════════════════════════════════
export const search = query({
	args: {
		query: v.string(),
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		if (!args.query.trim()) {
			return [];
		}

		const limit = args.limit ?? 10;

		const results = await ctx.db
			.query("municipalities")
			.withSearchIndex("search_name", (q) => q.search("name", args.query))
			.take(limit);

		return results;
	},
});

// ═══════════════════════════════════════════════════════════════
// LIST BY STATE - Grouped by state for browse UI
// ═══════════════════════════════════════════════════════════════
export const listByState = query({
	args: {
		activeOnly: v.optional(v.boolean()),
	},
	handler: async (ctx, args) => {
		let municipalities = await ctx.db.query("municipalities").collect();

		// Filter by active status if requested
		if (args.activeOnly) {
			municipalities = municipalities.filter((m) => m.isActive);
		}

		// Group by state
		const byState: Record<
			string,
			Array<{
				_id: (typeof municipalities)[0]["_id"];
				name: string;
				county: string | undefined;
				population: number | undefined;
				isVerified: boolean;
			}>
		> = {};

		for (const muni of municipalities) {
			if (!byState[muni.state]) {
				byState[muni.state] = [];
			}
			byState[muni.state].push({
				_id: muni._id,
				name: muni.name,
				county: muni.county,
				population: muni.population,
				isVerified: muni.isVerified,
			});
		}

		// Sort municipalities within each state
		for (const state of Object.keys(byState)) {
			byState[state].sort((a, b) => a.name.localeCompare(b.name));
		}

		// Convert to sorted array of states
		return Object.entries(byState)
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([state, municipalities]) => ({
				state,
				municipalities,
				count: municipalities.length,
			}));
	},
});

// ═══════════════════════════════════════════════════════════════
// LIST DUE FOR SCRAPE - For cron job scheduler
// ═══════════════════════════════════════════════════════════════
export const listDueForScrape = query({
	args: {},
	handler: async (ctx) => {
		const now = Date.now();

		// Get all active municipalities that are not manual-only
		const municipalities = await ctx.db
			.query("municipalities")
			.withIndex("by_active", (q) => q.eq("isActive", true))
			.collect();

		// Filter to those due for scraping
		return municipalities.filter((muni) => {
			// Skip manual-only municipalities
			if (muni.platform === "manual") return false;

			// If never scraped, it's due
			if (!muni.lastScrapedAt) return true;

			// Check if enough time has passed since last scrape
			const frequencyMs =
				(muni.scrapeConfig?.frequencyHours ?? 24) * 60 * 60 * 1000;
			return now - muni.lastScrapedAt >= frequencyMs;
		});
	},
});

// ═══════════════════════════════════════════════════════════════
// GET STATS - Statistics for a municipality
// ═══════════════════════════════════════════════════════════════
export const getStats = query({
	args: {
		id: v.id("municipalities"),
	},
	handler: async (ctx, args) => {
		const municipality = await ctx.db.get(args.id);
		if (!municipality) return null;

		// Count meetings
		const meetings = await ctx.db
			.query("meetings")
			.withIndex("by_municipality", (q) => q.eq("municipalityId", args.id))
			.collect();

		// Count by status
		const byStatus = {
			pending: 0,
			processing: 0,
			summarized: 0,
			failed: 0,
			skipped: 0,
		};

		for (const meeting of meetings) {
			byStatus[meeting.status]++;
		}

		// Get date range
		const dates = meetings.map((m) => m.meetingDate).sort((a, b) => a - b);

		return {
			totalMeetings: meetings.length,
			byStatus,
			oldestMeeting: dates[0] ?? null,
			newestMeeting: dates[dates.length - 1] ?? null,
			lastScrapedAt: municipality.lastScrapedAt ?? null,
			lastScrapeStatus: municipality.lastScrapeStatus ?? null,
		};
	},
});

// ═══════════════════════════════════════════════════════════════
// LIST COVERAGE HEALTH - Operator coverage model for municipalities
// ═══════════════════════════════════════════════════════════════
export const listCoverageHealth = query({
	args: {},
	handler: async (ctx) => {
		const caller = await getCurrentUser(ctx);
		if (!caller?.isAdmin) return null;

		const now = Date.now();
		const municipalities = await ctx.db.query("municipalities").collect();

		const rows = await Promise.all(
			municipalities.map(async (municipality) => {
				const [meetings, scrapeJobs] = await Promise.all([
					ctx.db
						.query("meetings")
						.withIndex("by_municipality", (q) =>
							q.eq("municipalityId", municipality._id),
						)
						.collect(),
					ctx.db
						.query("scrapeJobs")
						.withIndex("by_municipality", (q) =>
							q.eq("municipalityId", municipality._id),
						)
						.order("desc")
						.take(10),
				]);

				const summaries = await Promise.all(
					meetings.map((meeting) =>
						ctx.db
							.query("summaries")
							.withIndex("by_meeting", (q) => q.eq("meetingId", meeting._id))
							.first(),
					),
				);

				return {
					municipality: {
						id: municipality._id,
						name: municipality.name,
						state: municipality.state,
						platform: municipality.platform,
						isActive: municipality.isActive,
						isVerified: municipality.isVerified,
					},
					health: buildMunicipalityCoverageHealth({
						now,
						municipality,
						meetings: meetings.map((meeting) => ({
							id: meeting._id,
							status: meeting.status,
							sourceUrl: meeting.sourceUrl ?? null,
							rawContent: meeting.rawContent ?? null,
							documentStorageId: meeting.documentStorageId ?? null,
						})),
						summaries: summaries.flatMap((summary) =>
							summary
								? [
										{
											meetingId: summary.meetingId,
											createdAt: summary.createdAt,
										},
									]
								: [],
						),
						scrapeJobs: scrapeJobs.map((job) => ({
							status: job.status,
							createdAt: job.createdAt,
							completedAt: job.completedAt ?? null,
							errors: job.errors ?? null,
						})),
					}),
				};
			}),
		);

		return rows.sort((a, b) =>
			a.municipality.name.localeCompare(b.municipality.name),
		);
	},
});

// ═══════════════════════════════════════════════════════════════
// LIST ONBOARDING CHECKLISTS - Operator setup workflow per municipality
// ═══════════════════════════════════════════════════════════════
export const listOnboardingChecklists = query({
	args: {},
	handler: async (ctx) => {
		const caller = await getCurrentUser(ctx);
		if (!caller?.isAdmin) return null;

		const now = Date.now();
		const municipalities = await ctx.db.query("municipalities").collect();

		const rows = await Promise.all(
			municipalities.map(async (municipality) => {
				const [latestValidation, scrapeJobs, meetings] = await Promise.all([
					ctx.db
						.query("scraperValidationRuns")
						.withIndex("by_municipality_created", (q) =>
							q.eq("municipalityId", municipality._id),
						)
						.order("desc")
						.first(),
					ctx.db
						.query("scrapeJobs")
						.withIndex("by_municipality", (q) =>
							q.eq("municipalityId", municipality._id),
						)
						.order("desc")
						.take(5),
					ctx.db
						.query("meetings")
						.withIndex("by_municipality", (q) =>
							q.eq("municipalityId", municipality._id),
						)
						.collect(),
				]);

				const summaries = await Promise.all(
					meetings.map((meeting) =>
						ctx.db
							.query("summaries")
							.withIndex("by_meeting", (q) => q.eq("meetingId", meeting._id))
							.first(),
					),
				);

				return buildMunicipalityOnboardingChecklist({
					now,
					municipality: {
						id: municipality._id,
						name: municipality.name,
						state: municipality.state,
						meetingsPageUrl: municipality.meetingsPageUrl ?? null,
						platform: municipality.platform,
						isActive: municipality.isActive,
						isVerified: municipality.isVerified,
					},
					latestValidation: latestValidation
						? {
								status: latestValidation.status,
								createdAt: latestValidation.createdAt,
								stats: {
									meetingsFound: latestValidation.stats.meetingsFound,
								},
								checks: latestValidation.checks.map((check) => ({
									name: check.name,
									status: check.status,
									message: check.message,
								})),
							}
						: null,
					scrapeJobs: scrapeJobs.map((job) => ({
						status: job.status,
						createdAt: job.createdAt,
						completedAt: job.completedAt ?? null,
						meetingsFound: job.meetingsFound ?? null,
						errors: job.errors ?? null,
					})),
					meetings: meetings.map((meeting) => ({
						id: meeting._id,
						status: meeting.status,
					})),
					summaries: summaries.flatMap((summary) =>
						summary
							? [
									{
										meetingId: summary.meetingId,
										createdAt: summary.createdAt,
									},
								]
							: [],
					),
				});
			}),
		);

		return rows.sort((a, b) => {
			const statusRank =
				onboardingStatusRank(a.overallStatus) -
				onboardingStatusRank(b.overallStatus);
			if (statusRank !== 0) return statusRank;
			return a.municipality.name.localeCompare(b.municipality.name);
		});
	},
});

function onboardingStatusRank(status: string): number {
	const rank: Record<string, number> = {
		failed: 0,
		"next-action": 1,
		blocked: 2,
		completed: 3,
	};
	return rank[status] ?? 4;
}
