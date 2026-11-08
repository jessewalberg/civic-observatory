import { z } from "zod";
import { entityId } from "../../id";
import { getCurrentUser } from "../../lib/auth";
import type { Doc, Id } from "../../model";
import { defineRead, privateRead, type ServiceContext } from "../../procedure";
import { buildMunicipalityCoverageHealth } from "./coverageHealth";
import { getCoverageStatus, isCoveragePublic } from "./coveragePublication";
import { buildMunicipalityOnboardingChecklist } from "./onboardingChecklist";
import {
	buildPublicCoverageBadge,
	toSafePublicMunicipality,
	withPublicCoverageBadge,
} from "./publicCoverageBadge";

const DEFAULT_SEARCH_LIMIT = 10;
const MAX_RESULT_LIMIT = 100;
// ═══════════════════════════════════════════════════════════════
// LIST - All municipalities with optional state filter
// ═══════════════════════════════════════════════════════════════
export const list = defineRead({
	args: {
		state: z.string().optional(),
		activeOnly: z.boolean().optional(),
		limit: z.number().optional(),
	},
	handler: async (ctx, args) => {
		const includeInternal = await canReadInternalCoverage(ctx);
		const limit = clampResultLimit(args.limit, Number.POSITIVE_INFINITY);
		// Filter by state if provided
		const allMunicipalities = args.state
			? await ctx.data
					.select("municipalities")
					.orderBy(["state", "_creationTime", "_id"])
					.where("state", "=", args.state as string)
					.all()
			: await ctx.data.select("municipalities").all();
		// Public callers only see published coverage. Admins can inspect raw rows.
		const filtered = allMunicipalities.filter((municipality) => {
			if (args.activeOnly) return isCoveragePublic(municipality);
			if (includeInternal) return true;
			return isCoveragePublic(municipality);
		});
		return filtered
			.sort((a, b) => a.name.localeCompare(b.name))
			.slice(0, limit)
			.map((municipality) =>
				projectMunicipalityForCaller(municipality, includeInternal),
			);
	},
});
// ═══════════════════════════════════════════════════════════════
// GET - Single municipality by ID
// ═══════════════════════════════════════════════════════════════
export const get = defineRead({
	args: {
		id: entityId("municipalities"),
	},
	handler: async (ctx, args) => {
		return await getVisibleMunicipality(ctx, args.id);
	},
});
export const internalGet = privateRead({
	args: {
		id: entityId("municipalities"),
	},
	handler: async (ctx, args) => {
		return await ctx.data.find(args.id);
	},
});
export const internalList = privateRead({
	args: {
		state: z.string().optional(),
	},
	handler: async (ctx, args) => {
		const municipalities = args.state
			? await ctx.data
					.select("municipalities")
					.orderBy(["state", "_creationTime", "_id"])
					.where("state", "=", args.state as string)
					.all()
			: await ctx.data.select("municipalities").all();
		return municipalities.sort((a, b) => a.name.localeCompare(b.name));
	},
});
export const getBySlug = defineRead({
	args: {
		slug: z.string(),
	},
	handler: async (ctx, args) => {
		const municipality = await ctx.data
			.select("municipalities")
			.orderBy(["slug", "_creationTime", "_id"])
			.where("slug", "=", args.slug)
			.one();
		return await filterVisibleMunicipality(ctx, municipality);
	},
});
export const getByIdentifier = defineRead({
	args: {
		identifier: z.string(),
	},
	handler: async (ctx, args) => {
		const bySlug = await ctx.data
			.select("municipalities")
			.orderBy(["slug", "_creationTime", "_id"])
			.where("slug", "=", args.identifier)
			.one();
		if (bySlug) {
			return await filterVisibleMunicipality(ctx, bySlug);
		}
		try {
			return await getVisibleMunicipality(
				ctx,
				args.identifier as Id<"municipalities">,
			);
		} catch {
			return null;
		}
	},
});
// ═══════════════════════════════════════════════════════════════
// GET WITH MEETINGS - Municipality with recent meetings
// ═══════════════════════════════════════════════════════════════
export const getWithMeetings = defineRead({
	args: {
		id: entityId("municipalities"),
		meetingLimit: z.number().optional(),
	},
	handler: async (ctx, args) => {
		const municipality = await getVisibleMunicipality(ctx, args.id);
		if (!municipality) return null;
		const limit = args.meetingLimit ?? 10;
		// Get recent meetings for this municipality
		const meetings = await ctx.data
			.select("meetings")
			.orderBy(["municipalityId", "meetingDate", "_creationTime", "_id"])
			.where("municipalityId", "=", args.id)
			.direction("desc")
			.limit(limit);
		// Get summaries for these meetings
		const meetingsWithSummaries = await Promise.all(
			meetings.map(async (meeting) => {
				const summary = await ctx.data
					.select("summaries")
					.orderBy(["meetingId", "_creationTime", "_id"])
					.where("meetingId", "=", meeting._id)
					.one();
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
export const search = defineRead({
	args: {
		query: z.string(),
		state: z.string().optional(),
		limit: z.number().optional(),
	},
	handler: async (ctx, args) => {
		if (!args.query.trim()) {
			return [];
		}
		const limit = clampResultLimit(args.limit, DEFAULT_SEARCH_LIMIT);
		const results = await ctx.data
			.select("municipalities")
			.search("name", args.query)
			.limit(Math.min(limit * 5, 100));
		const includeInternal = await canReadInternalCoverage(ctx);
		return results
			.filter((municipality) =>
				includeInternal ? true : isCoveragePublic(municipality),
			)
			.filter((municipality) =>
				args.state ? municipality.state === args.state : true,
			)
			.slice(0, limit)
			.map((municipality) =>
				projectMunicipalityForCaller(municipality, includeInternal),
			);
	},
});
// ═══════════════════════════════════════════════════════════════
// LIST BY STATE - Grouped by state for browse UI
// ═══════════════════════════════════════════════════════════════
export const listByState = defineRead({
	args: {
		activeOnly: z.boolean().optional(),
	},
	handler: async (ctx, args) => {
		const includeInternal = await canReadInternalCoverage(ctx);
		let municipalities = await ctx.data.select("municipalities").all();
		municipalities = municipalities.filter((municipality) => {
			if (args.activeOnly) return isCoveragePublic(municipality);
			if (includeInternal) return true;
			return isCoveragePublic(municipality);
		});
		// Group by state
		const byState: Record<
			string,
			Array<{
				_id: (typeof municipalities)[0]["_id"];
				name: string;
				county: string | undefined;
				population: number | undefined;
				isVerified: boolean;
				coverageBadge: ReturnType<typeof buildPublicCoverageBadge>;
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
				coverageBadge: buildPublicCoverageBadge(muni),
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
export const listDueForScrape = defineRead({
	args: {},
	handler: async (ctx) => {
		const now = Date.now();
		// Get all active municipalities that are not manual-only
		const municipalities = await ctx.data
			.select("municipalities")
			.orderBy(["isActive", "_creationTime", "_id"])
			.where("isActive", "=", true)
			.all();
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
export const getStats = defineRead({
	args: {
		id: entityId("municipalities"),
	},
	handler: async (ctx, args) => {
		const municipality = await getVisibleMunicipality(ctx, args.id);
		if (!municipality) return null;
		// Count meetings
		const meetings = await ctx.data
			.select("meetings")
			.orderBy(["municipalityId", "_creationTime", "_id"])
			.where("municipalityId", "=", args.id)
			.all();
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
export const listCoverageHealth = defineRead({
	args: {},
	handler: async (ctx) => {
		const caller = await getCurrentUser(ctx);
		if (!caller?.isAdmin) return null;
		const now = Date.now();
		const municipalities = await ctx.data.select("municipalities").all();
		const rows = await Promise.all(
			municipalities.map(async (municipality) => {
				const [meetings, scrapeJobs] = await Promise.all([
					ctx.data
						.select("meetings")
						.orderBy(["municipalityId", "_creationTime", "_id"])
						.where("municipalityId", "=", municipality._id)
						.all(),
					ctx.data
						.select("scrapeJobs")
						.orderBy(["municipalityId", "_creationTime", "_id"])
						.where("municipalityId", "=", municipality._id)
						.direction("desc")
						.limit(10),
				]);
				const summaries = await Promise.all(
					meetings.map((meeting) =>
						ctx.data
							.select("summaries")
							.orderBy(["meetingId", "_creationTime", "_id"])
							.where("meetingId", "=", meeting._id)
							.one(),
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
						coverageStatus: getCoverageStatus(municipality),
						coverageBadge: buildPublicCoverageBadge(municipality, now),
					},
					health: buildMunicipalityCoverageHealth({
						now,
						municipality,
						meetings: meetings.map((meeting) => ({
							id: meeting._id,
							status: meeting.status,
							sourceUrl: meeting.sourceUrl ?? null,
							rawContent: meeting.rawContent ?? null,
							documentId: meeting.documentId ?? null,
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
							meetingsFound: job.meetingsFound ?? null,
							meetingsCreated: job.meetingsCreated ?? null,
							meetingsSkipped: job.meetingsSkipped ?? null,
							meetingsFailed: job.meetingsFailed ?? null,
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
export const listOnboardingChecklists = defineRead({
	args: {},
	handler: async (ctx) => {
		const caller = await getCurrentUser(ctx);
		if (!caller?.isAdmin) return null;
		const now = Date.now();
		const municipalities = await ctx.data.select("municipalities").all();
		const rows = await Promise.all(
			municipalities.map(async (municipality) => {
				const [latestValidation, scrapeJobs, meetings] = await Promise.all([
					ctx.data
						.select("scraperValidationRuns")
						.orderBy(["municipalityId", "createdAt", "_creationTime", "_id"])
						.where("municipalityId", "=", municipality._id)
						.direction("desc")
						.one(),
					ctx.data
						.select("scrapeJobs")
						.orderBy(["municipalityId", "_creationTime", "_id"])
						.where("municipalityId", "=", municipality._id)
						.direction("desc")
						.limit(5),
					ctx.data
						.select("meetings")
						.orderBy(["municipalityId", "_creationTime", "_id"])
						.where("municipalityId", "=", municipality._id)
						.all(),
				]);
				const summaries = await Promise.all(
					meetings.map((meeting) =>
						ctx.data
							.select("summaries")
							.orderBy(["meetingId", "_creationTime", "_id"])
							.where("meetingId", "=", meeting._id)
							.one(),
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
						coverageStatus: getCoverageStatus(municipality),
						coverageStatusReason: municipality.coverageStatusReason ?? null,
						coverageStatusOverrideReason:
							municipality.coverageStatusOverrideReason ?? null,
						coverageStatusUpdatedAt:
							municipality.coverageStatusUpdatedAt ?? null,
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
export const listCoveragePublicationEvents = defineRead({
	args: {
		municipalityId: entityId("municipalities"),
		limit: z.number().optional(),
	},
	handler: async (ctx, args) => {
		const caller = await getCurrentUser(ctx);
		if (!caller?.isAdmin) return null;
		return await ctx.data
			.select("coveragePublicationEvents")
			.orderBy(["municipalityId", "createdAt", "_creationTime", "_id"])
			.where("municipalityId", "=", args.municipalityId)
			.direction("desc")
			.limit(Math.max(1, Math.min(args.limit ?? 20, 100)));
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
function clampResultLimit(limit: number | undefined, fallback: number): number {
	if (limit === undefined) return fallback;
	return Math.max(1, Math.min(Math.floor(limit), MAX_RESULT_LIMIT));
}
async function canReadInternalCoverage(ctx: ServiceContext): Promise<boolean> {
	const caller = await getCurrentUser(ctx);
	return Boolean(caller?.isAdmin);
}
async function getVisibleMunicipality(
	ctx: ServiceContext,
	id: Id<"municipalities">,
) {
	const municipality = await ctx.data.find(id);
	return await filterVisibleMunicipality(ctx, municipality);
}
async function filterVisibleMunicipality(
	ctx: ServiceContext,
	municipality: Doc<"municipalities"> | null,
) {
	if (!municipality) return null;
	if (isCoveragePublic(municipality)) {
		return toSafePublicMunicipality(municipality);
	}
	if (await canReadInternalCoverage(ctx))
		return withPublicCoverageBadge(municipality);
	return null;
}
function projectMunicipalityForCaller(
	municipality: Doc<"municipalities">,
	includeInternal: boolean,
) {
	return includeInternal
		? withPublicCoverageBadge(municipality)
		: toSafePublicMunicipality(municipality);
}
