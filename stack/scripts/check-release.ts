// `bun run check:release`: the production release, rehearsed (docs/runbooks/release.md;
// no unit tests, Jesse 2026-10-09). Local only; no cloud or GitHub call.
//
//  1. scripts/check-production.ts against the Worker as Alchemy builds it, in local
//     workerd on a made-up release of more than 300 items, bound as each stage is: it
//     passes, and it fails for each thing it checks when that one thing is broken.
//  2. .github/workflows, read as data: who may start what, what each step may know, that
//     nothing else deploys, and that a pull request starts the two checking jobs alone.
//  3. production.yml's own steps, run in order with their own conditions, against
//     stand-ins for Cloudflare's and GitHub's APIs, for the zone, and for Alchemy's
//     command line; the guard, the domain, wait and check scripts are the real ones.
//     Every run is held to three things: nothing asks the API for a firewall rule or a
//     DNS record; no step gives the domain to the old Worker while the zone's block is
//     gone; and nothing it prints, its steps' inputs included, holds an ID, an address,
//     a token or the workers.dev subdomain, all of which the stand-ins answer with.
import { type ChildProcess, execFileSync, spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { FUNCTIONS, OLD_FUNCTIONS, ORIGIN } from "../src/lib/site";
import { type BuiltWorker, startBuiltWorker } from "./built-worker";
import { GIVE_BACK_STEP, MOVE_STEP } from "./cloudflare-api";
import { enlarged, loadInto, readBundleFile } from "./harness";

declare const Bun: { YAML: { parse(text: string): unknown } };

const root = fileURLToPath(new URL("..", import.meta.url));
const repository = join(root, "..");
const workflows = join(repository, ".github/workflows");
const OLD = "civic-observatory";
const NEW = "civic-docket-production";
const HOST = "civicobservatory.com";
// Recognizable, so that none of them can be printed unseen.
const ACCOUNT = "acc0".repeat(8);
const OTHER_ACCOUNT = "acc1".repeat(8);
const ZONE = "20e0".repeat(8);
const ATTACHMENT = "a77a".repeat(8);
const TOKEN_ID = "70e1".repeat(8);
const RULE = "f1e0".repeat(8);
const DATABASE = "dbdbdbdb-1111-4222-8333-dbdbdbdbdbdb";
const SUBDOMAIN = "rehearsal-subdomain-9f";
const EMAIL = "somebody.private@rehearsal.example";
const STRANGER = "a-private-worker-of-the-account";
const TOKEN = "cfut_rehearsal0deploy0token0of0nobody";
const GITHUB_TOKEN = "ghs_rehearsal0github0token0of0nobody";
const PRIVATE = [ACCOUNT, OTHER_ACCOUNT, ZONE, ATTACHMENT, TOKEN_ID, RULE, DATABASE, SUBDOMAIN, EMAIL, STRANGER, TOKEN, GITHUB_TOKEN];
const HEAD = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
const LEAST = 300;

let cases = 0;
function check(condition: boolean, message: string, detail = "") {
	if (!condition) throw new Error(`check:release failed: ${message}\n${detail}`);
	cases += 1;
	console.log(`ok - ${message}`);
}

// ---------------------------------------------------------------------------
// Servers on this machine.

interface Reply {
	status: number;
	headers: Record<string, string>;
	body: string | Buffer;
}
interface Asked {
	method: string;
	path: string;
	headers: Record<string, string | string[] | undefined>;
	body: Buffer;
}

const closers: (() => void)[] = [];
async function listen(answer: (asked: Asked) => Promise<Reply>) {
	const server = createServer(async (incoming, outgoing) => {
		const chunks: Buffer[] = [];
		for await (const chunk of incoming) chunks.push(chunk as Buffer);
		try {
			const reply = await answer({
				method: incoming.method ?? "GET",
				path: incoming.url ?? "/",
				headers: incoming.headers,
				body: Buffer.concat(chunks),
			});
			outgoing.writeHead(reply.status, reply.headers);
			outgoing.end(incoming.method === "HEAD" ? undefined : reply.body);
		} catch {
			outgoing.writeHead(500);
			outgoing.end();
		}
	});
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
	closers.push(() => {
		server.closeAllConnections();
		server.close();
	});
	return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}
async function freePort() {
	const server = createServer();
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
	const { port } = server.address() as AddressInfo;
	await new Promise((resolve) => server.close(resolve));
	return port;
}
const json = (status: number, body: unknown): Reply => ({
	status,
	headers: { "Content-Type": "application/json" },
	body: JSON.stringify(body),
});

let caller = 0;
/** A Worker's answers to HEAD, which every check asks for 300 times: asked once. */
const heads = new Map<string, Promise<Reply>>();
const fromWorker = (worker: BuiltWorker, asked: Asked): Promise<Reply> => {
	if (asked.method !== "HEAD") return askWorker(worker, asked);
	const key = `${worker.base()} ${asked.path}`;
	const reply = heads.get(key) ?? askWorker(worker, asked);
	heads.set(key, reply);
	return reply;
};
/** The Worker's own answer, asked from a fresh address each time. */
async function askWorker(worker: BuiltWorker, asked: Asked): Promise<Reply> {
	caller = (caller + 1) % 60_000;
	const passed = Object.fromEntries(
		["accept", "content-type", "x-tsr-serverfn", "sec-fetch-site"]
			.map((name) => [name, asked.headers[name]])
			.filter(([, value]) => typeof value === "string"),
	) as Record<string, string>;
	const response = await worker.send(asked.path, {
		method: asked.method,
		headers: {
			...passed,
			...(asked.headers.origin ? { origin: worker.base() } : {}),
			"CF-Connecting-IP": `198.18.${Math.floor(caller / 250)}.${caller % 250}`,
		},
		body: asked.method === "POST" ? asked.body.toString() : undefined,
	});
	const headers = Object.fromEntries(response.headers);
	for (const name of ["content-encoding", "content-length", "transfer-encoding"]) delete headers[name];
	return { status: response.status, headers, body: Buffer.from(await response.arrayBuffer()) };
}

type Breaks = (path: string, reply: Reply, method: string, accept?: string) => Reply;
/** As Cloudflare does with its page-speed script: only for who asks as a browser. */
const forBrowsers =
	(breaks: Breaks): Breaks =>
	(path, reply, method, accept) =>
		accept?.includes("text/html") ? breaks(path, reply, method) : reply;
const at =
	(path: string | RegExp, change: (reply: Reply) => Partial<Reply>): Breaks =>
	(asked, reply) =>
		(typeof path === "string" ? asked === path : path.test(asked)) ? { ...reply, ...change(reply) } : reply;
const header = (name: string, value?: string) => (reply: Reply) => {
	const headers = { ...reply.headers };
	if (value === undefined) delete headers[name];
	else headers[name] = value;
	return { headers };
};
const text = (from: string | RegExp, to: string) => (reply: Reply) => {
	const body = reply.body.toString("utf8");
	return { body: typeof from === "string" ? body.replaceAll(from, to) : body.replace(from, to) };
};
const status = (code: number) => () => ({ status: code });
const headerOf = (name: string, from: string | RegExp, to: string) => (reply: Reply) =>
	header(name, (reply.headers[name] ?? "").replace(from, to))(reply);
/** /api/health with another release of the data in it. */
const docket = (change: Record<string, unknown> | null) =>
	at("/api/health", (reply) => {
		const said = JSON.parse(reply.body.toString()) as { docket: object };
		return { body: JSON.stringify({ ...said, docket: change && { ...said.docket, ...change } }) };
	});

// ---------------------------------------------------------------------------
// Children.

const running = new Set<ChildProcess>();
function start(command: string, args: string[], env: Record<string, string | undefined>, cwd = root) {
	const child = spawn(command, args, {
		cwd,
		env: env as unknown as NodeJS.ProcessEnv,
		detached: true,
		stdio: ["ignore", "pipe", "pipe"],
	});
	running.add(child);
	const done = new Promise<{ code: number | null; output: string }>((resolve) => {
		let output = "";
		for (const stream of [child.stdout, child.stderr])
			stream.on("data", (chunk) => {
				output += chunk;
			});
		child.on("close", (code) => {
			running.delete(child);
			resolve({ code, output });
		});
	});
	const kill = () => {
		try {
			if (child.pid) process.kill(-child.pid, "SIGKILL");
		} catch {
			// Already gone.
		}
	};
	return { done, kill };
}

// ---------------------------------------------------------------------------
// 1. The production check: green, then red for each thing it checks.

const ITEM = /^\/item\/(?!no-such)/;
const TOWN = /^\/town\//;
const SCRIPT = /^\/assets\/.*\.js$/;
const STYLE = /^\/assets\/.*\.css$/;
const CALL = new RegExp(`^${FUNCTIONS}/`);
const OLD_CALL = new RegExp(`^${OLD_FUNCTIONS}`);
const LABYRINTH = (more = "") =>
	`<a href="https://${HOST}/cdn-cgi/content?id=abc_D-1.2.3" aria-hidden="true" rel="nofollow noopener" style="display: none"${more}></a>`;

interface Case {
	name: string;
	mode: string;
	/** As the workflow names the place; the address is played. */
	where: string;
	url: () => Promise<string>;
	env?: Record<string, string>;
	says: string;
	/** It finds nothing wrong. */
	passes?: true;
}

/** Five at a time: each has its own proxy, and every caller its own address. */
async function runCases(all: Case[]) {
	const next = all.values();
	await Promise.all(
		Array.from({ length: 5 }, async () => {
			for (const { name, mode, where, url, env, says, passes } of next) {
				const address = await url();
				const { code, output } = await start(process.execPath, ["scripts/check-production.ts", where === "" ? address : where, mode], {
					PATH: process.env.PATH,
					HOME: process.env.HOME,
					APP_RELEASE: HEAD,
					WORKERS_SUBDOMAIN: SUBDOMAIN,
					...(where === "workers.dev" ? { WORKERS_DEV_ORIGIN: address } : {}),
					...(where === ORIGIN ? { SITE_ORIGIN: address } : {}),
					...env,
				}).done;
				check(
					code === (passes ? 0 : 1) && output.includes(says) && !output.includes(SUBDOMAIN),
					name,
					`exit ${code}, expected to say: ${says}\n${output}`,
				);
			}
		}),
	);
}

async function productionCases(worker: () => BuiltWorker, items: number): Promise<Case[]> {
	const through = (breaks: Breaks) => () =>
		listen(async (asked) => breaks(asked.path, await fromWorker(worker(), asked), asked.method, asked.headers.accept as string));
	const same: Breaks = (_, reply) => reply;
	/** The zone answers for the old function path before the Worker does. */
	const blocked: Breaks = at(OLD_CALL, () => ({ status: 403, headers: {}, body: "blocked" }));
	const both =
		(first: Breaks, second: Breaks): Breaks =>
		(path, reply, method) =>
			second(path, first(path, reply, method), method);
	const plain = await listen(async () => ({ status: 308, headers: { Location: `${ORIGIN}/?kind=decision` }, body: "" }));
	const served = await listen(async () => ({ status: 200, headers: {}, body: "" }));
	const towns = readBundleFile().towns.length;
	const EXPECT = { EXPECT_DOCKET: `1:${items}:${towns}` };
	/** The sixth item of the sitemap: no page that is read whole. */
	const SMALL = `/item/${enlarged(readBundleFile(), LEAST).items.map(({ id }) => id).sort()[5]}`;
	const oneHead =
		(code: number): Breaks =>
		(path, reply, method) =>
			method === "HEAD" && path === SMALL ? { ...reply, status: code } : reply;

	const RED: [string, string, Breaks, Record<string, string>?][] = [
		["another commit answers", "never answered", at("/api/health", header("x-commit-sha", "1".repeat(40)))],
		["the health report names another commit", "/api/health: commit 444444444444", at("/api/health", text(HEAD, "4".repeat(40)))],
		["D1 does not answer", "/api/health answered 503", at("/api/health", status(503))],
		["the database is not migrated", "the database is unreachable", at("/api/health", text('"reachable"', '"unreachable"'))],
		["the health report is kept", "/api/health: Cache-Control is missing", at("/api/health", header("cache-control"))],
		["no release is loaded", "no release is loaded", docket(null)],
		["a release is no number", "no release is loaded", docket({ release: "one" })],
		["the release has 299 items", `has 299 items, fewer than ${LEAST}`, docket({ items: 299 }), {}],
		["another release than the one the wait saw answers", "not the one the wait saw (release 1,", docket({ release: 2 })],
		["the release has one item more than the wait saw", `not the one the wait saw (release 1, ${items} items)`, docket({ items: items + 1 })],
		["the release has another number of towns", "not the one the wait saw", docket({ towns: towns + 1 })],
		["sign-up is open at the cutover", "sign-up is open", at("/api/health", text('"signup":"closed"', '"signup":"open"'))],
		["sign-up has no state", "sign-up is unstated", at("/api/health", text('"signup":"closed"', '"other":0'))],
		["what the wait saw is unreadable", "no answer (Error)", same, { EXPECT_DOCKET: "none" }],
		["an item's page fails", "answered 500", at(ITEM, status(500))],
		["an item has no quote", "shows no item", at(ITEM, text(/<blockquote[\s\S]*?<\/blockquote>/, ""))],
		["an item has an empty heading", "shows no item", at(ITEM, text(/(<h1[^>]*>)[\s\S]*?(<\/h1>)/, "$1$2"))],
		["a town has an empty heading", "shows no town", at(TOWN, text(/(<h1[^>]*>)[\s\S]*?(<\/h1>)/, "$1$2"))],
		["the front page lists nothing", "/: lists no item", at("/", text('class="entry', 'class="other'))],
		["a filtered list lists nothing", "/?kind=decision: lists no item", at("/?kind=decision", text('class="entry', 'class="other'))],
		["a filtered list may be indexed", "/?kind=decision: its robots meta says nothing", at("/?kind=decision", text('content="noindex, follow"', 'content=""'))],
		["a fixed page fails", "/privacy answered 500", at("/privacy", status(500))],
		["a page is not HTML", "/method: not HTML", at("/method", header("content-type", "text/plain"))],
		["a page names another commit in its meta tag", '<meta name="commit"> is 222222222222', at("/terms", text(`content="${HEAD}"`, `content="${"2".repeat(40)}"`))],
		["/ has no commit meta tag", '/: <meta name="commit"> is none', at("/", text('name="commit"', 'name="other"'))],
		["a town does not name its commit in a header", "x-commit-sha is none", at(TOWN, header("x-commit-sha"))],
		["a page's canonical is another site", "canonical is https://elsewhere.example", at(ITEM, text(`rel="canonical" href="${ORIGIN}`, 'rel="canonical" href="https://elsewhere.example'))],
		["an item must not be indexed", "its robots meta says noindex", at(ITEM, text("<head>", '<head><meta name="robots" content="noindex">'))],
		["/ must not be indexed", "/: X-Robots-Tag says noindex", at("/", header("x-robots-tag", "noindex"))],
		["an old address answers 200", "/pricing answered 200", at("/pricing", status(200))],
		["an old address is a 404", "/sign-in answered 404", at("/sign-in", status(404))],
		["an unknown path answers 200", "/no-such-page answered 200", at("/no-such-page", status(200))],
		["an unknown item answers 200", "/item/no-such-item-01 answered 200", at("/item/no-such-item-01", status(200))],
		["robots.txt disallows everything", "/robots.txt is not the public policy", at("/robots.txt", () => ({ body: "User-agent: *\nDisallow: /\n" }))],
		["robots.txt has one byte more", "/robots.txt is not the public policy", at("/robots.txt", text(/$/, "\n"))],
		["the sitemap is missing", "/sitemap.xml answered 404", at("/sitemap.xml", () => ({ status: 404, body: "" }))],
		["the sitemap is not XML", "/sitemap.xml answered 200", at("/sitemap.xml", header("content-type", "text/html"))],
		["the sitemap misses one item", `${items - 1} of them items`, at("/sitemap.xml", text(/ {2}<url><loc>[^<]*\/item\/[^<]*<\/loc><\/url>\n/, ""))],
		["the sitemap lists an item twice", `${items + 1} of them items`, at("/sitemap.xml", text(/( {2}<url><loc>[^<]*\/item\/[^<]*<\/loc><\/url>\n)/, "$1$1"))],
		["the sitemap misses a fixed page", "/sitemap.xml lists", at("/sitemap.xml", text(`${ORIGIN}/terms<`, `${ORIGIN}/method<`))],
		["the sitemap lists another host", "/sitemap.xml lists", at("/sitemap.xml", text(`${ORIGIN}/terms`, "https://elsewhere.example/terms"))],
		["one page of the sitemap that is not read whole is gone", `${SMALL}, in the sitemap, answered 410`, oneHead(410)],
		["one page of the sitemap that is not read whole fails", `${SMALL}, in the sitemap, answered 500`, oneHead(500)],
		["a page loads a script of somebody else", "/method: loads https://elsewhere.example/a.js", at("/method", text("</body>", '<script src="https://elsewhere.example/a.js"></script></body>'))],
		["a page loads a file by an address without a scheme", "/method: loads //elsewhere.example/a.css", at("/method", text("</head>", '<link rel="stylesheet" href="//elsewhere.example/a.css"></head>'))],
		["the zone's page-speed script is in a page", "/terms: something of Cloudflare's is in it", forBrowsers(at("/terms", text("</body>", '<script type="module" src="https://static.cloudflareinsights.com/beacon.min.js/v1"></script></body>')))],
		["another script of the zone's is in a page", "/terms: something of Cloudflare's is in it", at("/terms", text("</body>", '<script defer src="/cdn-cgi/scripts/a.js"></script></body>'))],
		["the zone's crawler link is not hidden", "/terms: something of Cloudflare's is in it", at("/terms", text("</body>", `${LABYRINTH().replace('aria-hidden="true" ', "")}</body>`))],
		["the zone's crawler link has something in it", "/terms: something of Cloudflare's is in it", at("/terms", text("</body>", `${LABYRINTH().replace("></a>", ">more</a>")}</body>`))],
		["the edge may change a page", "/terms: Cache-Control is public, max-age=0, must-revalidate", at("/terms", headerOf("cache-control", ", no-transform", ""))],
		["a page may be kept", ": Cache-Control is public, max-age=3600, no-transform", at(ITEM, header("cache-control", "public, max-age=3600, no-transform"))],
		["a page says nothing to the edge", ": Cache-Control is missing", at(TOWN, header("cache-control"))],
		["HSTS is missing on /", "/: strict-transport-security is missing", at("/", header("strict-transport-security"))],
		["a page may be framed", "/terms: x-frame-options is SAMEORIGIN", at("/terms", header("x-frame-options", "SAMEORIGIN"))],
		["a page sends its whole address on", "/: referrer-policy is unsafe-url", at("/", header("referrer-policy", "unsafe-url"))],
		["a page may use the camera", "/: permissions-policy is camera=(self)", at("/", header("permissions-policy", "camera=(self)"))],
		["a page's type may be guessed", "/method: x-content-type-options is missing", at("/method", header("x-content-type-options"))],
		["a page's policy is missing", "/: content-security-policy is missing", at("/", header("content-security-policy"))],
		["a page's policy admits any inline script", "an inline script its policy does not admit", at("/", headerOf("content-security-policy", /'nonce-[0-9a-f]+'/, "'unsafe-inline'"))],
		["a page's policy admits another host", "an inline script its policy does not admit", at("/", headerOf("content-security-policy", "connect-src 'self'", "connect-src 'self' https://elsewhere.example"))],
		["an inline script has no nonce", "/terms: an inline script its policy does not admit", at("/terms", text("</body>", "<script>1</script></body>"))],
		["a page is rate limited", "a page is rate limited", at(ITEM, header("ratelimit-policy", '"pages";q=1;w=60'))],
		["/ names no script", "/: names no script or stylesheet", at("/", text("/assets/", "/elsewhere/"))],
		["a script is missing", ".js answered 404", at(SCRIPT, status(404))],
		["a static file has no nosniff", "/favicon.svg: x-content-type-options is missing", at("/favicon.svg", header("x-content-type-options"))],
		["a static file's policy is another", "/favicon.svg: content-security-policy is default-src *", at("/favicon.svg", header("content-security-policy", "default-src *"))],
		["a stylesheet is not kept", ".css: cache-control is no-store", at(STYLE, header("cache-control", "no-store"))],
		["the scripts name no server function", "name no server function", at(SCRIPT, text(/[0-9a-f]{64}/g, "none"))],
		["a script calls the old function path", `name ${OLD_FUNCTIONS}, which the zone blocks`, at(SCRIPT, text(/^/, `/* ${OLD_FUNCTIONS}/ */`))],
		["something blocks the pages' own calls", "a call under /_fn that says nothing answered 403", at(CALL, () => ({ status: 403, headers: {}, body: "blocked" }))],
		["a call that says nothing is answered", "a call under /_fn that says nothing answered 200", at(CALL, status(200))],
		["the limit is not bound", "a call: the limit (60 a minute) is not bound", at(CALL, header("ratelimit-policy"))],
		["the limit is another", 'a call: the limit (60 a minute) is "calls";q=6000;w=60', at(CALL, header("ratelimit-policy", '"calls";q=6000;w=60'))],
		["the old function path answers", `${OLD_FUNCTIONS} answered 200`, at(OLD_CALL, status(200))],
		["the old function path is blocked where no zone is", `${OLD_FUNCTIONS} answered 403`, blocked],
		["the old function path answers a function", `${OLD_FUNCTIONS} answered a server function`, at(OLD_CALL, header("x-tss-serialized", "true"))],
		["a page sets a cookie", "/method: sets a cookie", at("/method", header("set-cookie", "a=b"))],
		["the old app's sign-in is in a header", "/: a header of the old app's (x-clerk-auth-status)", at("/", header("x-clerk-auth-status", "signed-out"))],
		["the old app's sign-in is in a page", "/: names one of the old app's vendors", at("/", text("</body>", "<!-- https://x.clerk.accounts.dev --></body>"))],
		["the old app's database is in a page", "/: names one of the old app's vendors", at("/", text("</body>", "<!-- https://x.convex.cloud --></body>"))],
		["the old app's other sign-in is in a script", ".js: names one of the old app's vendors", at(SCRIPT, text(/^/, "/* WorkOS */"))],
		["the old app's database is in a script", ".js: names one of the old app's vendors", at(SCRIPT, text(/^/, "/* convex */"))],
		["a page's frame names the old app's sign-in", "its frame names one of the old app's vendors", at("/terms", text("</footer>", "<p>Sign in with Clerk</p></footer>"))],
	];
	const BUILT = "passes on the Worker as Alchemy builds it, on more than 300 items, bound as";
	const before = { mode: "cutover", where: "workers.dev", env: EXPECT };
	const domain = { where: ORIGIN, env: { PLAIN_ORIGIN: plain, ...EXPECT } };
	return [
		{ ...before, name: `check-production cutover (before the move): ${BUILT} production`, url: through(same), says: `nothing is under ${OLD_FUNCTIONS}`, passes: true },
		{ ...domain, name: `check-production cutover (on the domain): ${BUILT} production, behind the zone's block`, mode: "cutover", url: through(blocked), says: `the zone still blocks ${OLD_FUNCTIONS}`, passes: true },
		{ ...domain, env: { PLAIN_ORIGIN: plain }, name: "check-production release: passes with another release of the data", mode: "release", url: through(both(blocked, docket({ release: 7 }))), says: "the zone still blocks", passes: true },
		{ ...domain, env: { PLAIN_ORIGIN: plain }, name: "check-production release: passes with sign-up open", mode: "release", url: through(both(blocked, at("/api/health", text('"signup":"closed"', '"signup":"open"')))), says: "the zone still blocks", passes: true },
		{ ...before, name: "check-production: passes with the zone's hidden crawler link, and says so", url: through(at(ITEM, text("</body>", `${LABYRINTH()}</body>`))), says: "note: the zone added its hidden crawler link to 10 pages", passes: true },
		{ ...before, name: "check-production: passes with a town's clerk in a page's own text", url: through(at(ITEM, text("</main>", "<p>Filed with the Town Clerk: https://town.example/town_clerk.com_minutes</p></main>"))), says: "nothing of the old app's vendors", passes: true },
		...RED.map(([name, says, breaks, env = EXPECT]): Case => ({ ...before, name: `check-production fails when ${name}`, url: through(breaks), env, says })),
		...(
			[
				["the zone's block is gone", "THE ZONE'S BLOCK IS GONE", same, {}],
				["the Worker itself answers 403 where the block was", "THE ZONE'S BLOCK IS GONE", at(OLD_CALL, () => ({ status: 403, headers: { "x-commit-sha": HEAD }, body: "" })), {}],
				["the zone challenges where it blocked", "or is not what answers", at(OLD_CALL, () => ({ status: 403, headers: { "cf-mitigated": "challenge" }, body: "" })), {}],
				["plain http is served", "http:// answered 200, not a redirect", blocked, { PLAIN_ORIGIN: served }],
			] as [string, string, Breaks, Record<string, string>][]
		).flatMap(([name, says, breaks, env]): Case[] =>
			["cutover", "release"].map((mode) => ({ ...domain, env: { ...domain.env, ...env }, name: `check-production ${mode} on the domain fails when ${name}`, mode, url: through(breaks), says })),
		),
		{ ...domain, name: "check-production reachable: passes when the zone answers this machine and blocks", mode: "reachable", url: through(blocked), says: "answers this machine: 200; the zone blocks", passes: true },
		{ ...domain, name: "check-production reachable: fails when the zone challenges this machine", mode: "reachable", url: () => listen(async () => ({ status: 403, headers: { "cf-mitigated": "challenge" }, body: "" })), says: "Nothing was moved" },
		{ ...domain, name: "check-production reachable: fails when the block is gone", mode: "reachable", url: through(same), says: "the zone's block is gone. Nothing was moved." },
		...(
			[
				["a mode there is not", ORIGIN, "later", "The last argument is"],
				["the new Worker's address after the move", "workers.dev", "release", "The last argument is"],
				["another site", "https://elsewhere.example", "release", "Use: bun scripts/check-production.ts"],
			] as const
		).map(([name, where, mode, says]): Case => ({ name: `check-production refuses ${name}`, where, mode, url: through(same), says })),
	];
}

/** The preview stage, behind a stand-in for Access. */
function previewCases(worker: () => BuiltWorker): Case[] {
	const token = { CF_ACCESS_CLIENT_ID: "rehearsal.access", CF_ACCESS_CLIENT_SECRET: "rehearsal-access-secret" };
	const same: Breaks = (_, reply) => reply;
	const behindAccess =
		(breaks: Breaks, open = false) =>
		() =>
			listen(async (asked) =>
				open || (asked.headers["cf-access-client-id"] === token.CF_ACCESS_CLIENT_ID && asked.headers["cf-access-client-secret"] === token.CF_ACCESS_CLIENT_SECRET)
					? breaks(asked.path, await fromWorker(worker(), asked), asked.method)
					: { status: 302, headers: { Location: "https://rehearsal.cloudflareaccess.com/cdn-cgi/access/login/x" }, body: "" },
			);
	const RED: [string, string, () => Promise<string>, Record<string, string>?][] = [
		["anyone may read it", "answered 200 to a request without", behindAccess(same, true)],
		["Access does not take the token", "never answered", behindAccess(same), { ...token, CF_ACCESS_CLIENT_SECRET: "another" }],
		["there is no token", "Set CF_ACCESS_CLIENT_ID and CF_ACCESS_CLIENT_SECRET", behindAccess(same), {}],
		["a page may be indexed", "/: X-Robots-Tag says nothing", behindAccess(at("/", header("x-robots-tag")))],
		["robots.txt is the public policy", "/robots.txt is not the closed policy", behindAccess(at("/robots.txt", () => ({ body: readFileSync(`${root}public/robots.txt`, "utf8") })))],
		["the limit is not bound", "a call: the limit (60 a minute) is not bound", behindAccess(at(CALL, header("ratelimit-policy")))],
	];
	return [
		{ name: "check-production preview: passes on the Worker as Alchemy builds it, bound as preview and behind Access", mode: "preview", where: "", url: behindAccess(same), env: token, says: "nobody without the token gets in", passes: true },
		...RED.map(([name, says, url, env = token]): Case => ({ name: `check-production preview fails when ${name}`, mode: "preview", where: "", url, env, says })),
	];
}

// ---------------------------------------------------------------------------
// 2. The workflows as data.

interface Step {
	id?: string;
	name?: string;
	uses?: string;
	with?: Record<string, unknown>;
	run?: string;
	if?: string;
	env?: Record<string, string>;
}
interface Workflow {
	on: Record<string, { branches?: string[]; paths?: string[] } | null>;
	permissions?: Record<string, string>;
	jobs: Record<
		string,
		{
			if?: string;
			"runs-on"?: string | string[];
			environment?: string | { name: string; url?: string };
			permissions?: Record<string, string>;
			concurrency?: { group: string; "cancel-in-progress": boolean };
			defaults?: { run?: Record<string, string> };
			env?: Record<string, string>;
			steps: Step[];
		}
	>;
}
type Job = Workflow["jobs"][string];
const readWorkflow = (name: string) => Bun.YAML.parse(readFileSync(join(workflows, name), "utf8")) as Workflow;

/** What a release card's reader of workflows calls a deploy step (read 2026-11-25). */
const DEPLOY =
	/\b(?:wrangler\s+(?:pages\s+)?deploy|(?:bun|npm|pnpm|yarn)(?:\s+run)?\s+deploy\b|(?:bash|sh)\s+\S*deploy\S*|\.\/\S*deploy\S*)/i;
/** What could put something on Cloudflare, anywhere in the tree. */
const PUTS = /wrangler(?:\.js)?["']?,?\s+["']?(?:pages|deploy|versions|secret|triggers|publish|delete|d1["',\s]+(?:execute|migrations)[^\n]*--remote)|--remote\b|alchemy\/bin\/cli|bunx?\s+alchemy|npx\s+alchemy/;

const MOVES = "steps.inspect.outputs.move == 'true'";
const CUTOVER = "steps.inspect.outputs.cutover == 'true'";
const SECRET = "${{ secrets.CLOUDFLARE_PRODUCTION_DEPLOY_TOKEN }}";

function workflowFacts() {
	const source = readFileSync(join(workflows, "production.yml"), "utf8");
	const workflow = readWorkflow("production.yml");
	const job = workflow.jobs.production;
	if (!job || Object.keys(workflow.jobs).length !== 1) throw new Error("check:release failed: production.yml has one job");
	const same = (one: unknown, other: unknown) => JSON.stringify(one) === JSON.stringify(other);
	check(
		same(workflow.on, { push: { branches: ["main"], paths: ["stack/**", ".github/workflows/production.yml"] } }) &&
			job.if === "github.event_name == 'push' && github.ref == 'refs/heads/main' && github.repository == 'jessewalberg/civic-observatory'",
		"production.yml starts on a push to this repository's main that changes the docket, and on nothing else",
	);
	check(
		job["runs-on"] === "ubuntu-24.04" &&
			typeof job.environment === "object" &&
			job.environment.name === "production" &&
			same(job.concurrency, { group: "civic-docket-production", "cancel-in-progress": false }) &&
			same(job.defaults, { run: { "working-directory": "stack" } }),
		"production.yml: a GitHub-hosted runner, the production environment, one run at a time, none cancelled, in stack/",
	);
	check(
		same(workflow.permissions, {}) && same(job.permissions, { contents: "read", actions: "read" }),
		"production.yml: no permission but the job's two reads",
	);
	const uses = job.steps.filter(({ uses }) => uses);
	check(
		uses.every(({ uses }) => /^[\w-]+\/[\w-]+@[0-9a-f]{40}$/.test(uses ?? "")) &&
			same(uses.map(({ uses }) => uses?.split("@")[0]), ["actions/checkout", "actions/setup-node", "oven-sh/setup-bun"]) &&
			uses[0]?.with?.["persist-credentials"] === false &&
			uses[1]?.with?.["package-manager-cache"] === false &&
			uses[2]?.with?.["no-cache"] === true &&
			!/actions\/cache|upload-artifact|download-artifact/.test(source),
		"production.yml: three actions, each pinned by commit; no credential kept, no cache, no artifact",
	);
	const runs = job.steps.map((step) => step.run ?? "");
	const credentialed = job.steps.findIndex((step) => JSON.stringify(step).includes("secrets."));
	check(
		same(runs.slice(0, credentialed).filter((run) => run !== ""), [
			"bun install --frozen-lockfile",
			"bun audit --prod --audit-level=high",
			"bun run check",
			"bun run build",
			"bunx playwright install --with-deps chromium-headless-shell",
			"bun run check:docket",
			"bun run check:signup",
			"bun run check:pages",
			"bun run check:limits",
			"rm -rf dist",
		]) && !JSON.stringify(job.env).includes("secrets."),
		"production.yml: install, audit, lint, build, types and the checks come before any step with a secret",
	);
	const [inspect, ...after] = job.steps.slice(credentialed);
	check(
		inspect?.run === "bun scripts/production-domain.ts inspect" &&
			same(after.map(({ run, if: when }) => [run, when ?? ""]), [
				["bun scripts/check-production.ts https://civicobservatory.com reachable", MOVES],
				["bun run deploy:production:ci", MOVES],
				["bun scripts/await-docket.ts", MOVES],
				["bun scripts/check-production.ts workers.dev cutover", MOVES],
				["bun scripts/production-domain.ts move", MOVES],
				["bun run deploy:production:ci", ""],
				['bun scripts/check-production.ts https://civicobservatory.com "$CHECK_MODE"', ""],
				["bun scripts/production-domain.ts restore", `(failure() || cancelled()) && ${CUTOVER}`],
			]),
		"production.yml: inspect, then the cutover in its order, only the apply and the check on every push, and the give-back until a run has finished the cutover",
		JSON.stringify(after.map(({ run, if: when }) => [run, when ?? ""]), null, 1),
	);
	// What a later run reads of these two in GitHub's record, and what they are told.
	const named = (name: string) => job.steps.filter((step) => step.name === name);
	const [move, back] = [named(MOVE_STEP), named(GIVE_BACK_STEP)];
	check(
		move.length === 1 &&
			move[0]?.id === "move" &&
			move[0].run === "bun scripts/production-domain.ts move" &&
			back.length === 1 &&
			back[0]?.run === "bun scripts/production-domain.ts restore" &&
			same(back[0].env, {
				CLOUDFLARE_API_TOKEN: SECRET,
				MOVE_OUTCOME: "${{ steps.move.outcome }}",
				MOVE_ASKED: "${{ steps.move.outputs.asked }}",
				MOVE_UNANSWERED: "${{ steps.move.outputs.unanswered }}",
				CARRIES_ON: "${{ steps.inspect.outputs.carries_on }}",
			}),
		"production.yml: the move and the give-back have the names later runs look for, and the give-back is told what this run moved or carries on",
		JSON.stringify([move, back], null, 1),
	);
	const scripts = (JSON.parse(readFileSync(`${root}package.json`, "utf8")) as { scripts: Record<string, string> }).scripts;
	const deploys = job.steps.filter((step) => DEPLOY.test(step.run ?? ""));
	check(
		deploys.length === 2 &&
			deploys.every((step) => step.run === "bun run deploy:production:ci") &&
			scripts["deploy:production:ci"] === "bun scripts/infra.ts deploy --yes" &&
			deploys[0]?.env?.PRODUCTION_DOMAIN === "unmanaged" &&
			deploys[1]?.env?.PRODUCTION_DOMAIN === undefined &&
			deploys[1]?.if === undefined,
		"a card's reader of the workflow sees the two applies, the second unconditional, and nothing else",
	);
	const knows = job.steps.filter((step) => JSON.stringify(step.env ?? {}).includes("secrets.")).map((step) => step.run);
	check(
		same(knows, [
			"bun scripts/production-domain.ts inspect",
			"bun run deploy:production:ci",
			"bun scripts/production-domain.ts move",
			"bun run deploy:production:ci",
			"bun scripts/production-domain.ts restore",
		]) &&
			(source.match(/secrets\.\w+/g) ?? []).every((secret) => secret === "secrets.CLOUDFLARE_PRODUCTION_DEPLOY_TOKEN") &&
			same(job.steps.filter((step) => JSON.stringify(step.env ?? {}).includes("github.token")).map(({ id }) => id), ["inspect"]),
		"production.yml: one secret, the deploy token, which reaches only the steps that call Cloudflare; GitHub's read token reaches the inspection alone",
	);
	check(!runs.some((run) => run.includes("${{")), "production.yml: no expression is pasted into a command");

	// The rest of the workflows.
	const others = readdirSync(workflows).filter((name) => name !== "production.yml");
	check(same(others, ["deploy.yml"]), "there is one other workflow");
	const other = readFileSync(join(workflows, "deploy.yml"), "utf8");
	const checking = readWorkflow("deploy.yml");
	check(
		same(Object.keys(checking.on), ["push", "pull_request"]) &&
			same(checking.on.push, { branches: ["main"] }) &&
			same(Object.keys(checking.jobs), ["verify", "stack"]) &&
			same(checking.permissions, { contents: "read" }) &&
			!/environment:|secrets\.|actions\/cache|upload-artifact/.test(other) &&
			Object.values(checking.jobs).every(
				(entry) =>
					/^ubuntu-/.test(String(entry["runs-on"])) &&
					entry.permissions === undefined &&
					!entry.steps.some((step) => DEPLOY.test(step.run ?? "")),
			),
		"deploy.yml: its two jobs, on pull requests and main, with no environment, secret, wider permission, artifact or deploy",
	);
	check(
		!/pull_request_target|workflow_run|workflow_dispatch|issue_comment|self-hosted|repository_dispatch/.test(`${source.replace(/#.*$/gm, "")}${other.replace(/#.*$/gm, "")}`) &&
			Object.values(checking.jobs).every((entry) =>
				entry.steps.filter(({ uses }) => uses).every(({ uses, with: given }) => /@[0-9a-f]{40}$/.test(uses ?? "") && (!uses?.startsWith("actions/checkout") || given?.["persist-credentials"] === false)),
			),
		"no workflow starts for a stranger's event or on a machine of ours; every action is pinned by commit, and no checkout keeps a credential",
	);

	// The tree.
	const files = (folder: string): string[] =>
		readdirSync(folder, { withFileTypes: true, recursive: true })
			.filter((entry) => entry.isFile())
			.map((entry) => join(entry.parentPath, entry.name));
	const own = [...files(join(root, "scripts")), join(root, "alchemy.run.ts"), join(root, "package.json")];
	const release = own.filter((name) => !/\/(?:check|rehearsal)-[\w-]+\.tsx?$/.test(name));
	check(
		release.filter((name) => PUTS.test(readFileSync(name, "utf8"))).map((name) => name.slice(root.length)).join() === "scripts/infra.ts" &&
			Object.values(scripts).every((script) => !PUTS.test(script)),
		"nothing in this folder can put anything on Cloudflare but the guard",
		release.filter((name) => PUTS.test(readFileSync(name, "utf8"))).join(),
	);
	check(
		[...release, join(workflows, "production.yml")].every((name) => !/rulesets|firewall\/|\/dns_records|\/settings\/rum|WAF_TOKEN/.test(readFileSync(name, "utf8"))),
		"no script or step of the release has a call that reads or writes a firewall rule, a DNS record or a zone setting",
	);
	return job;
}

// ---------------------------------------------------------------------------
// 3. The workflow's own steps, against stand-ins.

/** An attempt of a run, as GitHub recorded it. */
interface Past {
	/** How it ended; null: it has not. */
	ends: string | null;
	/** Its status, while it has not ended. */
	status?: string;
	/** How its two domain steps ended. */
	move?: string;
	back?: string;
	/** Its move has an end, and never began. */
	neverBegan?: true;
	/** Its runner was lost in the step whose name begins so: nothing later has an end. */
	lostIn?: string;
	/** It never came to its steps; or GitHub's record of them ends where it was lost. */
	stops?: "in the queue" | "in its setup" | "where it was lost";
	/** It ended so many minutes ago. */
	ago: number;
	/** GitHub has no end of its job. */
	noEnd?: true;
}
/** Ended before its move, with nothing to give back. */
const EARLY: Past = { ends: "failure", move: "skipped", back: "success", ago: 2 };
/** Its runner died after its move. */
const LOST: Past = { ends: "failure", move: "success", lostIn: "Deploy production", ago: 90 };
/** Moved the domain, and gave it back. */
const GAVE_BACK: Past = { ends: "failure", move: "success", back: "success", ago: 2 };
/** Moved the domain, and its give-back was not confirmed. */
const UNCONFIRMED: Past = { ...GAVE_BACK, back: "failure", ago: 5 };
const FINISHED: Past = { ends: "success", move: "success", back: "skipped", ago: 600 };

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
/** GitHub's record of an attempt, and of its one job with the workflow's own steps. */
const recordOf = (past: Past) => ({
	status: past.ends ? "completed" : (past.status ?? "in_progress"),
	conclusion: past.ends,
	created_at: minutesAgo(past.ago + 30),
	run_started_at: minutesAgo(past.ago + 25),
	updated_at: minutesAgo(past.ago),
	actor: { email: EMAIL },
});
function jobOf(job: Job, past: Past) {
	const when = minutesAgo(past.ago);
	let lost = false;
	const steps = ["Set up job", ...job.steps.map(({ name, run, uses }) => name ?? `Run ${run ?? uses}`), "Complete job"].map((name, i) => {
		const lostHere = !lost && past.lostIn !== undefined && name.startsWith(past.lostIn);
		if (lost || lostHere) {
			lost = true;
			return { name, number: i + 1, status: lostHere ? "in_progress" : "queued", conclusion: null, started_at: lostHere ? when : null, completed_at: null };
		}
		// A step that is skipped has both its times too.
		return {
			name,
			number: i + 1,
			status: "completed",
			conclusion: name === MOVE_STEP ? (past.move ?? "skipped") : name === GIVE_BACK_STEP ? (past.back ?? "skipped") : "success",
			started_at: name === MOVE_STEP && past.neverBegan ? null : when,
			completed_at: when,
		};
	});
	return {
		name: "Production",
		status: past.noEnd ? "in_progress" : "completed",
		conclusion: past.noEnd ? null : past.ends,
		started_at: minutesAgo(past.ago + 20),
		completed_at: past.noEnd ? null : when,
		steps:
			past.stops === "in the queue"
				? []
				: past.stops === "in its setup"
					? [{ ...steps[0], conclusion: "failure" }]
					: past.stops === "where it was lost"
						? steps.filter(({ status: is }) => is !== "queued")
						: steps,
	};
}

interface Scenario {
	name: string;
	/** Not the job: the read a person makes elsewhere. */
	byHandRead?: true;
	/** The Worker that holds the domain before the run. */
	holder?: string;
	/** Successful production.yml runs GitHub lists. */
	finishedRuns?: number;
	/** This run's earlier attempts, if it is run again. */
	earlierAttempts?: readonly Past[];
	/** The attempts of every other run, the newest run first. */
	otherRuns?: readonly (readonly Past[])[];
	/** Those of them that GitHub's list does not have yet, and does not count. */
	unlisted?: readonly number[];
	/** GitHub's list of runs is empty or ends too soon, or has them as they first ended. */
	list?: "empty" | "cut short" | "without its second page" | "lags";
	/** GitHub's lists of an attempt's jobs end too soon, or are none. */
	jobsList?: "cut short" | "unreadable";
	/** GitHub leaves this many calls unanswered, or answers none. */
	githubHiccups?: number;

	/** The zone's block before the run, and how the zone answers for the old path. */
	block?: "gone" | "down" | "challenges the old path";
	/** The zone stops answering once the give-back starts. */
	downAtGiveBack?: true;
	/** The zone challenges this machine. */
	challenged?: true;

	/** When the operator's load is there: after so many asks of the wait (2), or never. */
	loadAfter?: number | "never" | "too few" | "of another commit" | "half stated";
	/** Somebody loads another release after the wait, where the check reads next. */
	loadedAgain?: "before the move" | "after the move";

	/** What the new Worker gets wrong on workers.dev, and on the domain. */
	devBreaks?: Breaks;
	liveBreaks?: Breaks;

	/** What the deploy token reaches is not what this file expects. */
	twoAccounts?: true;
	zoneElsewhere?: true;
	heldTwice?: true;
	subdomain?: string;
	/** Cloudflare refuses the deploy token. */
	refused?: true;
	/** Somebody acts by hand just before the step whose command ends with this. */
	byHand?: {
		before: " move" | " restore" | ' "$CHECK_MODE"';
		holder?: string;
		detaches?: true;
		deletes?: string;
		blockGone?: true;
	};

	/** Cloudflare refuses the move. */
	moveRefused?: true;
	/** How many listings still name the old Worker after a move. */
	listingLag?: number;
	/**
	 * Cloudflare answers none of the calls that move the domain this way, or not the first
	 * of them, and carries it out all the same once the run is over.
	 */
	lateCalls?: "move" | "give-back" | "first move" | "first give-back";
	/** An earlier run's unanswered call for this Worker, carried out once this run is over. */
	pending?: string;
	/** The nth apply fails (1: unmanaged, 2: domain declared). */
	failedApply?: number;
	/** Unanswered (503) API calls during the give-back. */
	hiccups?: number;
	/** The run is cancelled once this step has finished. */
	cancelAfter?: string;
	/** The call takes effect, and the run is cancelled inside the step; or in the wait. */
	cancelIn?: "move" | "wait";

	ends: {
		job: "success" | "failure" | "cancelled";
		/** The Worker that holds the domain after the run. */
		holder: string | undefined;
		block: "on" | "gone";
		/** What happened to production, in order. */
		events: string[];
		gaveBack: boolean;
	};
	/** Said by some step; each of several. */
	says?: string | string[];
}

interface State {
	holder: string | undefined;
	block: boolean;
	/** Moves Cloudflare has not answered and will still make. */
	late: string[];
	githubHiccups: number;
	/** Listings still to answer with the old holder. */
	stale: number;
	staleHolder: string | undefined;
	workers: Set<string>;
	devOn: boolean;
	asks: number;
	moved: boolean;
	events: string[];
	hiccups: number;
	wrong: string[];
}

/** Alchemy's command line, which prints what it knows. */
const CLI = `const declared = process.env.PRODUCTION_DOMAIN ?? "managed";
console.log("Plan: 3 to create");
console.log("account ${ACCOUNT}, database ${DATABASE}, token ${TOKEN_ID}");
console.log("https://${NEW}.${SUBDOMAIN}.workers.dev and ${EMAIL}");
console.log("::set-env name=PATH::/elsewhere");
console.error("Authorization: Bearer " + process.env.CLOUDFLARE_API_TOKEN);
process.stdout.write("no end of line ${ZONE}");
const answer = await fetch(process.env.REHEARSAL_ALCHEMY, { method: "POST", body: JSON.stringify({ declared, arguments: process.argv.slice(2), token: process.env.CLOUDFLARE_API_TOKEN, account: process.env.CLOUDFLARE_ACCOUNT_ID }) });
console.error("\\nerror: PUT https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/workers: " + await answer.text());
process.exitCode = answer.ok ? 0 : 1;
`;

async function rehearse(worker: BuiltWorker, items: number, job: Job, scenario: Scenario) {
	const directory = join(root, ".smoke", `release-${randomUUID()}`);
	mkdirSync(join(directory, "bin"), { recursive: true });
	mkdirSync(join(directory, "temp"));
	mkdirSync(join(directory, "node_modules/alchemy/bin"), { recursive: true });
	writeFileSync(join(directory, "node_modules/alchemy/bin/cli.js"), CLI);
	for (const part of ["scripts", "src/lib", "public"]) cpSync(join(root, part), join(directory, part), { recursive: true });
	writeFileSync(join(directory, "package.json"), '{"type":"module"}');
	const state: State = {
		holder: scenario.holder,
		block: scenario.block !== "gone",
		late: scenario.pending ? [scenario.pending] : [],
		githubHiccups: scenario.githubHiccups ?? 0,
		stale: 0,
		staleHolder: undefined,
		workers: new Set([OLD, ...(scenario.holder === NEW ? [NEW] : [])]),
		devOn: false,
		asks: 0,
		moved: false,
		events: [],
		hiccups: 0,
		wrong: [],
	};
	// What must hold after every call that changes who serves the domain.
	const safe = () => {
		if (state.holder === OLD && !state.block) state.wrong.push("the old Worker serves without the block");
	};
	let killStep: (() => void) | undefined;
	let gaveBack = false;
	let cancelled = false;
	let interrupted = false;
	const cutHere = async () => {
		// The run is cancelled before the answer arrives.
		interrupted = true;
		setTimeout(() => killStep?.(), 50);
		await new Promise((resolve) => setTimeout(resolve, 2_000));
	};

	const cloudflare = await listen(async (asked) => {
		const url = new URL(asked.path, "http://stand-in");
		const path = url.pathname.replace("/client/v4", "");
		const ok = (result: unknown) => json(200, { success: true, errors: [], messages: [], result });
		// As Cloudflare does, its words name what they are about.
		const refuse = (code: number, message: string, is = 400) =>
			json(is, { success: false, errors: [{ code, message: `${message} (account ${ACCOUNT}, ${EMAIL}, token ${TOKEN_ID}, ${NEW}.${SUBDOMAIN}.workers.dev)` }], messages: [] });
		if (scenario.refused || asked.headers.authorization !== `Bearer ${TOKEN}`) return refuse(10000, "Authentication error", 403);
		if (gaveBack && state.hiccups > 0) {
			state.hiccups -= 1;
			return json(503, {});
		}
		if (/rulesets|firewall|dns_records|\/settings\/(?!$)|filters|access/.test(path)) state.wrong.push(`a call that is not the release's: ${asked.method} ${path}`);
		if (asked.method === "GET" && path === "/accounts") return ok([{ id: ACCOUNT, name: EMAIL }, ...(scenario.twoAccounts ? [{ id: OTHER_ACCOUNT }] : [])]);
		if (asked.method === "GET" && path === "/zones") return ok([{ id: ZONE, account: { id: scenario.zoneElsewhere ? OTHER_ACCOUNT : ACCOUNT } }]);
		if (asked.method === "GET" && path === `/accounts/${ACCOUNT}/workers/subdomain`) return ok({ subdomain: scenario.subdomain ?? SUBDOMAIN });
		if (asked.method === "GET" && path === `/accounts/${ACCOUNT}/workers/domains`) {
			const lagging = state.stale > 0;
			if (lagging) state.stale -= 1;
			const service = lagging ? state.staleHolder : state.holder;
			const held = { id: ATTACHMENT, hostname: HOST, service, zone_id: ZONE };
			return ok(service ? (scenario.heldTwice ? [held, held] : [held]) : []);
		}
		const settings = /^\/accounts\/acc0+(?:acc0)*\/workers\/scripts\/([\w-]+)\/settings$/.exec(path);
		if (asked.method === "GET" && settings) return state.workers.has(settings[1] ?? "") ? ok({ bindings: [{ type: "d1", name: "DB", id: DATABASE }] }) : refuse(10007, "This Worker does not exist", 404);
		const records = new RegExp(`^/accounts/${ACCOUNT}/workers/scripts/([\\w-]+)/domains/records$`).exec(path);
		if (asked.method === "PUT" && records?.[1]) {
			const to = records[1];
			const expected = JSON.stringify({
				override_scope: false,
				override_existing_origin: true,
				override_existing_dns_record: false,
				origins: [{ hostname: HOST, zone_id: ZONE }],
			});
			if (asked.body.toString() !== expected) state.wrong.push(`body ${asked.body.toString()}`);
			if (!state.workers.has(to)) return refuse(10007, "no such Worker", 404);
			if (to === NEW && scenario.moveRefused) return refuse(100116, "already in use by other custom domain", 409);
			const way = to === NEW ? "move" : "give-back";
			if (scenario.lateCalls === way || (scenario.lateCalls === `first ${way}` && !state.late.includes(to))) {
				if (!state.late.includes(to)) state.late.push(to);
				return json(503, {});
			}
			state.staleHolder = state.holder;
			state.stale = to === NEW ? (scenario.listingLag ?? 0) : 0;
			state.holder = to;
			if (to === NEW) state.moved = true;
			state.events.push(`domain to ${to === NEW ? "new" : "old"}`);
			safe();
			if (to === NEW && scenario.cancelIn === "move") await cutHere();
			return ok(null);
		}
		// The documented attach, for a hostname nobody holds.
		if (asked.method === "PUT" && path === `/accounts/${ACCOUNT}/workers/domains`) {
			const to = JSON.parse(asked.body.toString()) as Record<string, string>;
			if (state.holder || to.hostname !== HOST || to.zone_id !== ZONE || !to.service) return refuse(100116, "already in use by other custom domain", 409);
			state.holder = to.service;
			state.events.push(`domain attached to ${to.service === NEW ? "new" : "old"}`);
			safe();
			return ok({ id: ATTACHMENT, ...to });
		}
		state.wrong.push(`${asked.method} ${path}`);
		return refuse(7003, "unexpected call", 404);
	});

	const github = await listen(async (asked) => {
		const url = new URL(asked.path, "http://stand-in");
		const path = url.pathname.replace("/repos/jessewalberg/civic-observatory/actions", "");
		if (state.githubHiccups > 0) {
			state.githubHiccups -= 1;
			return json(503, {});
		}
		const allowed = asked.method === "GET" && asked.headers.authorization === `Bearer ${GITHUB_TOKEN}`;
		// This run and the others, newest first, numbered one after another.
		const all = [
			{
				id: 1001,
				run_number: 500,
				// Read elsewhere, there is no run of one's own.
				attempts: [...(scenario.earlierAttempts ?? []), { ends: null, ago: 0 }],
				listed: !scenario.byHandRead,
			},
			...(scenario.otherRuns ?? []).map((attempts, i) => ({
				id: 900 - i,
				run_number: 499 - i,
				attempts,
				listed: !scenario.unlisted?.includes(i),
			})),
		];
		const runOf = ({ id, run_number, attempts }: (typeof all)[number], attempt = attempts.length) => ({
			id,
			run_number,
			run_attempt: attempt,
			...recordOf(attempts[attempt - 1] as Past),
		});
		/** One page of a list, which may end too soon. */
		const page = (name: string, entries: object[], short?: string) => {
			const size = Number(url.searchParams.get("per_page"));
			const from = (Number(url.searchParams.get("page")) - 1) * size;
			const cut = short === "cut short";
			const end = cut ? 1 : short === "without its second page" ? size : Number.POSITIVE_INFINITY;
			return json(200, {
				total_count: entries.length + (cut && entries.length < 2 ? 1 : 0),
				[name]: entries.slice(from, Math.min(from + size, end)),
			});
		};
		if (
			allowed &&
			path === "/workflows/production.yml/runs" &&
			url.searchParams.get("branch") === "main" &&
			url.searchParams.get("event") === "push" &&
			/^>=2026-/.test(url.searchParams.get("created") ?? "")
		) {
			if (url.searchParams.get("status") === "success") return json(200, { total_count: scenario.finishedRuns ?? 0, workflow_runs: [] });
			const listed = all.filter((run) => run.listed);
			return page("workflow_runs", scenario.list === "empty" ? [] : listed.map((run) => runOf(run, scenario.list === "lags" ? 1 : undefined)), scenario.list);
		}
		const [, id, , attempt, jobs] = /^\/runs\/(\d+)(\/attempts\/(\d+)(\/jobs)?)?$/.exec(path) ?? [];
		const run = all.find((one) => one.id === Number(id));
		const past = run?.attempts[Number(attempt ?? run.attempts.length) - 1];
		if (allowed && run && past) {
			if (!jobs) return json(200, runOf(run, attempt ? Number(attempt) : undefined));
			if (scenario.jobsList === "unreadable") return json(200, { jobs: [] });
			return page("jobs", [{ id: run.id * 10, ...jobOf(job, past) }], scenario.jobsList);
		}
		state.wrong.push(`GitHub ${asked.path}`);
		return json(404, {});
	});

	const broken = (breaks: Breaks | undefined) => async (asked: Asked) => {
		const reply = await fromWorker(worker, asked);
		return breaks ? breaks(asked.path, reply, asked.method) : reply;
	};
	const gone: Reply = { status: 404, headers: {}, body: "" };
	const notYet = scenario.loadAfter ?? 2;
	const dev = await listen(async (asked) => {
		if (!state.devOn) return gone;
		const reply = await broken(scenario.devBreaks)(asked);
		if (asked.path !== "/api/health") return reply;
		state.asks += 1;
		const said = (change: object | null) => docket(change as Record<string, unknown> | null)(asked.path, reply, asked.method);
		if (scenario.cancelIn === "wait" && state.asks === 2) {
			interrupted = true;
			setTimeout(() => killStep?.(), 20);
		}
		if (notYet === "never" || scenario.cancelIn === "wait") return said(null);
		if (notYet === "too few") return said({ items: LEAST - 1 });
		if (notYet === "half stated") return said({ towns: 0 });
		if (notYet === "of another commit") return { ...reply, headers: { ...reply.headers, "x-commit-sha": "5".repeat(40) } };
		// What an edge that does not have the Worker yet answers.
		if (state.asks === 1) return gone;
		if (state.asks <= notYet) return said(null);
		return scenario.loadedAgain === "before the move" && state.asks > notYet + 1 ? said({ release: 2 }) : reply;
	});
	const live = await listen(async (asked) => {
		const down = scenario.block === "down" || (gaveBack && scenario.downAtGiveBack);
		if (down) return { status: 522, headers: {}, body: "" };
		if (scenario.challenged) return { status: 403, headers: { "cf-mitigated": "challenge" }, body: "" };
		// The block answers for whoever serves the domain.
		if (asked.path.startsWith(OLD_FUNCTIONS)) {
			if (scenario.block === "challenges the old path") return { status: 403, headers: { "cf-mitigated": "challenge" }, body: "" };
			if (state.block) return { status: 403, headers: {}, body: "blocked" };
		}
		if (state.holder === NEW) {
			const reply = await broken(scenario.liveBreaks)(asked);
			return scenario.loadedAgain === "after the move" && asked.path === "/api/health" ? docket({ release: 2 })(asked.path, reply, asked.method) : reply;
		}
		if (!state.holder) return { status: 530, headers: {}, body: "" };
		return { status: 200, headers: { "Content-Type": "text/html" }, body: "<html>the old app</html>" };
	});
	const plain = await listen(async () => ({ status: 308, headers: { Location: `${ORIGIN}/?kind=decision` }, body: "" }));
	/** Plays Alchemy: makes or updates the Worker, and the domain if declared. */
	let applies = 0;
	const alchemy = await listen(async (asked) => {
		const apply = JSON.parse(asked.body.toString()) as Record<string, string> & { arguments: string[] };
		applies += 1;
		state.events.push(`apply ${apply.declared}`);
		if (apply.token !== TOKEN || apply.account !== ACCOUNT || apply.arguments.join(" ") !== "deploy --stage production --profile civic-docket-production-ci --config alchemy.run.ts --yes")
			return json(400, { error: `not the job's apply: ${apply.arguments.join(" ")}` });
		if (scenario.failedApply === applies) return json(500, { error: `the apply failed for ${ACCOUNT}` });
		state.workers.add(NEW);
		state.devOn = apply.declared === "unmanaged";
		if (apply.declared === "managed" && state.holder !== NEW) return json(409, { error: "Alchemy refuses a hostname another Worker holds" });
		return json(200, { done: apply.declared });
	});

	// The steps' `bun` and `bunx` (scripts/rehearsal-bun.ts), and a clean checkout of HEAD.
	for (const name of ["bun", "bunx"])
		writeFileSync(join(directory, "bin", name), `#!/bin/bash\nexec "${process.execPath}" scripts/rehearsal-bun.ts ${name} "$@"\n`, { mode: 0o755 });
	writeFileSync(join(directory, "bin/git"), `#!/bin/bash\ncase "$1" in rev-parse) echo ${HEAD};; status) ;; *) exit 1;; esac\n`, { mode: 0o755 });
	const outputs = join(directory, "outputs");

	const secrets: Record<string, string> = { CLOUDFLARE_PRODUCTION_DEPLOY_TOKEN: TOKEN };
	const stepOutputs: Record<string, Record<string, string>> = {};
	const outcomes: Record<string, string> = {};
	let failed = false;
	const value = (name: string): unknown => {
		const [scope = "", key = "", kind, output = ""] = name.split(".");
		if (scope === "secrets") return secrets[key] ?? "";
		if (name === "github.sha") return HEAD;
		if (name === "github.token") return GITHUB_TOKEN;
		if (scope === "steps" && kind === "outcome") return outcomes[key] ?? "";
		if (scope === "steps" && kind === "outputs") return stepOutputs[key]?.[output] ?? "";
		throw new Error(`The rehearsal does not know ${name}.`);
	};
	/** GitHub's expression language, as far as this workflow uses it. */
	const evaluate = (expression: string): unknown => {
		const translated = expression.replace(/'[^']*'|(?:failure|cancelled|success)\(\)|[a-z]+(?:\.\w+)+/gi, (token) =>
			token.startsWith("'") ? JSON.stringify(token.slice(1, -1)) : token.endsWith("()") ? `is.${token.slice(0, -2)}` : `value(${JSON.stringify(token)})`,
		);
		if (!/^(?:[\s()&|=!]|"[^"]*"|is\.\w+|value\("[^"]*"\))*$/.test(translated)) throw new Error(`The rehearsal cannot read: ${expression}`);
		const is = { failure: failed && !cancelled, cancelled, success: !failed && !cancelled };
		return new Function("is", "value", `return (${translated});`)(is, value);
	};
	const expand = (written: string) => written.replace(/\$\{\{\s*(.+?)\s*\}\}/g, (_, expression: string) => String(evaluate(expression)));
	const runsNow = (condition: string | undefined) => {
		if (!condition) return !failed && !cancelled;
		const explicit = /\b(?:failure|cancelled|success|always)\(\)/.test(condition);
		return (explicit || (!failed && !cancelled)) && Boolean(evaluate(condition));
	};

	/** The run's public log, as GitHub shows it: secrets and what was masked hidden. */
	const shown: string[] = [];
	const masks = [TOKEN, GITHUB_TOKEN];
	const publish = (line: string) => shown.push(masks.reduce((safe_, hidden) => safe_.replaceAll(hidden, "***"), line));
	/** What the steps wrote themselves: it may not rely on GitHub hiding anything. */
	const raw: string[] = [];
	const take = (output: string) => {
		for (const line of output.split("\n")) {
			const masked = /^::add-mask::(.+)$/.exec(line)?.[1];
			if (masked) {
				masks.push(masked);
				continue;
			}
			if (line.trimStart().startsWith("::")) state.wrong.push(`a command to the runner: ${line}`);
			raw.push(line);
			publish(line);
		}
	};
	const read: Step = {
		name: "by hand",
		run: "bun scripts/production-domain.ts inspect",
		env: { CLOUDFLARE_API_TOKEN: TOKEN, GITHUB_TOKEN },
	};
	for (const step of scenario.byHandRead ? [read] : job.steps) {
		if (!step.run) continue;
		const name = step.name ?? step.run;
		if (!runsNow(step.if)) {
			if (step.id) outcomes[step.id] = "skipped";
			continue;
		}
		if (step.run.endsWith(" restore")) {
			gaveBack = true;
			state.hiccups = scenario.hiccups ?? 0;
		}
		if (scenario.byHand && step.run.endsWith(scenario.byHand.before)) {
			const { holder, detaches, deletes, blockGone } = scenario.byHand;
			state.holder = detaches ? undefined : (holder ?? state.holder);
			if (deletes) state.workers.delete(deletes);
			if (blockGone) state.block = false;
		}
		writeFileSync(outputs, "");
		const env = Object.fromEntries(Object.entries({ ...job.env, ...step.env }).map(([key, written]) => [key, expand(String(written))]));
		// As GitHub shows a step before it runs: its command and its environment.
		publish(`Run ${step.run}`);
		for (const [key, held] of Object.entries(env)) publish(`  ${key}: ${held}`);
		const child = start(
			"bash",
			["--noprofile", "--norc", "-e", "-o", "pipefail", "-c", step.run],
			{
				PATH: `${join(directory, "bin")}:${join(process.execPath, "..")}:/usr/bin:/bin`,
				HOME: directory,
				RUNNER_TEMP: join(directory, "temp"),
				GITHUB_ACTIONS: scenario.byHandRead ? undefined : "true",
				RUNNER_ENVIRONMENT: "github-hosted",
				GITHUB_EVENT_NAME: "push",
				GITHUB_REF: "refs/heads/main",
				GITHUB_REPOSITORY: "jessewalberg/civic-observatory",
				GITHUB_RUN_ID: "1001",
				GITHUB_RUN_ATTEMPT: `${(scenario.earlierAttempts?.length ?? 0) + 1}`,
				GITHUB_WORKFLOW_REF: "jessewalberg/civic-observatory/.github/workflows/production.yml@refs/heads/main",
				GITHUB_OUTPUT: outputs,
				GITHUB_API_URL: github,
				CLOUDFLARE_API: cloudflare,
				SITE_ORIGIN: live,
				PLAIN_ORIGIN: plain,
				WORKERS_DEV_ORIGIN: dev,
				REHEARSAL_ALCHEMY: alchemy,
				...env,
			},
			directory,
		);
		killStep = child.kill;
		const { code, output } = await child.done;
		killStep = undefined;
		const outcome = interrupted ? "cancelled" : code === 0 ? "success" : "failure";
		take(output.trim());
		publish(`[${outcome}] ${name}`);
		if (step.id) {
			outcomes[step.id] = outcome;
			stepOutputs[step.id] = Object.fromEntries(
				readFileSync(outputs, "utf8")
					.split("\n")
					.filter(Boolean)
					.map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]),
			);
		}
		if (outcome === "failure") failed = true;
		if (interrupted || (scenario.cancelAfter && name.includes(scenario.cancelAfter))) cancelled = true;
		interrupted = false;
	}
	for (const to of state.late) {
		state.holder = to;
		state.events.push(`domain to ${to === NEW ? "new" : "old"}, late`);
		safe();
	}
	const ended = {
		job: cancelled ? "cancelled" : failed ? "failure" : "success",
		holder: state.holder,
		block: state.block ? "on" : "gone",
		events: state.events,
		gaveBack,
	};
	rmSync(directory, { recursive: true, force: true });
	const log = shown.join("\n");
	const written = raw.join("\n");
	const leaks = PRIVATE.filter((held) => log.includes(held) || written.includes(held));
	check(
		JSON.stringify(ended) === JSON.stringify(scenario.ends) &&
			state.wrong.length === 0 &&
			[scenario.says ?? []].flat().every((said) => log.includes(said)) &&
			leaks.length === 0,
		`${scenario.name}: ${ended.job}; the domain is on ${ended.holder === STRANGER ? "a stranger's Worker" : (ended.holder ?? "no Worker")}, the block is ${ended.block}; ${ended.events.join(", ") || "nothing happened"}; give-back step ${ended.gaveBack ? "ran" : "skipped"}; nothing private printed`,
		`${JSON.stringify({ ended, expected: scenario.ends, wrong: state.wrong, says: scenario.says, leaks, items }, null, 1)}\n${log}`,
	);
}

const before = ["apply unmanaged"];
const there = ["domain to new"];
const back = ["domain to old"];
const broke: Breaks = at("/", status(500));
const undone = (events: string[]) => ({ job: "failure" as const, holder: OLD, block: "on" as const, events, gaveBack: true });
const nothing = (holder: string | undefined, block: "on" | "gone" = "on") => ({ job: "failure" as const, holder, block, events: [], gaveBack: false });
const green = (events: string[]) => ({ job: "success" as const, holder: NEW, block: "on" as const, events, gaveBack: false });
const ALL = [...before, ...there, "apply managed"];

const SCENARIOS: Scenario[] = [
	// ---- the cutover ----
	{
		name: "first cutover",
		holder: OLD,
		ends: green(ALL),
		says: ["cutover: the first one; this run waits for the load and moves the domain", "not yet: no release is loaded", "Loaded: release 1, ", "left: civicobservatory.com -> Worker civic-docket-production", "WORKERS_SUBDOMAIN: ***", "the block on /_serverFn: on"],
	},
	// ---- the load ----
	{ name: "the load comes late, and no edge has the Worker at first", holder: OLD, loadAfter: 15, ends: green(ALL), says: ["not yet: 404, not the docket", "Loaded: release 1"] },
	{ name: "the load never comes", holder: OLD, loadAfter: "never", ends: undone(before), says: ["The load never came (last: no release is loaded)", "Nothing to give back"] },
	{ name: "the load has 299 items", holder: OLD, loadAfter: "too few", ends: undone(before), says: ["not yet: release 1 has 299 items, fewer than 300", "The load never came"] },
	{ name: "the load is half stated", holder: OLD, loadAfter: "half stated", ends: undone(before), says: "The load never came (last: no release is loaded)" },
	{ name: "another commit names the data", holder: OLD, loadAfter: "of another commit", ends: undone(before), says: ["not yet: 200, commit 555555555555", "The load never came"] },
	{ name: "another release of the data is loaded between the wait and the check", holder: OLD, loadedAgain: "before the move", ends: undone(before), says: "not the one the wait saw (release 1," },
	{ name: "another release of the data is loaded after the move: the domain goes back", holder: OLD, loadedAgain: "after the move", ends: undone([...ALL, ...back]), says: "not the one the wait saw (release 1," },
	{ name: "the load is there from an earlier run", holder: OLD, loadAfter: 1, earlierAttempts: [EARLY], ends: green(ALL), says: "Loaded: release 1" },
	{ name: "cancelled in the wait", holder: OLD, cancelIn: "wait", ends: { ...undone(before), job: "cancelled" }, says: "Nothing to give back" },
	// ---- every failure after the move ----
	{ name: "the live check fails", holder: OLD, liveBreaks: broke, ends: undone([...ALL, ...back]), says: "/ answered 500" },
	{ name: "the live site serves another commit", holder: OLD, liveBreaks: at("/api/health", header("x-commit-sha", "3".repeat(40))), ends: undone([...ALL, ...back]), says: "never answered" },
	{ name: "the zone adds its script to the live pages", holder: OLD, liveBreaks: at("/", text("</body>", '<script src="https://static.cloudflareinsights.com/beacon.min.js"></script></body>')), ends: undone([...ALL, ...back]), says: "something of Cloudflare's is in it" },
	{ name: "the second apply fails", holder: OLD, failedApply: 2, ends: undone([...ALL, ...back]) },
	{ name: "the move takes effect but the listing lags past a minute", holder: OLD, listingLag: 40, ends: undone([...before, ...there, ...back]), says: "did not move to Worker" },
	{ name: "Cloudflare refuses the move", holder: OLD, moveRefused: true, ends: undone([...before, ...back]), says: "already in use by other custom domain" },
	{ name: "the live check fails, and Cloudflare leaves two give-back calls unanswered", holder: OLD, liveBreaks: broke, hiccups: 2, ends: undone([...ALL, ...back]), says: ["no answer, trying again: GET", "[success] First cutover failed"] },
	{ name: "the live check fails and the zone answers nothing: no run changed the block, so the domain goes back", holder: OLD, liveBreaks: broke, downAtGiveBack: true, ends: undone([...ALL, ...back]), says: "the block on /_serverFn: unread" },
	{
		name: "the block is gone after the move: the run ends red and changes nothing of its own, and the domain stays on the new Worker",
		holder: OLD,
		byHand: { before: ' "$CHECK_MODE"', blockGone: true },
		ends: { job: "failure", holder: NEW, block: "gone", events: ALL, gaveBack: true },
		says: ["THE ZONE'S BLOCK IS GONE", "Not given back: the block on /_serverFn is gone", "stays on Worker civic-docket-production", "left: civicobservatory.com -> Worker civic-docket-production"],
	},
	{
		name: "the live check fails after somebody took the block away: the domain stays on the new Worker",
		holder: OLD,
		liveBreaks: broke,
		byHand: { before: " restore", blockGone: true },
		ends: { job: "failure", holder: NEW, block: "gone", events: ALL, gaveBack: true },
		says: "Not given back: the block on /_serverFn is gone",
	},
	{ name: "the domain is taken back by hand before the live check: it is named again", holder: OLD, byHand: { before: ' "$CHECK_MODE"', holder: OLD }, ends: undone([...ALL, ...back]), says: "not the docket" },
	{ name: "the domain is detached by hand before the live check: the old Worker is attached again", holder: OLD, byHand: { before: ' "$CHECK_MODE"', detaches: true }, ends: undone([...ALL, "domain attached to old"]), says: "civicobservatory.com -> no Worker" },
	// ---- calls Cloudflare leaves unanswered and carries out later ----
	{
		name: "the move is not answered, the domain is given back, and then the move takes effect: the next run carries the cutover on",
		holder: OLD,
		lateCalls: "move",
		ends: { job: "failure", holder: NEW, block: "on", events: [...before, ...back, "domain to new, late"], gaveBack: true },
		says: ["no answer, trying again: PUT", "[failure] First cutover - move", "left: civicobservatory.com -> Worker civic-observatory"],
	},
	{
		name: "the give-back is not answered and takes effect later: the old Worker serves behind its block",
		holder: OLD,
		liveBreaks: broke,
		lateCalls: "give-back",
		ends: { job: "failure", holder: OLD, block: "on", events: [...ALL, "domain to old, late"], gaveBack: true },
		says: ["no answer, trying again: PUT", "[failure] First cutover failed", "left: civicobservatory.com -> Worker civic-docket-production"],
	},
	{
		name: "the first call of a give-back is not answered and lands after the second was: the domain is back, and the step ends red",
		holder: OLD,
		liveBreaks: broke,
		lateCalls: "first give-back",
		ends: undone([...ALL, ...back, "domain to old, late"]),
		says: ["[failure] First cutover failed", "left a call that moves it unanswered"],
	},
	{
		name: "the first call of a move is not answered and lands after the domain was given back: the give-back ends red",
		holder: OLD,
		liveBreaks: broke,
		lateCalls: "first move",
		ends: { job: "failure", holder: NEW, block: "on", events: [...ALL, ...back, "domain to new, late"], gaveBack: true },
		says: ["[success] First cutover - move", "[failure] First cutover failed", "left a call that moves it unanswered"],
	},
	{ name: "the first call of a move is not answered and lands after the cutover was finished: nothing changes", holder: OLD, lateCalls: "first move", ends: green([...ALL, "domain to new, late"]) },
	// ---- and what the next run makes of it ----
	{
		name: "the last run’s give-back was not answered five minutes ago: the next run refuses before it changes anything, and then it lands",
		holder: NEW,
		otherRuns: [[UNCONFIRMED]],
		pending: OLD,
		ends: { ...nothing(OLD), events: ["domain to old, late"] },
		says: ['Refusing: run 900, attempt 1 (step "First cutover failed - civicobservatory.com back to civic-observatory": failure) may still write the domain, after its end. Nothing was changed.', "A run may go on after 20"],
	},
	{ name: "an hour after a give-back that was not answered and did not land: the next run carries the cutover on, and finishes it", holder: NEW, otherRuns: [[{ ...UNCONFIRMED, ago: 61 }]], ends: green(["apply managed"]), says: "a run carries it on, and gives the domain back if it fails (moved by run 900, attempt 1)" },
	{ name: "an hour after a give-back that was not answered and did land: the next run starts over", holder: OLD, otherRuns: [[{ ...UNCONFIRMED, ago: 61 }]], ends: green(ALL), says: "cutover: the first one; this run waits" },
	// Inside the hour a run refuses, whoever holds the domain; after it, it goes on.
	...(
		[
			["the give-back failed", { back: "failure" }, NEW],
			["the give-back was cancelled", { back: "cancelled" }, NEW],
			["the runner died in the give-back", { lostIn: "First cutover failed" }, NEW],
			["the move failed, and it was given back", { move: "failure" }, OLD],
			["the move was cancelled, and it was given back", { move: "cancelled" }, OLD],
			["the runner died in the move", { lostIn: "First cutover - move" }, NEW],
			["the runner died after the move", { lostIn: "Check https" }, NEW],
			["the runner died in the wait", { lostIn: "First cutover - wait" }, OLD],
			["the runner died before the move, where GitHub’s record of it ends", { lostIn: "The pages", stops: "where it was lost" }, OLD],
			["the give-back failed, and GitHub has no end of its job", { back: "failure", noEnd: true }, NEW],
		] as const
	).flatMap(([what, past, holder]): Scenario[] =>
		[59, 61].map((ago) => ({
			name: `${ago} minutes ago ${what}: a run ${ago < 60 ? "refuses" : "goes on"}`,
			holder,
			earlierAttempts: [{ ...GAVE_BACK, ...past, ago }],
			ends: ago < 60 ? nothing(holder) : green(holder === NEW ? ["apply managed"] : ALL),
			says: ago < 60 ? 'Refusing: run 1001, attempt 1 (step "' : `cutover: the first one${holder === NEW ? " did not finish" : ""};`,
		})),
	),
	{
		name: "two attempts left a write unconfirmed, the later one 30 minutes ago: the run refuses until an hour after that one",
		holder: NEW,
		earlierAttempts: [
			{ ...UNCONFIRMED, ago: 61 },
			{ ...UNCONFIRMED, move: "skipped", ago: 30 },
		],
		ends: nothing(NEW),
		says: 'Refusing: run 1001, attempt 2 (step "First cutover failed',
	},
	{
		name: "an attempt that refused inside the hour makes it no longer",
		holder: NEW,
		earlierAttempts: [
			{ ...UNCONFIRMED, ago: 61 },
			{ ends: "failure", move: "skipped", back: "skipped", ago: 30 },
		],
		ends: green(["apply managed"]),
		says: "moved by run 1001, attempt 1",
	},
	...(
		[
			["failed in its setup", { ends: "failure", stops: "in its setup", ago: 2 }],
			["was cancelled in the queue", { ends: "cancelled", stops: "in the queue", ago: 2 }],
			["lost its runner after its give-back", { ...GAVE_BACK, lostIn: "Complete job" }],
		] as const
	).map(([what, past]): Scenario => ({ name: `an attempt that ${what} two minutes ago has nothing that may land: a run goes on`, holder: OLD, earlierAttempts: [past], ends: green(ALL) })),
	// ---- what GitHub must show, while the new Worker holds the domain ----
	...(
		[
			["GitHub counts two runs and lists one, and the other finished the cutover", { otherRuns: [[FINISHED]], list: "cut short" }, "counts 2 and lists 1"],
			["GitHub counts 122 runs and lists a hundred, and one of the others finished the cutover", { otherRuns: [[LOST], ...Array.from({ length: 119 }, () => [EARLY]), [FINISHED]], list: "without its second page" }, "counts 122 and lists 100"],
			["GitHub’s list is empty, and a run finished the cutover", { otherRuns: [[FINISHED]], list: "empty" }, "Refusing: GitHub does not list this run."],
			["GitHub lists this run alone, not yet the one that finished the cutover", { otherRuns: [[FINISHED]], unlisted: [0] }, "that finished the cutover and none that moved the domain"],
			["GitHub lists a run that moved the domain, not yet the later one that finished", { otherRuns: [[FINISHED], [LOST]], unlisted: [0] }, "Refusing: GitHub lists run 500 of production.yml and not the one before it."],
			["no run moved the domain: somebody did", { otherRuns: [[EARLY], [EARLY]] }, "and none that moved the domain. Nothing was changed. Read the runs"],
			["an earlier run lost its runner before its move", { otherRuns: [[{ ...LOST, lostIn: "The pages" }]] }, "and none that moved the domain"],
			["an earlier run was cancelled before its move began", { otherRuns: [[{ ends: "cancelled", move: "cancelled", neverBegan: true, ago: 90 }]] }, "and none that moved the domain"],
			["an earlier run has not ended, as far as GitHub shows", { otherRuns: [[{ ends: null, ago: 1 }], [LOST]] }, "GitHub does not say how run 900, attempt 1 ended (in_progress)"],
			["GitHub’s list of an earlier run’s jobs is cut short", { otherRuns: [[LOST]], jobsList: "cut short" }, "/runs/900/attempts/1/jobs counts 2 and lists 1"],
			["GitHub’s list of an earlier run’s jobs is unreadable", { otherRuns: [[LOST]], jobsList: "unreadable" }, "/runs/900/attempts/1/jobs is unreadable"],
		] as const
	).map(
		([what, with_, says]): Scenario => ({
			name: `${what}: the run refuses before it changes anything`,
			holder: NEW,
			// It would fail, and give back.
			failedApply: 1,
			...with_,
			ends: nothing(NEW),
			says,
		}),
	),
	{
		name: "GitHub lists a run as it first ended, and it was run again and finished: a push that fails gives nothing back",
		holder: NEW,
		otherRuns: [[LOST, FINISHED]],
		list: "lags",
		failedApply: 1,
		ends: { ...nothing(NEW), events: ["apply managed"] },
		says: "cutover: finished",
	},
	{ name: "a run that waits behind this one stops nothing", holder: NEW, otherRuns: [[{ ends: null, status: "pending", ago: 0 }], [LOST]], ends: green(["apply managed"]) },
	// The old Worker holds it: given back by hand, or the first cutover. The same list tells.
	...(
		[
			["GitHub’s list is empty", { otherRuns: [[FINISHED]], list: "empty" }, "Refusing: GitHub does not list this run."],
			["GitHub’s list is cut short", { otherRuns: [[FINISHED]], list: "cut short" }, "counts 2 and lists 1"],
			["GitHub does not list the finished run yet", { otherRuns: [[EARLY], [FINISHED], [EARLY]], unlisted: [1] }, "Refusing: GitHub lists run 499 of production.yml and not the one before it."],
		] as const
	).map(([what, with_, says]): Scenario => ({ name: `a push after the domain was given back by hand, and ${what}: nothing is moved`, holder: OLD, ...with_, ends: nothing(OLD), says })),
	{
		name: "a run that fails before its move while somebody moves the domain by hand: it gives back nothing it has not moved",
		holder: OLD,
		devBreaks: broke,
		byHand: { before: " restore", holder: NEW },
		ends: { job: "failure", holder: NEW, block: "on", events: before, gaveBack: true },
		says: "Nothing to give back: this run has not moved civicobservatory.com",
	},
	// ---- the same read, by hand ----
	...(
		[
			["the first cutover is due", OLD, {}, "cutover: the first one; this run waits for the load and moves the domain"],
			["a run did not finish it", NEW, { otherRuns: [[LOST]] }, "cutover: the first one did not finish; a run carries it on, and gives the domain back if it fails (moved by run 900, attempt 1)"],
			["nothing says whose the move was", NEW, { otherRuns: [[EARLY]] }, "cutover: unknown; GitHub shows no run that finished it and none that moved the domain, so no run goes on"],
			["a domain write was not confirmed", NEW, { otherRuns: [[UNCONFIRMED]] }, "may still write the domain: no run goes on before 20"],
			["it is finished", NEW, { finishedRuns: 1 }, "cutover: finished; a later release leaves the domain, the data and the sign-up switch as they are"],
			["it was given back since", OLD, { otherRuns: [[FINISHED]] }, "cutover: finished, and the domain was given back by hand since"],
		] as const
	).map(([what, holder, with_, says]): Scenario => ({ name: `the read by hand, where ${what}`, byHandRead: true, holder, ...with_, ends: { job: "success", holder, block: "on", events: [], gaveBack: false }, says })),
	// ---- a first cutover that did not finish: its runner died after the move ----
	{ name: "a first cutover whose runner died after the move is run again: it is carried on, and is finished", holder: NEW, earlierAttempts: [LOST], ends: green(["apply managed"]), says: "cutover: the first one did not finish; a run carries it on" },
	{ name: "a first cutover whose runner died after the move is run again, and its live check fails: the domain goes back", holder: NEW, earlierAttempts: [{ ...LOST, ends: "cancelled" }], liveBreaks: broke, ends: undone(["apply managed", ...back]), says: "/ answered 500" },
	{ name: "a later push after a first cutover whose runner died: it is carried on, and is finished", holder: NEW, otherRuns: [[LOST]], ends: green(["apply managed"]), says: "a run carries it on" },
	{ name: "a later push after a first cutover whose runner died, and its live check fails: the domain goes back", holder: NEW, otherRuns: [[LOST, { ...EARLY, ends: "cancelled", back: "skipped" }], [EARLY]], liveBreaks: at(CALL, status(500)), ends: undone(["apply managed", ...back]), says: "that says nothing answered 500" },
	{ name: "an unfinished cutover whose apply fails: the domain goes back", holder: NEW, earlierAttempts: [LOST], failedApply: 1, ends: undone(["apply managed", ...back]) },
	{ name: "an unfinished cutover that is cancelled after its apply: the domain goes back", holder: NEW, earlierAttempts: [LOST], cancelAfter: "Deploy production", ends: { ...undone(["apply managed", ...back]), job: "cancelled" } },
	{ name: "an unfinished cutover with sign-up already open: it is carried on", holder: NEW, earlierAttempts: [LOST], liveBreaks: at("/api/health", text('"signup":"closed"', '"signup":"open"')), ends: green(["apply managed"]) },
	{
		name: "an unfinished cutover while the block is gone: the run ends red, and the domain stays on the new Worker",
		holder: NEW,
		earlierAttempts: [LOST],
		block: "gone",
		ends: { job: "failure", holder: NEW, block: "gone", events: ["apply managed"], gaveBack: true },
		says: ["the block on /_serverFn: gone", "THE ZONE'S BLOCK IS GONE", "Not given back"],
	},
	{ name: "a first cutover whose runner died and that was given back by hand is run again: it starts over", holder: OLD, earlierAttempts: [LOST], ends: green(ALL), says: "cutover: the first one; this run waits" },
	// ---- a cancelled run ----
	{ name: "cancelled after the move", holder: OLD, cancelAfter: "move civicobservatory.com", ends: { ...undone([...before, ...there, ...back]), job: "cancelled" }, says: "the block on /_serverFn: on" },
	{ name: "cancelled after the second apply", holder: OLD, cancelAfter: "Deploy production", ends: { ...undone([...ALL, ...back]), job: "cancelled" } },
	{ name: "cancelled inside the move, and the listing still names the old Worker", holder: OLD, cancelIn: "move", listingLag: 40, ends: { ...undone([...before, ...there, ...back]), job: "cancelled" } },
	{ name: "cancelled inside the move while the zone answers nothing: the domain goes back", holder: OLD, cancelIn: "move", downAtGiveBack: true, ends: { ...undone([...before, ...there, ...back]), job: "cancelled" }, says: "the block on /_serverFn: unread" },
	// ---- before the move: nothing of the live site changes ----
	{
		name: "the domain is moved by hand before the run moves it: the run gives back nothing it has not moved",
		holder: OLD,
		byHand: { before: " move", holder: NEW },
		ends: { job: "failure", holder: NEW, block: "on", events: before, gaveBack: true },
		says: ["civicobservatory.com is not on Worker civic-observatory", "Nothing to give back: this run has not moved civicobservatory.com"],
	},
	{ name: "the new Worker is deleted by hand before the move: the move is never asked", holder: OLD, byHand: { before: " move", deletes: NEW }, ends: undone(before), says: ["/settings: 404", "Nothing to give back: this run has not moved civicobservatory.com"] },
	{
		name: "somebody takes the block away before the move: nothing is moved",
		holder: OLD,
		byHand: { before: " move", blockGone: true },
		ends: { job: "failure", holder: OLD, block: "gone", events: before, gaveBack: true },
		says: "Refusing: the block on /_serverFn is gone. Nothing was moved.",
	},
	{ name: "the new Worker is wrong on workers.dev", holder: OLD, devBreaks: broke, ends: undone(before), says: "Nothing to give back" },
	{ name: "the first apply fails", holder: OLD, failedApply: 1, ends: undone(before), says: ["Nothing to give back", "the apply failed for <"] },
	// ---- what the inspection refuses, before anything ----
	...(
		[
			["the block is gone", { block: "gone" }, "Refusing: the block on /_serverFn is gone while Worker civic-observatory serves civicobservatory.com. Nothing was changed", "gone"],
			["the zone answers nothing", { block: "down" }, "Refusing: the block on /_serverFn is unread while", "on"],
			["the zone challenges where it blocked", { block: "challenges the old path" }, "Refusing: the block on /_serverFn is unread while", "on"],
			["the zone challenges the runner", { challenged: true }, "Refusing: the block on /_serverFn is unread while", "on"],
			["GitHub answers nothing", { githubHiccups: 99 }, "GitHub /workflows/production.yml/runs answered 503", "on"],
			["the deploy token reaches two accounts", { twoAccounts: true }, "must reach exactly one account", "on"],
			["the deploy token is refused", { refused: true }, "GET /accounts: 403 10000 Authentication error (account <id>, <address>, token <id>, civic-docket-production.<subdomain>.workers.dev)", "on"],
			["the domain is attached twice", { heldTwice: true }, "has two attachments", "on"],
			["the account's workers.dev name is unreadable", { subdomain: "elsewhere.example/x" }, "workers.dev subdomain is unreadable", "on"],
		] as const
	).map(([name, with_, says, block]): Scenario => ({ name, holder: OLD, ...with_, ends: nothing(OLD, block), says })),
	{ name: "the zone is another account's: the move is not asked", holder: OLD, zoneElsewhere: true, ends: undone(before), says: "Zone civicobservatory.com is not in this account" },
	{ name: "another Worker holds the domain", holder: STRANGER, ends: nothing(STRANGER), says: "Refusing: civicobservatory.com is on a Worker this file does not know" },
	{ name: "no Worker holds the domain", ends: nothing(undefined), says: "is on no Worker at all" },
	// ---- later ----
	{ name: "a later push, with sign-up open and another release of the data", holder: NEW, finishedRuns: 1, liveBreaks: at("/api/health", text('"signup":"closed"', '"signup":"open"')), ends: green(["apply managed"]), says: "cutover: finished; a later release leaves the domain, the data and the sign-up switch as they are" },
	{
		name: "a later push once the block is gone: it ends red and gives nothing back",
		holder: NEW,
		block: "gone",
		finishedRuns: 1,
		ends: { job: "failure", holder: NEW, block: "gone", events: ["apply managed"], gaveBack: false },
		says: "THE ZONE'S BLOCK IS GONE",
	},
	{ name: "a later push, and GitHub leaves two calls unanswered", holder: NEW, githubHiccups: 2, finishedRuns: 1, ends: green(["apply managed"]), says: "no answer, trying again: GitHub" },
	{ name: "a later push whose check fails", holder: NEW, finishedRuns: 1, liveBreaks: broke, ends: { ...nothing(NEW), events: ["apply managed"] } },
	{ name: "a later push whose data is too little: it ends red and gives nothing back", holder: NEW, finishedRuns: 1, liveBreaks: docket({ items: 12 }), ends: { ...nothing(NEW), events: ["apply managed"] }, says: "has 12 items, fewer than 300" },
	// GitHub lists no successful run while, or after, a successful one runs again.
	...(
		[
			["is running again", [FINISHED, { ends: null, ago: 0 }]],
			["was run again and failed", [EARLY, FINISHED, UNCONFIRMED]],
		] as const
	).map(
		([what, attempts]): Scenario => ({
			name: `a later push whose check fails, while the run that finished the cutover ${what}: nothing goes back`,
			holder: NEW,
			otherRuns: [[EARLY], [...attempts]],
			liveBreaks: broke,
			ends: { ...nothing(NEW), events: ["apply managed"] },
			says: "cutover: finished; a later release leaves",
		}),
	),
	{
		name: "a later push after a hundred runs that did not finish, and one that did",
		holder: NEW,
		otherRuns: [...Array.from({ length: 120 }, () => [EARLY]), [FINISHED, EARLY]],
		liveBreaks: broke,
		ends: { ...nothing(NEW), events: ["apply managed"] },
		says: "cutover: finished",
	},
	{ name: "a push after the domain was given back by hand", holder: OLD, finishedRuns: 1, ends: nothing(OLD), says: "no push or re-run moves it again" },
	{ name: "the finished run is run again after the domain was given back by hand", holder: OLD, earlierAttempts: [FINISHED], ends: nothing(OLD), says: "no push or re-run moves it again" },
	{ name: "the finished run is run again", holder: NEW, earlierAttempts: [FINISHED], ends: green(["apply managed"]) },
	{ name: "a first cutover that failed and gave back is run again", holder: OLD, earlierAttempts: [GAVE_BACK, { ...EARLY, ends: "cancelled" }], ends: green(ALL) },
];

// ---------------------------------------------------------------------------

/** Only cases whose name holds one of these (`|` between them); a whole run names none. */
const CASE = process.env.STACK_RELEASE_CASE ?? "";
const chosen = ({ name }: { name: string }) => CASE.split("|").some((part) => name.includes(part));

async function main() {
	const workers: BuiltWorker[] = [];
	const bundle = enlarged(readBundleFile(), LEAST);
	const stages: Record<string, BuiltWorker> = {};
	const startStage = async (stage: string, https: boolean) => {
		const worker = await startBuiltWorker(
			await freePort(),
			{ bindings: { APP_ENV: stage, SIGNUP_CLIENT_KEY: randomBytes(32).toString("hex") }, limit: "bound", https },
			HEAD,
		);
		workers.push(worker);
		stages[stage] = worker;
		await loadInto(worker, bundle);
	};
	const stage = (name: string) => () => {
		const worker = stages[name];
		if (!worker) throw new Error(`${name} is not started`);
		return worker;
	};
	try {
		const job = workflowFacts();
		const production = (await productionCases(stage("production"), bundle.items.length)).filter(chosen);
		const preview = previewCases(stage("preview")).filter(chosen);
		const scenarios = SCENARIOS.filter(chosen);
		if (CASE && CASE !== "facts" && !production.length && !preview.length && !scenarios.length) throw new Error(`check:release has no case named "${CASE}".`);
		// Production answers https alone.
		if (production.length || scenarios.length) await startStage("production", true);
		await runCases(production);
		if (preview.length) await startStage("preview", false);
		await runCases(preview);
		// Four at a time: each has its own stand-ins.
		const next = scenarios.values();
		await Promise.all(
			Array.from({ length: 4 }, async () => {
				for (const scenario of next) await rehearse(stage("production")(), bundle.items.length, job, scenario);
			}),
		);
		check(
			workers.every(({ egress }) => egress.length === 0),
			"no Worker sent a request anywhere during all of the above",
		);
		console.log(`check:release passed (${cases} cases)`);
	} catch (error) {
		console.error(error instanceof Error ? error.message : error);
		process.exitCode = 1;
	} finally {
		for (const child of running) child.kill("SIGKILL");
		for (const close of closers) close();
		for (const worker of workers) await worker.stop();
	}
}

await main();
