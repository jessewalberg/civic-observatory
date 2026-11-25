// The docket's reads. Every statement is fixed; what a page asks for is bound.
import {
	type Board,
	dateInConnecticut,
	type Item,
	type ListSearch,
	pagesOf,
	type Release,
	type Town,
} from "@/lib/docket";
import { PAGE_SIZE } from "@/lib/limits";
import { env } from "./env";
import { recordDatabase } from "./observability";

/** Today in Connecticut. Local runs may say what day it is, for the checks. */
export function today(): string {
	const said = env.APP_ENV === "local" ? env.LOCAL_TODAY : undefined;
	return said && /^\d{4}-\d\d-\d\d$/.test(said)
		? said
		: dateInConnecticut(new Date());
}

async function read(
	...statements: D1PreparedStatement[]
): Promise<Record<string, unknown>[][]> {
	const results = await env.DB.batch<Record<string, unknown>>(statements);
	for (const { meta } of results) recordDatabase(meta);
	return results.map((result) => result.results);
}

const RELEASE =
	"SELECT generated_at, window_start, window_end, upcoming_through, item_count FROM releases ORDER BY seq DESC LIMIT 1";

const TOWNS = `SELECT t.slug, t.town, t.platform, t.site,
	EXISTS (SELECT 1 FROM boards b WHERE b.town_slug = t.slug AND b.status <> 'blocked') AS collected
FROM towns t`;

const COLUMNS = `i.id, t.town, i.town_slug, i.board, i.subbody, i.meeting_date, i.meeting_type, i.kind,
	i.case_number, i.address, i.parcel, i.applicant_display, i.owner_display, i.request, i.status, i.status_label,
	i.outcome, i.quote, i.source_type, i.source_url, i.source_ocr, i.agenda_url, i.minutes_url,
	i.address_source_url, i.address_source_label, i.address_source_text`;

// ?1 town, ?2 board type, ?3 kind, ?4 today when only upcoming items are asked.
const MATCHES = `(?1 IS NULL OR i.town_slug = ?1)
	AND (?2 IS NULL OR i.board_type = ?2)
	AND (?3 IS NULL OR i.kind = ?3)
	AND (?4 IS NULL OR (i.meeting_date >= ?4 AND i.status <> 'cancelled'))`;

const COUNT = `SELECT count(*) AS n FROM items i WHERE ${MATCHES}`;
const PAGE = `SELECT ${COLUMNS} FROM items i JOIN towns t ON t.slug = i.town_slug WHERE ${MATCHES}
ORDER BY i.meeting_date DESC, i.town_slug, i.board, i.id LIMIT ?5 OFFSET ?6`;

type Row = Record<string, unknown>;
const text = (value: unknown) => (typeof value === "string" ? value : null);

function releaseOf(row: Row | undefined): Release | null {
	return row
		? {
				generatedAt: String(row.generated_at),
				windowStart: String(row.window_start),
				windowEnd: String(row.window_end),
				upcomingThrough: String(row.upcoming_through),
				items: Number(row.item_count),
			}
		: null;
}

const townOf = (row: Row): Town => ({
	slug: String(row.slug),
	town: String(row.town),
	collected: row.collected === 1,
});

function itemOf(row: Row, now: string): Item {
	const date = String(row.meeting_date);
	const source = String(row.source_url);
	const other = (url: unknown) => (url === source ? null : text(url));
	const addressUrl = text(row.address_source_url);
	return {
		id: String(row.id),
		town: String(row.town),
		townSlug: String(row.town_slug),
		board: String(row.board),
		subbody: text(row.subbody),
		meetingDate: date,
		meetingType: String(row.meeting_type),
		kind: row.kind as Item["kind"],
		caseNumber: text(row.case_number),
		address: text(row.address),
		parcel: text(row.parcel),
		applicant: text(row.applicant_display),
		ownerShown: text(row.owner_display),
		request: String(row.request),
		// What the data calls upcoming is not, once its date has passed.
		statusLabel:
			row.status === "upcoming" && date < now
				? "Date has passed; outcome not collected yet"
				: String(row.status_label),
		outcome: String(row.outcome),
		quote: String(row.quote),
		sourceType: row.source_type === "agenda" ? "agenda" : "minutes",
		sourceUrl: source,
		sourceOcr: row.source_ocr === 1,
		agendaUrl: other(row.agenda_url),
		minutesUrl: other(row.minutes_url),
		addressSource: addressUrl
			? {
					url: addressUrl,
					label: String(row.address_source_label),
					text: String(row.address_source_text),
				}
			: null,
	};
}

export interface ItemList {
	/** Items that match, across all pages. */
	total: number;
	page: number;
	pages: number;
	items: Item[];
}

/** Null when the address asks for a page past the last one. */
function listOf(
	total: number,
	rows: Row[],
	page: number,
	now: string,
): ItemList | null {
	const pages = pagesOf(total);
	return page > pages
		? null
		: { total, page, pages, items: rows.map((row) => itemOf(row, now)) };
}

function listStatements(search: ListSearch, now: string) {
	const filters = [
		search.town ?? null,
		search.board ?? null,
		search.kind ?? null,
		search.upcoming ? now : null,
	];
	const page = search.page ?? 1;
	return [
		env.DB.prepare(COUNT).bind(...filters),
		env.DB.prepare(PAGE).bind(...filters, PAGE_SIZE, (page - 1) * PAGE_SIZE),
	];
}

export interface Docket {
	release: Release | null;
	towns: Town[];
	signupOpen: boolean;
	list: ItemList;
}

/** The front page. Null: no such page, or no such town. */
export async function readDocket(search: ListSearch): Promise<Docket | null> {
	const now = today();
	const [release, towns, settings, count, rows] = await read(
		env.DB.prepare(RELEASE),
		env.DB.prepare(`${TOWNS} ORDER BY t.town`),
		env.DB.prepare("SELECT signup_open FROM settings WHERE id = 1"),
		...listStatements(search, now),
	);
	const known = (towns ?? []).map(townOf);
	if (search.town && !known.some(({ slug }) => slug === search.town))
		return null;
	const list = listOf(
		Number(count?.[0]?.n ?? 0),
		rows ?? [],
		search.page ?? 1,
		now,
	);
	return (
		list && {
			release: releaseOf(release?.[0]),
			towns: known,
			signupOpen: settings?.[0]?.signup_open === 1,
			list,
		}
	);
}

export type ItemPage =
	| { found: "item"; item: Item; site: string }
	| {
			found: "withdrawn";
			town: string;
			board: string;
			meetingDate: string;
			withdrawnOn: string;
	  };

export async function readItem(id: string): Promise<ItemPage | null> {
	const [items, withdrawn] = await read(
		env.DB.prepare(
			`SELECT ${COLUMNS}, t.site FROM items i JOIN towns t ON t.slug = i.town_slug WHERE i.id = ?1`,
		).bind(id),
		env.DB.prepare(
			"SELECT town, board, meeting_date, withdrawn_at FROM withdrawn_items WHERE id = ?1",
		).bind(id),
	);
	const row = items?.[0];
	if (row)
		return {
			found: "item",
			item: itemOf(row, today()),
			site: String(row.site),
		};
	const gone = withdrawn?.[0];
	return gone
		? {
				found: "withdrawn",
				town: String(gone.town),
				board: String(gone.board),
				meetingDate: String(gone.meeting_date),
				withdrawnOn: dateInConnecticut(new Date(String(gone.withdrawn_at))),
			}
		: null;
}

/** A meeting that was looked at and put nothing on the docket. */
export interface QuietMeeting {
	id: string;
	board: string;
	subbody: string | null;
	date: string;
	status: string;
	note: string | null;
	minutesNote: string | null;
	url: string | null;
}

export interface TownPage {
	release: Release;
	town: Town;
	platform: string;
	site: string;
	boards: Board[];
	quiet: QuietMeeting[];
	list: ItemList;
}

const boardOf = (row: Row): Board => ({
	board: String(row.board),
	minutesOnline: row.minutes_online as Board["minutesOnline"],
	status: row.status as Board["status"],
	note: text(row.note),
});

/** Null: no such town, or no such page of it. */
export async function readTown(
	slug: string,
	page: number | undefined,
): Promise<TownPage | null> {
	const now = today();
	const [release, towns, boards, quiet, count, rows] = await read(
		env.DB.prepare(RELEASE),
		env.DB.prepare(`${TOWNS} WHERE t.slug = ?1`).bind(slug),
		env.DB.prepare(
			"SELECT board, minutes_online, status, note FROM boards WHERE town_slug = ?1 ORDER BY position",
		).bind(slug),
		env.DB.prepare(
			"SELECT id, board, subbody, meeting_date, status, note, minutes_note, minutes_url, agenda_url FROM meetings WHERE town_slug = ?1 AND item_count = 0 ORDER BY meeting_date DESC, board, id",
		).bind(slug),
		...listStatements({ town: slug, page }, now),
	);
	const current = releaseOf(release?.[0]);
	const row = towns?.[0];
	const list = listOf(Number(count?.[0]?.n ?? 0), rows ?? [], page ?? 1, now);
	if (!current || !row || !list) return null;
	return {
		release: current,
		town: townOf(row),
		platform: String(row.platform),
		site: String(row.site),
		boards: (boards ?? []).map(boardOf),
		quiet: (quiet ?? []).map((meeting) => ({
			id: String(meeting.id),
			board: String(meeting.board),
			subbody: text(meeting.subbody),
			date: String(meeting.meeting_date),
			status: String(meeting.status),
			note: text(meeting.note),
			minutesNote: text(meeting.minutes_note),
			url: text(meeting.minutes_url) ?? text(meeting.agenda_url),
		})),
		list,
	};
}

export interface Coverage {
	release: Release | null;
	towns: (Town & { boards: Board[] })[];
}

export async function readCoverage(): Promise<Coverage> {
	const [release, towns, boards] = await read(
		env.DB.prepare(RELEASE),
		env.DB.prepare(`${TOWNS} ORDER BY t.town`),
		env.DB.prepare(
			"SELECT town_slug, board, minutes_online, status, note FROM boards ORDER BY town_slug, position",
		),
	);
	return {
		release: releaseOf(release?.[0]),
		towns: (towns ?? []).map((row) => ({
			...townOf(row),
			boards: (boards ?? [])
				.filter((board) => board.town_slug === row.slug)
				.map(boardOf),
		})),
	};
}

/** The sitemap's towns and items, in a fixed order. */
export async function readAddresses(): Promise<{
	towns: string[];
	items: string[];
}> {
	const [towns, items] = await read(
		env.DB.prepare("SELECT slug FROM towns ORDER BY slug"),
		env.DB.prepare("SELECT id FROM items ORDER BY id"),
	);
	return {
		towns: (towns ?? []).map((row) => String(row.slug)),
		items: (items ?? []).map((row) => String(row.id)),
	};
}

export async function readHealth() {
	const [release, settings] = await read(
		env.DB.prepare(RELEASE),
		env.DB.prepare("SELECT signup_open FROM settings WHERE id = 1"),
	);
	const current = releaseOf(release?.[0]);
	return {
		docket: current && {
			generatedAt: current.generatedAt,
			items: current.items,
		},
		signup: settings?.[0]?.signup_open === 1 ? "open" : "closed",
	};
}
