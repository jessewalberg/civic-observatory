// The release check production.yml runs (docs/runbooks/release.md). Public requests
// only, no credential; APP_RELEASE is the full commit SHA the job deployed.
//   bun scripts/check-production.ts workers.dev cutover
//     the first cutover, before the move: production's Worker on its own address
//     (WORKERS_SUBDOMAIN), with the release of the data the wait saw (EXPECT_DOCKET)
//   bun scripts/check-production.ts https://civicobservatory.com cutover
//     and after it
//   bun scripts/check-production.ts https://civicobservatory.com release
//     every later release: any release of the data, sign-up open or closed
//   bun scripts/check-production.ts https://civicobservatory.com reachable
//     before the cutover: this machine is not challenged by the zone, and the block
//     on the old function path answers it
//   bun scripts/check-production.ts https://<the preview's address> preview
//     from the operator's machine: every request carries the verifier's token
//     (CF_ACCESS_CLIENT_ID and CF_ACCESS_CLIENT_SECRET). It must refuse anyone
//     without it and forbid indexing
// Every page is asked for as a browser asks (`Accept: text/html`): Cloudflare adds its
// page-speed script to those answers and to no other. It waits up to six minutes for
// the commit, then gives everything else one minute to settle. An address on this
// machine (check:release) gets seconds. It asks for about 60 pages and reads the
// head of every page the sitemap lists, four at a time; a head is not counted as a
// page request (src/start.ts). What it prints is a closed vocabulary (public-log.ts):
// no value of an answer, but statuses and counts.
import { readFileSync } from "node:fs";
import { BOARD_TYPES, KINDS } from "../src/lib/docket";
import { CALLS, limitPolicy, PAGE_SIZE } from "../src/lib/limits";
import { FUNCTIONS, OLD_FUNCTIONS, ORIGIN } from "../src/lib/site";
import { SITE, workersDev } from "./cloudflare-api";
import { expectedDocket, MIN_ITEMS, readDocket } from "./docket-health";
import {
	classOf,
	commit,
	complain,
	fail,
	keep,
	type Line,
	list,
	publicOutput,
	say,
	Told,
	told,
	word,
} from "./public-log";
import { FIXED, GONE, HOSTNAME, MISSING } from "./release-words";

const file = (path: string) =>
	readFileSync(new URL(`../public/${path}`, import.meta.url), "utf8");

const where = process.argv[2] ?? "";
const mode = process.argv[3] ?? "";
const preview = mode === "preview";
const expected = process.env.APP_RELEASE ?? "";
/** The production Worker on its own address, before the move. */
const own = where === "workers.dev";
/** The domain, with the zone in front of it. */
const onDomain = where === ORIGIN;
const addressIsGood =
	own ||
	onDomain ||
	(preview &&
		/^(https:\/\/[a-z0-9.-]+|http:\/\/127\.0\.0\.1:\d+)$/.test(where));
/** What it is called in what is printed: never the account's own address. */
const label = own
	? told`the new Worker's own address`
	: onDomain
		? word(ORIGIN)
		: told`the preview`;
const COMMIT = () => commit(expected);
const BLOCK = word(OLD_FUNCTIONS);
let base = where;
let local = false;

/** What Access asks of a service; sent to the checked address only. */
const ACCESS: Record<string, string> = preview
	? {
			"CF-Access-Client-Id": process.env.CF_ACCESS_CLIENT_ID ?? "",
			"CF-Access-Client-Secret": process.env.CF_ACCESS_CLIENT_SECRET ?? "",
		}
	: {};

/** How many of the sitemap's pages are read whole, evenly spaced in its order. */
const ITEM_PAGES = 10;
const TOWN_PAGES = 3;
const AT_ONCE = 4;

const SECURITY_HEADERS: [string, RegExp][] = [
	["strict-transport-security", /^max-age=31536000; includeSubDomains$/],
	["x-content-type-options", /^nosniff$/],
	["x-frame-options", /^DENY$/],
	["referrer-policy", /^strict-origin-when-cross-origin$/],
	["permissions-policy", /^camera=\(\), microphone=\(\), geolocation=\(\)$/],
	[
		"content-security-policy",
		/^default-src 'none'; .*frame-ancestors 'none'; base-uri 'none'$/,
	],
];
/**
 * The old app's vendors: as words, where the docket's own text cannot be, and as
 * their code has them anywhere. A town has a clerk.
 */
const VENDORS = /\b(?:clerk|convex|workos|authkit)\b/i;
const VENDOR_CODE =
	/convex\.(?:cloud|site|dev)|workos|authkit|\/\/clerk\.|clerk\.accounts|@clerk\/|__clerk|clerk-js/i;

interface Answer {
	/** What it is called in what is printed. */
	name: Line;
	path: string;
	status: number;
	headers: Headers;
	body: string;
}

async function ask(
	from: string,
	path: string,
	name: Line,
	init: RequestInit = {},
): Promise<Answer> {
	const response = await fetch(new URL(path, from), {
		...init,
		redirect: "manual",
		keepalive: false,
		headers: {
			"User-Agent": `civic-observatory-release-check/1 (+${ORIGIN})`,
			"Cache-Control": "no-cache",
			Accept: "text/html",
			...(init.headers as Record<string, string>),
		},
		signal: AbortSignal.timeout(20_000),
	});
	return {
		name,
		path,
		status: response.status,
		headers: response.headers,
		body: await response.text(),
	};
}
const get = (path: string, name: Line, init: RequestInit = {}) =>
	ask(base, path, name, {
		...init,
		headers: { ...ACCESS, ...(init.headers as Record<string, string>) },
	});

/** A header, when it is not what it must be. */
const state = (value: string | null) =>
	value === null ? told`missing` : told`another value`;

/** Runs `each` for every one of `all`, a few at a time. */
async function politely<T>(all: T[], each: (one: T) => Promise<void>) {
	const queue = all.values();
	await Promise.all(
		Array.from({ length: AT_ONCE }, async () => {
			for (const one of queue) await each(one);
		}),
	);
}

/**
 * The one link the zone may add to a page, for crawlers (AI Labyrinth), as it was seen
 * on 2026-11-25: on the zone's own host, an ID of that shape, five attributes and no
 * other, hidden by its style, with nothing in it. Nothing else may be added, and not
 * twice.
 */
const LABYRINTH =
	/<a href="https:\/\/civicobservatory\.com\/cdn-cgi\/content\?id=[\w-]{43}-\d{10}\.\d{1,7}-\d(?:\.\d){3}-[\w.-]{16,200}" aria-hidden="true" rel="nofollow noopener" style="display: none !important; visibility: hidden !important"><\/a>/;
let labyrinth = 0;

/** What a page says about itself: its commit, its scripts and its assets. */
async function page(html: string) {
	const seen = {
		commit: [] as string[],
		robots: [] as string[],
		canonical: [] as string[],
		title: "",
		entries: 0,
		/** The towns its entries link to. */
		towns: [] as string[],
		/** Its notes' text: what a list says of itself. */
		notes: [] as string[],
		quotes: 0,
		inlineNonces: [] as (string | null)[],
		assets: new Set<string>(),
		foreign: new Set<string>(),
		/** The page without its main part and its scripts' text. */
		frame: "",
	};
	let inside = 0;
	await new HTMLRewriter()
		.on('meta[name="commit"]', {
			element(element) {
				seen.commit.push(element.getAttribute("content") ?? "");
			},
		})
		.on('meta[name="robots"]', {
			element(element) {
				seen.robots.push(element.getAttribute("content") ?? "");
			},
		})
		.on('link[rel="canonical"]', {
			element(element) {
				// As it is written; a filter's address has an ampersand.
				const href = element.getAttribute("href") ?? "";
				seen.canonical.push(href.replaceAll("&amp;", "&"));
			},
		})
		.on("h1", {
			text(chunk) {
				seen.title += chunk.text;
			},
		})
		.on(".entry h3 a", {
			element() {
				seen.entries += 1;
			},
		})
		.on(".entry .when a", {
			element(element) {
				seen.towns.push(element.getAttribute("href") ?? "");
			},
		})
		.on("main p.note", {
			element() {
				seen.notes.push("");
			},
			text(chunk) {
				seen.notes[seen.notes.length - 1] += chunk.text;
			},
		})
		.on("blockquote", {
			element() {
				seen.quotes += 1;
			},
		})
		.on("main, script, head", {
			element(element) {
				inside += 1;
				element.onEndTag(() => {
					inside -= 1;
				});
			},
		})
		.on("body *", {
			element(element) {
				if (inside === 0)
					seen.frame += ` ${element.getAttribute("href") ?? ""} ${element.getAttribute("class") ?? ""} `;
			},
			text(chunk) {
				if (inside === 0) seen.frame += chunk.text;
			},
		})
		.on("script", {
			element(element) {
				if (!element.getAttribute("src"))
					seen.inlineNonces.push(element.getAttribute("nonce"));
			},
		})
		.on("script[src], link[href], img[src], iframe[src]", {
			element(element) {
				const reference =
					element.getAttribute("src") ?? element.getAttribute("href") ?? "";
				// Where a browser would ask for it: `//elsewhere` starts with a slash too.
				const origin = URL.canParse(reference, ORIGIN)
					? new URL(reference, ORIGIN).origin
					: "none";
				if (reference.startsWith("/assets/")) seen.assets.add(reference);
				else if (origin !== ORIGIN) seen.foreign.add(reference);
			},
		})
		.transform(new Response(html))
		.text();
	return seen;
}

/**
 * How many items a list says it has, if the list it shows is the first page of that;
 * undefined when it shows something else. A list of none says so and shows none.
 */
function totalOf(seen: Awaited<ReturnType<typeof page>>): number | undefined {
	const notes = seen.notes.map((note) => note.replace(/\s+/g, " ").trim());
	const none = notes.some((note) => note.startsWith("No items match."));
	const [, from, to, of] =
		notes
			.map((note) =>
				/^Items (\d{1,7}) to (\d{1,7}) of (\d{1,7}), newest first/.exec(note),
			)
			.find(Boolean)
			?.map(Number) ?? [];
	if (of === undefined) return none && seen.entries === 0 ? 0 : undefined;
	return !none &&
		of > 0 &&
		from === 1 &&
		to === Math.min(of, PAGE_SIZE) &&
		seen.entries === to
		? of
		: undefined;
}

/** The sitemap's pages of one kind, in its own order. */
const listed = (sitemap: string) =>
	[...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(([, url]) => url ?? "");
/** The fixed rule: `count` of them, evenly spaced, the first always. */
const spaced = (all: string[], count: number) =>
	Array.from({ length: Math.min(count, all.length) }, (_, i) =>
		String(all[Math.floor((i * all.length) / count)]),
	);

/** public/_headers, as rules for a path. */
function staticHeaders(path: string): [string, string][] {
	const found = new Map<string, string>();
	let applies = false;
	for (const line of file("_headers").split("\n")) {
		if (line.startsWith("#") || !line.trim()) continue;
		if (!line.startsWith(" ")) {
			const [before = "", after] = line.trim().split("*");
			applies = after === undefined ? path === before : path.startsWith(before);
		} else if (applies) {
			const at = line.indexOf(":");
			found.set(
				line.slice(0, at).trim().toLowerCase(),
				line.slice(at + 1).trim(),
			);
		}
	}
	return [...found];
}

/** Everything wrong with the deployed site; empty when the release is good. */
async function problems(): Promise<Line[]> {
	const found: Line[] = [];
	labyrinth = 0;
	/** `seen` is what was there, for the operator's own machine. */
	const expect = (condition: boolean, problem: Line, seen?: unknown) => {
		if (condition) return;
		found.push(problem);
		if (seen !== undefined) keep(`${problem}: ${JSON.stringify(seen)}`);
	};
	const header = (answer: Answer, name: string, good: boolean) => {
		const value = answer.headers.get(name);
		expect(good, told`${answer.name}: ${word(name)} is ${state(value)}`, value);
	};
	const secured = (answer: Answer) => {
		for (const [name, pattern] of SECURITY_HEADERS)
			header(answer, name, pattern.test(answer.headers.get(name) ?? ""));
	};
	/** Nothing of the old app's vendors, and no cookie, in any answer. */
	const clean = (answer: Answer) => {
		// Access sets its own on every answer it lets through, and it is before the
		// preview alone.
		const cookies = answer.headers
			.getSetCookie()
			.filter((cookie) => !preview || !cookie.startsWith("CF_Authorization="));
		expect(cookies.length === 0, told`${answer.name}: sets a cookie`);
		const vendor = [...answer.headers].find(([name, value]) =>
			VENDORS.test(`${name.replace(/[-_]/g, " ")} ${value}`),
		);
		expect(
			!vendor,
			told`${answer.name}: has a header of the old app's`,
			vendor,
		);
		expect(
			!VENDOR_CODE.test(answer.body),
			told`${answer.name}: names one of the old app's vendors`,
		);
	};
	const ours = (answer: Answer) => {
		clean(answer);
		const said = answer.headers.get("x-commit-sha");
		expect(
			said === expected,
			told`${answer.name}: x-commit-sha is ${commit(said)}`,
			said,
		);
		// Production may be indexed, and no other stage.
		header(
			answer,
			"x-robots-tag",
			/noindex/i.test(answer.headers.get("x-robots-tag") ?? "") === preview,
		);
		secured(answer);
	};
	/** A page as a visitor loads it whole, from this commit. */
	const wholePage = async (
		path: string,
		name: Line,
		{ status = 200, list: aList = false, plain = false } = {},
	) => {
		const answer = await get(path, name);
		const body = answer.body.replace(LABYRINTH, "");
		if (body !== answer.body) labyrinth += 1;
		const seen = await page(body);
		ours(answer);
		expect(answer.status === status, told`${name} answered ${answer.status}`);
		expect(
			/^text\/html/.test(answer.headers.get("content-type") ?? ""),
			told`${name}: not HTML`,
		);
		expect(
			seen.commit.length === 1 && seen.commit[0] === expected,
			told`${name}: <meta name="commit"> is ${commit(seen.commit[0])}`,
			seen.commit,
		);
		expect(
			!VENDORS.test(seen.frame),
			told`${name}: its frame names one of the old app's vendors`,
		);
		if (!plain)
			expect(
				seen.canonical.length === 1 && seen.canonical[0] === `${ORIGIN}${path}`,
				told`${name}: its canonical address is not its own`,
				seen.canonical,
			);
		expect(
			plain || seen.robots.join() === (aList ? "noindex, follow" : ""),
			told`${name}: its robots meta is not as it must be`,
			seen.robots,
		);
		expect(
			seen.foreign.size === 0,
			told`${name}: loads ${seen.foreign.size} files from elsewhere`,
			[...seen.foreign],
		);
		// What Cloudflare's edge could add to it, and that it may not.
		expect(
			!/cloudflareinsights|\/cdn-cgi\//.test(body),
			told`${name}: something of Cloudflare's is in it`,
		);
		header(
			answer,
			"cache-control",
			answer.headers.get("cache-control") ===
				"public, max-age=0, must-revalidate, no-transform",
		);
		const policy = answer.headers.get("content-security-policy") ?? "";
		const nonce = /script-src 'self' 'nonce-([0-9a-f]{32})';/.exec(policy)?.[1];
		expect(
			nonce !== undefined &&
				!/unsafe|https?:|\*/.test(policy) &&
				seen.inlineNonces.length > 0 &&
				seen.inlineNonces.every((value) => value === nonce),
			told`${name}: an inline script its policy does not admit`,
		);
		// A search engine must never be limited out of a page.
		expect(
			!answer.headers.has("ratelimit-policy"),
			told`${name}: a page is rate limited`,
		);
		return seen;
	};

	if (preview) {
		const outside = await ask(base, "/", word("/"));
		expect(
			([401, 403].includes(outside.status) ||
				(outside.status === 302 &&
					/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com\//.test(
						outside.headers.get("location") ?? "",
					))) &&
				!outside.headers.has("x-commit-sha"),
			told`/ answered ${outside.status} to a request without Access's token`,
		);
	}

	const health = await get("/api/health", word("/api/health"));
	ours(health);
	const said = readDocket(health.body);
	const { docket } = said;
	expect(health.status === 200, told`/api/health answered ${health.status}`);
	header(
		health,
		"cache-control",
		health.headers.get("cache-control") === "no-store",
	);
	expect(
		said.commit === expected,
		told`/api/health: it reports ${commit(said.commit)}`,
	);
	expect(
		said.database === "reachable",
		told`/api/health: the database is ${said.database === "unreachable" ? told`unreachable` : told`unstated`}`,
	);
	expect(
		mode === "cutover"
			? said.signup === "closed"
			: said.signup === "closed" || said.signup === "open",
		told`/api/health: sign-up is ${said.signup === "open" ? told`open` : told`unstated`}`,
	);
	expect(
		docket !== null && (preview || docket.items >= MIN_ITEMS),
		docket
			? told`/api/health: release ${docket.release} has ${docket.items} items, fewer than ${MIN_ITEMS}`
			: told`/api/health: no release is loaded`,
	);
	const before = expectedDocket(process.env.EXPECT_DOCKET);
	if (before)
		expect(
			JSON.stringify(before) === JSON.stringify(docket),
			told`/api/health: release ${docket?.release ?? 0} with ${docket?.items ?? 0} items, not the one the wait saw (release ${before.release}, ${before.items} items)`,
		);

	// The sitemap: exactly the fixed pages, the towns and the items.
	const sitemap = await get("/sitemap.xml", word("/sitemap.xml"));
	ours(sitemap);
	const urls = listed(sitemap.body);
	const paths = urls
		.filter((url) => url.startsWith(`${ORIGIN}/`))
		.map((url) => url.slice(ORIGIN.length));
	const items = paths.filter((path) => path.startsWith("/item/"));
	const towns = paths.filter((path) => path.startsWith("/town/"));
	expect(
		sitemap.status === 200 &&
			/^application\/xml/.test(sitemap.headers.get("content-type") ?? ""),
		told`/sitemap.xml answered ${sitemap.status}, or is not XML`,
	);
	expect(
		paths.length === urls.length &&
			new Set(paths).size === paths.length &&
			FIXED.every((path) => paths.includes(path)) &&
			items.length === docket?.items &&
			towns.length === docket?.towns &&
			paths.length === FIXED.length + items.length + towns.length,
		told`/sitemap.xml lists ${urls.length} pages, ${items.length} of them items and ${towns.length} towns; health says ${docket?.items ?? 0} and ${docket?.towns ?? 0}, and ${FIXED.length} are fixed`,
	);
	let alive = 0;
	await politely([...paths.entries()], async ([at, path]) => {
		const answer = await get(path, told`page ${at + 1} of the sitemap`, {
			method: "HEAD",
		});
		ours(answer);
		if (answer.status === 200) alive += 1;
		else
			expect(
				false,
				told`page ${at + 1} of the sitemap answered ${answer.status}`,
				path,
			);
	});
	expect(
		alive === paths.length,
		told`${paths.length - alive} pages of the sitemap do not answer 200`,
	);

	const home = await wholePage("/", word("/"));
	expect(
		totalOf(home) === docket?.items,
		told`/: does not list the items of the release`,
		home.notes,
	);
	for (const path of FIXED.slice(1)) await wholePage(path, word(path));
	for (const [at, path] of spaced(items, ITEM_PAGES).entries()) {
		const name = told`item page ${at + 1} of ${ITEM_PAGES}`;
		const seen = await wholePage(path, name);
		expect(
			seen.title.trim() !== "" && seen.quotes === 1,
			told`${name} shows no item`,
			path,
		);
	}
	for (const [at, path] of spaced(towns, TOWN_PAGES).entries()) {
		const name = told`town page ${at + 1} of ${TOWN_PAGES}`;
		const seen = await wholePage(path, name);
		expect(seen.title.trim() !== "", told`${name} shows no town`, path);
	}

	// The filters, from the data that is there. Every item has one kind, one board and
	// one town, so the lists of every kind hold the release's items, and so do those of
	// every board and of every town: a list that wrongly shows nothing is missed there.
	interface Filter {
		path: string;
		name: Line;
		town?: string;
	}
	const counts = new Map<string, number>();
	const readList = async ({ path, name, town }: Filter) => {
		const answer = await get(path, name);
		ours(answer);
		expect(answer.status === 200, told`${name} answered ${answer.status}`);
		const seen = await page(answer.body);
		const total = totalOf(seen);
		expect(
			total !== undefined,
			told`${name} shows neither items nor that there are none`,
			seen.notes,
		);
		expect(
			!town || seen.towns.every((link) => link === `/town/${town}`),
			told`${name} shows an item of another town`,
			seen.towns,
		);
		counts.set(path, total ?? 0);
		return total ?? 0;
	};
	const whole = async (called: Line, all: Filter[], of: number | undefined) => {
		await politely(all, async (one) => {
			await readList(one);
		});
		const sum = all.reduce((so, { path }) => so + (counts.get(path) ?? 0), 0);
		expect(
			sum === of,
			told`the lists of every ${called} hold ${sum} items in all, not ${of ?? 0}`,
		);
	};
	const kinds = Object.keys(KINDS).map((kind) => ({
		path: `/?kind=${kind}`,
		name: told`the list of kind ${word(kind)}`,
	}));
	const boards = Object.keys(BOARD_TYPES).map((board) => ({
		path: `/?board=${board}`,
		name: told`the list of board ${word(board)}`,
	}));
	const slugs = towns
		.map((path) => path.slice("/town/".length))
		.filter((slug) => /^[a-z0-9-]{1,60}$/.test(slug));
	const places: Filter[] = slugs.map((slug, at) => ({
		path: `/?town=${slug}`,
		name: told`the list of town ${at + 1} of ${slugs.length}`,
		town: slug,
	}));
	await whole(told`kind`, kinds, docket?.items);
	await whole(told`board`, boards, docket?.items);
	await whole(told`town`, places, docket?.items);
	const all: Filter[] = [...kinds, ...boards, ...places];
	const holds = ({ path }: Filter) => counts.get(path) ?? 0;
	// One of each that has items, read whole.
	for (const some of [kinds, boards, places]) {
		const one = (some as Filter[]).find((filter) => holds(filter) > 0);
		if (one) {
			const seen = await wholePage(one.path, one.name, { list: true });
			expect(
				(totalOf(seen) ?? 0) > 0 && seen.entries > 0,
				told`${one.name} lists no item`,
			);
		}
	}
	// And one that has none: a kind, a board or a town, or a kind in the smallest town.
	let empty = all.find((filter) => holds(filter) === 0);
	const [smallest] = [...places].sort((a, b) => holds(a) - holds(b));
	if (!empty && smallest) {
		const inTown = kinds.map(({ path, name }) => ({
			// In the docket's own order of filters (src/lib/docket.ts, listPath).
			path: `${smallest.path}&${path.slice(2)}`,
			name: told`${name} in ${smallest.name}`,
			town: smallest.town,
		}));
		await whole(told`kind of a town`, inTown, holds(smallest));
		empty = inTown.find((filter) => holds(filter) === 0);
	}
	if (empty) {
		const seen = await wholePage(empty.path, empty.name, { list: true });
		expect(
			totalOf(seen) === 0,
			told`${empty.name} does not say that it has no items`,
		);
	}

	for (const path of GONE)
		await wholePage(path, word(path), { status: 410, plain: true });
	for (const path of MISSING)
		await wholePage(path, word(path), { status: 404, plain: true });

	// Static files, which are served without the Worker.
	expect(
		[...home.assets].some((path) => path.endsWith(".js")) &&
			[...home.assets].some((path) => path.endsWith(".css")),
		told`/: names no script or stylesheet`,
	);
	let scripts = "";
	for (const [at, path] of [...home.assets, "/favicon.svg"].entries()) {
		const name = path.endsWith(".js")
			? told`file ${at + 1}, a script`
			: path.endsWith(".css")
				? told`file ${at + 1}, a stylesheet`
				: word(path, told`file ${at + 1}`);
		const answer = await get(path, name, { headers: { Accept: "*/*" } });
		expect(answer.status === 200, told`${name} answered ${answer.status}`);
		clean(answer);
		for (const [key, value] of staticHeaders(path))
			expect(
				answer.headers.get(key) === value,
				told`${name}: ${word(key)} is ${state(answer.headers.get(key))}, not what public/_headers says`,
				answer.headers.get(key),
			);
		expect(
			!VENDORS.test(answer.body),
			told`${name}: names one of the old app's vendors`,
		);
		if (path.endsWith(".js")) scripts += answer.body;
	}

	const robots = await get("/robots.txt", word("/robots.txt"));
	ours(robots);
	expect(
		robots.status === 200 &&
			robots.body ===
				(preview ? "User-agent: *\nDisallow: /\n" : file("robots.txt")),
		told`/robots.txt is not the ${preview ? told`closed` : told`public`} policy (${robots.status})`,
	);

	// The pages' own calls reach the Worker, and their limit is bound: one of the
	// functions the scripts name, asked with nothing in it, which reads and writes
	// nothing.
	expect(
		!scripts.includes(OLD_FUNCTIONS),
		told`the pages' scripts name ${BLOCK}, which the zone blocks`,
	);
	const id = /(?<=[`'"])[0-9a-f]{64}(?=[`'"])/.exec(scripts)?.[0];
	expect(id !== undefined, told`the pages' scripts name no server function`);
	const call = await get(`${FUNCTIONS}/${id ?? "none"}`, told`a call`, {
		method: "POST",
		headers: {
			Accept: "application/json",
			"Content-Type": "application/json",
			"x-tsr-serverfn": "true",
			Origin: new URL(base).origin,
			"Sec-Fetch-Site": "same-origin",
		},
		body: "[]",
	});
	ours(call);
	expect(
		call.status === 400,
		told`a call under ${word(FUNCTIONS)} that says nothing answered ${call.status}`,
	);
	const limit = call.headers.get("ratelimit-policy");
	expect(
		limit === limitPolicy,
		told`a call: the limit (${CALLS.calls} a minute) is ${limit === null ? told`not bound` : told`another`}`,
		limit,
	);

	// The old app's function path. On the domain the zone answers for it first, as it
	// did for the old app: its answer has neither a commit nor the docket's headers.
	// Everywhere else the docket answers, like any other path.
	const old = await get(`${OLD_FUNCTIONS}/x`, told`${BLOCK}/x`);
	if (onDomain) clean(old);
	else ours(old);
	expect(
		onDomain
			? old.status === 403 &&
					!old.headers.has("x-commit-sha") &&
					!old.headers.has("cf-mitigated")
			: old.status === 404,
		onDomain
			? told`${BLOCK} answered ${old.status}: THE ZONE'S BLOCK IS GONE, or is not what answers (docs/runbooks/release.md, section 7)`
			: told`${BLOCK} answered ${old.status}`,
	);
	expect(
		!old.headers.has("x-tss-serialized"),
		told`${BLOCK} answered a server function`,
	);

	// Plain http answers a redirect to https and nothing else.
	const http = onDomain ? plainAddress() : undefined;
	if (http) {
		const plain = await ask(http, "/?kind=decision", told`http://`);
		expect(
			plain.status >= 301 &&
				plain.status <= 308 &&
				plain.headers.get("location") === `${ORIGIN}/?kind=decision`,
			told`http:// answered ${plain.status}, not a redirect to https`,
		);
	}
	return found;
}

/** Where plain http is asked; in the rehearsal, a stand-in on this machine. */
function plainAddress() {
	if (!local) return `http://${HOSTNAME}`;
	const played = process.env.PLAIN_ORIGIN ?? "";
	return /^http:\/\/127\.0\.0\.1:\d+$/.test(played) ? played : undefined;
}

const pause = () =>
	new Promise((resolve) => setTimeout(resolve, local ? 250 : 10_000));

/** Waits until the expected commit answers, well or not. */
async function waitForCommit() {
	const deadline = Date.now() + (local ? 4_000 : 6 * 60_000);
	for (;;) {
		let seen: Line;
		try {
			const health = await get("/api/health", word("/api/health"));
			const said = health.headers.get("x-commit-sha");
			if (said === expected) return;
			seen = told`HTTP ${health.status}, ${said ? commit(said) : told`not the docket`}`;
		} catch (error) {
			seen = told`no answer (${classOf(error)})`;
		}
		if (Date.now() > deadline)
			return fail`${label} never answered ${COMMIT()} (last: ${seen}).`;
		say(told`waiting for ${COMMIT()} at ${label}: ${seen}`);
		await pause();
	}
}

async function check() {
	await waitForCommit();
	const deadline = Date.now() + (local ? 1_000 : 60_000);
	for (;;) {
		const found = await problems().catch((error: unknown) => {
			keep(error instanceof Error ? error.stack : error);
			return [
				error instanceof Told
					? error.line
					: told`no answer (${classOf(error)})`,
			];
		});
		if (found.length === 0) break;
		if (Date.now() > deadline)
			return fail`${label} is not right:${list(
				found.slice(0, 40).map((line) => told`\n- ${line}`),
				told``,
			)}${found.length > 40 ? told`\n- and ${found.length - 40} more` : told``}`;
		say(told`not settled yet: ${list(found.slice(0, 5), told`; `)}`);
		await pause();
	}
	if (labyrinth)
		say(
			told`note: the zone added its hidden crawler link to ${labyrinth} pages`,
		);
	say(
		told`${label} serves ${COMMIT()}: every page, the sitemap, the data, the filters, robots, the static files, the limit and the headers are right; ${
			preview
				? told`nobody without the token gets in`
				: onDomain
					? told`the zone still blocks ${BLOCK}`
					: told`nothing is under ${BLOCK}`
		}; no cookie${preview ? told` but Access's own` : told``} and nothing of the old app's vendors.`,
	);
}

/** What would fail the check after the move is found before it. */
async function reachable() {
	const home = await get("/", word("/"));
	if (home.headers.has("cf-mitigated") || home.status === 403)
		return fail`${label} challenges this machine (${home.status}), so the check after the move could not read it. Nothing was moved.`;
	const old = await get(`${OLD_FUNCTIONS}/x`, BLOCK);
	if (
		old.status !== 403 ||
		old.headers.has("cf-mitigated") ||
		old.headers.has("x-commit-sha")
	)
		return fail`${label}: ${BLOCK} answered ${old.status}, so the zone's block is gone. Nothing was moved.`;
	say(
		told`${label} answers this machine: ${home.status}; the zone blocks ${BLOCK}.`,
	);
}

async function main() {
	publicOutput();
	if (process.argv.length !== 4 || !addressIsGood)
		return fail`Use: bun scripts/check-production.ts workers.dev cutover | ${word(ORIGIN)} reachable|cutover|release | https://<host> preview`;
	if (
		own
			? mode !== "cutover"
			: !["reachable", "cutover", "release", "preview"].includes(mode)
	)
		return fail`The last argument is cutover, release, reachable or preview.`;
	base = own ? workersDev() : onDomain ? SITE() : where;
	local = base.startsWith("http://127.0.0.1");
	if (mode === "reachable") return reachable();
	if (!/^[0-9a-f]{40}$/.test(expected))
		return fail`Set APP_RELEASE to the full deployed commit SHA.`;
	if (Object.values(ACCESS).includes(""))
		return fail`Set CF_ACCESS_CLIENT_ID and CF_ACCESS_CLIENT_SECRET (the preview's verifier token).`;
	return check();
}

main().catch((error: unknown) => {
	complain(error, told`The check failed.`);
	process.exitCode = 1;
});
