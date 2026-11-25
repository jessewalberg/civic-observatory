// `bun run check:load`: the operator's scripts on a stage's database (docs/runbooks/
// release.md, section 6; no unit tests, Jesse 2026-10-09). Local only: stand-ins for
// Cloudflare's API, and in place of Cloudflare a local workerd that runs Wrangler's
// own proxy Worker, the file it uploads for a remote binding, in front of a D1. The
// scripts are the real ones, run as an operator runs them. What is not shown here is
// Cloudflare's edge preview and the database behind it.
import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { Miniflare } from "miniflare";
import { CURRENT, loadStatements, readBundle } from "./docket-bundle";
import { type BundleFile, checks, readBundleFile, root } from "./harness";
import { BATCH_WORKER, openRemote, type Rows } from "./local-d1";

declare const Bun: {
	Transpiler: new (options: {
		loader: "ts";
	}) => { transformSync(code: string): string };
};

const { expect, must, done } = checks("check:load");
/** Recognizable, so that none of them can be printed unseen. */
const ACCOUNT = "acc0".repeat(8);
const DATABASE = "dbdbdbdb-1111-4222-8333-dbdbdbdbdbdb";
const TOKEN = "cfut_rehearsal0token0of0nobody";
const COMMIT = "c0".repeat(20);
const PRIVATE = [ACCOUNT, DATABASE, TOKEN];

const scratch = `${root}.smoke/load-${randomUUID()}`;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// ---------------------------------------------------------------------------
// In place of Cloudflare's network: Wrangler's proxy Worker and a D1.

interface Asked {
	binding: string;
	/** The statements of one request to D1. */
	statements: number;
	/** It is the load's batch. */
	load: boolean;
}
/** What the stand-in does with the load's request. */
interface Play {
	/** Hold it until this many have come. */
	gather?: number;
	/** Do it, and lose the answer. */
	drop?: boolean;
	/** Make its last-but-one statement fail. */
	spoil?: boolean;
	/** The session's deadline, if it is not ten minutes away. */
	until?: string;
	/** Make it arrive as if it had been asked for this many seconds ago. */
	aged?: number;
}

// Between the client and Wrangler's own proxy: it counts, and plays what goes wrong.
const RELAY = `import proxy from "./scripts/remote-proxy-worker.js";
let log = [];
let play = {};
let gathered = 0;
export default {
	async fetch(request, env) {
		if (new URL(request.url).pathname === "/control") {
			const seen = log;
			play = await request.json();
			log = [];
			gathered = 0;
			return Response.json(seen);
		}
		const binding = request.headers.get("MF-Binding");
		let load = false;
		if (binding && request.method === "POST") {
			const sent = JSON.parse(await request.clone().text());
			const statements = Array.isArray(sent) ? sent : [sent];
			load = statements.some(({ sql }) => sql.startsWith("INSERT INTO releases"));
			log.push({ binding, statements: statements.length, load });
			if (load && play.gather) {
				gathered += 1;
				while (gathered < play.gather) await scheduler.wait(5);
			}
			if (load && play.aged) {
				// As asked: a write held back, against a clock that went on.
				const [first] = statements;
				first.params[9] = new Date(Date.parse(first.params[9]) - play.aged * 1000).toISOString();
				request = new Request(request, { body: JSON.stringify(statements) });
			}
			if (play.aged && statements[0].sql.startsWith("UPDATE settings")) {
				statements[0].params[1] -= play.aged;
				request = new Request(request, { body: JSON.stringify(sent) });
			}
			if (load && play.spoil) {
				statements.splice(-2, 0, { sql: "INSERT INTO items (id) VALUES (NULL)", params: [] });
				request = new Request(request, { body: JSON.stringify(statements) });
			}
		}
		// Wrangler asks Cloudflare for the binding "raw": the service behind it.
		const response = await proxy.fetch(request, {
			DB: env.__D1_BETA__DB,
			UNTIL: play.until ?? String(Date.now() + 600_000),
		});
		if (!load || !play.drop) return response;
		await response.text();
		return new Response("the answer is lost", { status: 502 });
	},
};`;

let cloud: Miniflare | undefined;
let cloudOrigin = "";
async function startCloud() {
	const migrated = spawnSync(
		`${root}node_modules/.bin/wrangler`,
		["d1", "migrations", "apply", "DB", "--local", "--persist-to", scratch],
		{
			cwd: root,
			encoding: "utf8",
			env: { ...process.env, CI: "1", WRANGLER_SEND_METRICS: "false" },
		},
	);
	if (migrated.status !== 0)
		throw new Error(`${migrated.stdout}${migrated.stderr}`);
	const id = "00000000-0000-0000-0000-000000000001";
	cloud = new Miniflare({
		host: "127.0.0.1",
		port: 0,
		d1Persist: `${scratch}/v3/d1`,
		workers: [
			{
				name: "edge",
				compatibilityDate: "2025-04-28",
				modules: [
					{ type: "ESModule", path: "relay.js", contents: RELAY },
					{
						type: "ESModule",
						path: "scripts/remote-proxy-worker.js",
						contents: new Bun.Transpiler({ loader: "ts" }).transformSync(
							readFileSync(`${root}scripts/remote-proxy-worker.ts`, "utf8"),
						),
					},
					{
						type: "ESModule",
						path: "node_modules/wrangler/wrangler-dist/ProxyServerWorker.js",
						contents: readFileSync(
							`${root}node_modules/wrangler/wrangler-dist/ProxyServerWorker.js`,
							"utf8",
						),
					},
				],
				d1Databases: { __D1_BETA__DB: id },
			},
			{
				name: "ops",
				compatibilityDate: "2026-01-14",
				modules: true,
				d1Databases: { DB: id },
				script: BATCH_WORKER,
			},
		],
	});
	cloudOrigin = (await cloud.ready).origin;
}
/** Sets what is played, and answers what was asked since the last time. */
async function control(play: Play = {}) {
	const response = await fetch(`${cloudOrigin}/control`, {
		method: "POST",
		body: JSON.stringify(play),
		keepalive: false,
	});
	return (await response.json()) as Asked[];
}
async function sql(statement: string): Promise<Rows> {
	const response = await fetch(cloudOrigin, {
		method: "POST",
		headers: { "MF-Route-Override": "ops" },
		body: JSON.stringify([[statement, []]]),
		keepalive: false,
	});
	if (!response.ok) throw new Error(await response.text());
	const [result] = (await response.json()) as { rows: Rows }[];
	return result?.rows ?? [];
}
/** Everything the loader writes, and the switch, as one string. */
async function dump() {
	const all = [];
	for (const table of [
		"releases",
		"towns",
		"boards",
		"meetings",
		"items",
		"withdrawn_items",
		"settings",
		"signups",
	])
		all.push(await sql(`SELECT * FROM ${table} ORDER BY 1, 2`));
	return JSON.stringify(all);
}
/** The content without the releases' own rows. */
const content = (dumped: string) =>
	JSON.stringify((JSON.parse(dumped) as unknown[]).slice(1, 5));

// ---------------------------------------------------------------------------
// In place of Cloudflare's API.

interface Account {
	noWorker?: true;
	appEnv?: string;
	release?: string;
	bindings?: object[];
	name?: string;
	uuid?: string;
	twoAccounts?: true;
}
let account: Account = {};
let requests: string[] = [];
let uploaded = "";
const api = createServer(async (request, response) => {
	const chunks: Buffer[] = [];
	for await (const chunk of request) chunks.push(chunk as Buffer);
	const path = (request.url ?? "").replace("/client/v4", "");
	const send = (status: number, body: unknown) => {
		response.writeHead(status, { "Content-Type": "application/json" });
		response.end(JSON.stringify(body));
	};
	const ok = (result: unknown) =>
		send(200, { success: true, errors: [], messages: [], result });
	const refuse = (status: number, code: number, message: string) =>
		send(status, {
			success: false,
			errors: [{ code, message }],
			messages: [],
			result: null,
		});
	requests.push(`${request.method} ${path.split("?")[0]}`);
	// What Wrangler asks for before it uploads the proxy.
	if (path === "/exchange")
		return send(200, {
			inspector_websocket: "wss://127.0.0.1/inspector",
			prewarm: `${apiOrigin}/prewarm`,
			token: "session",
		});
	if (request.headers.authorization !== `Bearer ${TOKEN}`)
		return refuse(403, 10000, "Authentication error");
	if (path.startsWith("/accounts?"))
		return ok([
			{ id: ACCOUNT },
			...(account.twoAccounts ? [{ id: "e".repeat(32) }] : []),
		]);
	const script = /^\/accounts\/\w+\/workers\/scripts\/([\w-]+)\/settings$/.exec(
		path,
	)?.[1];
	if (script) {
		const stage = script.replace("civic-docket-", "");
		if (account.noWorker) return refuse(404, 10007, "no such Worker");
		return ok({
			bindings: account.bindings ?? [
				{
					type: "plain_text",
					name: "APP_ENV",
					text: account.appEnv ?? stage,
				},
				{
					type: "plain_text",
					name: "APP_RELEASE",
					text: account.release ?? COMMIT,
				},
				{ type: "d1", name: "DB", id: DATABASE },
				{ type: "secret_text", name: "SIGNUP_CLIENT_KEY" },
			],
		});
	}
	if (path === `/accounts/${ACCOUNT}/d1/database/${DATABASE}`)
		return ok({
			uuid: account.uuid ?? DATABASE,
			name: account.name ?? "civic-docket-Database-preview-abcdefgh23456789",
		});
	if (path === `/accounts/${ACCOUNT}/workers/subdomain/edge-preview`)
		return ok({ exchange_url: `${apiOrigin}/exchange` });
	if (/\/workers\/scripts\/[\w-]+\/edge-preview$/.test(path)) {
		uploaded = `${path}\n${Buffer.concat(chunks).toString("latin1")}`;
		return refuse(403, 10000, "the rehearsal goes no further");
	}
	return refuse(404, 7003, "unexpected call");
});
let apiOrigin = "";

// ---------------------------------------------------------------------------
// The scripts, as an operator runs them.

const everything: string[] = [];
function start(script: string, args: string[], env: Record<string, string>) {
	// With a clock that is wrong, if the case wants one.
	const clock = env.REHEARSAL_SKEW
		? ["--preload", "./scripts/rehearsal-clock.ts"]
		: [];
	const child = spawn(process.execPath, [...clock, `scripts/${script}.ts`, ...args], {
		cwd: root,
		detached: true,
		stdio: ["ignore", "pipe", "pipe"],
		env: {
			PATH: process.env.PATH ?? "",
			HOME: scratch,
			CLOUDFLARE_API: apiOrigin,
			CLOUDFLARE_API_TOKEN: TOKEN,
			D1_PROXY: cloudOrigin,
			...env,
		} as unknown as NodeJS.ProcessEnv,
	});
	let said = "";
	const kill = () => {
		try {
			process.kill(-(child.pid as number), "SIGKILL");
		} catch {
			// It had ended.
		}
	};
	// One that never ends is not a refusal.
	const late = setTimeout(kill, 120_000);
	const ended = new Promise<{ ok: boolean; said: string }>((resolve) => {
		for (const stream of [child.stdout, child.stderr])
			stream.on("data", (chunk: Buffer) => {
				said += chunk.toString();
			});
		child.on("close", (code) => {
			clearTimeout(late);
			everything.push(said);
			resolve({ ok: code === 0, said: said.trim() });
		});
	});
	return { ended, said: () => said, kill };
}
const run = (
	script: string,
	args: string[],
	env: Record<string, string> = {},
) => start(script, args, env).ended;

let files = 0;
function fileOf(bundle: unknown) {
	const path = `${scratch}/bundle-${files++}.json`;
	writeFileSync(path, JSON.stringify(bundle));
	return path;
}
const load = (
	bundle: unknown,
	args: string[] = ["--stage", "preview"],
	env?: Record<string, string>,
) => run("load-docket", [fileOf(bundle), ...args], env);
const APPROVED = ["--stage", "production", "--production-approved", COMMIT];

/** A release with other words in every item. */
function changed(bundle: BundleFile, year: number) {
	const next = structuredClone(bundle);
	next.generated_at = `${year}-01-01T00:00:00Z`;
	for (const item of next.items) item.outcome = `${item.outcome} (${year})`;
	return next;
}

// ---------------------------------------------------------------------------

/** What is refused before anything is connected to. */
async function refusedFirst(bundle: BundleFile) {
	const raw = structuredClone(bundle);
	(raw.items[0] as Record<string, unknown>).owner = "a person";
	const cases: [string, string, string[], RegExp][] = [
		["an unknown stage", "load-docket", [fileOf(bundle), "--stage", "staging"], /--stage is preview or production/],
		["production without the approval", "load-docket", [fileOf(bundle), "--stage", "production"], /^Stage: production\nProduction is refused without --production-approved/],
		["production with a short commit", "load-docket", [fileOf(bundle), "--stage", "production", "--production-approved", COMMIT.slice(0, 12)], /Production is refused without/],
		["an approval for the preview", "load-docket", [fileOf(bundle), "--stage", "preview", "--production-approved", COMMIT], /--production-approved is production's/],
		["a folder and a stage", "load-docket", [fileOf(bundle), "--stage", "preview", "--state", ".wrangler/state"], /--state is the local database's/],
		["a raw name field", "load-docket", [fileOf(raw), "--stage", "preview"], /Refused, and nothing was written:[\s\S]*raw name field/],
		["half a file", "load-docket", [fileOf(JSON.stringify(bundle).slice(0, 5_000)), "--stage", "preview"], /not a JSON object/],
		["a reason that is none", "load-docket", [fileOf(bundle), "--stage", "preview", "--shrink", "x"], /--shrink needs a reason/],
		["no file", "load-docket", ["--stage", "preview"], /Use: bun run load/],
		["the switch of production without the approval", "signup-switch", ["open", "--stage", "production"], /Production is refused without/],
		["a switch to nothing", "signup-switch", ["ajar", "--stage", "preview"], /Use: bun run signup open\|closed/],
		["the report of production without the approval", "report-docket", ["--stage", "production"], /Production is refused without/],
	];
	for (const [what, script, args, says] of cases) {
		requests = [];
		const { ok, said } = await run(script, args);
		must(
			!ok && says.test(said) && requests.length === 0,
			`${what} is refused before any call: ${said} (${requests.join(", ")})`,
		);
	}
	expect(
		(await control()).length === 0,
		`${cases.length} refused before any call: ${cases.map(([what]) => what).join("; ")}`,
	);
}

/** A database that is not this app's, by its name and its binding. */
async function wrongDatabase(bundle: BundleFile) {
	const own = { type: "d1", name: "DB", id: DATABASE };
	const env = { type: "plain_text", name: "APP_ENV", text: "preview" };
	const cases: [string, Account, RegExp, string[]?][] = [
		["no such Worker", { noWorker: true }, /there is no Worker civic-docket-preview/],
		["a Worker of another stage", { appEnv: "production" }, /is not stage preview/],
		["a Worker that is no stage", { bindings: [own] }, /is not stage preview/],
		["a Worker without a database", { bindings: [env] }, /not bound to one database, as DB/],
		["a database bound by another name", { bindings: [env, { ...own, name: "OTHER" }] }, /not bound to one database, as DB/],
		["two databases", { bindings: [env, own, { ...own, name: "OTHER" }] }, /not bound to one database, as DB/],
		["another app's database", { name: "somebody-else-Database-preview-abcdefgh23456789" }, /is not this app's of preview/],
		["this app's database of the other stage", { name: "civic-docket-Database-production-abcdefgh23456789" }, /is not this app's of preview/],
		["a name that only begins like it", { name: "civic-docket-Database-preview-abcdefgh23456789-copy" }, /is not this app's of preview/],
		["a database that is another one", { uuid: "eeeeeeee-1111-4222-8333-eeeeeeeeeeee" }, /is not this app's of preview/],
		["two accounts", { twoAccounts: true }, /must reach exactly one account/],
		["production at another commit than the approved one", { release: "d".repeat(40) }, /is not at the approved commit c0c0c0c0c0c0/, APPROVED],
	];
	for (const [what, is, says, args] of cases) {
		account = is;
		for (const [script, rest] of [
			["load-docket", [fileOf(bundle)]],
			["report-docket", []],
			["signup-switch", ["open"]],
		] as const) {
			const { ok, said } = await run(script, [
				...rest,
				...(args ?? ["--stage", "preview"]),
			]);
			must(!ok && says.test(said), `${what}, ${script}: ${said}`);
		}
	}
	account = {};
	const other = await run(
		"load-docket",
		[fileOf(bundle), "--stage", "preview"],
		{ CLOUDFLARE_API_TOKEN: "another" },
	);
	must(
		!other.ok &&
			other.said.includes(
				"Which account the token reaches: HTTP 403, error 10000: the token is not allowed this, or is not valid",
			) &&
			!/Authentication error/.test(other.said),
		other.said,
	);
	expect(
		(await control()).length === 0,
		`${cases.length} databases that are not this app's of the stage are refused by the load, the report and the switch, and asked nothing`,
	);
	await sql("ALTER TABLE withdrawn_items RENAME TO other_items");
	const { ok, said } = await load(bundle);
	await sql("ALTER TABLE other_items RENAME TO withdrawn_items");
	const asked = await control();
	expect(
		!ok &&
			/does not have this app's tables/.test(said) &&
			asked.every((one) => !one.load),
		"a database without this app's tables is refused, and nothing is written",
	);
}

async function loading(bundle: BundleFile) {
	const before = await dump();
	const first = await load(bundle);
	const asked = await control();
	const counts = countsOf(bundle);
	expect(
		first.ok &&
			first.said.startsWith("Stage: preview\n") &&
			first.said.includes(`Release 1: ${counts}; 0 withdrawn now; `),
		`the load: ${first.said.split("\n").join(" | ")}`,
	);
	const batches = asked.filter((one) => one.load);
	expect(
		batches.length === 1 &&
			batches[0]?.statements ===
				loadStatements(readBundle(bundle), null, undefined, "").length &&
			asked.every(({ binding }) => binding === "DB"),
		`it reaches the database as one request of ${batches[0]?.statements} statements, through one binding (${asked.length} requests in all)`,
	);
	const loaded = await dump();
	must(loaded !== before, "something was stored");
	const again = await load(bundle);
	expect(
		again.ok &&
			again.said.includes(
				`Release 1 is this file already (${counts}); nothing was written.`,
			) &&
			(await dump()) === loaded &&
			(await control()).every((one) => !one.load),
		`the same file again counts what is there and writes nothing: ${again.said.split("\n").at(-1)}`,
	);
	const fewer = structuredClone(bundle);
	fewer.items = fewer.items.slice(0, Math.floor(fewer.items.length / 2));
	for (const meeting of fewer.meetings)
		meeting.item_count = fewer.items.filter(
			({ id }) => id.replace(/-\d+$/, "") === meeting.id,
		).length;
	const shrunk = await load(fewer);
	expect(
		!shrunk.ok &&
			/fewer than 80%/.test(shrunk.said) &&
			(await dump()) === loaded,
		"half of the items without a reason are refused, and nothing is written",
	);
	account = {
		name: "civic-docket-Database-production-abcdefgh23456789",
	};
	const live = await run("load-docket", [fileOf(bundle), ...APPROVED]);
	account = {};
	expect(
		live.ok &&
			live.said.startsWith("Stage: production\n") &&
			live.said.includes("is this file already"),
		"production with the approved commit, which is the deployed one, is loaded the same way",
	);
	await control();
}

/** What the loader says of a file that is there, whole. */
const countsOf = (bundle: BundleFile) =>
	`${bundle.items.length} items, ${bundle.meetings.length} meetings, ${bundle.towns.length} towns, ${bundle.sources.reduce((sum, { boards }) => sum + boards.length, 0)} boards`;

const LOSE_A_BOARD =
	"DELETE FROM boards WHERE position = 0 AND town_slug = (SELECT max(town_slug) FROM boards)";

/** A stored release that is not the file whose digest it has. */
async function damaged(bundle: BundleFile) {
	const says = (what: "items" | "meetings" | "towns" | "boards", by: number) => {
		const [, n = ""] = new RegExp(`(\\d+) ${what}`).exec(countsOf(bundle)) ?? [];
		return `${Number(n) + by} ${what} of the file's ${n}`;
	};
	const cases: [string, "items" | "meetings" | "towns" | "boards", number, string][] = [
		["an item that is gone", "items", -1, "DELETE FROM items WHERE id = (SELECT max(id) FROM items)"],
		["every item but one gone", "items", 1 - bundle.items.length, "DELETE FROM items WHERE id <> (SELECT max(id) FROM items)"],
		["an item too many", "items", 1, "INSERT INTO items SELECT * FROM copy_of_one"],
		["a meeting that is gone", "meetings", -1, "DELETE FROM meetings WHERE id = (SELECT max(id) FROM meetings WHERE id NOT IN (SELECT meeting_id FROM items))"],
		["a town too many", "towns", 1, "INSERT INTO towns SELECT 'one-too-many', 'One Too Many', platform, site FROM towns LIMIT 1"],
		["a board that is gone", "boards", -1, LOSE_A_BOARD],
	];
	const tables = ["items", "meetings", "towns", "boards"];
	for (const table of tables) await sql(`CREATE TABLE kept_${table} AS SELECT * FROM ${table}`);
	await sql("CREATE TABLE copy_of_one AS SELECT * FROM items LIMIT 1");
	await sql("UPDATE copy_of_one SET id = 'one-too-many-01'");
	for (const [what, table, by, statement] of cases) {
		await sql(statement);
		const before = await dump();
		const { ok, said } = await load(bundle);
		must(
			!ok &&
				said.includes("The stored release is damaged, and nothing was written: it names this file, and holds ") &&
				said.includes(says(table, by)) &&
				!said.includes("is this file already") &&
				(await dump()) === before &&
				(await control()).every((one) => !one.load),
			`${what}: ${said}`,
		);
		// As it was, children first.
		for (const one of ["items", "meetings", "boards", "towns"]) await sql(`DELETE FROM ${one}`);
		for (const one of ["towns", "boards", "meetings", "items"]) await sql(`INSERT INTO ${one} SELECT * FROM kept_${one}`);
	}
	const again = await load(bundle);
	expect(
		again.ok && again.said.includes(`is this file already (${countsOf(bundle)})`),
		`a stored release that is not the file is said to be damaged, with 1, and nothing is written: ${cases.map(([what]) => what).join("; ")}`,
	);
	for (const table of tables) await sql(`DROP TABLE kept_${table}`);
	await sql("DROP TABLE copy_of_one");
	// Lost while it is written: what is there is counted, not what was sent.
	await sql(`CREATE TRIGGER lost AFTER UPDATE OF loaded_count ON releases BEGIN ${LOSE_A_BOARD}; END`);
	for (const [at, play] of [{}, { drop: true }].entries()) {
		await control(play);
		const { ok, said } = await load(changed(bundle, 2024 + at));
		await control();
		must(
			!ok && said.includes("The stored release is damaged: it names this file, and holds ") && said.includes(says("boards", -1)),
			`a release that is written damaged: ${said}`,
		);
	}
	await sql("DROP TRIGGER lost");
	must((await load(changed(bundle, 2026))).ok, "a whole load after it");
	must((await load(bundle)).ok, "and the old content again");
	expect(true, "a release that is damaged as it is written is said to be, answered or not; the next whole load puts it right");
}

/** A machine whose clock is wrong, at every command. */
async function wrongClock(bundle: BundleFile) {
	let year = 2100;
	for (const skew of [-300, 300, -3_600, 86_400]) {
		const env = { REHEARSAL_SKEW: String(skew) };
		const args = ["--stage", "preview"];
		const told = (said: string) => {
			const [, database = "", machine = ""] =
				/may still be made until (\S+Z) by the database's clock, (\S+Z) by this machine's, and not after\./.exec(said) ?? [];
			const off = (text: string, by: number) => Math.abs(Date.parse(text) - Date.now() - 600_000 - by * 1_000);
			return off(database, 0) < 60_000 && off(machine, skew) < 60_000;
		};
		const before = await dump();
		// What arrives in time is made, and what does not is not, whatever this clock says.
		for (const aged of [620, -620]) {
			await control({ aged });
			const late = await load(changed(bundle, year), args, env);
			must(
				!late.ok && /CHECK constraint failed/.test(late.said) && told(late.said) && (await dump()) === before,
				`${skew} s wrong, a load ${aged} s late: ${late.said}`,
			);
		}
		await control({ aged: 590 });
		const inTime = await load(changed(bundle, year), args, env);
		await control();
		must(inTime.ok, `${skew} s wrong, a load 590 s late: ${inTime.said}`);
		const stored = (await sql("SELECT loaded_at FROM releases ORDER BY seq DESC LIMIT 1"))[0]?.loaded_at;
		must(
			Math.abs(Date.parse(String(stored)) + 590_000 - Date.now()) < 60_000,
			`${skew} s wrong: the release is stored as loaded at ${stored}`,
		);
		must((await run("signup-switch", ["open", ...args], env)).ok, `${skew} s wrong: the switch opens`);
		await control({ aged: 620 });
		const late = await run("signup-switch", ["closed", ...args], env);
		await control({ aged: 590 });
		const closed = await run("signup-switch", ["closed", ...args], env);
		await control();
		must(
			late.said.includes("reads back as open, not closed") && closed.ok,
			`${skew} s wrong, the switch: ${late.said} ${closed.said}`,
		);
		await sql("CREATE TRIGGER broken BEFORE UPDATE ON settings BEGIN SELECT RAISE(ABORT, 'broken'); END");
		const unsure = await run("signup-switch", ["open", ...args], env);
		await sql("DROP TRIGGER broken");
		must(!unsure.ok && told(unsure.said), `${skew} s wrong, a switch that fails: ${unsure.said}`);
		await sessionEnds(bundle, env);
		year += 1;
	}
	must((await load(bundle)).ok, "and the old content again");
	expect(
		true,
		"a machine whose clock is 5 minutes, an hour or a day wrong, fast or slow: what arrives after 590 s is made, after 620 s not, the session's deadline and the stored time are right, and what is said names both clocks",
	);
	await control();
}

/** The deadline of the edge preview that a load asks for. */
async function sessionEnds(bundle: BundleFile, env: Record<string, string> = {}) {
	requests = [];
	uploaded = "";
	const { ok, said } = await load(bundle, undefined, { D1_PROXY: "", ...env });
	const metadata =
		/name="metadata"[\s\S]*?\r\n\r\n([\s\S]*?)\r\n--/.exec(uploaded)?.[1] ??
		"{}";
	const { bindings } = JSON.parse(metadata) as {
		bindings?: { name: string; text?: string }[];
	};
	const ends = bindings?.find(({ name }) => name === "UNTIL")?.text ?? "";
	must(
		/^\d{13}$/.test(ends) &&
			Number(ends) > Date.now() + 480_000 &&
			Number(ends) <= Date.now() + 600_000 &&
			uploaded.includes("The session is over."),
		`the edge preview ends by itself within ten minutes: ${ends}`,
	);
	return { ok, said, bindings, ends };
}

async function interrupted(bundle: BundleFile) {
	const old = await dump();
	// Half way: the batch's last-but-one statement fails, inside the database.
	await control({ spoil: true });
	const spoiled = await load(changed(bundle, 2031));
	expect(
		!spoiled.ok &&
			/The load failed, whole: D1: /.test(spoiled.said) &&
			/Release \d+ is there\. If the database never answered, the load may still be made until \S+Z by the database's clock, \S+Z by this machine's, and not after\. Run the same command again/.test(
				spoiled.said,
			) &&
			(await dump()) === old,
		"a batch that fails half way leaves the old release whole, says which one is there, and until when a load may still land",
	);
	// A write that was held back, and one through a session that somebody left behind.
	await control({ aged: 590 });
	const inTime = await load(changed(bundle, 2030));
	must(inTime.ok, `a load held back for 590 s is made: ${inTime.said}`);
	must((await load(bundle)).ok, "and the old content again");
	const whole_ = await dump();
	for (const aged of [620, 86_400, -620]) {
		await control({ aged });
		const late = await load(changed(bundle, 2031));
		must(
			!late.ok &&
				/CHECK constraint failed: item_count > 0/.test(late.said) &&
				(await dump()) === whole_,
			`a load that arrives ${aged} s late: ${late.said}`,
		);
	}
	await control();
	const opened = await run("signup-switch", ["open", "--stage", "preview"]);
	must(opened.ok, opened.said);
	await control({ aged: 620 });
	const tooLate = await run("signup-switch", ["closed", "--stage", "preview"]);
	await control();
	must(
		!tooLate.ok && tooLate.said.includes("reads back as open, not closed"),
		`a switch that arrives late: ${tooLate.said}`,
	);
	await run("signup-switch", ["closed", "--stage", "preview"]);
	await control({ until: String(Date.now() - 1) });
	const over = await load(changed(bundle, 2031));
	const overSwitch = await run("signup-switch", [
		"open",
		"--stage",
		"preview",
	]);
	must(
		!over.ok && !overSwitch.ok && (await dump()) === whole_,
		`after the session's deadline: ${over.said} ${overSwitch.said}`,
	);
	for (const until of ["", "soon"]) {
		await control({ until });
		must(!(await load(changed(bundle, 2031))).ok, `a deadline of "${until}"`);
	}
	await control();
	expect(
		(await dump()) === whole_,
		"a load that arrives later than ten minutes after it was asked for, or through a session past its deadline, changes nothing",
	);
	// The answer is lost after it was done.
	await control({ drop: true });
	const lost = await load(changed(bundle, 2032));
	await control();
	expect(
		lost.ok &&
			/Release \d+: .*the answer was lost, and the release is there/.test(
				lost.said,
			),
		"a load whose answer is lost is read back, and said to be there",
	);
	// Two loads that start from the same release, both held until both are there.
	const base = await dump();
	await control({ gather: 2 });
	const both = await Promise.all([
		load(changed(bundle, 2033)),
		load(changed(bundle, 2034)),
	]);
	await control();
	const winner = both.find(({ ok }) => ok);
	const loser = both.find(({ ok }) => !ok);
	const [{ n: now_ } = { n: 0 }] = await sql(
		"SELECT max(seq) AS n FROM releases",
	);
	expect(
		winner?.said.includes(`Release ${now_}: `) === true &&
			/UNIQUE constraint failed: releases\.seq/.test(loser?.said ?? "") &&
			loser?.said.includes(`Release ${now_} is there`) === true &&
			(await sql("SELECT count(*) AS n FROM releases"))[0]?.n === now_ &&
			(await dump()) !== base,
		"of two loads from the same release one finishes and the other fails whole, and says so",
	);
	// The client killed, at different moments of the load.
	let kept = 0;
	let finished = 0;
	for (const [at, delay] of [0, 0, 5, 10, 20, 30, 45, 60, 90, 140].entries()) {
		const before = await dump();
		const next = changed(bundle, 2040 + at);
		const going = start(
			"load-docket",
			[fileOf(next), "--stage", "preview"],
			{},
		);
		for (let i = 0; !going.said().includes("Loading"); i++) {
			must(i < 3_000, `the load began: ${going.said()}`);
			await sleep(10);
		}
		await sleep(delay);
		going.kill();
		await going.ended;
		// What it had sent is done or not by then; the database answers in order.
		await sleep(250);
		const after = await dump();
		if (after === before) kept += 1;
		else {
			finished += 1;
			must(
				content(after).split(`(${2040 + at})`).length - 1 >=
					bundle.items.length &&
					(await sql("SELECT count(*) AS n FROM items"))[0]?.n ===
						bundle.items.length,
				`a load killed after ${delay} ms left something else`,
			);
		}
		const again = await load(next);
		must(
			again.ok && /Release \d+( is this file already|: )/.test(again.said),
			`the same command after the kill: ${again.said}`,
		);
	}
	expect(
		kept + finished === 10,
		`of 10 loads whose client was killed, ${kept} left the old release whole and ${finished} the new one, none anything else; the same command again finishes each`,
	);
	// The binding itself, through the same proxy: a wrong statement anywhere.
	const database = await openRemote(DATABASE, cloudOrigin);
	const whole = await dump();
	const current = (await database.batch([CURRENT]))[0]?.rows[0];
	const good = loadStatements(
		readBundle(changed(bundle, 2060)),
		{ seq: Number(current?.seq), digest: "", items: bundle.items.length },
		undefined,
		new Date().toISOString(),
	);
	for (const place of [0, 1, 4, Math.floor(good.length / 2), good.length]) {
		const bad = [...good];
		bad.splice(place, 0, ["INSERT INTO items (id) VALUES (NULL)", []]);
		must(
			(await database.batch(bad).catch(() => "failed")) === "failed" &&
				(await dump()) === whole,
			`a wrong statement at ${place} rolls the batch back`,
		);
	}
	await database.close();
	expect(
		true,
		"a wrong statement in any of 5 places rolls the whole batch back",
	);
	await control();
}

async function switchAndReport() {
	await sql(
		`INSERT INTO signups (email, role, towns, token_hash, created_at) VALUES ('seen-by-nobody@example.com', 'resident', '["aldermoor"]', '${"7".repeat(64)}', 1)`,
	);
	const args = ["--stage", "preview"];
	const opened = await run("signup-switch", ["open", ...args]);
	const asked = await control();
	must(
		opened.said === "Stage: preview\nSign-up is open." &&
			(await sql("SELECT signup_open AS n FROM settings"))[0]?.n === 1 &&
			// The tables, the time, the one statement, the read back.
			asked.length === 4 &&
			asked.every(({ statements }) => statements === 1),
		`opened: ${opened.said} ${JSON.stringify(asked)}`,
	);
	const closed = await run("signup-switch", ["closed", ...args]);
	expect(
		closed.ok &&
			closed.said === "Stage: preview\nSign-up is closed." &&
			(await sql("SELECT signup_open AS n FROM settings"))[0]?.n === 0,
		"the switch opens and closes with one statement, and says what it read back",
	);
	await sql(
		"CREATE TRIGGER stuck AFTER UPDATE ON settings BEGIN UPDATE settings SET signup_open = 0; END",
	);
	const stuck = await run("signup-switch", ["open", ...args]);
	await sql("DROP TRIGGER stuck");
	expect(
		!stuck.ok && stuck.said.includes("Sign-up reads back as closed, not open."),
		"a switch that does not read back as asked fails",
	);
	await sql("DELETE FROM settings");
	for (const to of ["open", "closed"]) {
		const { ok, said } = await run("signup-switch", [to, ...args]);
		must(
			!ok &&
				said ===
					"Stage: preview\nThe settings row is missing, so sign-up is closed and nothing was changed. Put the row back (docs/runbooks/release.md, section 5), then run the same command again." &&
				(await sql("SELECT count(*) AS n FROM settings"))[0]?.n === 0,
			`${to}, without the settings row: ${said}`,
		);
	}
	// As the runbook puts it back.
	const runbook = readFileSync(`${root}docs/runbooks/release.md`, "utf8");
	const [, back = ""] = /\{"sql":"(INSERT INTO settings [^"]*)"\}/.exec(runbook) ?? [];
	await sql(back);
	const closedAgain = await run("signup-switch", ["closed", ...args]);
	expect(
		closedAgain.ok && closedAgain.said === "Stage: preview\nSign-up is closed.",
		"without the settings row the switch says that it is missing and what to do, and the runbook's statement puts it back, closed",
	);
	const report = await run("report-docket", args);
	const [first, ...rest] = report.said.split("\n");
	const counts = JSON.parse(rest.join("\n")) as Record<string, unknown>;
	expect(
		first === "Stage: preview" &&
			counts.signups === 1 &&
			counts.signup_open === false &&
			typeof counts.release === "number" &&
			JSON.stringify(counts.requests_by_utc_day) === "{}" &&
			!/@|[0-9a-f]{32}/.test(report.said),
		"the report of a stage holds counts and no address or hash",
	);
	await sql("DELETE FROM signups");
	await control();
}

/** What Wrangler is told to open, as far as the API goes. */
async function session(bundle: BundleFile) {
	const { ok, said, bindings, ends } = await sessionEnds(bundle);
	expect(
		!ok &&
			/Not connected, and nothing was read or written/.test(said) &&
			uploaded.startsWith(
				`/accounts/${ACCOUNT}/workers/scripts/civic-docket-load/edge-preview`,
			) &&
			JSON.stringify(bindings) ===
				JSON.stringify([
					{ name: "UNTIL", type: "plain_text", text: ends },
					{ name: "DB", type: "d1", id: DATABASE, raw: true },
				]),
		`Wrangler is told to open one binding, this database, in an edge preview with a deadline: ${JSON.stringify(bindings)}`,
	);
	const written = requests.filter((one) => !one.startsWith("GET "));
	expect(
		written.every((one) => one.endsWith("/civic-docket-load/edge-preview")) &&
			!requests.some((one) => /\/(domains|routes|subdomain$)/.test(one)),
		`and it deploys nothing: ${[...new Set(requests)].join(", ").replaceAll(ACCOUNT, "…").replaceAll(DATABASE, "…")}`,
	);
	expect(
		(await control()).length === 0,
		"a session that fails has asked the database nothing",
	);
	const elsewhere = await load(bundle, undefined, {
		D1_PROXY: "http://proxy.example:80",
	});
	must(
		!elsewhere.ok && /D1_PROXY is the rehearsal's/.test(elsewhere.said),
		elsewhere.said,
	);
}

try {
	mkdirSync(scratch, { recursive: true });
	await new Promise<void>((resolve) =>
		api.listen(0, "127.0.0.1", () => resolve()),
	);
	apiOrigin = `http://127.0.0.1:${(api.address() as AddressInfo).port}`;
	await startCloud();
	const bundle = readBundleFile();
	await refusedFirst(bundle);
	await wrongDatabase(bundle);
	await loading(bundle);
	await damaged(bundle);
	await wrongClock(bundle);
	await interrupted(bundle);
	await switchAndReport();
	await session(bundle);
	const said = everything.join("\n");
	expect(
		PRIVATE.every((value) => !said.includes(value)),
		`none of what ${everything.length} runs printed holds the account, the database or the token`,
	);
	done();
} catch (error) {
	console.error(error instanceof Error ? error.message : error);
	process.exitCode = 1;
} finally {
	api.closeAllConnections();
	api.close();
	await cloud?.dispose();
	rmSync(scratch, { recursive: true, force: true });
}
