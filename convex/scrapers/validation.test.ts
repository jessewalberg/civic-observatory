import { describe, expect, it } from "vitest";
import {
	buildScraperValidationReport,
	type ScraperValidationReportInput,
} from "./validation";

const now = new Date("2026-06-21T12:00:00.000Z").getTime();

const baseInput: ScraperValidationReportInput = {
	now,
	sourceUrl: "https://example.civicplus.com/AgendaCenter",
	configuredPlatform: "civicplus",
	detectedPlatform: "civicplus",
	selectedPlatform: "civicplus",
	scraperFound: true,
	scrapeSucceeded: true,
	meetings: [
		{
			title: "Town Council",
			meetingDate: now - 60_000,
			meetingType: "city_council",
			sourceUrl: "https://example.civicplus.com/AgendaCenter/ViewFile/Agenda/1",
			documentUrl:
				"https://example.civicplus.com/AgendaCenter/ViewFile/Agenda/1.pdf",
			rawContent: "Agenda text",
			contentHash: "town-council-1",
		},
	],
	errors: [],
	duplicateResults: [{ exists: false, sourceUrl: "https://example.test/1" }],
};

describe("scraper validation report", () => {
	it("passes when the platform is supported and meetings are document-ready", () => {
		const report = buildScraperValidationReport(baseInput);

		expect(report.status).toBe("passed");
		expect(report.stats).toMatchObject({
			meetingsFound: 1,
			documentReady: 1,
			summaryReady: 1,
			duplicates: 0,
		});
		expect(report.checks.map((check) => [check.name, check.status])).toEqual([
			["platform_detection", "pass"],
			["source_reachable", "pass"],
			["meeting_extraction", "pass"],
			["document_links", "pass"],
			["duplicate_behavior", "pass"],
			["summary_readiness", "pass"],
		]);
	});

	it("fails unsupported platform validation before reachability checks", () => {
		const report = buildScraperValidationReport({
			...baseInput,
			configuredPlatform: "manual",
			selectedPlatform: undefined,
			scraperFound: false,
			scrapeSucceeded: false,
			meetings: [],
			errors: [
				{
					message: "Manual municipalities do not have automatic scrapers",
					code: "unknown",
					timestamp: now,
				},
			],
			duplicateResults: undefined,
		});

		expect(report.status).toBe("failed");
		expect(
			report.checks.find((check) => check.name === "platform_detection"),
		).toMatchObject({
			status: "fail",
			message: "No automatic scraper is available for manual coverage.",
		});
		expect(
			report.checks.find((check) => check.name === "source_reachable"),
		).toMatchObject({ status: "not_applicable" });
	});

	it("fails unreachable sources with the scraper error surfaced", () => {
		const report = buildScraperValidationReport({
			...baseInput,
			scrapeSucceeded: false,
			meetings: [],
			errors: [
				{
					message: "fetch failed: connection refused",
					code: "network",
					url: baseInput.sourceUrl,
					timestamp: now,
				},
			],
			duplicateResults: [],
		});

		expect(report.status).toBe("failed");
		expect(
			report.checks.find((check) => check.name === "source_reachable"),
		).toMatchObject({
			status: "fail",
			message: "Source was not reachable: fetch failed: connection refused",
		});
	});

	it("fails when no meetings are extracted from a reachable source", () => {
		const report = buildScraperValidationReport({
			...baseInput,
			meetings: [],
			errors: [],
			duplicateResults: [],
		});

		expect(report.status).toBe("failed");
		expect(
			report.checks.find((check) => check.name === "meeting_extraction"),
		).toMatchObject({
			status: "fail",
			message: "No meetings were extracted from the source.",
		});
	});

	it("marks partial document extraction as a retrievable warning", () => {
		const report = buildScraperValidationReport({
			...baseInput,
			meetings: [
				baseInput.meetings[0],
				{
					title: "Planning Commission",
					meetingDate: now - 120_000,
					meetingType: "planning_commission",
					sourceUrl: baseInput.sourceUrl,
					contentHash: "planning-1",
				},
			],
			duplicateResults: [
				{ exists: false, sourceUrl: "https://example.test/1" },
				{ exists: false, sourceUrl: "https://example.test/2" },
			],
		});

		expect(report.status).toBe("partial");
		expect(report.stats).toMatchObject({
			meetingsFound: 2,
			documentReady: 1,
			summaryReady: 1,
		});
		expect(
			report.checks.find((check) => check.name === "document_links"),
		).toMatchObject({
			status: "warning",
			message: "Only 1 of 2 meetings had document links or inline content.",
		});
		expect(report.meetingSample[1]).toMatchObject({
			title: "Planning Commission",
			documentReady: false,
			summaryReady: false,
		});
	});
});
