// A stage's own database, for the operator's scripts: load-docket.ts,
// report-docket.ts and signup-switch.ts (docs/runbooks/release.md, section 6). It is
// found by what the stage's Worker is bound to, refused unless it is this app's
// database of that stage, and asked through the D1 binding, whose batch is one
// transaction. Nothing is deployed.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { WORKERS } from "../src/lib/site";
import {
	account,
	CLOUDFLARE,
	call,
	Declined,
	deployToken,
} from "./cloudflare-api";
import { SESSION_SECONDS } from "./docket-bundle";
import { type Database, openDatabase, openRemote } from "./local-d1";
import { mask, redact } from "./public-log";

const root = fileURLToPath(new URL("..", import.meta.url));

/** What every operator's script takes besides its own. */
export const STAGE_OPTIONS = {
	stage: { type: "string" },
	state: { type: "string" },
	"production-approved": { type: "string" },
} as const;

interface Chosen {
	stage?: string;
	state?: string;
	"production-approved"?: string;
}

/**
 * The stage a script is about, said on its first line; `open` connects to it.
 * Production wants the commit that was approved and is deployed there.
 */
export function chooseStage(values: Chosen) {
	const stage = values.stage ?? "local";
	if (stage !== "local" && stage !== "preview" && stage !== "production")
		throw new Error("--stage is preview or production.");
	console.log(`Stage: ${stage}`);
	const approved = values["production-approved"]?.trim();
	if (stage !== "local" && values.state !== undefined)
		throw new Error("--state is the local database's.");
	if (stage !== "production" && approved !== undefined)
		throw new Error("--production-approved is production's.");
	if (stage === "production" && !/^[0-9a-f]{40}$/.test(approved ?? ""))
		throw new Error(
			"Production is refused without --production-approved <the merge commit that is deployed, the full SHA>.",
		);
	return {
		stage,
		open: (): Promise<Database> =>
			stage === "local"
				? openDatabase(values.state)
				: openStage(stage, approved),
	};
}

interface Binding {
	type?: string;
	name?: string;
	text?: string;
	id?: string;
	database_id?: string;
}

/** The database the stage's Worker is bound to, if all of it is this app's. */
async function findDatabase(
	token: string,
	accountId: string,
	stage: "preview" | "production",
	approved: string | undefined,
) {
	const name = WORKERS[stage];
	const refuse = (why: string): never => {
		throw new Error(`Refused, and nothing was read or written: ${why}.`);
	};
	const { bindings = [] } = await call<{ bindings?: Binding[] }>(
		token,
		"GET",
		`/accounts/${accountId}/workers/scripts/${name}/settings`,
	).catch((error: unknown) => {
		if (error instanceof Declined && error.codes.includes(10007))
			return refuse(`there is no Worker ${name}`);
		throw error;
	});
	const plain = (key: string) =>
		bindings.find((one) => one.type === "plain_text" && one.name === key)?.text;
	if (plain("APP_ENV") !== stage)
		refuse(`Worker ${name} is not stage ${stage}`);
	if (approved && plain("APP_RELEASE") !== approved)
		refuse(
			`Worker ${name} is not at the approved commit ${approved.slice(0, 12)}`,
		);
	const databases = bindings.filter(({ type }) => type === "d1");
	const [only, second] = databases;
	const id = only?.id ?? only?.database_id ?? "";
	if (only?.name !== "DB" || second || !/^[0-9a-f-]{36}$/.test(id))
		return refuse(`Worker ${name} is not bound to one database, as DB`);
	mask(id);
	const database = await call<{ uuid?: string; name?: string }>(
		token,
		"GET",
		`/accounts/${accountId}/d1/database/${id}`,
	);
	// The name Alchemy gives this stack's `Database` of this stage.
	if (
		database.uuid !== id ||
		!new RegExp(`^civic-docket-Database-${stage}-[a-z0-9]{16}$`, "i").test(
			database.name ?? "",
		)
	)
		refuse(`the database of Worker ${name} is not this app's of ${stage}`);
	return id;
}

/** Wrangler's connection (remote-proxy.ts), or a rehearsal's on this machine. */
async function connect(token: string, accountId: string, id: string) {
	const played = process.env.D1_PROXY?.trim();
	if (played) {
		if (
			!CLOUDFLARE.startsWith("http://127.0.0.1") ||
			!/^http:\/\/127\.0\.0\.1:\d+$/.test(played)
		)
			throw new Error("D1_PROXY is the rehearsal's, on 127.0.0.1.");
		return { connection: played, end: () => {} };
	}
	const until = String(Date.now() + SESSION_SECONDS * 1_000);
	const child = spawn("node", ["scripts/remote-proxy.ts", id, until], {
		cwd: root,
		stdio: ["pipe", "pipe", "pipe"],
		env: {
			PATH: process.env.PATH,
			HOME: process.env.HOME,
			CI: "1",
			CLOUDFLARE_ACCOUNT_ID: accountId,
			CLOUDFLARE_API_TOKEN: token,
			CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: "false",
			WRANGLER_LOG: "error",
			WRANGLER_SEND_METRICS: "false",
			...(CLOUDFLARE.startsWith("http://127.0.0.1")
				? { CLOUDFLARE_API_BASE_URL: `${CLOUDFLARE}/client/v4` }
				: {}),
		} as unknown as NodeJS.ProcessEnv,
	});
	const end = () => {
		child.stdin.end();
		child.kill();
	};
	return new Promise<{ connection: string; end: () => void }>(
		(resolve, reject) => {
			let output = "";
			const fail = (why: string) => {
				clearTimeout(late);
				end();
				reject(
					new Error(
						`Not connected, and nothing was read or written: ${why}\n${redact(output).slice(-2_000)}`,
					),
				);
			};
			const late = setTimeout(() => fail("no answer in 90 seconds"), 90_000);
			for (const stream of [child.stdout, child.stderr])
				stream.on("data", (chunk: Buffer) => {
					output += chunk.toString();
					const line = output.match(/^\{"connection":"(http:[^"]+)"\}$/m);
					if (!line?.[1]) return;
					clearTimeout(late);
					resolve({ connection: line[1], end });
				});
			child.on("error", () => fail("node is not here"));
			child.on("close", () => fail("Wrangler gave up"));
		},
	);
}

/** Tables of migrations/0001_docket.sql: another database does not have them all. */
const TABLES = [
	"boards",
	"counters",
	"items",
	"meetings",
	"releases",
	"settings",
	"signup_attempts",
	"signups",
	"towns",
	"withdrawn_items",
];

async function openStage(
	stage: "preview" | "production",
	approved: string | undefined,
): Promise<Database> {
	const token = deployToken();
	const accountId = await account(token);
	const id = await findDatabase(token, accountId, stage, approved);
	const { connection, end } = await connect(token, accountId, id);
	const database = await openRemote(id, connection);
	const close = async () => {
		await database.close();
		end();
	};
	try {
		const held = await database.rows(
			`SELECT name FROM sqlite_master WHERE type = 'table' AND name IN (${TABLES.map((table) => `'${table}'`).join(", ")}) ORDER BY name`,
		);
		if (held.map(({ name }) => name).join() !== TABLES.join())
			throw new Error(
				`Refused, and nothing was written: the database of stage ${stage} does not have this app's tables.`,
			);
	} catch (error) {
		await close();
		throw error;
	}
	return { ...database, close };
}
