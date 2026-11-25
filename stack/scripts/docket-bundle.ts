// A `docket-v1` bundle: what is refused, and the statements that store it
// (stack/README.md, "Data"). No input or output: scripts/load-docket.ts has that.
import { createHash } from "node:crypto";
import {
	BOARD_STATUS,
	BOARD_TYPES,
	isItemId,
	isSlug,
	KINDS,
	MINUTES_ONLINE,
	STATUSES,
	slugOf,
} from "../src/lib/docket";
import type { Rows, Statement, Value } from "./local-d1";

/** Why a bundle was refused, one reason a line. Nothing of it was written. */
export class Refused extends Error {
	constructor(reasons: string[]) {
		const shown = reasons.slice(0, 20);
		const more = reasons.length - shown.length;
		super(
			`Refused, and nothing was written:\n${shown.map((reason) => `- ${reason}`).join("\n")}${more > 0 ? `\n- and ${more} more` : ""}`,
		);
	}
}

type Check = (value: unknown) => boolean;
const string = (most: number): Check => {
	return (value) =>
		typeof value === "string" &&
		value.trim() !== "" &&
		value.length <= most &&
		!/\p{Cc}/u.test(value.replace(/[\t\n]/g, ""));
};
const orNull =
	(check: Check): Check =>
	(value) =>
		value === null || check(value);
const oneOf =
	(values: readonly string[]): Check =>
	(value) =>
		typeof value === "string" && values.includes(value);
const boolean: Check = (value) => typeof value === "boolean";
const count: Check = (value) =>
	typeof value === "number" && Number.isInteger(value) && value >= 0;
const date: Check = (value) => {
	if (typeof value !== "string" || !/^\d{4}-\d\d-\d\d$/.test(value))
		return false;
	const time = new Date(`${value}T00:00:00Z`);
	return !Number.isNaN(time.getTime()) && time.toISOString().startsWith(value);
};
const instant: Check = (value) =>
	typeof value === "string" &&
	/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(value) &&
	!Number.isNaN(Date.parse(value));
const url: Check = (value) => {
	if (typeof value !== "string" || value.length > 2000) return false;
	if (!/^https:\/\/[^\s"<>\\]+$/.test(value)) return false;
	try {
		const parsed = new URL(value);
		return parsed.protocol === "https:" && !parsed.username && !parsed.password;
	} catch {
		return false;
	}
};

interface Field {
	check: Check;
	optional?: true;
}
const field = (check: Check): Field => ({ check });
const maybe = (check: Check): Field => ({ check, optional: true });
type Shape = Record<string, Field>;

const any = field(() => true);
const BUNDLE: Shape = {
	schema_version: any,
	title: field(string(200)),
	generated_at: field(instant),
	window: any,
	towns: any,
	sources: any,
	meetings: any,
	items: any,
};
const WINDOW: Shape = {
	start: field(date),
	end: field(date),
	upcoming_through: field(date),
};
const SOURCE: Shape = {
	town: field(string(60)),
	platform: field(string(200)),
	site: field(url),
	boards: any,
};
const BOARD: Shape = {
	board: field(string(120)),
	agendas: maybe(string(500)),
	minutes: maybe(string(500)),
	minutes_online: field(oneOf(Object.keys(MINUTES_ONLINE))),
	status: field(oneOf(Object.keys(BOARD_STATUS))),
	note: maybe(orNull(string(1000))),
};
const MEETING: Shape = {
	id: field(isItemId),
	town: field(string(60)),
	board: field(string(120)),
	board_type: field(oneOf(Object.keys(BOARD_TYPES))),
	subbody: field(orNull(string(120))),
	meeting_date: field(date),
	meeting_type: field(oneOf(["regular", "special"])),
	status: field(oneOf(["held", "cancelled", "upcoming"])),
	agenda_url: field(orNull(url)),
	minutes_url: field(orNull(url)),
	minutes_status: field(oneOf(["posted", "not_posted_yet", "not_applicable"])),
	minutes_note: field(orNull(string(1000))),
	note: field(orNull(string(1000))),
	item_count: field(count),
};
const ITEM: Shape = {
	id: field(isItemId),
	town: field(string(60)),
	board: field(string(120)),
	board_type: field(oneOf(Object.keys(BOARD_TYPES))),
	subbody: field(orNull(string(120))),
	meeting_date: field(date),
	meeting_type: field(oneOf(["regular", "special"])),
	kind: field(oneOf(Object.keys(KINDS))),
	case_number: field(orNull(string(200))),
	address: field(orNull(string(500))),
	parcel: field(orNull(string(300))),
	applicant_display: field(orNull(string(300))),
	owner_display: field(orNull(string(300))),
	request: field(string(2000)),
	status: field(oneOf(STATUSES)),
	status_label: field(string(200)),
	outcome: field(string(2000)),
	outcome_source_text: field(string(4000)),
	source_type: field(oneOf(["agenda", "minutes"])),
	source_url: field(url),
	agenda_url: field(orNull(url)),
	minutes_url: field(orNull(url)),
	source_ocr: field(boolean),
	collected_at: field(instant),
	address_source: maybe(() => true),
};
const ADDRESS_SOURCE: Shape = {
	url: field(url),
	label: field(string(500)),
	text: field(string(2000)),
	ocr: field(boolean),
};

/** Fields that hold a person's name in the private file. */
const RAW_NAMES = ["applicant", "owner", "name"];

type Record_ = Record<string, unknown>;
const isRecord = (value: unknown): value is Record_ =>
	typeof value === "object" && value !== null && !Array.isArray(value);

export interface Bundle {
	schema_version: "docket-v1";
	generated_at: string;
	window: { start: string; end: string; upcoming_through: string };
	towns: string[];
	sources: (Record_ & { town: string; boards: Record_[] })[];
	meetings: (Record_ & { id: string; town: string; meeting_date: string })[];
	items: (Record_ & { id: string; town: string })[];
	digest: string;
	/** An item's meeting. */
	meetingOf: Map<string, string>;
}

/** The bundle, or every reason it is refused. */
export function readBundle(raw: unknown): Bundle {
	if (!isRecord(raw)) throw new Refused(["the file is not a JSON object"]);
	if (raw.schema_version !== "docket-v1")
		throw new Refused([
			`schema_version is ${JSON.stringify(raw.schema_version) ?? "missing"}, not "docket-v1"`,
		]);
	const reasons: string[] = [];

	const namesIn = (value: unknown, where: string) => {
		if (Array.isArray(value))
			value.forEach((part, at) => {
				namesIn(part, `${where}[${at}]`);
			});
		else if (isRecord(value))
			for (const [key, part] of Object.entries(value)) {
				if (RAW_NAMES.includes(key.toLowerCase()))
					reasons.push(`${where}.${key} is a raw name field`);
				namesIn(part, `${where}.${key}`);
			}
	};
	namesIn(raw, "bundle");

	const shaped = (value: unknown, shape: Shape, where: string) => {
		if (!isRecord(value)) {
			reasons.push(`${where} is not an object`);
			return false;
		}
		const before = reasons.length;
		for (const key of Object.keys(value))
			if (!Object.hasOwn(shape, key) && !RAW_NAMES.includes(key.toLowerCase()))
				reasons.push(`${where}.${key} is not a field of docket-v1`);
		for (const [key, { check, optional }] of Object.entries(shape))
			if (!Object.hasOwn(value, key)) {
				if (!optional) reasons.push(`${where}.${key} is missing`);
			} else if (!check(value[key]))
				reasons.push(
					key === "source_url"
						? `${where} has no link to its source document`
						: key === "outcome_source_text"
							? `${where} has no quote`
							: `${where}.${key} is not acceptable`,
				);
		return reasons.length === before;
	};
	const list = (value: unknown, where: string): unknown[] => {
		if (Array.isArray(value) && value.length > 0) return value;
		reasons.push(`${where} is not a list, or is empty`);
		return [];
	};
	/** Adds to a set, and says when it was there. */
	const once = (seen: Set<string>, key: string, where: string) => {
		if (seen.has(key)) reasons.push(`${where} is a duplicate: ${key}`);
		seen.add(key);
	};

	shaped(raw, BUNDLE, "bundle");
	const window = raw.window as Bundle["window"];
	const windowIsGood =
		shaped(window, WINDOW, "window") &&
		window.start <= window.end &&
		window.end <= window.upcoming_through;
	if (!windowIsGood && isRecord(window)) reasons.push("window is not in order");

	const towns = new Set<string>();
	const slugs = new Set<string>();
	for (const town of list(raw.towns, "towns")) {
		if (!string(60)(town) || !isSlug(slugOf(town as string), 60)) {
			reasons.push("towns holds something that is not a town");
			continue;
		}
		once(towns, town as string, "towns");
		once(slugs, slugOf(town as string), "a town's address");
	}

	const sourced = new Set<string>();
	/** A town's boards, as its source lists them. */
	const boardsOf = new Map<string, Set<string>>();
	list(raw.sources, "sources").forEach((source, at) => {
		const where = `sources[${at}]`;
		if (!shaped(source, SOURCE, where)) return;
		const { town, boards } = source as Bundle["sources"][number];
		if (!towns.has(town)) reasons.push(`${where}: unknown town ${town}`);
		once(sourced, town, where);
		const seen = new Set<string>();
		list(boards, `${where}.boards`).forEach((board, index) => {
			const here = `${where}.boards[${index}]`;
			if (shaped(board, BOARD, here))
				once(seen, String((board as Record_).board), here);
		});
		boardsOf.set(town, seen);
	});
	for (const town of towns)
		if (!sourced.has(town)) reasons.push(`${town} has no source`);

	const inWindow = (day: unknown) =>
		windowIsGood &&
		String(day) >= window.start &&
		String(day) <= window.upcoming_through;

	const meetings = new Map<string, Record_>();
	const meetingIds = new Set<string>();
	list(raw.meetings, "meetings").forEach((meeting, at) => {
		const where = `meetings[${at}]`;
		if (!shaped(meeting, MEETING, where)) return;
		const found = meeting as Bundle["meetings"][number];
		once(meetingIds, found.id, where);
		meetings.set(found.id, found);
		if (!towns.has(found.town))
			reasons.push(`${where}: unknown town ${found.town}`);
		// An item's board is its meeting's, below.
		else if (!boardsOf.get(found.town)?.has(String(found.board)))
			reasons.push(
				`${found.id}: ${JSON.stringify(found.board)} is not one of ${found.town}'s boards`,
			);
		if (!inWindow(found.meeting_date))
			reasons.push(`${where}: ${found.meeting_date} is outside the window`);
	});

	const meetingOf = new Map<string, string>();
	const itemIds = new Set<string>();
	const counts = new Map<string, number>();
	list(raw.items, "items").forEach((item, at) => {
		const where = `items[${at}]`;
		if (!shaped(item, ITEM, where)) return;
		const found = item as Bundle["items"][number];
		once(itemIds, found.id, where);
		if (found.address_source !== undefined && found.address_source !== null)
			shaped(found.address_source, ADDRESS_SOURCE, `${where}.address_source`);
		if (!towns.has(found.town))
			reasons.push(`${where}: unknown town ${found.town}`);
		if (!inWindow(found.meeting_date))
			reasons.push(`${where}: ${found.meeting_date} is outside the window`);
		// An item's id is its meeting's, and a number.
		const meetingId = found.id.replace(/-\d+$/, "");
		const meeting = meetings.get(meetingId);
		if (!meeting || meetingId === found.id) {
			reasons.push(`${where}: unknown meeting for ${found.id}`);
			return;
		}
		for (const key of [
			"town",
			"board",
			"board_type",
			"subbody",
			"meeting_date",
			"meeting_type",
		])
			if (meeting[key] !== found[key])
				reasons.push(`${where}.${key} is not its meeting's`);
		meetingOf.set(found.id, meetingId);
		counts.set(meetingId, (counts.get(meetingId) ?? 0) + 1);
	});
	for (const [id, meeting] of meetings)
		if (meeting.item_count !== (counts.get(id) ?? 0))
			reasons.push(
				`${id} says ${meeting.item_count} items and has ${counts.get(id) ?? 0}`,
			);

	if (reasons.length > 0) throw new Refused(reasons);
	return {
		...(raw as unknown as Bundle),
		digest: createHash("sha256").update(JSON.stringify(raw)).digest("hex"),
		meetingOf,
	};
}

export interface Current {
	seq: number;
	digest: string;
	items: number;
}

export const CURRENT: Statement = [
	"SELECT seq, digest, item_count FROM releases ORDER BY seq DESC LIMIT 1",
	[],
];
export const readCurrent = (rows: Rows | undefined): Current | null => {
	const row = rows?.[0];
	return row
		? {
				seq: Number(row.seq),
				digest: String(row.digest),
				items: Number(row.item_count),
			}
		: null;
};

/** Refuses a release that lost too much, unless somebody says why. */
export function checkShrink(
	bundle: Bundle,
	current: Current | null,
	shrink: string | undefined,
) {
	if (!current || bundle.items.length >= 0.8 * current.items || shrink) return;
	throw new Refused([
		`${bundle.items.length} items are fewer than 80% of the current release's ${current.items}; --shrink "<why>" says why`,
	]);
}

/**
 * Rows as JSON, in pieces that fit a D1 statement however it is sent
 * (100,000 bytes).
 */
function pieces(rows: Record<string, Value>[]): string[] {
	const found: string[] = [];
	let piece: string[] = [];
	let size = 2;
	for (const row of rows) {
		const text = JSON.stringify(row);
		const bytes = Buffer.byteLength(text) + 1;
		if (size + bytes > 80_000 && piece.length > 0) {
			found.push(`[${piece.join(",")}]`);
			piece = [];
			size = 2;
		}
		piece.push(text);
		size += bytes;
	}
	if (piece.length > 0) found.push(`[${piece.join(",")}]`);
	return found;
}

/** Inserts rows that all have the same columns. */
function inserts(table: string, rows: Record<string, Value>[]): Statement[] {
	const columns = Object.keys(rows[0] ?? {});
	const sql = `INSERT INTO ${table} (${columns.join(", ")}) SELECT ${columns
		.map((column) => `json_extract(value, '$.${column}')`)
		.join(", ")} FROM json_each(?1)`;
	return pieces(rows).map((piece) => [sql, [piece]]);
}

const value = (from: unknown): Value =>
	typeof from === "boolean"
		? Number(from)
		: typeof from === "string" || typeof from === "number"
			? from
			: null;

/** The whole load: one batch, in this order. */
export function loadStatements(
	bundle: Bundle,
	current: Current | null,
	shrink: string | undefined,
	now: string,
): Statement[] {
	const slug = (town: unknown) => slugOf(String(town));
	const pick = (from: Record_, columns: string[]) =>
		Object.fromEntries(columns.map((column) => [column, value(from[column])]));
	const seq = (current?.seq ?? 0) + 1;

	const towns = bundle.sources.map((source) => ({
		slug: slug(source.town),
		...pick(source, ["town", "platform", "site"]),
	}));
	const boards = bundle.sources.flatMap((source) =>
		source.boards.map((board, position) => ({
			town_slug: slug(source.town),
			position,
			...pick(board, ["board", "minutes_online", "status", "note"]),
		})),
	);
	const meetings = bundle.meetings.map((meeting) => ({
		town_slug: slug(meeting.town),
		...pick(meeting, [
			"id",
			"board",
			"board_type",
			"subbody",
			"meeting_date",
			"meeting_type",
			"status",
			"agenda_url",
			"minutes_url",
			"minutes_status",
			"minutes_note",
			"note",
			"item_count",
		]),
	}));
	const items = bundle.items.map((item) => {
		const address = (item.address_source ?? {}) as Record_;
		return {
			meeting_id: bundle.meetingOf.get(item.id) ?? null,
			town_slug: slug(item.town),
			quote: value(item.outcome_source_text),
			address_source_url: value(address.url),
			address_source_label: value(address.label),
			address_source_text: value(address.text),
			address_source_ocr: value(address.ocr),
			...pick(item, [
				"id",
				"board",
				"board_type",
				"subbody",
				"meeting_date",
				"meeting_type",
				"kind",
				"case_number",
				"address",
				"parcel",
				"applicant_display",
				"owner_display",
				"request",
				"status",
				"status_label",
				"outcome",
				"source_type",
				"source_url",
				"source_ocr",
				"agenda_url",
				"minutes_url",
				"collected_at",
			]),
		};
	});
	return [
		// The number after the one this load read. Another load that finished
		// since has taken it, and this whole batch fails.
		[
			`INSERT INTO releases (seq, digest, schema_version, generated_at, window_start, window_end, upcoming_through, item_count, shrink_reason, loaded_at)
			VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`,
			[
				seq,
				bundle.digest,
				bundle.schema_version,
				bundle.generated_at,
				bundle.window.start,
				bundle.window.end,
				bundle.window.upcoming_through,
				bundle.items.length,
				shrink ?? null,
				now,
			],
		],
		// What leaves keeps its address; what is listed is not withdrawn.
		[
			`INSERT INTO withdrawn_items (id, town, board, meeting_date, withdrawn_at)
			SELECT i.id, t.town, i.board, i.meeting_date, ?1 FROM items i JOIN towns t ON t.slug = i.town_slug`,
			[now],
		],
		["DELETE FROM items", []],
		["DELETE FROM meetings", []],
		["DELETE FROM boards", []],
		["DELETE FROM towns", []],
		...inserts("towns", towns),
		...inserts("boards", boards),
		...inserts("meetings", meetings),
		...inserts("items", items),
		["DELETE FROM withdrawn_items WHERE id IN (SELECT id FROM items)", []],
		// Fails, and the batch with it, unless every item is there.
		[
			"UPDATE releases SET loaded_count = (SELECT count(*) FROM items) WHERE seq = ?1",
			[seq],
		],
	];
}
