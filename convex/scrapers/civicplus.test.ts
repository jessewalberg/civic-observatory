import { afterEach, describe, expect, it, vi } from "vitest";
import { civicplusScraper } from "./civicplus";

const COVENTRY_TOWN_COUNCIL_URL =
	"https://www.coventry-ct.gov/AgendaCenter/Town-Council-20";

function agendaRow({
	id,
	dateLabel,
	title,
}: {
	id: string;
	dateLabel: string;
	title: string;
}) {
	return `
		<tr id="row${id}" class="catAgendaRow">
			<td>
				<h3 class="noMargin">
					<strong aria-label="Agenda for ${dateLabel}">${dateLabel}</strong>
				</h3>
				<p>
					<a href="/AgendaCenter/ViewFile/Agenda/_${id}?html=true">
						${title}
					</a>
				</p>
			</td>
			<td class="minutes">
				<a href="/AgendaCenter/ViewFile/Minutes/_${id}" aria-label="${dateLabel}, ${title}. Minutes">
					Minutes
				</a>
			</td>
			<td class="media">
				<a href="https://coventryct.viebit.com/watch?hash=${id}">Video</a>
			</td>
			<td class="downloads">
				<ol>
					<li><a class="html" href="/AgendaCenter/ViewFile/Agenda/_${id}?html=true">HTML</a></li>
					<li><a class="pdf" href="/AgendaCenter/ViewFile/Agenda/_${id}">PDF</a></li>
					<li><a class="pdf" href="/AgendaCenter/ViewFile/Agenda/_${id}?packet=true">Packet</a></li>
				</ol>
			</td>
		</tr>
	`;
}

describe("civicplusScraper Coventry AgendaCenter fixtures", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("extracts Town Council rows with HTML source and packet document URLs", async () => {
		const html = `
			<table>
				<tbody>
					${agendaRow({
						id: "06152026-4545",
						dateLabel: "June 15, 2026",
						title: "Town Council Meeting and Public Hearing: June 15, 2026",
					})}
					${agendaRow({
						id: "06012026-4529",
						dateLabel: "June 1, 2026",
						title: "Town Council Meeting: June 1, 2026",
					})}
					${agendaRow({
						id: "05182026-4514",
						dateLabel: "May 18, 2026",
						title: "Town Council Meeting: May 18, 2026",
					})}
				</tbody>
			</table>
		`;

		vi.stubGlobal(
			"fetch",
			vi.fn(async () => new Response(html, { status: 200 })),
		);

		const result = await civicplusScraper.scrape(COVENTRY_TOWN_COUNCIL_URL);

		expect(result.success).toBe(true);
		expect(result.errors).toEqual([]);
		expect(result.stats).toMatchObject({ found: 3, new: 3, failed: 0 });
		expect(result.meetings.map((meeting) => meeting.title)).toEqual([
			"Town Council Meeting and Public Hearing: June 15, 2026",
			"Town Council Meeting: June 1, 2026",
			"Town Council Meeting: May 18, 2026",
		]);
		expect(result.meetings[0]).toMatchObject({
			meetingType: "city_council",
			sourceUrl:
				"https://www.coventry-ct.gov/AgendaCenter/ViewFile/Agenda/_06152026-4545?html=true",
			documentUrl:
				"https://www.coventry-ct.gov/AgendaCenter/ViewFile/Agenda/_06152026-4545?packet=true",
		});
		expect(new Date(result.meetings[0].meetingDate).toISOString()).toContain(
			"2026-06-15",
		);
	});
});
