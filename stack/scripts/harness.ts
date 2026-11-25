// What the checks share: counting, reading a page without running it, and the
// docket as the bundle states it, worked out apart from the app's own queries.
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { type Browser, chromium } from "@playwright/test";
import { fixture } from "../fixtures/docket";
import type { BuiltWorker } from "./built-worker";

export const root = fileURLToPath(new URL("..", import.meta.url));
export const commit = () =>
	execFileSync("git", ["rev-parse", "HEAD"], {
		cwd: root,
		encoding: "utf8",
	}).trim();

export function checks(title: string) {
	let passed = 0;
	return {
		expect(condition: boolean, message: string) {
			if (!condition) throw new Error(`${title} failed: ${message}`);
			passed += 1;
			console.log(`ok - ${message}`);
		},
		/** A condition that holds many times over, reported once by the caller. */
		must(condition: boolean, message: string) {
			if (!condition) throw new Error(`${title} failed: ${message}`);
		},
		done: () => console.log(`${title} passed (${passed} checks)`),
	};
}

export interface BundleItem {
	id: string;
	town: string;
	board: string;
	board_type: string;
	meeting_date: string;
	kind: string;
	status: string;
	status_label: string;
	request: string;
	outcome: string;
	outcome_source_text: string;
	source_url: string;
	address: string | null;
	case_number: string | null;
	[key: string]: unknown;
}
export interface BundleMeeting {
	id: string;
	town: string;
	meeting_date: string;
	item_count: number;
	[key: string]: unknown;
}
export interface BundleFile {
	schema_version: string;
	generated_at: string;
	window: { start: string; end: string; upcoming_through: string };
	towns: string[];
	sources: {
		town: string;
		site: string;
		boards: { board: string; status: string; note?: string }[];
		[key: string]: unknown;
	}[];
	meetings: BundleMeeting[];
	items: BundleItem[];
	[key: string]: unknown;
}

/** DOCKET_BUNDLE's file, or the fixture. Always a copy of its own. */
export function readBundleFile(): BundleFile {
	const path = process.env.DOCKET_BUNDLE;
	return structuredClone(
		path ? JSON.parse(readFileSync(path, "utf8")) : fixture,
	) as BundleFile;
}

/** A bundle with at least `least` items: more meetings like its first busy one. */
export function enlarged(bundle: BundleFile, least: number): BundleFile {
	const large = structuredClone(bundle);
	const pattern = large.meetings.find(
		({ item_count }) => item_count > 0,
	) as BundleMeeting;
	const item = large.items.find(
		({ id }) => id.replace(/-\d+$/, "") === pattern.id,
	) as BundleItem;
	for (let n = 1; large.items.length < least; n++) {
		const id = `${pattern.id}-more-${n}x`;
		large.meetings.push({ ...pattern, id, item_count: 30 });
		for (let i = 1; i <= 30; i++)
			large.items.push({
				...structuredClone(item),
				id: `${id}-${String(i).padStart(2, "0")}`,
				request: `${item.request} (more ${n}.${i})`,
			});
	}
	return large;
}

/** Runs scripts/load-docket.ts as an operator would. */
export function load(state: string, bundle: unknown, ...args: string[]) {
	mkdirSync(`${root}${state}`, { recursive: true });
	const file = `${root}${state}/bundle.json`;
	writeFileSync(
		file,
		typeof bundle === "string" ? bundle : JSON.stringify(bundle),
	);
	const result = spawnSync(
		process.execPath,
		["scripts/load-docket.ts", file, "--state", state, ...args],
		{ cwd: root, encoding: "utf8" },
	);
	return {
		ok: result.status === 0,
		said: `${result.stdout}${result.stderr}`.trim(),
	};
}

export const loadInto = (worker: BuiltWorker, bundle: unknown) =>
	worker.whileStopped(() => {
		const result = load(worker.state, bundle);
		if (!result.ok) throw new Error(result.said);
		return result;
	});

export const slug = (town: string) =>
	town
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "");

const decode = (text: string) =>
	text
		.replace(/&#x([0-9a-f]+);/gi, (_, hex: string) =>
			String.fromCodePoint(Number.parseInt(hex, 16)),
		)
		.replace(/&#(\d+);/g, (_, code: string) =>
			String.fromCodePoint(Number(code)),
		)
		.replace(/&quot;/g, '"')
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&nbsp;/g, " ")
		.replace(/&amp;/g, "&");
export const tidy = (text: string) => text.replace(/\s+/g, " ").trim();

export interface Document {
	status: number;
	headers: Headers;
	html: string;
	title: string;
	/** meta name or property -> content. */
	meta: Map<string, string>;
	canonical: string[];
	/** href, src and action attributes, as written: what a reader can follow. */
	references: string[];
	ids: Set<string>;
	/** The text of <main>, scripts left out. */
	main: string;
	quotes: string[];
	/** Each item a list shows, by its link. */
	entries: string[];
	/** The text of the scripts. */
	scripts: string;
	headings: number;
}

export async function read(
	worker: Pick<BuiltWorker, "send">,
	path: string,
	init?: RequestInit,
): Promise<Document> {
	const response = await worker.send(path, init);
	const html = await response.text();
	const document: Document = {
		status: response.status,
		headers: response.headers,
		html,
		title: "",
		meta: new Map(),
		canonical: [],
		references: [],
		ids: new Set(),
		main: "",
		quotes: [],
		entries: [],
		scripts: "",
		headings: 0,
	};
	let hidden = 0;
	let inMain = 0;
	await new HTMLRewriter()
		.on("title", {
			text(chunk) {
				document.title += chunk.text;
			},
		})
		.on("meta", {
			element(element) {
				const key =
					element.getAttribute("name") ?? element.getAttribute("property");
				if (key)
					document.meta.set(key, decode(element.getAttribute("content") ?? ""));
			},
		})
		.on('link[rel="canonical"]', {
			element(element) {
				document.canonical.push(decode(element.getAttribute("href") ?? ""));
			},
		})
		.on("[href], [src], [action]", {
			element(element) {
				for (const name of ["href", "src", "action"]) {
					const value = element.getAttribute(name);
					if (value) document.references.push(decode(value));
				}
			},
		})
		.on("[id]", {
			element(element) {
				document.ids.add(element.getAttribute("id") ?? "");
			},
		})
		.on("h1", {
			element() {
				document.headings += 1;
			},
		})
		.on(".entry h3 a", {
			element(element) {
				document.entries.push(decode(element.getAttribute("href") ?? ""));
			},
		})
		.on("blockquote", {
			element() {
				document.quotes.push("");
			},
			text(chunk) {
				const last = document.quotes.length - 1;
				document.quotes[last] += chunk.text;
			},
		})
		.on("script", {
			text(chunk) {
				document.scripts += chunk.text;
			},
		})
		.on("script, style, noscript", {
			element(element) {
				hidden += 1;
				element.onEndTag(() => {
					hidden -= 1;
				});
			},
		})
		.on("main", {
			element(element) {
				inMain += 1;
				element.onEndTag(() => {
					inMain -= 1;
				});
			},
		})
		.on(
			"p, h1, h2, h3, li, dt, dd, td, th, caption, option, div, time, legend",
			{
				element(element) {
					element.onEndTag(() => {
						if (inMain > 0) document.main += " ";
					});
				},
			},
		)
		.on("main *", {
			text(chunk) {
				if (hidden === 0 && inMain > 0) document.main += chunk.text;
			},
		})
		.transform(new Response(html))
		.text();
	document.title = tidy(decode(document.title));
	document.main = tidy(decode(document.main));
	document.quotes = document.quotes.map((quote) => tidy(decode(quote)));
	return document;
}

export const launch = (): Promise<Browser> =>
	chromium.launch(
		process.env.CHROMIUM_PATH
			? { executablePath: process.env.CHROMIUM_PATH }
			: {},
	);

/** Newest first; ties by town's address, board and id. */
export const newestFirst = (a: BundleItem, b: BundleItem) =>
	compare(b.meeting_date, a.meeting_date) ||
	compare(slug(a.town), slug(b.town)) ||
	compare(a.board, b.board) ||
	compare(a.id, b.id);
// As SQLite compares: by code unit, never by locale.
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
