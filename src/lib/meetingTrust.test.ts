import { describe, expect, it } from "vitest";
import { getMeetingSourceTrust } from "./meetingTrust";

describe("meeting source trust state", () => {
	it("identifies source-backed scraped summaries", () => {
		expect(
			getMeetingSourceTrust({
				status: "summarized",
				sourceUrl:
					"https://www.coventry-ct.gov/AgendaCenter/ViewFile/Agenda/_06152026-4545?packet=true",
				sourceType: "scraped",
				contentHash: "meeting-hash",
				summary: {
					status: "summarized",
					sourceUrl:
						"https://www.coventry-ct.gov/AgendaCenter/ViewFile/Agenda/_06152026-4545?packet=true",
					sourceType: "scraped",
					sourceContentHash: "summary-hash",
				},
			}),
		).toMatchObject({
			state: "source-backed",
			label: "Source-backed summary",
			sourceUrl:
				"https://www.coventry-ct.gov/AgendaCenter/ViewFile/Agenda/_06152026-4545?packet=true",
			sourceTypeLabel: "Scraped public record",
			hasContentHash: true,
		});
	});

	it("surfaces missing source links honestly", () => {
		expect(
			getMeetingSourceTrust({
				status: "summarized",
				summary: {
					status: "summarized",
				},
			}),
		).toMatchObject({
			state: "missing-source",
			label: "Source unavailable",
			sourceUrl: null,
			hasContentHash: false,
		});
	});

	it("does not claim a source-backed summary before a summary exists", () => {
		expect(
			getMeetingSourceTrust({
				status: "processing",
				sourceUrl: "https://example.test/agenda.pdf",
				sourceType: "scraped",
				contentHash: "meeting-hash",
				summary: null,
			}),
		).toMatchObject({
			state: "source-backed",
			label: "Source-backed record",
			sourceUrl: "https://example.test/agenda.pdf",
			hasContentHash: true,
		});
	});

	it("preserves source context when processing failed", () => {
		expect(
			getMeetingSourceTrust({
				status: "failed",
				sourceUrl: "https://example.test/agenda.pdf",
				sourceType: "scraped",
				processingError: "Document had no extractable text",
			}),
		).toMatchObject({
			state: "failed",
			label: "Summary failed",
			sourceUrl: "https://example.test/agenda.pdf",
			sourceTypeLabel: "Scraped public record",
		});
	});
});
