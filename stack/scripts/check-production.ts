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
// machine (check:release) gets seconds. It asks for about 40 pages and reads the
// head of every other page the sitemap lists, four at a time; a head is not counted
// as a page request (src/start.ts).
import { readFileSync } from "node:fs";
import { CALLS, limitPolicy } from "../src/lib/limits";
import { FUNCTIONS, OLD_FUNCTIONS, ORIGIN } from "../src/lib/site";
import { SITE, workersDev } from "./cloudflare-api";
import { expectedDocket, MIN_ITEMS, readDocket } from "./docket-health";
import { complain, redact, say } from "./public-log";

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
	? "the new Worker's own address"
	: onDomain
		? ORIGIN
		: "the preview";
let base = where;
let local = false;

/** What Access asks of a service; sent to the checked address only. */
const ACCESS: Record<string, string> = preview
	? {
			"CF-Access-Client-Id": process.env.CF_ACCESS_CLIENT_ID ?? "",
			"CF-Access-Client-Secret": process.env.CF_ACCESS_CLIENT_SECRET ?? "",
		}
	: {};

const FIXED = ["/", "/method", "/privacy", "/terms"];
const GONE = [
	"/explore",
	"/pricing",
	"/search",
	"/topics/housing",
	"/meeting/a-meeting",
	"/dashboard",
	"/admin",
	"/sign-in",
	"/sign-up",
	"/reset-password",
];
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
	path: string;
	status: number;
	headers: Headers;
	body: string;
}

async function ask(
	from: string,
	path: string,
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
		path,
		status: response.status,
		headers: response.headers,
		body: await response.text(),
	};
}
const get = (path: string, init: RequestInit = {}) =>
	ask(base, path, {
		...init,
		headers: { ...ACCESS, ...(init.headers as Record<string, string>) },
	});

const short = (sha: unknown) =>
	typeof sha === "string" && sha ? sha.slice(0, 12) : "none";

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
 * A link the zone may add for crawlers (AI Labyrinth): hidden, not followed, of the
 * zone's own host, and nothing runs. Nothing else may be added to a page.
 */
const LABYRINTH =
	/<a href="https:\/\/civicobservatory\.com\/cdn-cgi\/content\?id=[\w.%-]+" aria-hidden="true" rel="nofollow noopener"[^>]*><\/a>/g;
let labyrinth = 0;

/** What a page says about itself: its commit, its scripts and its assets. */
async function page(html: string) {
	const seen = {
		commit: [] as string[],
		robots: [] as string[],
		canonical: [] as string[],
		title: "",
		entries: 0,
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
				seen.canonical.push(element.getAttribute("href") ?? "");
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
async function problems(): Promise<string[]> {
	const found: string[] = [];
	labyrinth = 0;
	const expect = (condition: boolean, problem: string) => {
		if (!condition) found.push(problem);
	};
	const secured = (answer: Answer) => {
		for (const [name, pattern] of SECURITY_HEADERS)
			expect(
				pattern.test(answer.headers.get(name) ?? ""),
				`${answer.path}: ${name} is ${answer.headers.get(name) ?? "missing"}`,
			);
	};
	/** Nothing of the old app's vendors, and no cookie, in any answer. */
	const clean = (answer: Answer) => {
		expect(!answer.headers.has("set-cookie"), `${answer.path}: sets a cookie`);
		const vendor = [...answer.headers].find(([name, value]) =>
			VENDORS.test(`${name.replace(/[-_]/g, " ")} ${value}`),
		);
		expect(
			!vendor,
			`${answer.path}: a header of the old app's (${vendor?.[0]})`,
		);
		expect(
			!VENDOR_CODE.test(answer.body),
			`${answer.path}: names one of the old app's vendors`,
		);
	};
	const ours = (answer: Answer) => {
		clean(answer);
		expect(
			answer.headers.get("x-commit-sha") === expected,
			`${answer.path}: x-commit-sha is ${short(answer.headers.get("x-commit-sha"))}`,
		);
		// Production may be indexed, and no other stage.
		expect(
			/noindex/i.test(answer.headers.get("x-robots-tag") ?? "") === preview,
			`${answer.path}: X-Robots-Tag says ${answer.headers.get("x-robots-tag") ?? "nothing"}`,
		);
		secured(answer);
	};
	/** A page as a visitor loads it whole, from this commit. */
	const wholePage = async (
		path: string,
		{ status = 200, list = false, plain = false } = {},
	) => {
		const answer = await get(path);
		labyrinth += answer.body.match(LABYRINTH)?.length ?? 0;
		const body = answer.body.replace(LABYRINTH, "");
		const seen = await page(body);
		ours(answer);
		expect(answer.status === status, `${path} answered ${answer.status}`);
		expect(
			/^text\/html/.test(answer.headers.get("content-type") ?? ""),
			`${path}: not HTML`,
		);
		expect(
			seen.commit.length === 1 && seen.commit[0] === expected,
			`${path}: <meta name="commit"> is ${short(seen.commit[0])}`,
		);
		expect(
			!VENDORS.test(seen.frame),
			`${path}: its frame names one of the old app's vendors`,
		);
		if (!plain)
			expect(
				seen.canonical.length === 1 && seen.canonical[0] === `${ORIGIN}${path}`,
				`${path}: canonical is ${seen.canonical.join(", ") || "missing"}`,
			);
		expect(
			plain || seen.robots.join() === (list ? "noindex, follow" : ""),
			`${path}: its robots meta says ${seen.robots.join(", ") || "nothing"}`,
		);
		expect(
			seen.foreign.size === 0,
			`${path}: loads ${[...seen.foreign].join(", ")}`,
		);
		// What Cloudflare's edge could add to it, and that it may not.
		expect(
			!/cloudflareinsights|\/cdn-cgi\//.test(body),
			`${path}: something of Cloudflare's is in it`,
		);
		expect(
			answer.headers.get("cache-control") ===
				"public, max-age=0, must-revalidate, no-transform",
			`${path}: Cache-Control is ${answer.headers.get("cache-control") ?? "missing"}`,
		);
		const policy = answer.headers.get("content-security-policy") ?? "";
		const nonce = /script-src 'self' 'nonce-([0-9a-f]{32})';/.exec(policy)?.[1];
		expect(
			nonce !== undefined &&
				!/unsafe|https?:|\*/.test(policy) &&
				seen.inlineNonces.length > 0 &&
				seen.inlineNonces.every((value) => value === nonce),
			`${path}: an inline script its policy does not admit`,
		);
		// A search engine must never be limited out of a page.
		expect(
			!answer.headers.has("ratelimit-policy"),
			`${path}: a page is rate limited`,
		);
		return { ...seen, body };
	};

	if (preview) {
		const outside = await ask(base, "/");
		expect(
			([401, 403].includes(outside.status) ||
				(outside.status === 302 &&
					/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com\//.test(
						outside.headers.get("location") ?? "",
					))) &&
				!outside.headers.has("x-commit-sha"),
			`/ answered ${outside.status} to a request without Access's token`,
		);
	}

	const health = await get("/api/health");
	ours(health);
	const state = readDocket(health.body);
	const { docket } = state;
	expect(health.status === 200, `/api/health answered ${health.status}`);
	expect(
		health.headers.get("cache-control") === "no-store",
		`/api/health: Cache-Control is ${health.headers.get("cache-control") ?? "missing"}`,
	);
	expect(
		state.commit === expected,
		`/api/health: commit ${short(state.commit)}`,
	);
	expect(
		state.database === "reachable",
		`/api/health: the database is ${state.database === "unreachable" ? "unreachable" : "unstated"}`,
	);
	expect(
		mode === "cutover"
			? state.signup === "closed"
			: state.signup === "closed" || state.signup === "open",
		`/api/health: sign-up is ${state.signup === "open" ? "open" : "unstated"}`,
	);
	expect(
		docket !== null && (preview || docket.items >= MIN_ITEMS),
		`/api/health: ${docket ? `release ${docket.release} has ${docket.items} items, fewer than ${MIN_ITEMS}` : "no release is loaded"}`,
	);
	const seenBefore = expectedDocket(process.env.EXPECT_DOCKET);
	expect(
		!seenBefore || JSON.stringify(seenBefore) === JSON.stringify(docket),
		`/api/health: release ${docket?.release ?? "none"} with ${docket?.items ?? 0} items, not the one the wait saw (release ${seenBefore?.release}, ${seenBefore?.items} items)`,
	);

	// The sitemap: exactly the fixed pages, the towns and the items.
	const sitemap = await get("/sitemap.xml");
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
		`/sitemap.xml answered ${sitemap.status}`,
	);
	expect(
		paths.length === urls.length &&
			new Set(paths).size === paths.length &&
			FIXED.every((path) => paths.includes(path)) &&
			items.length === docket?.items &&
			towns.length === docket?.towns &&
			paths.length === FIXED.length + items.length + towns.length,
		`/sitemap.xml lists ${urls.length} pages, ${items.length} of them items and ${towns.length} towns; health says ${docket?.items ?? 0} and ${docket?.towns ?? 0}, and ${FIXED.length} are fixed`,
	);
	let alive = 0;
	await politely(paths, async (path) => {
		const answer = await get(path, { method: "HEAD" });
		ours(answer);
		if (answer.status === 200) alive += 1;
		else expect(false, `${path}, in the sitemap, answered ${answer.status}`);
	});
	expect(
		alive === paths.length,
		`${paths.length - alive} pages of the sitemap do not answer 200`,
	);

	const home = await wholePage("/");
	expect(home.entries > 0, "/: lists no item");
	for (const path of FIXED.slice(1)) await wholePage(path);
	for (const path of spaced(items, ITEM_PAGES)) {
		const seen = await wholePage(path);
		expect(
			seen.title.trim() !== "" && seen.quotes === 1,
			`${path} shows no item`,
		);
	}
	for (const path of spaced(towns, TOWN_PAGES))
		expect(
			(await wholePage(path)).title.trim() !== "",
			`${path} shows no town`,
		);
	expect(
		(await wholePage("/?kind=decision", { list: true })).entries > 0,
		"/?kind=decision: lists no item",
	);
	for (const path of GONE) await wholePage(path, { status: 410, plain: true });
	for (const path of ["/no-such-page", "/item/no-such-item-01"])
		await wholePage(path, { status: 404, plain: true });

	// Static files, which are served without the Worker.
	expect(
		[...home.assets].some((path) => path.endsWith(".js")) &&
			[...home.assets].some((path) => path.endsWith(".css")),
		"/: names no script or stylesheet",
	);
	let scripts = "";
	for (const path of [...home.assets, "/favicon.svg"]) {
		const answer = await get(path, { headers: { Accept: "*/*" } });
		expect(answer.status === 200, `${path} answered ${answer.status}`);
		clean(answer);
		for (const [name, value] of staticHeaders(path))
			expect(
				answer.headers.get(name) === value,
				`${path}: ${name} is ${answer.headers.get(name) ?? "missing"}, not what public/_headers says`,
			);
		expect(
			!VENDORS.test(answer.body),
			`${path}: names one of the old app's vendors`,
		);
		if (path.endsWith(".js")) scripts += answer.body;
	}

	const robots = await get("/robots.txt");
	ours(robots);
	expect(
		robots.status === 200 &&
			robots.body ===
				(preview ? "User-agent: *\nDisallow: /\n" : file("robots.txt")),
		`/robots.txt is not the ${preview ? "closed" : "public"} policy (${robots.status})`,
	);

	// The pages' own calls reach the Worker, and their limit is bound: one of the
	// functions the scripts name, asked with nothing in it, which reads and writes
	// nothing.
	expect(
		!scripts.includes(OLD_FUNCTIONS),
		`the pages' scripts name ${OLD_FUNCTIONS}, which the zone blocks`,
	);
	const id = /(?<=[`'"])[0-9a-f]{64}(?=[`'"])/.exec(scripts)?.[0];
	expect(id !== undefined, "the pages' scripts name no server function");
	const call = await get(`${FUNCTIONS}/${id ?? "none"}`, {
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
		`a call under ${FUNCTIONS} that says nothing answered ${call.status}`,
	);
	expect(
		call.headers.get("ratelimit-policy") === limitPolicy,
		`a call: the limit (${CALLS.calls} a minute) is ${call.headers.get("ratelimit-policy") ?? "not bound"}`,
	);

	// The old app's function path: nothing of this app is there. On the domain the
	// zone answers for it first, as it did for the old app.
	// Nothing of the docket answers there: the zone's own answer has neither a commit
	// nor the docket's headers. Everywhere else it is the docket's, like any other.
	const old = await get(`${OLD_FUNCTIONS}/x`);
	if (onDomain) clean(old);
	else ours(old);
	expect(
		onDomain
			? old.status === 403 &&
					!old.headers.has("x-commit-sha") &&
					!old.headers.has("cf-mitigated")
			: old.status === 404,
		onDomain
			? `${OLD_FUNCTIONS} answered ${old.status}: THE ZONE'S BLOCK IS GONE, or is not what answers (docs/runbooks/release.md, section 7)`
			: `${OLD_FUNCTIONS} answered ${old.status}`,
	);
	expect(
		!old.headers.has("x-tss-serialized"),
		`${OLD_FUNCTIONS} answered a server function`,
	);

	// Plain http answers a redirect to https and nothing else.
	const http = onDomain ? plainAddress() : undefined;
	if (http) {
		const plain = await ask(http, "/?kind=decision");
		expect(
			plain.status >= 301 &&
				plain.status <= 308 &&
				plain.headers.get("location") === `${ORIGIN}/?kind=decision`,
			`http:// answered ${plain.status}, not a redirect to https`,
		);
	}
	return found;
}

/** Where plain http is asked; in the rehearsal, a stand-in on this machine. */
function plainAddress() {
	if (!local) return ORIGIN.replace("https:", "http:");
	const played = process.env.PLAIN_ORIGIN ?? "";
	return /^http:\/\/127\.0\.0\.1:\d+$/.test(played) ? played : undefined;
}

const pause = () =>
	new Promise((resolve) => setTimeout(resolve, local ? 250 : 10_000));

/** Waits until the expected commit answers, well or not. */
async function waitForCommit() {
	const deadline = Date.now() + (local ? 4_000 : 6 * 60_000);
	for (;;) {
		let seen: string;
		try {
			const health = await get("/api/health");
			const commit = health.headers.get("x-commit-sha");
			if (commit === expected) return;
			seen = `${health.status}, ${commit ? `x-commit-sha ${short(commit)}` : "not the docket"}`;
		} catch (error) {
			seen = error instanceof Error ? error.name : "no answer";
		}
		if (Date.now() > deadline)
			throw new Error(
				`${label} never answered ${short(expected)} (last: ${seen}).`,
			);
		say(`waiting for ${short(expected)} at ${label}: ${seen}`);
		await pause();
	}
}

async function check() {
	await waitForCommit();
	const deadline = Date.now() + (local ? 1_000 : 60_000);
	for (;;) {
		const found = await problems().catch((error: unknown) => [
			`no answer (${error instanceof Error ? error.name : "failed"})`,
		]);
		if (found.length === 0) break;
		if (Date.now() > deadline)
			throw new Error(
				`${label} is not right:\n- ${found.slice(0, 40).join("\n- ")}${found.length > 40 ? `\n- and ${found.length - 40} more` : ""}`,
			);
		say(`not settled yet: ${found.slice(0, 5).join("; ")}`);
		await pause();
	}
	if (labyrinth)
		say(`note: the zone added its hidden crawler link to ${labyrinth} pages`);
	say(
		`${label} serves ${short(expected)}: every page, the sitemap, the data, robots, the static files, the limit and the headers are right; ${preview ? "nobody without the token gets in" : onDomain ? `the zone still blocks ${OLD_FUNCTIONS}` : `nothing is under ${OLD_FUNCTIONS}`}; no cookie and nothing of the old app's vendors.`,
	);
}

/** What would fail the check after the move is found before it. */
async function reachable() {
	const home = await get("/");
	if (home.headers.has("cf-mitigated") || home.status === 403)
		throw new Error(
			`${label} challenges this machine (${home.status}), so the check after the move could not read it. Nothing was moved.`,
		);
	const old = await get(`${OLD_FUNCTIONS}/x`);
	if (
		old.status !== 403 ||
		old.headers.has("cf-mitigated") ||
		old.headers.has("x-commit-sha")
	)
		throw new Error(
			`${label}: ${OLD_FUNCTIONS} answered ${old.status}, so the zone's block is gone. Nothing was moved.`,
		);
	say(
		`${label} answers this machine: ${home.status}; the zone blocks ${OLD_FUNCTIONS}.`,
	);
}

try {
	if (process.argv.length !== 4 || !addressIsGood)
		throw new Error(
			`Use: bun scripts/check-production.ts workers.dev cutover | ${ORIGIN} reachable|cutover|release | https://<host> preview`,
		);
	if (
		own
			? mode !== "cutover"
			: !["reachable", "cutover", "release", "preview"].includes(mode)
	)
		throw new Error(
			"The last argument is cutover, release, reachable or preview.",
		);
	base = own ? workersDev() : onDomain ? SITE() : where;
	local = base.startsWith("http://127.0.0.1");
	if (mode === "reachable") await reachable();
	else {
		if (!/^[0-9a-f]{40}$/.test(expected))
			throw new Error("Set APP_RELEASE to the full deployed commit SHA.");
		if (Object.values(ACCESS).includes(""))
			throw new Error(
				"Set CF_ACCESS_CLIENT_ID and CF_ACCESS_CLIENT_SECRET (the preview's verifier token).",
			);
		await check();
	}
} catch (error) {
	complain(error, redact("The check failed."));
	process.exitCode = 1;
}
