import { describe, expect, it } from "vitest";
import {
	buildLaunchGate,
	compareLiveSourceRows,
	extractLiveSourceRows,
} from "./municipality-data-audit.mjs";

describe("municipality data audit source comparison", () => {
	it("matches Legistar live detail URLs against stored document URLs", () => {
		const liveRows = [
			{
				title: "City Council - 6:00 PM",
				date: "Jun 15, 2026",
				sourceUrl: "https://bridgeportct.legistar.com/MeetingDetail.aspx?ID=12345",
				alternateSourceUrls: [
					"https://bridgeportct.legistar.com/View.ashx?M=A&ID=12345&GUID=abc",
				],
			},
		];
		const meetings = [
			{
				title: "City Council - 6:00 PM",
				status: "summarized",
				sourceUrl: "https://bridgeportct.legistar.com/View.ashx?M=A&ID=12345&GUID=abc",
				rawContent: "agenda text",
				summary: { executiveSummary: "summary" },
			},
		];

		const result = compareLiveSourceRows({
			platform: "legistar",
			liveRows,
			meetings,
		});

		expect(result).toMatchObject({
			platform: "legistar",
			liveRows: 1,
			storedRowsWithSource: 1,
			liveRowsMissingFromStorage: 0,
			storedRowsMissingFromLive: 0,
		});
	});

	it("extracts Legistar calendar rows with detail and document identity candidates", () => {
		const html = `
			<table>
				<tr class="rgRow">
					<td>City Council</td>
					<td>Jun 15, 2026</td>
					<td>
						<a href="/MeetingDetail.aspx?ID=12345">Details</a>
						<a href="/View.ashx?M=A&ID=12345&GUID=abc">Agenda</a>
					</td>
				</tr>
			</table>
		`;

		const rows = extractLiveSourceRows({
			html,
			meetingsPageUrl: "https://bridgeportct.legistar.com/Calendar.aspx",
			platform: "granicus",
		});

		expect(rows).toEqual([
			expect.objectContaining({
				title: "City Council",
				date: "Jun 15, 2026",
				sourceUrl: "https://bridgeportct.legistar.com/MeetingDetail.aspx?ID=12345",
				alternateSourceUrls: [
					"https://bridgeportct.legistar.com/View.ashx?M=A&ID=12345&GUID=abc",
				],
			}),
		]);
	});

	it("builds a blocked launch gate when live source coverage is incomplete", () => {
		const gate = buildLaunchGate({
			liveSourceAudit: {
				liveRows: 2,
				storedRowsWithSource: 1,
				liveRowsMissingFromStorage: 1,
				storedRowsMissingFromLive: 0,
			},
			statusCounts: {
				pending: 0,
				processing: 0,
				summarized: 1,
				failed: 0,
				skipped: 0,
			},
			meetings: [{ sourceUrl: "https://example.test/meeting/1", rawContent: "content" }],
			exceptions: [],
		});

		expect(gate).toMatchObject({
			status: "blocked",
			checks: {
				liveRowsMissingFromStorage: {
					ok: false,
					value: 1,
				},
			},
		});
	});

	it("allows a documented exception for raw-content gaps without hiding source drift", () => {
		const gate = buildLaunchGate({
			liveSourceAudit: {
				liveRows: 1,
				storedRowsWithSource: 1,
				liveRowsMissingFromStorage: 0,
				storedRowsMissingFromLive: 0,
			},
			statusCounts: {
				pending: 1,
				processing: 0,
				summarized: 0,
				failed: 0,
				skipped: 0,
			},
			meetings: [{ sourceUrl: "https://example.test/meeting/1", rawContent: "" }],
			exceptions: ["Future agenda preview is intentionally pending."],
		});

		expect(gate.status).toBe("ready_with_exceptions");
		expect(gate.checks.rawContentCoverage.ok).toBe(true);
		expect(gate.exceptions).toHaveLength(1);
	});

	it("keeps source drift blocked even when a raw-content exception exists", () => {
		const gate = buildLaunchGate({
			liveSourceAudit: {
				liveRows: 2,
				storedRowsWithSource: 1,
				liveRowsMissingFromStorage: 1,
				storedRowsMissingFromLive: 0,
			},
			statusCounts: {
				pending: 1,
				processing: 0,
				summarized: 0,
				failed: 0,
				skipped: 0,
			},
			meetings: [{ sourceUrl: "https://example.test/meeting/1", rawContent: "" }],
			exceptions: ["Future agenda preview is intentionally pending."],
		});

		expect(gate.status).toBe("blocked");
		expect(gate.checks.rawContentCoverage.ok).toBe(true);
		expect(gate.checks.liveRowsMissingFromStorage.ok).toBe(false);
	});

	it("blocks launch when live source audit finds no live rows or stored source coverage", () => {
		const gate = buildLaunchGate({
			liveSourceAudit: {
				liveRows: 0,
				storedRowsWithSource: 0,
				liveRowsMissingFromStorage: 0,
				storedRowsMissingFromLive: 0,
			},
			statusCounts: {
				pending: 0,
				processing: 0,
				summarized: 1,
				failed: 0,
				skipped: 0,
			},
			meetings: [{ sourceUrl: "", rawContent: "content" }],
			exceptions: [],
		});

		expect(gate.status).toBe("blocked");
		expect(gate.checks.liveRowsPresent.ok).toBe(false);
		expect(gate.checks.storedSourceCoverage.ok).toBe(false);
	});

	it("does not apply source-only exceptions to raw-content coverage", () => {
		const gate = buildLaunchGate({
			liveSourceAudit: {
				liveRows: 1,
				storedRowsWithSource: 1,
				liveRowsMissingFromStorage: 0,
				storedRowsMissingFromLive: 0,
			},
			statusCounts: {
				pending: 0,
				processing: 0,
				summarized: 1,
				failed: 0,
				skipped: 0,
			},
			meetings: [{ sourceUrl: "https://example.test/meeting/1", rawContent: "" }],
			exceptions: ["Manual source extraction exception for unsupported website."],
		});

		expect(gate.status).toBe("blocked");
		expect(gate.checks.liveSourceAudit.ok).toBe(true);
		expect(gate.checks.rawContentCoverage.ok).toBe(false);
	});
});
