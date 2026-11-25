// The words and shapes of the docket, shared by the pages, the Worker and the
// loader. The data itself is in D1.
import { PAGE_SIZE } from "./limits";

export const KINDS = {
	application: "Application",
	hearing: "Hearing",
	decision: "Decision",
	discussion: "Discussion",
	notice: "Notice",
} as const;
export type Kind = keyof typeof KINDS;

export const BOARD_TYPES = {
	planning_zoning: "Planning and zoning",
	zba: "Zoning board of appeals",
	wetlands: "Wetlands",
	conservation: "Conservation",
	council_selectmen: "Council and selectmen",
} as const;
export type BoardType = keyof typeof BOARD_TYPES;

export const STATUSES = [
	"approved",
	"denied",
	"withdrawn",
	"continued",
	"tabled",
	"received",
	"referred",
	"determination",
	"hearing_scheduled",
	"hearing_closed",
	"discussed",
	"no_action",
	"outcome_not_posted",
	"upcoming",
	"cancelled",
] as const;

export const MINUTES_ONLINE = {
	yes: "Minutes posted online",
	lagging: "Minutes posted, newest not up yet",
	partial: "Draft minutes only, inside later packets",
	no: "Minutes not posted online",
	blocked: "Posted online, not readable automatically",
} as const;
export type MinutesOnline = keyof typeof MINUTES_ONLINE;

export const BOARD_STATUS = {
	collected: "Collected",
	agendas_only: "Agendas only",
	blocked: "Not collected",
	none_in_window: "No meeting in these dates",
} as const;
export type BoardStatus = keyof typeof BOARD_STATUS;

export const ROLES = {
	builder_developer: "Builder or developer",
	contractor: "Contractor",
	real_estate: "Real estate",
	land_use_lawyer: "Land-use lawyer",
	engineer_surveyor: "Engineer or surveyor",
	lender_appraiser: "Lender or appraiser",
	resident: "Resident",
	other: "Other",
} as const;
export type Role = keyof typeof ROLES;

export interface Item {
	id: string;
	town: string;
	townSlug: string;
	board: string;
	subbody: string | null;
	meetingDate: string;
	meetingType: string;
	kind: Kind;
	caseNumber: string | null;
	address: string | null;
	parcel: string | null;
	applicant: string | null;
	ownerShown: string | null;
	request: string;
	statusLabel: string;
	outcome: string;
	quote: string;
	sourceType: "agenda" | "minutes";
	sourceUrl: string;
	sourceOcr: boolean;
	/** Null when it is the source document. */
	agendaUrl: string | null;
	minutesUrl: string | null;
	addressSource: { url: string; label: string; text: string } | null;
}

export interface Release {
	generatedAt: string;
	windowStart: string;
	windowEnd: string;
	upcomingThrough: string;
	items: number;
}

export interface Town {
	slug: string;
	town: string;
	/** False when every one of its boards is blocked. */
	collected: boolean;
}

export interface Board {
	board: string;
	minutesOnline: MinutesOnline;
	status: BoardStatus;
	note: string | null;
}

/** The filters of the list, as its address states them. */
export interface ListSearch {
	town?: string;
	board?: BoardType;
	kind?: Kind;
	upcoming?: 1;
	page?: number;
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const isSlug = (value: unknown, most: number): value is string =>
	typeof value === "string" && value.length <= most && SLUG.test(value);
/** Item ids are town-board-date[-subbody][-special]-NN. */
export const isItemId = (value: unknown) => isSlug(value, 160);

export const slugOf = (town: string) =>
	town
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "");

/** Page 1 is the plain address; anything but a whole number from 2 is dropped. */
export function readPage(value: unknown): number | undefined {
	const page = typeof value === "string" ? Number(value) : value;
	return typeof page === "number" &&
		Number.isInteger(page) &&
		page >= 2 &&
		page <= 10_000
		? page
		: undefined;
}

/** What a list's address asks for; whatever it cannot mean is dropped. */
export function readSearch(raw: Record<string, unknown>): ListSearch {
	const search: ListSearch = {};
	if (isSlug(raw.town, 60)) search.town = raw.town;
	if (typeof raw.board === "string" && Object.hasOwn(BOARD_TYPES, raw.board))
		search.board = raw.board as BoardType;
	if (typeof raw.kind === "string" && Object.hasOwn(KINDS, raw.kind))
		search.kind = raw.kind as Kind;
	if (raw.upcoming === 1 || raw.upcoming === "1") search.upcoming = 1;
	const page = readPage(raw.page);
	if (page) search.page = page;
	return search;
}

/** A list's address, its filters in one order. */
export function listPath(search: ListSearch, page?: number): string {
	const query = new URLSearchParams();
	if (search.town) query.set("town", search.town);
	if (search.board) query.set("board", search.board);
	if (search.kind) query.set("kind", search.kind);
	if (search.upcoming) query.set("upcoming", "1");
	if (page && page > 1) query.set("page", String(page));
	const text = query.toString();
	return text ? `/?${text}` : "/";
}

export const pagesOf = (items: number) =>
	Math.max(1, Math.ceil(items / PAGE_SIZE));

const asDate = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00Z`);

/** "Mon, Nov 16, 2026" */
export const showDate = (iso: string) =>
	asDate(iso).toLocaleDateString("en-US", {
		weekday: "short",
		month: "short",
		day: "numeric",
		year: "numeric",
		timeZone: "UTC",
	});

/** "November 16, 2026" */
export const longDate = (iso: string) =>
	asDate(iso).toLocaleDateString("en-US", {
		month: "long",
		day: "numeric",
		year: "numeric",
		timeZone: "UTC",
	});

/** The calendar date in Connecticut. */
export const dateInConnecticut = (time: Date) =>
	new Intl.DateTimeFormat("en-CA", {
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		timeZone: "America/New_York",
	}).format(time);

/** Cuts at a word, so the whole is at most `most` characters. */
export function cut(text: string, most: number): string {
	const line = text.replace(/\s+/g, " ").trim();
	if (line.length <= most) return line;
	const at = line.lastIndexOf(" ", most - 1);
	return `${line.slice(0, at > most / 2 ? at : most - 1).replace(/[\s,;:.]+$/, "")}…`;
}

/** What an item's page is called: its address, its file number, or its board. */
export const placeOf = (item: Item) =>
	item.address ??
	item.caseNumber ??
	(item.parcel ? `Parcel ${item.parcel}` : `Matter before the ${item.board}`);
