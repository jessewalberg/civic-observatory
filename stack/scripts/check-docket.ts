// `bun run check:docket`: the loader and every page of the docket (stack/README.md;
// no unit tests, Jesse 2026-10-09). The bundle is DOCKET_BUNDLE's file or the
// made-up fixture; what each page must show is worked out here, from the bundle.
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { ORIGIN } from "../src/lib/site";
import { type BuiltWorker, startBuiltWorker } from "./built-worker";
import {
	CURRENT,
	loadStatements,
	readBundle,
	readCurrent,
} from "./docket-bundle";
import {
	type BundleFile,
	type BundleItem,
	checks,
	type Document,
	load,
	newestFirst,
	read,
	readBundleFile,
	root,
	slug,
	tidy,
} from "./harness";
import { closeDatabases, openDatabase, type Statement } from "./local-d1";

const { expect, must, done } = checks("check:docket");
const TABLES = [
	"releases",
	"towns",
	"boards",
	"meetings",
	"items",
	"withdrawn_items",
];
const BOARDS = [
	"planning_zoning",
	"zba",
	"wetlands",
	"conservation",
	"council_selectmen",
];
const KINDS = ["application", "hearing", "decision", "discussion", "notice"];
const PAGE = 25;

/** Everything the loader writes, as one string. */
async function dump(state: string): Promise<string> {
	const database = await openDatabase(state);
	try {
		const tables = [];
		for (const table of TABLES)
			tables.push(await database.rows(`SELECT * FROM ${table} ORDER BY 1, 2`));
		return JSON.stringify(tables);
	} finally {
		await database.close();
	}
}

// ---------------------------------------------------------------------------
// What the loader refuses.

type Change = (bundle: BundleFile) => void;
const first = (bundle: BundleFile) => bundle.items[0] as BundleItem;
const meetingIdOf = (item: BundleItem) => item.id.replace(/-\d+$/, "");
const meetingOf = (bundle: BundleFile, item: BundleItem) =>
	bundle.meetings.find(
		({ id }) => id === meetingIdOf(item),
	) as BundleFile["meetings"][number];

const REFUSED: [string, RegExp, Change][] = [
	[
		"another schema",
		/schema_version is "docket-v2"/,
		(b) => {
			b.schema_version = "docket-v2";
		},
	],
	[
		"no schema",
		/schema_version is missing/,
		(b) => {
			delete (b as Partial<BundleFile>).schema_version;
		},
	],
	[
		"a raw applicant field",
		/applicant is a raw name field/,
		(b) => {
			first(b).applicant = "A Person";
		},
	],
	[
		"a raw owner field",
		/owner is a raw name field/,
		(b) => {
			first(b).owner = "A Person";
		},
	],
	[
		"a raw name field, deep inside",
		/address_source\.name is a raw name field/,
		(b) => {
			first(b).address_source = {
				url: "https://a.example/x",
				label: "x",
				text: "x",
				ocr: false,
				name: "A Person",
			};
		},
	],
	[
		"a raw name field in capitals",
		/Owner is a raw name field/,
		(b) => {
			(b.meetings[0] as Record<string, unknown>).Owner = "A Person";
		},
	],
	[
		"a field it does not know",
		/applicant_type is not a field of docket-v1/,
		(b) => {
			first(b).applicant_type = "individual";
		},
	],
	[
		"a missing field",
		/items\[0\]\.outcome is missing/,
		(b) => {
			delete (first(b) as Partial<BundleItem>).outcome;
		},
	],
	[
		"a kind that does not exist",
		/items\[0\]\.kind is not acceptable/,
		(b) => {
			first(b).kind = "rumor";
		},
	],
	[
		"a status that does not exist",
		/items\[0\]\.status is not acceptable/,
		(b) => {
			first(b).status = "maybe";
		},
	],
	[
		"a duplicate item",
		/items\[\d+\] is a duplicate/,
		(b) => {
			b.items.push({ ...first(b) });
		},
	],
	[
		"a duplicate meeting",
		/meetings\[\d+\] is a duplicate/,
		(b) => {
			b.meetings.push({ ...(b.meetings[0] as BundleFile["meetings"][number]) });
		},
	],
	[
		"a duplicate town",
		/towns is a duplicate/,
		(b) => {
			b.towns.push(b.towns[0] as string);
		},
	],
	[
		"two towns at one address",
		/a town's address is a duplicate/,
		(b) => {
			b.towns.push(`${b.towns[0]}!`);
		},
	],
	[
		"a duplicate source",
		/sources\[\d+\] is a duplicate/,
		(b) => {
			b.sources.push({ ...(b.sources[0] as BundleFile["sources"][number]) });
		},
	],
	[
		"a duplicate board",
		/boards\[\d+\] is a duplicate/,
		(b) => {
			const boards = b.sources[0]?.boards;
			if (boards?.[0]) boards.push({ ...boards[0] });
		},
	],
	[
		"a meeting, with its items, of a board its town does not list",
		/^- \S+: "A Board Nobody Lists" is not one of .+'s boards$/m,
		(b) => {
			const item = first(b);
			const id = meetingIdOf(item);
			meetingOf(b, item).board = "A Board Nobody Lists";
			for (const one of b.items)
				if (meetingIdOf(one) === id) one.board = "A Board Nobody Lists";
		},
	],
	[
		"a meeting without items of a board its town does not list",
		/is not one of .+'s boards/,
		(b) => {
			const quiet = b.meetings.find(({ item_count }) => item_count === 0);
			if (quiet) quiet.board = `${quiet.board}s`;
		},
	],
	[
		"a board that only another town lists",
		/is not one of .+'s boards/,
		(b) => {
			const item = first(b);
			const source = b.sources.find(({ town }) => town === item.town);
			const other = b.sources.find(({ town }) => town !== item.town);
			if (!source || !other) return;
			source.boards = source.boards.filter(({ board }) => board !== item.board);
			other.boards.push({ ...other.boards[0], board: item.board } as {
				board: string;
				status: string;
			});
		},
	],
	[
		"a board whose capitals differ",
		/is not one of .+'s boards/,
		(b) => {
			const item = first(b);
			for (const source of b.sources)
				if (source.town === item.town)
					for (const board of source.boards)
						board.board = board.board.toUpperCase();
		},
	],
	[
		"an item of an unknown town",
		/unknown town Atlantis/,
		(b) => {
			first(b).town = "Atlantis";
		},
	],
	[
		"an item of an unknown meeting",
		/unknown meeting for/,
		(b) => {
			first(b).id = "no-such-meeting-2026-01-01-01";
		},
	],
	[
		"a meeting of an unknown town",
		/meetings\[0\]: unknown town Atlantis/,
		(b) => {
			(b.meetings[0] as BundleFile["meetings"][number]).town = "Atlantis";
		},
	],
	[
		"a source of an unknown town",
		/sources\[0\]: unknown town Atlantis/,
		(b) => {
			(b.sources[0] as BundleFile["sources"][number]).town = "Atlantis";
		},
	],
	[
		"a town without a source",
		/has no source/,
		(b) => {
			b.sources.pop();
		},
	],
	[
		"an item whose board is not its meeting's",
		/items\[0\]\.board is not its meeting's/,
		(b) => {
			first(b).board = "Another Board";
		},
	],
	[
		"an item whose date is not its meeting's",
		/items\[0\]\.meeting_date is not its meeting's/,
		(b) => {
			first(b).meeting_date =
				b.window.start === first(b).meeting_date
					? b.window.end
					: b.window.start;
		},
	],
	[
		"a meeting that counts other items",
		/says \d+ items and has \d+/,
		(b) => {
			meetingOf(b, first(b)).item_count += 1;
		},
	],
	[
		"no source link",
		/items\[0\] has no link to its source document/,
		(b) => {
			(first(b) as Record<string, unknown>).source_url = null;
		},
	],
	[
		"a source link that is a script",
		/items\[0\] has no link to its source document/,
		(b) => {
			first(b).source_url = "javascript:alert(1)";
		},
	],
	[
		"a source link that is not https",
		/items\[0\] has no link to its source document/,
		(b) => {
			first(b).source_url = "http://a.example/x.pdf";
		},
	],
	[
		"no quote",
		/items\[0\] has no quote/,
		(b) => {
			first(b).outcome_source_text = "";
		},
	],
	[
		"a quote of spaces",
		/items\[0\] has no quote/,
		(b) => {
			first(b).outcome_source_text = "  ";
		},
	],
	[
		"a date before the window",
		/2001-01-01 is outside the window/,
		(b) => {
			const item = first(b);
			meetingOf(b, item).meeting_date = "2001-01-01";
			item.meeting_date = "2001-01-01";
		},
	],
	[
		"a date after the window",
		/2099-01-01 is outside the window/,
		(b) => {
			const item = first(b);
			meetingOf(b, item).meeting_date = "2099-01-01";
			item.meeting_date = "2099-01-01";
		},
	],
	[
		"a date that is not one",
		/meeting_date is not acceptable/,
		(b) => {
			first(b).meeting_date = "2026-02-30";
		},
	],
	[
		"a window out of order",
		/window is not in order/,
		(b) => {
			b.window.end = "2001-01-01";
		},
	],
	[
		"an id that is not one",
		/items\[0\]\.id is not acceptable/,
		(b) => {
			first(b).id = "../../etc";
		},
	],
	[
		"no items",
		/items is not a list, or is empty/,
		(b) => {
			b.items = [];
		},
	],
];

async function refusals(worker: BuiltWorker, bundle: BundleFile) {
	await worker.whileStopped(async () => {
		const before = await dump(worker.state);
		for (const [what, why, change] of REFUSED) {
			const changed = structuredClone(bundle);
			change(changed);
			const result = load(worker.state, changed);
			expect(
				!result.ok &&
					result.said.startsWith("Refused, and nothing was written:") &&
					why.test(result.said),
				`the loader refuses ${what}`,
			);
		}
		for (const [what, text] of [
			["something that is not JSON", "{"],
			["a list", "[]"],
		] as const)
			expect(!load(worker.state, text).ok, `the loader refuses ${what}`);
		expect(
			(await dump(worker.state)) === before,
			`D1 is as it was after ${REFUSED.length + 2} refusals`,
		);
	});
}

// ---------------------------------------------------------------------------
// What the pages show.

/** Every page of a list, by "Older" alone; its items in order. */
async function follow(worker: BuiltWorker, path: string) {
	const entries: string[] = [];
	const pages: Document[] = [];
	for (let next: string | undefined = path; next; ) {
		const page: Document = await read(worker, next);
		must(page.status === 200, `${next} answers ${page.status}`);
		pages.push(page);
		entries.push(...page.entries);
		next = undefined;
		const older: RegExpMatchArray | null = page.html.match(
			/<a href="([^"]+)" rel="next">/,
		);
		if (older?.[1]) next = older[1].replaceAll("&amp;", "&").split("#")[0];
		must(pages.length < 100, `${path} never ends`);
	}
	return { entries, pages };
}

function upcoming(item: BundleItem, today: string) {
	return item.meeting_date >= today && item.status !== "cancelled";
}

async function lists(worker: BuiltWorker, bundle: BundleFile, today: string) {
	const sorted = [...bundle.items].sort(newestFirst);
	let combinations = 0;
	let heaviest = 0;
	for (const town of [undefined, ...bundle.towns])
		for (const board of [undefined, ...BOARDS])
			for (const kind of [undefined, ...KINDS])
				for (const soon of [false, true]) {
					const query = new URLSearchParams();
					if (town) query.set("town", slug(town));
					if (board) query.set("board", board);
					if (kind) query.set("kind", kind);
					if (soon) query.set("upcoming", "1");
					const path = query.size > 0 ? `/?${query}` : "/";
					const expected = sorted.filter(
						(item) =>
							(!town || item.town === town) &&
							(!board || item.board_type === board) &&
							(!kind || item.kind === kind) &&
							(!soon || upcoming(item, today)),
					);
					const { entries, pages } = await follow(worker, path);
					must(
						entries.join(" ") ===
							expected.map(({ id }) => `/item/${id}`).join(" "),
						`${path} shows ${entries.length} items, not exactly the ${expected.length} it should, in order`,
					);
					must(
						pages.length === Math.max(1, Math.ceil(expected.length / PAGE)) &&
							pages.every(({ entries: shown }) => shown.length <= PAGE),
						`${path} has ${pages.length} pages`,
					);
					const past = `${path}${query.size > 0 ? "&" : "?"}page=${pages.length + 1}`;
					must(
						(await read(worker, past)).status === 404,
						`${past}, past the last page, answers 404`,
					);
					for (const page of pages)
						heaviest = Math.max(heaviest, Buffer.byteLength(page.html));
					combinations += 1;
				}
	expect(
		true,
		`${combinations} combinations of filters each show exactly their items once, newest first, ${PAGE} a page, over the whole dataset`,
	);
	const home = await read(worker, "/");
	const weight = Buffer.byteLength(home.html);
	expect(
		weight < 120_000,
		`the default page is ${weight} bytes of HTML, under 120,000 (the heaviest list: ${heaviest})`,
	);
	expect(
		(await read(worker, "/?town=no-such-town")).status === 404 &&
			(await read(worker, "/town/no-such-town")).status === 404 &&
			(await read(worker, "/item/no-such-item-01")).status === 404 &&
			(await read(worker, "/item/%3Cscript%3E")).status === 404,
		"a town or an item that does not exist answers 404",
	);
	for (const query of [
		"?town=&board=&kind=&page=1&utm_source=x",
		"?board=constructor&kind=__proto__&upcoming=true&page=-1",
		"?town=%7B%22a%22%3A1%7D&board=%5B1%5D&kind=null&page=1e9",
		"?town=%3Cscript%3E&town=x&page=two",
	]) {
		const odd = await read(worker, `/${query}`);
		expect(
			odd.status === 200 &&
				odd.canonical.join() === `${ORIGIN}/` &&
				odd.entries.join() === home.entries.join() &&
				!odd.meta.has("robots"),
			`${query}: what no filter means is dropped, and the page is the plain one`,
		);
	}
}

async function items(worker: BuiltWorker, bundle: BundleFile, today: string) {
	for (const item of bundle.items) {
		const page = await read(worker, `/item/${item.id}`);
		const quote = tidy(item.outcome_source_text);
		must(
			page.status === 200 && page.headings === 1,
			`/item/${item.id} answers ${page.status}`,
		);
		// A summary may be the document's own words; those are not the quote.
		const times = (words: string) => tidy(words).split(quote).length - 1;
		must(
			page.quotes.length === 1 &&
				page.quotes[0] === quote &&
				times(page.main) === 1 + times(item.outcome) + times(item.request),
			`/item/${item.id} shows its quote once`,
		);
		must(
			page.references.includes(item.source_url),
			`/item/${item.id} links to its source document`,
		);
		for (const shown of [
			item.request,
			item.outcome,
			item.board,
			item.town,
			item.address,
			item.case_number,
			item.parcel as string | null,
			item.applicant_display as string | null,
			item.owner_display as string | null,
			item.subbody as string | null,
			item.status === "upcoming" && item.meeting_date < today
				? "Date has passed; outcome not collected yet"
				: item.status_label,
		])
			must(
				!shown || page.main.includes(tidy(shown)),
				`/item/${item.id} shows "${shown}"`,
			);
		must(
			page.canonical.join() === `${ORIGIN}/item/${item.id}` &&
				page.title.includes(item.town) &&
				(page.meta.get("description") ?? "").includes(item.board),
			`/item/${item.id} has its own title, description and canonical`,
		);
		must(
			page.references.some((reference) =>
				reference.startsWith("mailto:hello@civicobservatory.com?subject="),
			),
			`/item/${item.id} has a link to report an error`,
		);
	}
	expect(
		true,
		`${bundle.items.length} items each have a page with their own words, their quote once and a link to their document`,
	);
}

async function towns(worker: BuiltWorker, bundle: BundleFile) {
	const sorted = [...bundle.items].sort(newestFirst);
	let missing = 0;
	for (const source of bundle.sources) {
		const path = `/town/${slug(source.town)}`;
		const { entries, pages } = await follow(worker, path);
		const front = pages[0] as Document;
		const blocked = source.boards.every(({ status }) => status === "blocked");
		must(
			entries.join(" ") ===
				sorted
					.filter((item) => item.town === source.town)
					.map(({ id }) => `/item/${id}`)
					.join(" "),
			`${path} shows exactly its items, once, newest first`,
		);
		must(
			front.references.includes(source.site) &&
				source.boards.every(
					({ board, note }) =>
						front.main.includes(tidy(board)) &&
						(!note || front.main.includes(tidy(note))),
				),
			`${path} says what is collected of each board`,
		);
		for (const meeting of bundle.meetings)
			if (meeting.town === source.town && meeting.item_count === 0)
				must(
					front.html.includes(`dateTime="${meeting.meeting_date}"`) ||
						front.html.includes(`datetime="${meeting.meeting_date}"`),
					`${path} lists its meeting of ${meeting.meeting_date}`,
				);
		for (const later of pages.slice(1))
			for (const meeting of bundle.meetings)
				must(
					meeting.town !== source.town ||
						meeting.item_count > 0 ||
						!later.html.includes(`"${meeting.id}"`),
					`a later page of ${path} carries the quiet meeting ${meeting.id}`,
				);
		must(
			blocked === front.main.includes(`${source.town} is not collected.`),
			`${path} says whether the town is collected`,
		);
		if (blocked) {
			missing += 1;
			const note = source.boards.find((board) => board.note)?.note;
			must(
				!note || front.main.split(tidy(note)).length >= 2,
				`${path} says why`,
			);
		}
	}
	expect(
		missing > 0,
		`${bundle.sources.length} towns have a page with exactly their items and what is and is not collected; ${missing} not collected, saying so and why`,
	);
	const method = await read(worker, "/method");
	expect(
		method.status === 200 &&
			bundle.sources.every(
				({ town, boards }) =>
					method.main.includes(town) &&
					boards.every(({ board }) => method.main.includes(tidy(board))),
			),
		"the method page lists every town and board",
	);
	const listed = [
		...(await (await worker.send("/sitemap.xml")).text()).matchAll(
			/<loc>([^<]+)<\/loc>/g,
		),
	].map((match) => match[1]);
	const expected = [
		"/",
		"/method",
		"/privacy",
		"/terms",
		...bundle.towns.map((town) => `/town/${slug(town)}`).sort(),
		...bundle.items.map(({ id }) => `/item/${id}`).sort(),
	].map((path) => `${ORIGIN}${path}`);
	expect(
		listed.join(" ") === expected.join(" "),
		`the sitemap lists exactly the ${expected.length} pages`,
	);
}

/** A town's later page does not read the quiet meetings: by the rows D1 read. */
async function quietReads(worker: BuiltWorker, bundle: BundleFile) {
	const town = bundle.towns
		.map((name) => ({
			path: `/town/${slug(name)}`,
			items: bundle.items.filter((item) => item.town === name).length,
		}))
		.sort((a, b) => b.items - a.items)[0] as { path: string; items: number };
	must(town.items > PAGE, `${town.path} has a second page`);
	const rowsRead = async (path: string) => {
		const page = await read(worker, path);
		const id = page.headers.get("x-request-id");
		for (let tries = 0; tries < 40; tries++) {
			const line = worker.lines.find((one) => one.includes(String(id)));
			if (line)
				return (JSON.parse(line) as { database: { rows_read: number } })
					.database.rows_read;
			await new Promise((resolve) => setTimeout(resolve, 50));
		}
		throw new Error(`no record of ${path}`);
	};
	const second = `${town.path}?page=2`;
	await worker.configure({ bindings: { APP_ENV: "preview" } });
	const before = [await rowsRead(town.path), await rowsRead(second)] as const;
	await worker.sql(
		`WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 200)
		INSERT INTO meetings (id, town_slug, board, board_type, meeting_date, meeting_type, status, minutes_status, item_count)
		SELECT 'quiet-' || i, ?1, 'A Board', 'zba', '2026-04-01', 'regular', 'held', 'posted', 0 FROM n`,
		town.path.replace("/town/", ""),
	);
	const after = [await rowsRead(town.path), await rowsRead(second)] as const;
	await worker.sql("DELETE FROM meetings WHERE id LIKE 'quiet-%'");
	expect(
		after[0] >= before[0] + 200 && after[1] === before[1],
		`with 200 more quiet meetings a town's first page reads ${after[0] - before[0]} more rows and its second ${after[1] - before[1]}`,
	);
}

async function noRawNames(worker: BuiltWorker, bundle: BundleFile) {
	const RAW = /^(applicant|owner|name)$/i;
	for (const table of [
		...TABLES,
		"settings",
		"signups",
		"signup_attempts",
		"counters",
	]) {
		const columns = await worker.sql(
			`SELECT name FROM pragma_table_info('${table}')`,
		);
		must(
			columns.length > 0 &&
				columns.every(({ name }) => !RAW.test(String(name))),
			`${table} has no raw name column`,
		);
	}
	const known = await worker.sql(
		"SELECT count(*) AS n FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '\\_cf%' ESCAPE '\\' AND name <> 'd1_migrations'",
	);
	expect(
		known[0]?.n === 10,
		"D1 has 10 tables, and none has a raw name column",
	);
	for (const path of [
		"/",
		"/method",
		...bundle.towns.map((town) => `/town/${slug(town)}`),
		...bundle.items.map(({ id }) => `/item/${id}`),
	]) {
		const { scripts } = await read(worker, path);
		must(
			!/[{,]"?(?:applicant_?(?:raw|name)|owner|name)"?:/i.test(scripts),
			`${path} carries no raw name field`,
		);
	}
	expect(true, "no page carries a raw name field in its data");
}

// ---------------------------------------------------------------------------
// Releases.

/** Drops an item and keeps its meeting's count true. */
function drop(bundle: BundleFile, id: string) {
	const item = bundle.items.find((one) => one.id === id) as BundleItem;
	meetingOf(bundle, item).item_count -= 1;
	bundle.items = bundle.items.filter((one) => one.id !== id);
}

async function releases(
	worker: BuiltWorker,
	bundle: BundleFile,
	today: string,
) {
	const uses = new Map<string, number>();
	for (const { outcome_source_text: quote } of bundle.items)
		uses.set(quote, (uses.get(quote) ?? 0) + 1);
	const single = bundle.items.filter(
		({ outcome_source_text: quote, outcome, request }) =>
			uses.get(quote) === 1 &&
			!`${outcome} ${request}`.includes(quote) &&
			!bundle.items.some(
				(other) =>
					other.outcome_source_text !== quote &&
					other.outcome_source_text.includes(quote),
			),
	);
	const [gone, alsoGone, changed] = [
		single[0],
		single[Math.floor(single.length / 2)],
		single.at(-1),
	] as [BundleItem, BundleItem, BundleItem];
	const next = structuredClone(bundle);
	next.generated_at = "2030-01-02T03:04:05Z";
	drop(next, gone.id);
	drop(next, alsoGone.id);
	const edited = next.items.find(({ id }) => id === changed.id) as BundleItem;
	edited.outcome_source_text = "A corrected quote of the check's own.";
	edited.status_label = "Corrected label";
	const added = {
		...edited,
		id: `${meetingIdOf(edited)}-98`,
		outcome_source_text: "An added quote of the check's own.",
	};
	next.items.push(added);
	meetingOf(next, added).item_count += 1;

	const before = Date.now();
	const loaded = await worker.whileStopped(() => load(worker.state, next));
	expect(
		loaded.ok && loaded.said.includes("2 withdrawn now"),
		"a release that drops two items, changes one and adds one loads",
	);
	const stored = JSON.stringify(
		await Promise.all(
			TABLES.map((table) => worker.sql(`SELECT * FROM ${table}`)),
		),
	);
	const day = new Intl.DateTimeFormat("en-US", {
		month: "long",
		day: "numeric",
		year: "numeric",
		timeZone: "America/New_York",
	}).format(new Date(before));
	for (const item of [gone, alsoGone]) {
		const page = await read(worker, `/item/${item.id}`);
		expect(
			page.status === 410 &&
				page.main.includes("This item was withdrawn") &&
				page.main.includes(`withdrawn from the docket on ${day}`) &&
				page.main.includes(item.board) &&
				page.main.includes(item.town) &&
				page.headers.get("cache-control") ===
					"public, max-age=0, must-revalidate, no-transform" &&
				page.meta.get("robots") === "noindex",
			`a dropped item's page answers 410 and says it was withdrawn on ${day}`,
		);
		expect(
			!page.html.includes(item.outcome_source_text.slice(0, 30)) &&
				!page.html.includes(item.request) &&
				!stored.includes(JSON.stringify(item.outcome_source_text).slice(1, -1)),
			"its content is in neither the page nor D1",
		);
	}
	const corrected = await read(worker, `/item/${changed.id}`);
	expect(
		corrected.status === 200 &&
			corrected.quotes[0] === edited.outcome_source_text &&
			corrected.main.includes("Corrected label") &&
			!corrected.main.includes(tidy(changed.outcome_source_text)),
		"a changed item shows what it says now, at the same address",
	);
	expect(
		(await read(worker, `/item/${added.id}`)).quotes[0] ===
			added.outcome_source_text,
		"an added item has its page",
	);
	const { entries } = await follow(worker, "/");
	expect(
		entries.join(" ") ===
			[...next.items]
				.sort(newestFirst)
				.map(({ id }) => `/item/${id}`)
				.join(" "),
		"the list shows exactly the new release's items",
	);
	await towns(worker, next);
	await items(worker, next, today);

	const back = await worker.whileStopped(() => load(worker.state, bundle));
	expect(
		back.ok && back.said.includes("1 withdrawn now"),
		"a release that brings both back and drops the added one loads",
	);
	expect(
		(await read(worker, `/item/${gone.id}`)).status === 200 &&
			(await read(worker, `/item/${alsoGone.id}`)).status === 200 &&
			(await read(worker, `/item/${added.id}`)).status === 410,
		"an id that comes back is an item again, and the dropped one is withdrawn",
	);
}

async function shrinking(worker: BuiltWorker, bundle: BundleFile) {
	const small = structuredClone(bundle);
	const least = Math.ceil(0.8 * bundle.items.length);
	while (small.items.length >= least)
		drop(small, (small.items.at(-1) as BundleItem).id);
	await worker.whileStopped(async () => {
		const before = await dump(worker.state);
		const refused = load(worker.state, small);
		expect(
			!refused.ok &&
				/fewer than 80% of the current release's/.test(refused.said) &&
				(await dump(worker.state)) === before,
			`${small.items.length} items after ${bundle.items.length} are refused, and D1 is as it was`,
		);
		expect(
			!load(worker.state, small, "--shrink", "  ").ok &&
				(await dump(worker.state)) === before,
			"an empty --shrink says nothing, and is refused",
		);
		const enough = structuredClone(bundle);
		while (enough.items.length > least)
			drop(enough, (enough.items.at(-1) as BundleItem).id);
		expect(
			load(worker.state, enough).ok && load(worker.state, bundle).ok,
			`${least} of ${bundle.items.length} items, 80%, are enough`,
		);
		const said = load(worker.state, small, "--shrink", "a check of the loader");
		const database = await openDatabase(worker.state);
		const [row] = await database.rows(
			"SELECT shrink_reason, item_count FROM releases ORDER BY seq DESC LIMIT 1",
		);
		await database.close();
		expect(
			said.ok &&
				row?.shrink_reason === "a check of the loader" &&
				row.item_count === small.items.length,
			"--shrink with a reason loads it, and the reason is stored",
		);
		if (!load(worker.state, bundle).ok) throw new Error("cannot load again");
	});
}

// ---------------------------------------------------------------------------
// Loads that do not finish.

async function interrupted(worker: BuiltWorker, bundle: BundleFile) {
	await worker.whileStopped(async () => {
		const next = structuredClone(bundle);
		next.generated_at = "2031-01-01T00:00:00Z";
		for (const item of next.items) item.outcome = `${item.outcome} Again.`;
		const old = await dump(worker.state);
		const oldItems = JSON.stringify(JSON.parse(old)[4]);

		// The whole batch, with one statement wrong at its end or its middle.
		const database = await openDatabase(worker.state);
		const current = readCurrent((await database.batch([CURRENT]))[0]?.rows);
		const good = loadStatements(
			readBundle(next),
			current,
			undefined,
			"2031-01-01T00:00:00.000Z",
		);
		const fails = async (statements: Statement[]) => {
			try {
				await database.batch(statements);
				return false;
			} catch {
				return true;
			}
		};
		const lost = good.filter(
			([sql], at) =>
				!(
					sql.startsWith("INSERT INTO items") &&
					good[at + 1]?.[0].startsWith("DELETE FROM withdrawn")
				),
		);
		expect(
			lost.length === good.length - 1 && (await fails(lost)),
			"a load that lost a part of its items fails",
		);
		for (const at of [1, 4, Math.floor(good.length / 2), good.length - 1])
			must(
				await fails([
					...good.slice(0, at),
					["SELECT no_such_column FROM items", []],
					...good.slice(at),
				]),
				`a load that fails at statement ${at}`,
			);
		await database.close();
		expect(
			(await dump(worker.state)) === old,
			"after loads that failed at five different statements, the old release is whole",
		);

		// The process and its database killed while the batch runs.
		const file = `${root}${worker.state}/next.json`;
		writeFileSync(file, JSON.stringify(next));
		let kept = 0;
		let finished = 0;
		for (const delay of [0, 0, 2, 4, 6, 8, 10, 13, 16, 20, 25, 30, 40, 60]) {
			await new Promise<void>((resolve, reject) => {
				const child = spawn(
					process.execPath,
					["scripts/load-docket.ts", file, "--state", worker.state],
					{ cwd: root, detached: true, stdio: ["ignore", "pipe", "inherit"] },
				);
				let seen = false;
				child.stdout.on("data", (chunk: Buffer) => {
					if (seen || !chunk.toString().includes("Loading")) return;
					seen = true;
					setTimeout(() => {
						try {
							process.kill(-(child.pid as number), "SIGKILL");
						} catch {
							// It had ended.
						}
					}, delay);
				});
				child.on("error", reject);
				child.on("close", () =>
					seen ? resolve() : reject(new Error("the load never started")),
				);
			});
			const after = await dump(worker.state);
			if (after === old) kept += 1;
			else {
				const [, , , , rows] = JSON.parse(after) as { outcome: string }[][];
				must(
					rows?.length === next.items.length &&
						rows.every(({ outcome }) => outcome.endsWith(" Again.")),
					`a load killed after ${delay} ms left neither the old release nor the new one`,
				);
				finished += 1;
				// Back to the old content for the next try; `old` then has a later seq.
				if (!load(worker.state, bundle).ok)
					throw new Error("cannot load again");
				const reset = await dump(worker.state);
				must(
					JSON.stringify(JSON.parse(reset)[4]) === oldItems,
					"the old content is back",
				);
				break;
			}
		}
		expect(
			kept > 0,
			`of ${kept + finished} loads killed while they ran, ${kept} left the old release whole and ${finished} the new one; none left anything else`,
		);

		// Two loads that start from the same release.
		const one = await openDatabase(worker.state);
		const base = readCurrent((await one.batch([CURRENT]))[0]?.rows);
		const [winner, loser] = [
			next,
			{ ...next, generated_at: "2032-01-01T00:00:00Z" },
		].map((version) =>
			loadStatements(
				readBundle(version),
				base,
				undefined,
				"2032-01-01T00:00:00.000Z",
			),
		) as [Statement[], Statement[]];
		await one.batch(winner);
		let refused = false;
		try {
			await one.batch(loser);
		} catch {
			refused = true;
		}
		const [row] = await one.rows(
			"SELECT generated_at FROM releases ORDER BY seq DESC LIMIT 1",
		);
		await one.close();
		expect(
			refused && row?.generated_at === next.generated_at,
			"of two loads that started from the same release, the second fails whole",
		);
		if (!load(worker.state, bundle).ok) throw new Error("cannot load again");
	});
}

// ---------------------------------------------------------------------------

let worker: BuiltWorker | undefined;
try {
	const bundle = readBundleFile();
	const during = bundle.window.end;
	worker = await startBuiltWorker(
		Number(process.env.STACK_DOCKET_PORT ?? 4311),
		{ bindings: { LOCAL_TODAY: during } },
	);
	const empty = await read(worker, "/");
	const health = await (await worker.send("/api/health")).json();
	expect(
		empty.status === 200 &&
			empty.main.includes("No items have been loaded yet.") &&
			JSON.stringify((health as { docket: unknown }).docket) === "null" &&
			(await read(worker, `/town/${slug(bundle.towns[0] as string)}`))
				.status === 404,
		"before a load, the front page says that there is nothing yet",
	);
	await refusals(worker, bundle);
	await worker.whileStopped(async () => {
		const state = (worker as BuiltWorker).state;
		const loaded = load(state, bundle);
		expect(loaded.ok, loaded.said.split("\n").at(-1) ?? "");
		const before = await dump(state);
		const again = load(state, bundle);
		const spaced = load(state, JSON.stringify(bundle, null, 3));
		expect(
			again.ok &&
				spaced.ok &&
				again.said.includes("nothing was written") &&
				spaced.said.includes("nothing was written") &&
				(await dump(state)) === before,
			"the same bundle again, however it is spaced, writes nothing",
		);
	});
	const after = (await (await worker.send("/api/health")).json()) as {
		docket: { items: number; generatedAt: string };
		signup: string;
	};
	expect(
		after.docket.items === bundle.items.length &&
			after.docket.generatedAt === bundle.generated_at &&
			after.signup === "closed",
		"/api/health states the release, and that sign-up is closed",
	);
	await lists(worker, bundle, during);
	await items(worker, bundle, during);
	await towns(worker, bundle);
	await noRawNames(worker, bundle);
	await quietReads(worker, bundle);

	// The day after everything has happened.
	const late = "2099-01-01";
	await worker.configure({ bindings: { LOCAL_TODAY: late } });
	const none = await read(worker, "/?upcoming=1");
	const label = "Date has passed; outcome not collected yet";
	const was = bundle.items.find(({ status }) => status === "upcoming");
	expect(
		none.entries.length === 0 &&
			none.main.includes("No items match.") &&
			was !== undefined &&
			(await read(worker, `/item/${was.id}`)).main.includes(label),
		"once its date has passed, nothing is upcoming, and an item says that its outcome is not collected",
	);
	await worker.configure({ bindings: { LOCAL_TODAY: during } });

	await releases(worker, bundle, during);
	await shrinking(worker, bundle);
	await interrupted(worker, bundle);
	expect(worker.egress.length === 0, "the Worker sent no request anywhere");
	done();
} catch (error) {
	console.error(error instanceof Error ? error.message : error);
	process.exitCode = 1;
} finally {
	await closeDatabases();
	await worker?.stop();
}
