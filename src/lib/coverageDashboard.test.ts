import { describe, expect, it } from "vitest";
import {
	type CoverageDashboardRow,
	getCoverageAlerts,
	getCoverageDashboardRows,
	getCoverageDashboardStats,
	getCoveragePlatformStats,
} from "./coverageDashboard";

const NOW = Date.UTC(2026, 5, 21, 12);
const HOUR = 60 * 60 * 1000;

describe("coverage dashboard table model", () => {
	it("filters by health, platform, failure, freshness, and coverage attention", () => {
		const rows = coverageRows();

		expect(
			getCoverageDashboardRows(rows, {
				healthState: "failing",
				platform: "granicus",
				failure: "has-failure",
			}).map((row) => row.municipality.name),
		).toEqual(["Failtown"]);

		expect(
			getCoverageDashboardRows(rows, {
				freshness: "stale",
				coverage: "attention",
			}).map((row) => row.municipality.name),
		).toEqual(["Stale City"]);

		expect(
			getCoverageDashboardRows(rows, {
				search: "ct",
				coverage: "complete",
			}).map((row) => row.municipality.name),
		).toEqual(["Liveville"]);
	});

	it("filters by explicit state, active state, and verification state", () => {
		const rows = [
			...coverageRows(),
			row({
				name: "Inactiveburg",
				state: "CT",
				platform: "manual",
				healthState: "unsupported",
				lastScrapedAt: null,
				lastSummarizedAt: null,
				documentAvailabilityPct: 0,
				summaryCoveragePct: 0,
				isActive: false,
				isVerified: false,
			}),
		];

		expect(
			getCoverageDashboardRows(rows, {
				state: "CT",
				activity: "inactive",
				verification: "unverified",
			}).map((row) => row.municipality.name),
		).toEqual(["Inactiveburg"]);
	});

	it("sorts by operational timestamps and coverage percentages", () => {
		const rows = coverageRows();

		expect(
			getCoverageDashboardRows(
				rows,
				{},
				{ key: "lastSummary", direction: "desc" },
			).map((row) => row.municipality.name),
		).toEqual(["Liveville", "Stale City", "Failtown"]);

		expect(
			getCoverageDashboardRows(
				rows,
				{},
				{ key: "coverage", direction: "asc" },
			).map((row) => row.municipality.name),
		).toEqual(["Failtown", "Stale City", "Liveville"]);
	});

	it("summarizes health counts for operator scan cards", () => {
		expect(getCoverageDashboardStats(coverageRows())).toEqual({
			total: 3,
			active: 3,
			inactive: 0,
			verified: 3,
			live: 1,
			stale: 1,
			failing: 1,
			broken: 1,
			pending: 0,
			unsupported: 0,
			neverProbed: 0,
			withFailures: 1,
			coverageAttention: 2,
		});
	});

	it("breaks health down by scraper platform", () => {
		expect(getCoveragePlatformStats(coverageRows())).toEqual([
			{
				platform: "granicus",
				total: 1,
				live: 0,
				stale: 0,
				failing: 1,
				pending: 0,
				unsupported: 0,
				neverProbed: 0,
			},
			{
				platform: "civicplus",
				total: 1,
				live: 1,
				stale: 0,
				failing: 0,
				pending: 0,
				unsupported: 0,
				neverProbed: 0,
			},
			{
				platform: "generic",
				total: 1,
				live: 0,
				stale: 1,
				failing: 0,
				pending: 0,
				unsupported: 0,
				neverProbed: 0,
			},
			{
				platform: "manual",
				total: 0,
				live: 0,
				stale: 0,
				failing: 0,
				pending: 0,
				unsupported: 0,
				neverProbed: 0,
			},
		]);
	});

	it("creates deduped active alert digest rows for repeated failures and stale coverage", () => {
		const rows = coverageRows();
		const recovered = row({
			name: "Recovered Town",
			state: "VT",
			platform: "civicplus",
			healthState: "live",
			lastScrapedAt: NOW - HOUR,
			lastSummarizedAt: NOW - HOUR,
			documentAvailabilityPct: 100,
			summaryCoveragePct: 100,
			lastFailure: { message: "older timeout", at: NOW - 72 * HOUR },
			scrapeJobSample: { total: 3, completed: 2, partial: 0, failed: 1 },
			lastSuccessAt: NOW - HOUR,
		});

		const alerts = getCoverageAlerts([...rows, rows[1], recovered]);

		expect(alerts.map((alert) => alert.id)).toEqual([
			"municipality_Failtown:repeated-failure",
			"municipality_Stale City:stale",
		]);
		expect(alerts[0]).toMatchObject({
			severity: "critical",
			municipalityName: "Failtown",
			platform: "granicus",
			reason: "agenda page returned 500",
			lastSuccessAt: NOW - 12 * HOUR,
			suggestedAction:
				"Inspect scraper logs, confirm the agenda URL still works, then retry the scraper.",
		});
		expect(alerts[1]).toMatchObject({
			severity: "warning",
			municipalityName: "Stale City",
			platform: "generic",
			reason: "No successful scrape inside the freshness window.",
			lastSuccessAt: NOW - 72 * HOUR,
			suggestedAction:
				"Run a manual scrape or check whether the meeting source changed.",
		});
	});
});

function coverageRows(): CoverageDashboardRow[] {
	return [
		row({
			name: "Liveville",
			state: "CT",
			platform: "civicplus",
			healthState: "live",
			lastScrapedAt: NOW - HOUR,
			lastSummarizedAt: NOW - HOUR / 2,
			documentAvailabilityPct: 100,
			summaryCoveragePct: 100,
		}),
		row({
			name: "Failtown",
			state: "MA",
			platform: "granicus",
			healthState: "failing",
			lastScrapedAt: NOW - 2 * HOUR,
			lastSuccessAt: NOW - 12 * HOUR,
			lastSummarizedAt: null,
			documentAvailabilityPct: 0,
			summaryCoveragePct: 0,
			lastFailure: { message: "agenda page returned 500", at: NOW - HOUR },
		}),
		row({
			name: "Stale City",
			state: "RI",
			platform: "generic",
			healthState: "stale",
			lastScrapedAt: NOW - 72 * HOUR,
			lastSummarizedAt: NOW - 24 * HOUR,
			documentAvailabilityPct: 40,
			summaryCoveragePct: 50,
		}),
	];
}

function row({
	name,
	state,
	platform,
	healthState,
	lastScrapedAt,
	lastSummarizedAt,
	documentAvailabilityPct,
	summaryCoveragePct,
	lastFailure = null,
	scrapeJobSample,
	lastSuccessAt = lastScrapedAt,
	isActive = true,
	isVerified = true,
}: {
	name: string;
	state: string;
	platform: CoverageDashboardRow["municipality"]["platform"];
	healthState: CoverageDashboardRow["health"]["state"];
	lastScrapedAt: number | null;
	lastSummarizedAt: number | null;
	documentAvailabilityPct: number;
	summaryCoveragePct: number;
	lastFailure?: CoverageDashboardRow["health"]["lastFailure"];
	scrapeJobSample?: CoverageDashboardRow["health"]["scrapeJobSample"];
	lastSuccessAt?: number | null;
	isActive?: boolean;
	isVerified?: boolean;
}): CoverageDashboardRow {
	const ageMs = lastScrapedAt ? Math.max(0, NOW - lastScrapedAt) : null;

	return {
		municipality: {
			id: `municipality_${name}`,
			name,
			state,
			platform,
			isActive,
			isVerified,
		},
		health: {
			state: healthState,
			freshness: {
				lastScrapedAt,
				lastSuccessAt,
				ageMs,
				frequencyHours: 24,
				staleAfterMs: 48 * HOUR,
				isStale: healthState === "stale",
			},
			scrapeSuccessRate: healthState === "failing" ? 0 : 1,
			scrapeJobSample: scrapeJobSample ?? {
				total: 3,
				completed: healthState === "failing" ? 1 : 3,
				partial: 0,
				failed: healthState === "failing" ? 2 : 0,
			},
			latestScrape: lastScrapedAt
				? {
						status: healthState === "failing" ? "failed" : "completed",
						at: lastScrapedAt,
						meetingsFound: 2,
						meetingsCreated: summaryCoveragePct === 100 ? 2 : 1,
						meetingsSkipped: summaryCoveragePct === 100 ? 0 : 1,
						meetingsFailed: summaryCoveragePct === 0 ? 2 : 0,
					}
				: null,
			documentAvailabilityPct,
			summaryStatus: {
				totalMeetings: 2,
				summarized: summaryCoveragePct === 100 ? 2 : 1,
				pending: 0,
				processing: 0,
				failed: summaryCoveragePct === 0 ? 2 : 0,
				skipped: 0,
				summaryCoveragePct,
				lastSummarizedAt,
			},
			lastFailure,
		},
	};
}
