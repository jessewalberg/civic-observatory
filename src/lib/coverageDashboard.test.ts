import { describe, expect, it } from "vitest";
import {
	type CoverageDashboardRow,
	getCoverageDashboardRows,
	getCoverageDashboardStats,
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
			live: 1,
			stale: 1,
			failing: 1,
			pending: 0,
			unsupported: 0,
			neverProbed: 0,
			withFailures: 1,
			coverageAttention: 2,
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
}): CoverageDashboardRow {
	const ageMs = lastScrapedAt ? Math.max(0, NOW - lastScrapedAt) : null;

	return {
		municipality: {
			id: `municipality_${name}`,
			name,
			state,
			platform,
			isActive: true,
			isVerified: true,
		},
		health: {
			state: healthState,
			freshness: {
				lastScrapedAt,
				ageMs,
				frequencyHours: 24,
				staleAfterMs: 48 * HOUR,
				isStale: healthState === "stale",
			},
			scrapeSuccessRate: healthState === "failing" ? 0 : 1,
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
