import { describe, expect, it } from "vitest";
import {
	buildSourceProofExamples,
	SOURCE_PROOF_FALLBACK_COPY,
} from "./sourceProof";

describe("source-backed product proof", () => {
	it("builds proof examples only from summaries with meeting, municipality, and source links", () => {
		const examples = buildSourceProofExamples([
			{
				_id: "summary_1",
				executiveSummary:
					"Council approved the park bond and requested quarterly reporting on construction timelines.",
				sourceUrl: "https://example.test/summary-source.pdf",
				meeting: {
					_id: "meeting_1",
					slug: "coventry-town-council-2026-06-01",
					title: "Town Council Regular Meeting",
					meetingDate: Date.UTC(2026, 5, 1),
					sourceUrl: "https://example.test/agenda.pdf",
				},
				municipality: {
					name: "Coventry",
					state: "CT",
				},
			},
			{
				_id: "summary_2",
				executiveSummary: "This record lacks a public source link.",
				meeting: {
					_id: "meeting_2",
					title: "Planning Commission",
					meetingDate: Date.UTC(2026, 4, 15),
				},
				municipality: {
					name: "Coventry",
					state: "CT",
				},
			},
		]);

		expect(examples).toEqual([
			expect.objectContaining({
				municipality: "Coventry, CT",
				meetingTitle: "Town Council Regular Meeting",
				meetingPath: "/meeting/coventry-town-council-2026-06-01",
				sourceUrl: "https://example.test/summary-source.pdf",
			}),
		]);
		expect(examples[0]?.summaryExcerpt).toContain("park bond");
	});

	it("uses the meeting source when the summary has no separate source", () => {
		const [example] = buildSourceProofExamples([
			{
				_id: "summary_1",
				executiveSummary: "Council reviewed a source-backed zoning update.",
				meeting: {
					_id: "meeting_1",
					title: "Zoning Board",
					meetingDate: Date.UTC(2026, 3, 10),
					sourceUrl: "https://example.test/zoning-agenda.pdf",
				},
				municipality: {
					name: "Coventry",
					state: "CT",
				},
			},
		]);

		expect(example?.sourceUrl).toBe("https://example.test/zoning-agenda.pdf");
	});

	it("returns an honest fallback when no source-backed proof exists", () => {
		expect(buildSourceProofExamples([])).toEqual([]);
		expect(SOURCE_PROOF_FALLBACK_COPY).toContain("No source-backed summaries");
	});
});
