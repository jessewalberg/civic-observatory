// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SummaryMetadataPanel } from "./$meetingId";

describe("meeting summary trust metadata", () => {
	afterEach(() => cleanup());

	it("renders AI provenance and source metadata on the meeting detail page", () => {
		render(<SummaryMetadataPanel meeting={meetingWithSummaryMetadata} />);

		expect(screen.getByText("AI summary details")).toBeDefined();
		expect(
			screen.getByText("Civic Observatory AI analysis, not official minutes."),
		).toBeDefined();
		expect(screen.getByText("AI review status")).toBeDefined();
		expect(screen.getAllByText("AI-generated, unreviewed")).toHaveLength(2);
		expect(screen.getByText("Model")).toBeDefined();
		expect(screen.getByText("gpt-4.1-mini")).toBeDefined();
		expect(screen.getByText("Prompt")).toBeDefined();
		expect(screen.getByText("civic-summary-v2")).toBeDefined();
		expect(screen.getByText("Processing time")).toBeDefined();
		expect(screen.getByText("4.2s")).toBeDefined();
		expect(screen.getByText("Summary created")).toBeDefined();
		expect(screen.getByText("June 15")).toBeDefined();
		expect(screen.getByText("Source type")).toBeDefined();
		expect(screen.getByText("Scraped public record")).toBeDefined();
		expect(screen.getByText("Last checked")).toBeDefined();
		expect(screen.getByText("June 16")).toBeDefined();
	});
});

const meetingWithSummaryMetadata = {
	_id: "meeting_1",
	_creationTime: Date.UTC(2026, 5, 15),
	createdAt: Date.UTC(2026, 5, 14),
	updatedAt: Date.UTC(2026, 5, 16, 12),
	municipalityId: "municipality_1",
	title: "Town Council Regular Meeting",
	meetingType: "city_council",
	meetingDate: Date.UTC(2026, 5, 15),
	status: "summarized",
	sourceUrl: "https://example.test/agenda.pdf",
	sourceType: "scraped",
	contentHash: "meeting-content-hash",
	summary: {
		executiveSummary: "Council reviewed budget and grant items.",
		keyDecisions: [],
		discussionTopics: [],
		upcomingItems: [],
		topics: ["budget"],
		modelUsed: "gpt-4.1-mini",
		promptVersion: "civic-summary-v2",
		processingTimeMs: 4200,
		createdAt: Date.UTC(2026, 5, 15, 12),
		sourceUrl: "https://example.test/agenda.pdf",
		sourceType: "scraped",
		sourceContentHash: "summary-content-hash",
		status: "summarized",
	},
	municipality: {
		_id: "municipality_1",
		name: "Coventry",
		state: "CT",
		lastScrapedAt: Date.UTC(2026, 5, 16, 12),
	},
} as const;
