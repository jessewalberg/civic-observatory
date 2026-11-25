// `bun run check:signup`: the sign-up, the paid intent and the removal
// (stack/README.md, "Sign-up"; no unit tests, Jesse 2026-10-09). The built Worker
// in workerd as a stage runs it, in Chromium and over HTTP. Emails are at
// example.com, callers are documentation addresses (RFC 5737, 3849).

import { spawnSync } from "node:child_process";
import { createHash, createHmac, randomBytes } from "node:crypto";
import type { Browser, Page } from "@playwright/test";
import { SIGNUP } from "../src/lib/limits";
import { TOKEN_KEY } from "../src/lib/site";
import { type BuiltWorker, startBuiltWorker } from "./built-worker";
import {
	checks,
	launch,
	loadInto,
	read,
	readBundleFile,
	root,
	slug,
} from "./harness";

const { expect, must, done } = checks("check:signup");
const KEY = randomBytes(32).toString("hex");
// As a stage: records are written, and there is no local key.
const STAGE = { APP_ENV: "preview", SIGNUP_CLIENT_KEY: KEY };
const INTENT = "Tell me when paid instant alerts launch, $29 a month";
const HOUR = SIGNUP.windowMs;
const sha256 = (text: string) =>
	createHash("sha256").update(text).digest("hex");
const hmac = (caller: string) =>
	createHmac("sha256", KEY)
		.update(`docket-signup-client:v1:${caller}`)
		.digest("hex");

/** Everything typed or sent as an email or an address, looked for at the end. */
const secrets = new Set<string>();

interface Call {
	path: string;
	body: string;
}
const calls: Record<"signup" | "intent" | "remove", Call | undefined> = {
	signup: undefined,
	intent: undefined,
	remove: undefined,
};

let worker: BuiltWorker | undefined;
let browser: Browser | undefined;
const app = () => worker as BuiltWorker;

/** Sends a call the page made, with another body, from another address. */
async function send(
	call: Call | undefined,
	body: string,
	address: string,
	headers: Record<string, string> = {},
) {
	if (!call) throw new Error("the page never made this call");
	secrets.add(address);
	const response = await app().send(call.path, {
		method: "POST",
		headers: {
			"CF-Connecting-IP": address,
			"content-type": "application/json",
			"x-tsr-serverfn": "true",
			accept: "application/json",
			origin: app().base(),
			"sec-fetch-site": "same-origin",
			...headers,
		},
		body,
	});
	return {
		status: response.status,
		headers: response.headers,
		text: await response.text(),
	};
}
const MARK = "seen-by-the-check@example.com";
function signUp(
	email: string,
	address: string,
	change: (body: string) => string = (body) => body,
) {
	secrets.add(email);
	return send(
		calls.signup,
		change((calls.signup?.body ?? "").replace(MARK, email)),
		address,
	);
}
const tokenIn = (text: string) => text.match(/[0-9a-f]{64}/)?.[0] ?? "";
const withToken = (call: Call | undefined, token: string) =>
	(call?.body ?? "").replace(/[0-9a-f]{64}/, token);

async function counts() {
	const [row] = await app().sql(
		`SELECT (SELECT count(*) FROM signups) AS signups,
			(SELECT count(paid_intent_at) FROM signups) AS intents, (SELECT count(*) FROM signup_attempts) AS attempts`,
	);
	return row as Record<"signups" | "intents" | "attempts", number>;
}
async function clear() {
	for (const table of ["signups", "signup_attempts"])
		await app().sql(`DELETE FROM ${table}`);
}
const open = (value: 0 | 1) =>
	app().sql("UPDATE settings SET signup_open = ?1", value);

async function fill(page: Page, email: string) {
	secrets.add(email);
	await page.locator('form[data-ready="true"]').waitFor();
	await page.fill('input[name="email"]', email);
	await page.selectOption('select[name="role"]', "builder_developer");
	await page.locator('input[name="towns"]').first().check();
}

// ---------------------------------------------------------------------------

async function closed() {
	const page = await read(app(), "/");
	expect(
		page.main.includes("Sign-up is not open yet.") &&
			!page.html.includes('name="email"'),
		"as released, sign-up is closed and the page has no form",
	);
}

/** The whole way, in a browser, and the calls it makes. */
async function inTheBrowser(towns: string[]) {
	const context = await (browser as Browser).newContext();
	const page = await context.newPage();
	page.on("request", (request) => {
		const body = request.postData() ?? "";
		if (request.method() !== "POST") return;
		const call = { path: new URL(request.url()).pathname, body };
		if (body.includes(MARK)) calls.signup ??= call;
		else if (/[0-9a-f]{64}/.test(body)) {
			if (!calls.intent) calls.intent = call;
			else if (call.path !== calls.intent.path) calls.remove ??= call;
		}
	});
	await page.goto(app().base());
	await fill(page, MARK);
	// Nothing is chosen for a person who chose nothing.
	await page.locator('input[name="towns"]').first().uncheck();
	await page.click('button[type="submit"]:has-text("Sign up")');
	expect(
		(await page.getByRole("status").innerText()) ===
			"Choose at least one town." && (await counts()).attempts === 0,
		"without a town the page asks for one, and sends nothing",
	);
	await page.locator('input[name="towns"]').first().check();
	await page.click('button[type="submit"]:has-text("Sign up")');
	await page.getByRole("button", { name: INTENT }).waitFor();
	const panel = await page.locator(".sign-up").innerText();
	expect(
		panel.includes("No email is sent now.") && !panel.includes("@"),
		"after signing up the page says that no email is sent now",
	);
	const [row] = await app().sql("SELECT email, role, towns FROM signups");
	expect(
		row?.email === MARK &&
			row.role === "builder_developer" &&
			row.towns ===
				JSON.stringify([
					slug([...towns].sort((a, b) => (a < b ? -1 : 1))[0] as string),
				]),
		"the sign-up stores the email, the role and the towns",
	);
	const token = await page.evaluate(
		(key) => localStorage.getItem(key),
		TOKEN_KEY,
	);
	const [stored] = await app().sql("SELECT token_hash FROM signups");
	expect(
		/^[0-9a-f]{64}$/.test(token ?? "") &&
			stored?.token_hash === sha256(token ?? ""),
		"the browser keeps the token, and D1 only its hash",
	);
	const [attempt] = await app().sql("SELECT client FROM signup_attempts");
	expect(
		attempt?.client === hmac("127.0.0.1") ||
			attempt?.client === hmac("unknown"),
		"the attempt holds the keyed hash of the caller",
	);

	await page.getByRole("button", { name: INTENT }).click();
	await page.getByText("Noted.").waitFor();
	await page.getByRole("button", { name: INTENT }).click();
	await page.getByText("Noted.").waitFor();
	expect(
		(await counts()).intents === 1,
		"the paid intent, pressed twice, is one",
	);
	// Somebody else's sign-up of the same address, which must stay.
	must(
		(await signUp(MARK, "192.0.2.99")).status === 200 &&
			(await counts()).signups === 2,
		"another submission of the same address is a row of its own",
	);

	await page.reload();
	await page.getByRole("button", { name: INTENT }).waitFor();
	expect(true, "after a reload the browser still knows that it signed up");
	await open(0);
	await page.reload();
	await page.getByRole("button", { name: "Remove my address" }).waitFor();
	expect(true, "with sign-up closed again, the address can still be removed");
	await page.getByRole("button", { name: "Remove my address" }).click();
	await page.getByText("Done.").waitFor();
	const left = await counts();
	expect(
		left.signups === 1 &&
			left.intents === 0 &&
			(
				await app().sql(
					"SELECT 1 FROM signups WHERE token_hash = ?1",
					sha256(token ?? ""),
				)
			).length === 0 &&
			(await page.evaluate((key) => localStorage.getItem(key), TOKEN_KEY)) ===
				null,
		"Remove my address deletes the sign-up this browser made, its intent and the browser's token, and nothing else",
	);
	await clear();
	await open(1);
	await page.reload();
	await page.locator('form[data-ready="true"]').waitFor();
	expect((await context.cookies()).length === 0, "no cookie was ever set");

	// A token whose sign-up is gone.
	await page.evaluate(
		([key, value]) => localStorage.setItem(key as string, value as string),
		[TOKEN_KEY, "0".repeat(64)],
	);
	await page.reload();
	await page.getByRole("button", { name: INTENT }).click();
	await page.getByText("no longer stored").waitFor();
	await page.locator('form[data-ready="true"]').waitFor();
	expect(
		true,
		"a browser whose sign-up is gone is told so and gets the form again",
	);
	await context.close();

	// A browser that refuses storage.
	const strict = await (browser as Browser).newContext();
	await strict.addInitScript(() => {
		Object.defineProperty(window, "localStorage", {
			get() {
				throw new Error("refused");
			},
		});
	});
	const strictPage = await strict.newPage();
	await strictPage.goto(app().base());
	await fill(strictPage, "no-storage@example.com");
	await strictPage.click('button[type="submit"]:has-text("Sign up")');
	await strictPage.getByRole("button", { name: "Remove my address" }).click();
	await strictPage.getByText("Done.").waitFor();
	expect(
		(await counts()).signups === 0,
		"a browser that refuses storage can sign up and remove",
	);
	await strict.close();

	// No script: no form that could put an email in an address.
	const plain = await (browser as Browser).newContext({
		javaScriptEnabled: false,
	});
	const plainPage = await plain.newPage();
	await plainPage.goto(app().base());
	expect(
		(await plainPage
			.locator('.sign-up form[method="post"] button[type="submit"]')
			.isDisabled()) &&
			// Playwright's text search skips <noscript>.
			(await plainPage.locator("noscript p").isVisible()),
		"without a script the form cannot be sent, and says why",
	);
	await plain.close();
	await clear();
}

async function limits() {
	// 50 at once from one address: one email each.
	await clear();
	const mine = await Promise.all(
		Array.from({ length: 50 }, (_, at) =>
			signUp(`burst-${at}@example.com`, "192.0.2.1"),
		),
	);
	const status = (list: { status: number }[], code: number) =>
		list.filter((answer) => answer.status === code).length;
	let now = await counts();
	expect(
		status(mine, 200) === SIGNUP.perClient &&
			status(mine, 429) === 50 - SIGNUP.perClient &&
			now.signups === SIGNUP.perClient &&
			now.attempts === SIGNUP.perClient,
		`of 50 at once from one address, ${status(mine, 200)} are stored and ${status(mine, 429)} answer 429`,
	);
	const refused = mine.find((answer) => answer.status === 429);
	const wait = Number(refused?.headers.get("retry-after"));
	expect(
		wait > 3500 &&
			wait <= 3600 &&
			refused?.headers.get("cache-control") === "no-store",
		`a refused one says to wait ${wait} seconds`,
	);
	// An IPv6 /64 is one caller, and so is an IPv4 address written as IPv6.
	await clear();
	const network = await Promise.all(
		Array.from({ length: 12 }, (_, at) =>
			signUp(`six-${at}@example.com`, `2001:db8:1:2::${at + 1}`),
		),
	);
	const neighbour = await signUp("neighbour@example.com", "2001:db8:1:3::1");
	expect(
		status(network, 200) === SIGNUP.perClient && neighbour.status === 200,
		"an IPv6 /64 is one caller, its neighbour another",
	);
	await clear();
	const mapped = [];
	for (let at = 0; at < 6; at++)
		mapped.push(
			await signUp(
				`mapped-${at}@example.com`,
				at % 2 ? "192.0.2.9" : "::ffff:192.0.2.9",
			),
		);
	expect(
		status(mapped, 200) === SIGNUP.perClient,
		"an IPv4 address written as IPv6 is the same caller",
	);

	// 100 at once, each from its own address.
	await clear();
	const all = await Promise.all(
		Array.from({ length: 100 }, (_, at) =>
			signUp(`all-${at}@example.com`, `198.51.100.${at + 1}`),
		),
	);
	now = await counts();
	expect(
		status(all, 200) === SIGNUP.inAll &&
			status(all, 429) === 100 - SIGNUP.inAll &&
			now.signups === SIGNUP.inAll &&
			now.attempts === SIGNUP.inAll,
		`of 100 at once from 100 addresses, ${status(all, 200)} are stored and ${status(all, 429)} answer 429`,
	);
	// The same email at once counts each time, and each is a row of its own.
	await clear();
	const same = await Promise.all(
		Array.from({ length: 50 }, (_, at) =>
			signUp("one@example.com", `203.0.113.${Math.floor(at / 5) + 1}`),
		),
	);
	now = await counts();
	const [own] = await app().sql(
		"SELECT count(DISTINCT token_hash) AS n FROM signups",
	);
	expect(
		status(same, 200) === 50 &&
			now.signups === 50 &&
			now.attempts === 50 &&
			own?.n === 50,
		"50 at once with one email: 50 submissions, each with its own token",
	);

	// The hour rolls.
	await clear();
	for (let at = 0; at < SIGNUP.perClient; at++)
		await signUp(`roll-${at}@example.com`, "192.0.2.20");
	must(
		(await signUp("roll-x@example.com", "192.0.2.20")).status === 429,
		"the sixth is refused",
	);
	await app().sql(
		"UPDATE signup_attempts SET at = at - ?1 WHERE id = (SELECT id FROM signup_attempts ORDER BY at LIMIT 1)",
		HOUR,
	);
	const sixth = await signUp("roll-y@example.com", "192.0.2.20");
	const seventh = await signUp("roll-z@example.com", "192.0.2.20");
	expect(
		sixth.status === 200 && seventh.status === 429,
		"when the first is an hour old there is one place, and only one",
	);
	await app().sql("UPDATE signup_attempts SET at = at - ?1", HOUR);
	await read(app(), "/terms");
	let left = 1;
	for (let tries = 0; tries < 40 && left > 0; tries++) {
		left = (await counts()).attempts;
		if (left > 0) await new Promise((resolve) => setTimeout(resolve, 50));
	}
	expect(
		left === 0,
		"the next page request deletes every caller's hash whose hour is over",
	);
	await clear();
}

/** Every submission is its own: what one token does, and to what. */
async function own() {
	const first = await signUp("First@Example.com ", "192.0.2.30");
	const [stored] = await app().sql("SELECT email FROM signups");
	expect(
		stored?.email === "first@example.com",
		"an email is stored trimmed and in lower case",
	);
	const rowOf = async (token: string) =>
		JSON.stringify(
			await app().sql(
				"SELECT * FROM signups WHERE token_hash = ?1",
				sha256(token),
			),
		);
	const mine = tokenIn(first.text);
	const before = await rowOf(mine);
	const second = await signUp("FIRST@example.COM", "192.0.2.31", (body) =>
		body.replace("builder_developer", "resident"),
	);
	const theirs = tokenIn(second.text);
	const [pair] = await app().sql(
		"SELECT count(*) AS n, count(DISTINCT email) AS emails, count(DISTINCT role) AS roles FROM signups",
	);
	expect(
		pair?.n === 2 &&
			pair.emails === 1 &&
			pair.roles === 2 &&
			(await rowOf(mine)) === before,
		"the same email again is a row of its own, and the first one stays as it was",
	);
	const asked = () =>
		app().sql(
			"SELECT token_hash FROM signups WHERE paid_intent_at IS NOT NULL",
		);
	await send(calls.intent, withToken(calls.intent, theirs), "192.0.2.31");
	const marked = await asked();
	expect(
		marked.length === 1 &&
			marked[0]?.token_hash === sha256(theirs) &&
			(await rowOf(mine)) === before,
		"a token marks the intent of its own submission, and of no other",
	);
	const when = await rowOf(theirs);
	await new Promise((resolve) => setTimeout(resolve, 5));
	await send(calls.intent, withToken(calls.intent, theirs), "192.0.2.31");
	expect((await rowOf(theirs)) === when, "and only once");
	await send(calls.remove, withToken(calls.remove, theirs), "192.0.2.31");
	expect(
		(await rowOf(theirs)) === "[]" && (await rowOf(mine)) === before,
		"a token removes its own submission, and no other",
	);
	await send(
		calls.remove,
		withToken(calls.remove, "f".repeat(64)),
		"192.0.2.31",
	);
	expect(
		(await rowOf(mine)) === before &&
			(await send(calls.intent, withToken(calls.intent, theirs), "192.0.2.31"))
				.status === 404,
		"a token that is gone, or never was, does nothing",
	);
	await clear();
}

/**
 * Nothing tells whether an address was there before: not the answer to any call,
 * and not the answers to several, in whatever order. The same calls are made
 * where somebody else had signed the address up and where nobody had, and
 * everything a caller can see must be the same, and the work D1 did for it too.
 */
async function membership() {
	const WORLDS = ["absent", "present", "asked", "removed", "twice"] as const;
	type Step = readonly ["A" | "B", "signup" | "intent" | "remove"];
	const ADDRESS = { A: "192.0.2.81", B: "2001:db8:9:9::1" };
	const NEVER = "e".repeat(64);
	const CLIENTS = ["A", "B"] as const;
	const ACTIONS = ["signup", "intent", "remove"] as const;
	const steps: Step[] = CLIENTS.flatMap((client) =>
		ACTIONS.map((action) => [client, action] as const),
	);
	const tokenSteps = steps.filter(([, action]) => action !== "signup");
	const three = (from: Step[]) =>
		from.flatMap((one) =>
			from.flatMap((two) => from.map((last) => [one, two, last])),
		);
	/** A token each, and then everything that can be done with them. */
	const withTokens = three(tokenSteps).map((rest) => [
		["A", "signup"] as const,
		["B", "signup"] as const,
		...rest,
	]);
	const byTwo: Step[][] = [...three(steps), ...withTokens];
	// Again with both tokens in one client's hands, as whoever wants to find out
	// would hold them: removing with one and asking with the other, both ways.
	const orders: Step[][] = [...byTwo, ...withTokens];
	must(
		(["A", "B"] as const).every((one) =>
			withTokens.some(
				([, , first, then]) =>
					first?.join() === `${one},remove` &&
					then?.join() === `${one === "A" ? "B" : "A"},intent`,
			),
		),
		"removing with one token and asking with the other is among the orders, both ways",
	);
	const seen = new Map<string, { calls: string[]; requests: string[] }[]>();
	let at = 0;
	let made = 0;
	for (const world of WORLDS) {
		const all: { calls: string[]; requests: string[] }[] = [];
		for (const [index, order] of orders.entries()) {
			const from = (client: "A" | "B") =>
				ADDRESS[index < byTwo.length ? client : "A"];
			await clear();
			at += 1;
			const email = `member-${at}@example.com`;
			const prior: string[] = [];
			if (world !== "absent") {
				for (let time = 0; time < (world === "twice" ? 2 : 1); time++)
					prior.push(tokenIn((await signUp(email, "192.0.2.80")).text));
				const token = prior[0] as string;
				if (world === "asked" || world === "removed")
					await send(
						calls.intent,
						withToken(calls.intent, token),
						"192.0.2.80",
					);
				if (world === "removed")
					await send(
						calls.remove,
						withToken(calls.remove, token),
						"192.0.2.80",
					);
				await app().sql("DELETE FROM signup_attempts");
			}
			const rows = async () =>
				JSON.stringify(
					(await app().sql("SELECT * FROM signups ORDER BY id")).filter(
						({ token_hash }) =>
							prior.some((token) => sha256(token) === token_hash),
					),
				);
			const theirs = await rows();
			const tokens = { A: NEVER, B: NEVER };
			const answers: string[] = [];
			const requests: string[] = [];
			for (const [client, action] of order) {
				const answer =
					action === "signup"
						? await signUp(email, from(client))
						: await send(
								calls[action],
								withToken(calls[action], tokens[client]),
								from(client),
							);
				if (action === "signup") tokens[client] = tokenIn(answer.text);
				made += 1;
				requests.push(answer.headers.get("x-request-id") ?? "");
				answers.push(
					JSON.stringify([
						answer.status,
						answer.text.replace(/[0-9a-f]{64}/g, "T"),
						[...answer.headers]
							.filter(([name]) => !["date", "x-request-id"].includes(name))
							.map(([name, value]) => [
								name,
								value.replace(/nonce-[0-9a-f]{32}/, "nonce"),
							])
							.sort(),
					]),
				);
			}
			must(
				(await rows()) === theirs,
				`${world}: ${order.join(" ")} changed somebody else's sign-up`,
			);
			all.push({ calls: answers, requests });
		}
		seen.set(world, all);
	}
	const says = (order: Step[]) =>
		order.map(([client, action]) => `${client} ${action}`).join(", ");
	const absent = seen.get("absent") ?? [];
	for (const world of WORLDS)
		for (const [index, order] of orders.entries()) {
			const here = seen.get(world)?.[index]?.calls ?? [];
			for (const [call, answer] of here.entries())
				must(
					answer === absent[index]?.calls[call],
					`an answer tells whether an address was there: ${world}, ${says(order)}, call ${call + 1}: ${answer.slice(0, 90)} and not ${absent[index]?.calls[call]?.slice(0, 90)}`,
				);
		}
	expect(
		true,
		`${byTwo.length} orders of calls by two clients and ${withTokens.length} by one with two tokens, in ${WORLDS.length} cases (${made} calls): status, body and headers are the same whether the address was there before or not, and nobody else's sign-up changes`,
	);
	// The work behind each answer, from the Worker's own records.
	await new Promise((resolve) => setTimeout(resolve, 500));
	const work = new Map<string, string>();
	for (const line of app().lines)
		if (line.startsWith("{")) {
			const { requestId, database } = JSON.parse(line) as {
				requestId?: string;
				database?: { rows_read: number; rows_written: number };
			};
			if (requestId && database)
				work.set(requestId, `${database.rows_read}/${database.rows_written}`);
		}
	for (const world of WORLDS)
		for (const [index, order] of orders.entries())
			for (const [call, id] of (
				seen.get(world)?.[index]?.requests ?? []
			).entries())
				must(
					work.has(id) &&
						work.get(id) === work.get(absent[index]?.requests[call] ?? ""),
					`D1's work tells whether an address was there: ${world}, ${says(order)}, call ${call + 1}: ${work.get(id)} rows and not ${work.get(absent[index]?.requests[call] ?? "")}`,
				);
	expect(true, "D1 reads and writes the same number of rows for each of them");
	// And the time, in turn, so that a busy machine is busy for both.
	await clear();
	const times: Record<"absent" | "present", number[]> = {
		absent: [],
		present: [],
	};
	for (let round = 0; round < 60; round++)
		for (const world of ["absent", "present"] as const) {
			const email = `time-${round}-${world}@example.com`;
			if (world === "present") await signUp(email, "192.0.2.80");
			await app().sql("DELETE FROM signup_attempts");
			const started = performance.now();
			await signUp(email, "192.0.2.81");
			times[world].push(performance.now() - started);
			await app().sql("DELETE FROM signup_attempts");
		}
	const median = (list: number[]) =>
		[...list].sort((a, b) => a - b)[Math.floor(list.length / 2)] as number;
	const [without, with_] = [median(times.absent), median(times.present)];
	expect(
		with_ / without < 2 && without / with_ < 2,
		`a sign-up takes as long for an address that was there (median ${with_.toFixed(1)} ms) as for one that was not (${without.toFixed(1)} ms)`,
	);
	await clear();
}

async function hostile() {
	const bad: [string, (body: string) => string][] = [];
	for (const email of [
		"",
		"x",
		"x@y",
		"a b@example.com",
		"a@b@example.com",
		"<b>@example.com",
		"a,b@example.com",
		`${"x".repeat(250)}@example.com`,
		"a\\u0000@example.com",
		"a\\r\\nBcc:b@example.com",
	])
		bad.push([
			`the email ${JSON.stringify(email).slice(0, 40)}`,
			(body) => body.replace(MARK, email),
		]);
	bad.push([
		"a role that does not exist",
		(body) => body.replace("builder_developer", "constructor"),
	]);
	bad.push(["an empty role", (body) => body.replace("builder_developer", "")]);
	const [first] = await app().sql(
		"SELECT slug FROM towns ORDER BY town LIMIT 1",
	);
	bad.push([
		"a town that does not exist",
		(body) => body.replace(`"${first?.slug}"`, '"atlantis"'),
	]);
	bad.push([
		"a town that is SQL",
		(body) => body.replace(`"${first?.slug}"`, `"x'); DROP TABLE signups;--"`),
	]);
	// A parser's message can quote what it could not read.
	for (const raw of [
		"leak-a@example.com",
		'{"t":leak-b@example.com',
		'{"email":"leak-c@example.com"',
	]) {
		secrets.add(raw.match(/leak-\w@example\.com/)?.[0] ?? raw);
		bad.push([`the raw body ${raw}`, () => raw]);
	}
	bad.push(["no JSON", () => "{"]);
	bad.push(["an empty body", () => ""]);
	bad.push(["a list", () => "[]"]);
	bad.push(["a number", () => "7"]);
	secrets.add("leak-d@example.com");
	bad.push([
		"JSON the framework does not write",
		() => '{"leak-d@example.com":["leak-d@example.com"]}',
	]);
	bad.push([
		"JSON with a type the framework does not know",
		() => '{"t":{"t":999,"s":"leak-d@example.com"},"f":63,"m":[]}',
	]);
	for (const [at, [what, change]] of bad.entries()) {
		const answer = await send(
			calls.signup,
			change(calls.signup?.body ?? ""),
			`203.0.113.${at + 1}`,
		);
		must(
			answer.status >= 400 &&
				answer.status < 600 &&
				!/\bat .+:\d+:\d+|SQLITE|D1_ERROR|signup_/.test(answer.text),
			`${what} answers ${answer.status} and says nothing of the inside: ${answer.text.slice(0, 200)}`,
		);
	}
	let now = await counts();
	expect(
		now.signups === 0 && now.attempts === 0,
		`${bad.length} hostile submissions are refused, and nothing is stored or counted`,
	);

	must(
		(await signUp("plain@example.com", "192.0.2.40")).status === 200,
		"a plain sign-up still works",
	);
	await clear();
	const tokens = [
		"",
		"x",
		"0".repeat(63),
		`${"0".repeat(63)}g`,
		"' OR 1=1 --",
		"0".repeat(5000),
	];
	for (const token of tokens) {
		const intent = await send(
			calls.intent,
			withToken(calls.intent, token),
			"192.0.2.41",
		);
		const remove = await send(
			calls.remove,
			withToken(calls.remove, token),
			"192.0.2.41",
		);
		must(
			intent.status >= 400 && (remove.status === 200 || remove.status === 413),
			`the token ${token.slice(0, 20)}: ${intent.status} ${remove.status}`,
		);
	}
	now = await counts();
	expect(
		now.signups === 0 && now.intents === 0,
		`${tokens.length} tokens that are not one record and remove nothing`,
	);

	const foreign = await send(
		calls.signup,
		calls.signup?.body ?? "",
		"192.0.2.42",
		{
			origin: "https://elsewhere.example",
			"sec-fetch-site": "cross-site",
		},
	);
	expect(
		foreign.status === 403 && (await counts()).signups === 0,
		"a call from another site is refused",
	);
	const get = await app().send(calls.signup?.path ?? "", {
		headers: { accept: "application/json", "x-tsr-serverfn": "true" },
	});
	expect(
		get.status >= 400 && (await counts()).signups === 0,
		`a GET of the sign-up's path answers ${get.status}`,
	);
}

/** The field no person sees. */
async function honeypot() {
	const page = await (browser as Browser).newPage();
	await page.goto(app().base());
	await fill(page, "robot@example.com");
	expect(
		(await page
			.locator('[aria-hidden="true"] input[name="company"][tabindex="-1"]')
			.count()) === 1,
		"the hidden field is out of the tab order and hidden from a screen reader",
	);
	await page.evaluate(() => {
		const field = document.querySelector<HTMLInputElement>(
			'input[name="company"]',
		);
		if (field) field.value = "Robots Inc";
	});
	await page.click('button[type="submit"]:has-text("Sign up")');
	await page.getByRole("button", { name: INTENT }).waitFor();
	const now = await counts();
	expect(
		now.signups === 0 && now.attempts === 0,
		"whoever fills the hidden field is answered, and nothing is stored",
	);
	await page.close();
}

async function closedRow() {
	await open(0);
	const answer = await signUp("late@example.com", "192.0.2.50");
	expect(
		answer.status === 403 &&
			answer.text.includes("closed") &&
			(await counts()).signups === 0 &&
			(await counts()).attempts === 0,
		"with the row closed, a submission is refused and stores nothing",
	);
	const refused = await app().sql(
		"SELECT count FROM counters WHERE kind = 'signup_limited'",
	);
	await signUp("late2@example.com", "192.0.2.50");
	expect(
		JSON.stringify(refused) ===
			JSON.stringify(
				await app().sql(
					"SELECT count FROM counters WHERE kind = 'signup_limited'",
				),
			),
		"and is not counted as one past a limit",
	);
	await open(1);
	const tabs = await (browser as Browser).newPage();
	await tabs.goto(app().base());
	await fill(tabs, "late3@example.com");
	await open(0);
	await tabs.click('button[type="submit"]:has-text("Sign up")');
	await tabs.getByText("Sign-up is not open now.").waitFor();
	expect(true, "a page that was open when it closed says so");
	await tabs.close();
	await open(1);
	expect(
		(await signUp("early@example.com", "192.0.2.51")).status === 200,
		"the row opens it again, without a deploy",
	);
	await clear();

	await app().configure({ bindings: { APP_ENV: "preview" } });
	const none = await signUp("keyless@example.com", "192.0.2.52");
	expect(
		none.status === 403 && (await counts()).signups === 0,
		"a stage without the secret answers as closed and stores nothing",
	);
	await app().configure({
		bindings: { APP_ENV: "preview", SIGNUP_CLIENT_KEY: "short" },
	});
	expect(
		(await signUp("shortkey@example.com", "192.0.2.53")).status === 403,
		"a short secret is no secret",
	);
	await app().configure({ bindings: STAGE, noData: true });
	const broken = await signUp("broken@example.com", "192.0.2.54");
	const brokenIntent = await send(
		calls.intent,
		withToken(calls.intent, "a".repeat(64)),
		"192.0.2.54",
	);
	expect(
		broken.status === 503 &&
			brokenIntent.status === 503 &&
			!/no such table|D1_ERROR|SQLITE/i.test(broken.text + brokenIntent.text),
		"when D1 cannot answer, the calls answer 503 and say nothing of the inside",
	);
	await app().configure({ bindings: STAGE });
}

async function report() {
	await clear();
	const emails = ["one@example.com", "two@example.com", "three@example.com"];
	const tokens = [];
	for (const [at, email] of emails.entries())
		tokens.push(tokenIn((await signUp(email, `192.0.2.${60 + at}`)).text));
	// Again, in another role and with every intent: each email still counts once.
	const again = await signUp("one@example.com", "192.0.2.70", (body) =>
		body.replace("builder_developer", "resident"),
	);
	for (const token of [tokens[0] as string, tokenIn(again.text)])
		await send(calls.intent, withToken(calls.intent, token), "192.0.2.60");
	for (const path of [
		"/",
		"/?kind=decision",
		"/method",
		"/privacy",
		"/no-such-page",
		"/pricing",
	])
		await read(app(), path);
	await app().send("/terms", { method: "HEAD" });
	await new Promise((resolve) => setTimeout(resolve, 500));
	const printed = await app().whileStopped(() =>
		spawnSync(
			process.execPath,
			["scripts/report-docket.ts", "--state", app().state],
			{ cwd: root, encoding: "utf8" },
		),
	);
	const text = `${printed.stdout}${printed.stderr}`;
	const report = JSON.parse(printed.stdout) as Record<string, unknown> & {
		requests_by_day: Record<string, Record<string, number>>;
	};
	const kinds = Object.values(report.requests_by_day)[0] ?? {};
	expect(
		report.submissions === 4 &&
			report.signups === 3 &&
			JSON.stringify(report.signups_by_role) === '{"builder_developer":3}' &&
			report.paid_intents === 1 &&
			JSON.stringify(report.paid_intents_by_role) ===
				'{"builder_developer":1}' &&
			report.signup_open === true,
		"the report counts each email once, by the role of its earliest row, and an intent once an email",
	);
	const [firstTown] = Object.entries(
		report.signups_by_town as Record<string, number>,
	);
	expect(firstTown?.[1] === 3, "the report counts sign-ups by town");
	expect(
		Object.keys(kinds).every((kind) =>
			[
				"home",
				"list",
				"item",
				"town",
				"method",
				"privacy",
				"terms",
				"signup_limited",
			].includes(kind),
		) &&
			(kinds.home ?? 0) > 0 &&
			kinds.list === 1 &&
			kinds.method === 1 &&
			kinds.privacy === 1 &&
			kinds.terms === 1,
		"page requests are counted by kind: a GET answered 200, and not a HEAD, a 404 or a 410",
	);
	expect(
		!/@|[0-9a-f]{32}|192\.0\.2|2001:db8/.test(text),
		"the report holds no email, address, token or hash",
	);
}

/** Nothing anyone typed, and no address, in a record or anywhere else in D1. */
async function nothingKept() {
	const records = app().lines.filter((line) => line.startsWith("{"));
	const said = app().lines.join("\n");
	const raw = app().lines.filter(
		(line) => line.trim() && !line.startsWith("{"),
	);
	expect(
		raw.length === 0,
		`the Worker logs records and nothing else${raw.length > 0 ? `, but logged:\n${raw.slice(0, 8).join("\n")}` : ""}`,
	);
	expect(records.length > 100, `${records.length} requests were recorded`);
	const keys = new Set(
		records.flatMap((line) => Object.keys(JSON.parse(line) as object)),
	);
	expect(
		[...keys].every((key) =>
			[
				"message",
				"timestamp",
				"severity",
				"app",
				"environment",
				"release",
				"requestId",
				"route",
				"method",
				"status",
				"elapsedMs",
				"errorTag",
				"database",
			].includes(key),
		),
		"a record holds allowlisted fields only",
	);
	for (const secret of secrets)
		must(
			!said.toLowerCase().includes(secret.trim().toLowerCase()),
			`a record holds ${secret}`,
		);
	expect(
		!/@example|\/item\/|\?town|_fn\//i.test(said) && !/[0-9a-f]{64}/.test(said),
		`none of ${secrets.size} emails and addresses, no path, token or hash is in what the Worker logged`,
	);
	const other = JSON.stringify(
		await Promise.all(
			["signup_attempts", "counters", "releases", "settings"].map((table) =>
				app().sql(`SELECT * FROM ${table}`),
			),
		),
	);
	expect(
		!/@|192\.0\.2|198\.51|203\.0\.113|2001:db8/.test(other),
		"D1 holds an email only as a sign-up's own, and an address nowhere",
	);
	const everything = JSON.stringify(await app().sql("SELECT * FROM signups"));
	expect(
		!/192\.0\.2|198\.51|203\.0\.113|2001:db8|127\.0\.0\.1/.test(everything),
		"a sign-up holds no address",
	);
	expect(
		app().egress.length === 0,
		"the Worker sent no request anywhere, so no email",
	);
}

try {
	const bundle = readBundleFile();
	worker = await startBuiltWorker(
		Number(process.env.STACK_SIGNUP_PORT ?? 4312),
		{ bindings: STAGE },
	);
	await loadInto(worker, bundle);
	browser = await launch();
	await closed();
	await open(1);
	await inTheBrowser(bundle.towns);
	await limits();
	await own();
	await membership();
	await hostile();
	await honeypot();
	await closedRow();
	await report();
	await nothingKept();
	done();
} catch (error) {
	console.error(error instanceof Error ? error.message : error);
	process.exitCode = 1;
} finally {
	await browser?.close();
	await worker?.stop();
}
