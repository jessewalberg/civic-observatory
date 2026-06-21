import { describe, expect, it } from "vitest";
import { buildPublicCoverageBadge } from "./publicCoverageBadge";

const NOW = Date.UTC(2026, 5, 21, 12);
const HOUR = 60 * 60 * 1000;

describe("public coverage reliability badges", () => {
	it("labels verified, active, manual, and seeded coverage distinctly", () => {
		expect(
			buildPublicCoverageBadge(
				municipality({
					isVerified: true,
					lastScrapedAt: NOW - HOUR,
					lastScrapeStatus: "success",
				}),
				NOW,
			),
		).toMatchObject({
			kind: "verified",
			label: "Verified coverage",
			tone: "success",
			latestHealth: "fresh",
			lastCheckedAt: NOW - HOUR,
		});

		expect(
			buildPublicCoverageBadge(
				municipality({
					isVerified: false,
					lastScrapedAt: NOW - HOUR,
					lastScrapeStatus: "success",
				}),
				NOW,
			),
		).toMatchObject({
			kind: "active",
			label: "Active coverage",
			tone: "info",
		});

		expect(
			buildPublicCoverageBadge(municipality({ platform: "manual" }), NOW),
		).toMatchObject({
			kind: "manual",
			label: "Manual coverage",
			latestHealth: "manual",
			lastCheckedAt: null,
		});

		expect(
			buildPublicCoverageBadge(
				municipality({ isActive: false, isVerified: false }),
				NOW,
			),
		).toMatchObject({
			kind: "seeded",
			label: "Seeded coverage",
			tone: "warning",
		});
	});

	it("summarizes latest scrape health without raw failure details", () => {
		expect(
			buildPublicCoverageBadge(
				municipality({
					lastScrapedAt: NOW - 72 * HOUR,
					lastScrapeStatus: "success",
				}),
				NOW,
			).latestHealth,
		).toBe("stale");

		expect(
			buildPublicCoverageBadge(
				municipality({
					lastScrapedAt: NOW - HOUR,
					lastScrapeStatus: "partial",
				}),
				NOW,
			).latestHealth,
		).toBe("partial");

		const failing = buildPublicCoverageBadge(
			municipality({
				lastScrapedAt: NOW - HOUR,
				lastScrapeStatus: "failed",
			}),
			NOW,
		);
		expect(failing.latestHealth).toBe("failing");
		expect(JSON.stringify(failing)).not.toMatch(/error|token|secret/i);
	});
});

function municipality(
	overrides: Partial<Parameters<typeof buildPublicCoverageBadge>[0]> = {},
): Parameters<typeof buildPublicCoverageBadge>[0] {
	return {
		coverageStatus: "published",
		isActive: true,
		isVerified: true,
		platform: "civicplus",
		scrapeConfig: { frequencyHours: 24 },
		...overrides,
	};
}
