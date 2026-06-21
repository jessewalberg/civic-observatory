import { describe, expect, it } from "vitest";
import {
	buildMunicipalityCoverageHealth,
	type CoverageHealthInput,
} from "./coverageHealth";

const NOW = Date.UTC(2026, 5, 21, 12);
const HOUR = 60 * 60 * 1000;

describe("municipality coverage health metrics", () => {
	it("marks active fresh municipalities with source-backed summaries as live", () => {
		const health = buildMunicipalityCoverageHealth({
			now: NOW,
			municipality: municipality({
				lastScrapedAt: NOW - 2 * HOUR,
				lastScrapeStatus: "success",
			}),
			meetings: [
				meeting({
					status: "summarized",
					sourceUrl: "https://example.test/a.pdf",
				}),
				meeting({ status: "summarized", rawContent: "minutes text" }),
			],
			summaries: [{ meetingId: "meeting_1" }, { meetingId: "meeting_2" }],
			scrapeJobs: [
				job({ status: "completed" }),
				job({ status: "completed" }),
				job({ status: "failed", errors: [{ message: "timeout" }] }),
			],
		});

		expect(health.state).toBe("live");
		expect(health.freshness.isStale).toBe(false);
		expect(health.scrapeSuccessRate).toBeCloseTo(2 / 3);
		expect(health.documentAvailabilityPct).toBe(100);
		expect(health.summaryStatus.summaryCoveragePct).toBe(100);
		expect(health.lastFailure?.message).toBe("timeout");
	});

	it("distinguishes unsupported, pending, never-probed, stale, and failing states", () => {
		expect(
			buildMunicipalityCoverageHealth({
				now: NOW,
				municipality: municipality({ isActive: false }),
				meetings: [],
				summaries: [],
				scrapeJobs: [],
			}).state,
		).toBe("unsupported");

		expect(
			buildMunicipalityCoverageHealth({
				now: NOW,
				municipality: municipality(),
				meetings: [],
				summaries: [],
				scrapeJobs: [job({ status: "running" })],
			}).state,
		).toBe("pending");

		expect(
			buildMunicipalityCoverageHealth({
				now: NOW,
				municipality: municipality(),
				meetings: [],
				summaries: [],
				scrapeJobs: [],
			}).state,
		).toBe("never-probed");

		expect(
			buildMunicipalityCoverageHealth({
				now: NOW,
				municipality: municipality({
					lastScrapedAt: NOW - 72 * HOUR,
					lastScrapeStatus: "success",
				}),
				meetings: [meeting({ status: "summarized" })],
				summaries: [{ meetingId: "meeting_1" }],
				scrapeJobs: [job({ status: "completed" })],
			}).state,
		).toBe("stale");

		expect(
			buildMunicipalityCoverageHealth({
				now: NOW,
				municipality: municipality({
					lastScrapedAt: NOW - HOUR,
					lastScrapeStatus: "failed",
					lastScrapeError: "Source returned 500",
				}),
				meetings: [meeting({ status: "failed" })],
				summaries: [],
				scrapeJobs: [job({ status: "failed" })],
			}).state,
		).toBe("failing");
	});
});

function municipality(
	overrides: Partial<CoverageHealthInput["municipality"]> = {},
): CoverageHealthInput["municipality"] {
	return {
		isActive: true,
		platform: "civicplus",
		meetingsPageUrl: "https://example.test/agenda",
		scrapeConfig: { frequencyHours: 24 },
		...overrides,
	};
}

function meeting(
	overrides: Partial<CoverageHealthInput["meetings"][number]> = {},
): CoverageHealthInput["meetings"][number] {
	return {
		id: "meeting_1",
		status: "summarized",
		...overrides,
	};
}

function job(
	overrides: Partial<CoverageHealthInput["scrapeJobs"][number]> = {},
): CoverageHealthInput["scrapeJobs"][number] {
	return {
		status: "completed",
		createdAt: NOW - HOUR,
		...overrides,
	};
}
