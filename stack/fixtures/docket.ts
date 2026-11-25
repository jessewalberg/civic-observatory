// A made-up docket-v1 bundle, for CI and local runs: towns that do not exist, at
// hosts that cannot (RFC 2606). `bun fixtures/docket.ts` prints it as JSON.

interface MeetingInput {
	town: string;
	board: string;
	type: string;
	date: string;
	status?: "held" | "cancelled" | "upcoming";
	special?: true;
	subbody?: string;
	minutes?: false;
	note?: string;
	items?: Record<string, unknown>[];
}

const slug = (text: string) =>
	text
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "");
const host = (town: string) => `https://www.${slug(town)}.example`;

const PLANNING = "Planning and Zoning Commission";
const WETLANDS = "Inland Wetlands Agency";
const APPEALS = "Zoning Board of Appeals";
const CONSERVATION = "Conservation Commission";
const COUNCIL = "Town Council";

// Every Monday of eight weeks, in a town with more items than one page holds.
const weekly: MeetingInput[] = Array.from({ length: 8 }, (_, week) => ({
	town: "Aldermoor",
	board: PLANNING,
	type: "planning_zoning",
	date: new Date(Date.UTC(2026, 2, 2 + 7 * week)).toISOString().slice(0, 10),
	items: Array.from({ length: 4 }, (_, at) => ({
		kind: (["application", "hearing", "decision", "discussion"] as const)[at],
		status: ["received", "continued", "approved", "discussed"][at],
		status_label: [
			"Received",
			"Continued",
			"Approved, 5-0",
			"Discussed, no vote",
		][at],
		case_number: at < 3 ? `PZ-26-${week * 4 + at + 1}` : null,
		address: `${10 + week * 4 + at} Millrace Road`,
		applicant_display: at === 3 ? null : "Millrace Homes LLC",
		request: `Item ${at + 1} of week ${week + 1}: a ${at + 2}-lot subdivision on Millrace Road.`,
		outcome: `Outcome ${at + 1} of week ${week + 1}.`,
		outcome_source_text: `MOTION ${week + 1}.${at + 1} on the Millrace Road subdivision … CARRIED.`,
	})),
}));

const others: MeetingInput[] = [
	{
		town: "Brackenfield",
		board: WETLANDS,
		type: "wetlands",
		date: "2026-03-11",
		items: [
			{
				kind: "decision",
				status: "denied",
				status_label: "Denied",
				// What a page must show as text and never as markup.
				address: 'Lot 7 & Lot 8, "The Narrows" <rear>',
				parcel: "12/7, 12/8",
				applicant_display: "Owner (individual)",
				request: "Fill 0.2 acres for a driveway; <b>not bold</b> & not a tag.",
				outcome: "Denied 4-1.",
				outcome_source_text:
					'[member] said "no" & moved to deny </script><script>alert(1)</script> … the motion carried 4-1.',
				source_ocr: true,
			},
			{
				kind: "notice",
				status: "received",
				status_label: "Notice received",
				address: "Long Pond",
				request: "Lake drawdown of three feet from October.",
				outcome: "Notice received.",
				outcome_source_text: "Long Pond drawdown, 3 ft, from October 15",
			},
		],
	},
	{
		town: "Brackenfield",
		board: APPEALS,
		type: "zba",
		date: "2026-04-14",
		special: true,
		minutes: false,
		items: [
			{
				kind: "hearing",
				status: "outcome_not_posted",
				status_label: "Outcome not posted yet",
				address: null,
				case_number: "ZBA-26-2",
				owner_display: "Brackenfield Land Trust",
				request: "Variance of the side setback.",
				outcome: "On the agenda. Minutes not posted online.",
				outcome_source_text: "Public hearing: ZBA-26-2, side setback",
			},
		],
	},
	{
		town: "Candle Hollow",
		board: CONSERVATION,
		type: "conservation",
		date: "2026-04-07",
		subbody: "Site walk",
		items: [
			{
				kind: "discussion",
				status: "referred",
				status_label: "Recommended, unanimous",
				address: "Old Quarry",
				request: "Open-space purchase of 40 acres.",
				outcome: "Recommended to the council, unanimous.",
				outcome_source_text: "unanimous recommendation of the Old Quarry purchase",
				address_source: {
					url: `${host("Candle Hollow")}/council/2026-03.pdf`,
					label: "the Town Council's March packet (page 4)",
					text: "Old Quarry, 40 acres, Quarry Lane",
					ocr: false,
				},
			},
		],
	},
	{
		town: "Candle Hollow",
		board: COUNCIL,
		type: "council_selectmen",
		date: "2026-05-12",
		status: "upcoming",
		items: [
			{
				kind: "hearing",
				status: "upcoming",
				status_label: "Upcoming",
				address: "Town-wide",
				request: "Public hearing on leasing the old firehouse.",
				outcome: "On the agenda.",
				outcome_source_text: "Public Hearing: Lease, Old Firehouse",
			},
			{
				kind: "discussion",
				status: "upcoming",
				status_label: "Upcoming",
				address: null,
				parcel: "4/19",
				request: "Sale of a town parcel.",
				outcome: "On the agenda.",
				outcome_source_text: "Discussion: sale of parcel 4/19",
			},
			{
				kind: "application",
				status: "cancelled",
				status_label: "Cancelled",
				address: "9 Tallow Street",
				request: "Water extension to Tallow Street.",
				outcome: "Taken off the agenda.",
				outcome_source_text: "Water extension, 9 Tallow Street: CANCELLED",
			},
		],
	},
	{
		town: "Eastmere",
		board: COUNCIL,
		type: "council_selectmen",
		date: "2026-03-25",
		note: "No land-use items (budget).",
	},
	{
		town: "Eastmere",
		board: PLANNING,
		type: "planning_zoning",
		date: "2026-04-22",
		status: "cancelled",
	},
];

const towns = [
	"Aldermoor",
	"Brackenfield",
	"Candle Hollow",
	"Dunmarrow",
	"Eastmere",
];

const meetings = [...weekly, ...others].map((input) => {
	const id = [
		slug(input.town),
		slug(input.board),
		input.date,
		input.subbody ? slug(input.subbody) : "",
		input.special ? "special" : "",
	]
		.filter(Boolean)
		.join("-");
	const status = input.status ?? "held";
	const posted = status === "held" && input.minutes !== false;
	return {
		input,
		meeting: {
			id,
			town: input.town,
			board: input.board,
			board_type: input.type,
			subbody: input.subbody ?? null,
			meeting_date: input.date,
			meeting_type: input.special ? "special" : "regular",
			status,
			agenda_url: `${host(input.town)}/agendas/${id}.pdf`,
			minutes_url: posted ? `${host(input.town)}/minutes/${id}.pdf` : null,
			minutes_status: posted
				? "posted"
				: status === "held"
					? "not_posted_yet"
					: "not_applicable",
			minutes_note: null,
			note: input.note ?? null,
			item_count: input.items?.length ?? 0,
		},
	};
});

export const fixture = {
	schema_version: "docket-v1",
	title: "Made-up development docket",
	generated_at: "2026-05-02T02:30:00Z",
	window: {
		start: "2026-03-01",
		end: "2026-04-30",
		upcoming_through: "2026-05-15",
	},
	towns,
	sources: towns.map((town) => ({
		town,
		platform: "A made-up website",
		site: `${host(town)}/boards`,
		boards:
			town === "Dunmarrow"
				? [PLANNING, COUNCIL].map((board, at) => ({
						board,
						minutes_online: "blocked",
						status: "blocked",
						...(at === 0
							? { note: "The made-up site answers a machine with a challenge." }
							: {}),
					}))
				: [
						{
							board: PLANNING,
							agendas: `${host(town)}/agendas (category 1)`,
							minutes_online: "yes",
							status: "collected",
						},
						{
							board: WETLANDS,
							minutes_online: "lagging",
							status: "collected",
							note: "April minutes not up yet.",
						},
						{
							board: APPEALS,
							minutes_online: "no",
							status: "agendas_only",
						},
						...[CONSERVATION, COUNCIL].map((board) => ({
							board,
							minutes_online: "partial",
							status: others.some(
								(meeting) => meeting.town === town && meeting.board === board,
							)
								? "collected"
								: "none_in_window",
						})),
					],
	})),
	meetings: meetings.map(({ meeting }) => meeting),
	items: meetings.flatMap(({ input, meeting }) =>
		(input.items ?? []).map((item, at) => ({
			id: `${meeting.id}-${String(at + 1).padStart(2, "0")}`,
			town: meeting.town,
			board: meeting.board,
			board_type: meeting.board_type,
			subbody: meeting.subbody,
			meeting_date: meeting.meeting_date,
			meeting_type: meeting.meeting_type,
			case_number: null,
			parcel: null,
			applicant_display: null,
			owner_display: null,
			source_type: meeting.minutes_url ? "minutes" : "agenda",
			source_url: meeting.minutes_url ?? meeting.agenda_url,
			agenda_url: meeting.agenda_url,
			minutes_url: meeting.minutes_url,
			source_ocr: false,
			collected_at: "2026-05-01T20:00:00Z",
			address_source: null,
			...item,
		})),
	),
};

if (import.meta.main) console.log(JSON.stringify(fixture, null, 1));
