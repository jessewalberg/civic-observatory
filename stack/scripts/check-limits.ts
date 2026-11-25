// `bun run check:limits`: the rate limit, the body limit, the headers of static
// files, the old function path, robots and https (stack/README.md, "Limits and
// headers"; no unit tests, Jesse 2026-10-09). Local only. Callers are
// documentation addresses (RFC 5737, 3849).
//
// Miniflare counts in whole clock minutes; Cloudflare's own counter is
// approximate and per location, so this proves the Worker's side: which calls
// are counted, by whom, and what a caller past the limit gets.
import { readdirSync, readFileSync } from "node:fs";
import type { Browser } from "@playwright/test";
import { CALLS, limitPolicy, MAX_CALL_BYTES } from "../src/lib/limits";
import { FUNCTIONS, OLD_FUNCTIONS, ORIGIN } from "../src/lib/site";
import { type BuiltWorker, startBuiltWorker } from "./built-worker";
import {
	checks,
	launch,
	loadInto,
	read,
	readBundleFile,
	root,
} from "./harness";

const { expect, must, done } = checks("check:limits");
const KEY = "k".repeat(40);
const STAGE = { APP_ENV: "preview", SIGNUP_CLIENT_KEY: KEY };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
/** Waits for a clock minute with at least `seconds` left in it. */
async function minuteWith(seconds: number) {
	const left = 60_000 - (Date.now() % 60_000);
	if (left < seconds * 1_000) await sleep(left + 250);
}

interface Call {
	path: string;
	body: string;
}

let worker: BuiltWorker | undefined;
let browser: Browser | undefined;
const app = () => worker as BuiltWorker;

/** The calls the page makes, as the browser made them. */
async function callsOfThePage(): Promise<Call[]> {
	await app().sql("UPDATE settings SET signup_open = 1");
	const page = await (browser as Browser).newPage();
	const calls: Call[] = [];
	page.on("request", (request) => {
		const path = new URL(request.url()).pathname;
		if (request.method() === "POST" || path.startsWith(FUNCTIONS))
			calls.push({ path, body: request.postData() ?? "" });
	});
	await page.goto(app().base(), { waitUntil: "networkidle" });
	must(calls.length === 0, "a page loaded whole calls no function");
	await page.locator('form[data-ready="true"]').waitFor();
	await page.fill('input[name="email"]', "limits@example.com");
	await page.selectOption('select[name="role"]', "resident");
	await page.locator('input[name="towns"]').first().check();
	await page.click('button[type="submit"]:has-text("Sign up")');
	await page.waitForTimeout(500);
	must(
		calls.length === 1 && calls[0]?.path.startsWith(`${FUNCTIONS}/`) === true,
		`the page's first call is under ${FUNCTIONS}/`,
	);
	await page.getByRole("button", { name: /^Tell me/ }).click();
	await page.getByText("Noted.").waitFor();
	await page.getByRole("button", { name: "Remove my address" }).click();
	await page.getByText("Done.").waitFor();
	await page.close();
	expect(
		calls.length === 3 &&
			calls.every(({ path }) => path.startsWith(`${FUNCTIONS}/`)) &&
			new Set(calls.map(({ path }) => path)).size === 3,
		`the page makes three calls, all under ${FUNCTIONS}/`,
	);
	return calls;
}

const call = (
	{ path, body }: Call,
	address: string | null,
	init: RequestInit = {},
) =>
	app().send(path, {
		method: "POST",
		headers: {
			...(address ? { "CF-Connecting-IP": address } : {}),
			"content-type": "application/json",
			"x-tsr-serverfn": "true",
			accept: "application/json",
			origin: app().base(),
			"sec-fetch-site": "same-origin",
		},
		body,
		...init,
	});

async function repeat(count: number, send: () => Promise<Response>) {
	const statuses: number[] = [];
	for (let sent = 0; sent < count; sent += 20)
		statuses.push(
			...(await Promise.all(
				Array.from({ length: Math.min(20, count - sent) }, async () => {
					const response = await send();
					await response.arrayBuffer();
					return response.status;
				}),
			)),
		);
	return statuses;
}

async function rateLimit(calls: Call[]) {
	// Removing with a token nobody has costs little and answers 200.
	const remove = calls[2] as Call;
	await app().configure({ bindings: STAGE, limit: "bound" });
	await minuteWith(30);
	const allowed = await repeat(CALLS.calls, () => call(remove, "192.0.2.1"));
	expect(
		allowed.length === CALLS.calls && allowed.every((status) => status === 200),
		`${CALLS.calls} calls in a minute from one address are answered`,
	);
	const over = await call(remove, "192.0.2.1");
	expect(
		over.status === 429 &&
			over.headers.get("retry-after") === String(CALLS.period) &&
			over.headers.get("ratelimit-policy") === limitPolicy &&
			over.headers.get("cache-control") === "no-store",
		"the next one answers 429, with Retry-After, the limit and no-store",
	);
	for (const other of calls.slice(0, 2))
		must(
			(await call(other, "192.0.2.1")).status === 429,
			"every function counts as one",
		);
	must(
		(await call({ ...remove, path: `${remove.path}/again` }, "192.0.2.1"))
			.status === 429 &&
			(await call({ ...remove, path: `${remove.path}?x=1` }, "192.0.2.1"))
				.status === 429,
		"a suffix or a query is no way around it",
	);
	expect(
		(await call(remove, "192.0.2.2")).status === 200,
		"every function is counted together; another address is not affected",
	);
	const pages = await repeat(120, () =>
		app().send("/terms", { headers: { "CF-Connecting-IP": "192.0.2.1" } }),
	);
	expect(
		pages.every((status) => status === 200),
		"120 pages asked by the address that used its limit up are answered",
	);
	await repeat(CALLS.calls / 2, () => call(remove, "2001:db8:1:2::1"));
	await repeat(CALLS.calls / 2, () => call(remove, "2001:DB8:1:2:ffff:0:0:9"));
	expect(
		(await call(remove, "2001:db8:0001:0002:aaaa:bbbb:cccc:dddd")).status ===
			429 && (await call(remove, "2001:db8:1:3::1")).status === 200,
		"an IPv6 /64 is one caller, its neighbour another",
	);
	await app().configure({ bindings: STAGE, limit: "broken" });
	const broken = await call(remove, "192.0.2.1");
	expect(broken.status === 200, "a limiter that cannot answer stops nobody");
	await app().configure({ bindings: STAGE });
	expect(
		!(await call(remove, "192.0.2.1")).headers.has("ratelimit-policy"),
		"a stage without the limit does not claim one",
	);
}

async function bodies(calls: Call[]) {
	const signup = calls[0] as Call;
	const before = JSON.stringify(
		await app().sql("SELECT count(*) AS n FROM signups"),
	);
	const large = "x".repeat(MAX_CALL_BYTES + 1);
	const stream = (text: string) =>
		({ body: new Blob([text]).stream(), duplex: "half" }) as RequestInit;
	expect(
		(await call({ ...signup, body: large }, "192.0.2.10")).status === 413,
		`a body over ${MAX_CALL_BYTES} bytes answers 413`,
	);
	expect(
		(await call(signup, "192.0.2.10", stream(large))).status === 413,
		"and one that states no length",
	);
	const read_ = await call(signup, "192.0.2.10", stream(signup.body));
	expect(
		read_.status === 200,
		"the page's own call that states no length is answered",
	);
	const form = new FormData();
	form.set("email", "form@example.com");
	must(
		(
			await app().send(signup.path, {
				method: "POST",
				headers: {
					origin: app().base(),
					"x-tsr-serverfn": "true",
					accept: "application/json",
					"sec-fetch-site": "same-origin",
				},
				body: form,
			})
		).status === 400,
		"a form is not how a page calls",
	);
	const bad = await app().send(`${signup.path}?payload=leak@example.com`, {
		headers: {
			accept: "application/json",
			"x-tsr-serverfn": "true",
			"sec-fetch-site": "same-origin",
			origin: app().base(),
		},
	});
	expect(
		bad.status === 400 || bad.status === 403,
		`an unreadable payload answers ${bad.status}`,
	);
	await app().sql("DELETE FROM signups");
	must(before !== "", "counted");
}

async function oldPath() {
	for (const method of ["GET", "POST", "PUT", "OPTIONS"])
		for (const path of [
			OLD_FUNCTIONS,
			`${OLD_FUNCTIONS}/abc`,
			`${OLD_FUNCTIONS}/abc?payload=%7B%7D`,
			"/_SERVERFN/abc",
		]) {
			const answer = await app().send(path, {
				method,
				headers: {
					accept: "application/json",
					origin: app().base(),
					"sec-fetch-site": "same-origin",
				},
			});
			must(
				answer.status === 404 &&
					answer.headers.get("cache-control") === "no-store" &&
					(await answer.text()) === "Not found",
				`${method} ${path} answers ${answer.status}`,
			);
		}
	const files = (folder: string) =>
		readdirSync(`${root}${folder}`, { recursive: true })
			.map(String)
			.filter((path) => path.endsWith(".js"))
			.map((path) => readFileSync(`${root}${folder}/${path}`, "utf8"));
	const client = files("dist/client").join("\n");
	expect(
		!client.includes(OLD_FUNCTIONS) && client.includes(FUNCTIONS),
		`nothing answers under ${OLD_FUNCTIONS}, and the browser's files never name it`,
	);
	expect(
		!/SIGNUP_CLIENT_KEY|signup_attempts|INSERT INTO|SELECT /.test(client),
		"the browser's files hold no SQL and no secret's name",
	);
}

async function staticFiles() {
	const page = await app().send("/terms");
	const rules = readFileSync(`${root}public/_headers`, "utf8");
	const all = rules.split(/^\/assets\/\*$/m)[0] ?? "";
	for (const name of [
		"Strict-Transport-Security",
		"X-Content-Type-Options",
		"X-Frame-Options",
		"Referrer-Policy",
		"Permissions-Policy",
	])
		must(
			all.includes(`  ${name}: ${page.headers.get(name)}\n`),
			`public/_headers states the Worker's ${name}`,
		);
	expect(
		/Content-Security-Policy: default-src 'none'/.test(all) &&
			/frame-ancestors 'none'/.test(all),
		"public/_headers states the Worker's headers for static files",
	);
	// As the edge asks, and as a browser does.
	for (const accept of ["text/html", "*/*"])
		for (const path of ["/", "/terms", "/pricing", "/no-such-page", "/?page=2"])
			must(
				(await app().send(path, { headers: { accept } })).headers.get(
					"cache-control",
				) === "public, max-age=0, must-revalidate, no-transform",
				`${path} for ${accept} says that nothing may be added to it`,
			);
	for (const [path, cache] of [
		["/sitemap.xml", "public, max-age=0, must-revalidate"],
		["/api/health", "no-store"],
	] as const)
		must(
			(await app().send(path)).headers.get("cache-control") === cache,
			`${path} says ${cache}`,
		);
	expect(
		true,
		"every HTML answer says no-transform and must-revalidate; the sitemap revalidates; health is not kept",
	);
	const html = await (await app().send("/")).text();
	const css = html.match(/href="(\/assets\/[^"]+\.css)"/)?.[1] as string;
	const file = await app().send(css);
	expect(
		file.status === 200 &&
			!/no-transform/.test(file.headers.get("cache-control") ?? "") &&
			/\/assets\/\*\n {2}Cache-Control: public, max-age=31536000, immutable\n/.test(
				rules,
			) &&
			(await file.text()).length < 12_000,
		"the stylesheet is served, under 12,000 bytes, with its own caching",
	);
}

async function stages() {
	const robots = async () => {
		const answer = await app().send("/robots.txt");
		return {
			text: await answer.text(),
			tag: answer.headers.get("x-robots-tag"),
		};
	};
	for (const stage of ["local", "preview"]) {
		await app().configure({ bindings: { APP_ENV: stage } });
		const { text, tag } = await robots();
		const page = await app().send("/");
		expect(
			text === "User-agent: *\nDisallow: /\n" &&
				tag === "noindex" &&
				page.headers.get("x-robots-tag") === "noindex",
			`${stage}: robots are disallowed everywhere and every answer says noindex`,
		);
	}
	await app().configure({ bindings: { APP_ENV: "production" }, https: true });
	const { text, tag } = await robots();
	const page = await read(app(), "/");
	expect(
		/^User-agent: \*\nDisallow:\n\nSitemap: /.test(text) &&
			text.includes(`${ORIGIN}/sitemap.xml`) &&
			tag === null &&
			page.status === 200 &&
			!page.headers.has("x-robots-tag"),
		"production: robots are allowed, the sitemap is named, and no answer says noindex",
	);
	expect(
		(await app().send("/pricing")).status === 410 &&
			(await app().send("/item/nothing-01")).status === 404,
		"production: gone and missing pages keep their status",
	);
	await app().configure({ bindings: { APP_ENV: "production" } });
	const plain = await app().send("/?kind=decision");
	expect(
		plain.status === 308 &&
			plain.headers.get("location") === "https://127.0.0.1/?kind=decision" &&
			plain.headers.has("strict-transport-security") &&
			(await plain.text()) === "",
		"production answers plain http with a redirect to https and nothing else",
	);
}

try {
	const bundle = readBundleFile();
	worker = await startBuiltWorker(
		Number(process.env.STACK_LIMITS_PORT ?? 4314),
		{ bindings: STAGE },
	);
	await loadInto(worker, bundle);
	browser = await launch();
	const calls = await callsOfThePage();
	await bodies(calls);
	await oldPath();
	await staticFiles();
	await rateLimit(calls);
	await stages();
	expect(worker.egress.length === 0, "the Worker sent no request anywhere");
	done();
} catch (error) {
	console.error(error instanceof Error ? error.message : error);
	process.exitCode = 1;
} finally {
	await browser?.close();
	await worker?.stop();
}
