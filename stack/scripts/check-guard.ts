// `unshare -rn bun run check:guard`: what each stage declares, and the guard's refusal
// matrix (docs/runbooks/release.md; no unit tests, Jesse 2026-10-09). Runs the real
// guard, Alchemy's real CLI on the real stack file, and the domain, wait and operator's
// scripts, each in a clean environment with an invented account and token, and reads
// what they say. It refuses to run with a network, so nothing can reach Cloudflare: an
// allowed case is one that gets as far as Alchemy's state store and finds nobody there.
// Needs a clean checkout (an apply does too).
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { CALLS } from "../src/lib/limits";
import { ALCHEMY_COMPATIBILITY } from "./alchemy-build";

const root = fileURLToPath(new URL("..", import.meta.url));
const git = (...args: string[]) => {
	const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
	if (result.status !== 0) throw new Error(`git ${args[0]} failed`);
	return result.stdout.trim();
};
const HEAD = git("rev-parse", "HEAD");
/** A real commit that is not HEAD. */
const OTHER = git("rev-parse", "HEAD~1");
const home = mkdtempSync(join(tmpdir(), "civic-guard-"));
/** Untracked, so it makes the tree dirty without changing a file. */
const probe = `${root}guard-probe.txt`;

type Env = Record<string, string>;
const base: Env = {
	PATH: process.env.PATH ?? "/usr/bin:/bin",
	HOME: home,
	ALCHEMY_TELEMETRY_DISABLED: "1",
	DO_NOT_TRACK: "1",
	CLOUDFLARE_ACCOUNT_ID: "0".repeat(32),
	CLOUDFLARE_API_TOKEN: "synthetic-not-a-token",
	APP_RELEASE: HEAD,
};
const preview: Env = {
	...base,
	ALCHEMY_STAGE: "preview",
	ALCHEMY_PROFILE: "civic-docket-preview",
};
const production: Env = {
	...base,
	ALCHEMY_STAGE: "production",
	ALCHEMY_PROFILE: "civic-docket-production-ci",
};
const WORKFLOWS = "jessewalberg/civic-observatory/.github/workflows";
/** Everything production.yml's job has. */
const job: Env = {
	...production,
	GITHUB_ACTIONS: "true",
	RUNNER_ENVIRONMENT: "github-hosted",
	GITHUB_EVENT_NAME: "push",
	GITHUB_REF: "refs/heads/main",
	GITHUB_WORKFLOW_REF: `${WORKFLOWS}/production.yml@refs/heads/main`,
	CIVIC_PRODUCTION_RELEASE: "production.yml",
};
const without = (env: Env, ...names: string[]): Env =>
	Object.fromEntries(
		Object.entries(env).filter(([name]) => !names.includes(name)),
	);

const guard = (...args: string[]) => ["scripts/infra.ts", ...args];
const domain = (...args: string[]) => ["scripts/production-domain.ts", ...args];
/** Alchemy's own CLI on the stack file, past the guard script. */
const direct = (stage: string, ...args: string[]) => [
	"node_modules/alchemy/bin/cli.js",
	...args,
	"--stage",
	stage,
	"--profile",
	"civic-guard",
	"--config",
	"alchemy.run.ts",
];

function run(args: string[], env: Env, until?: string) {
	return new Promise<{ code: number | null; output: string }>((resolve) => {
		const child = spawn(process.execPath, args, {
			cwd: root,
			// Only what the case names: none of this process's own environment.
			env: env as unknown as NodeJS.ProcessEnv,
			detached: true,
			stdio: ["ignore", "pipe", "pipe"],
		});
		// Its whole group: Alchemy's CLI runs the stack file in a second process.
		const kill = () => {
			try {
				if (child.pid) process.kill(-child.pid, "SIGKILL");
			} catch {
				// Already gone.
			}
		};
		const stop = setTimeout(kill, 180_000);
		let output = "";
		for (const stream of [child.stdout, child.stderr])
			stream.on("data", (chunk) => {
				// Time enough to show what it would do after saying so.
				if (until && !output.includes(until) && `${output}${chunk}`.includes(until))
					setTimeout(kill, 5_000);
				output += chunk;
			});
		child.on("close", (code) => {
			clearTimeout(stop);
			resolve({ code, output });
		});
	});
}

/** Only the cases whose name holds this, for a break; a whole run names none. */
const CASE = process.env.STACK_GUARD_CASE ?? "";
let cases = 0;
interface Case {
	name: string;
	args: string[];
	env: Env;
	/** What a refusal says. */
	says?: string;
	/** It refuses and then waits for the file to change, as `alchemy dev` does. */
	waits?: true;
	/** Allowed: it reached Alchemy's state store, and no network answered. */
	allowed?: true;
}

async function check({ name, args, env, says, waits, allowed }: Case) {
	if (!name.includes(CASE)) return;
	const { code, output } = await run(args, env, waits && says);
	const reached = output.includes("Loading stack state");
	const good = allowed
		? reached && /Transport error/.test(output)
		: code !== 0 && !reached && output.includes(says ?? "");
	if (!good)
		throw new Error(`check:guard failed: ${name} (exit ${code})\n${output}`);
	cases += 1;
	console.log(
		allowed
			? `ok - allowed, as far as the state store: ${name}`
			: `ok - refused: ${name}: ${says}`,
	);
}

interface Declared {
	resources: Record<string, string>;
	props: Record<string, Record<string, unknown>>;
	output: unknown;
	name: string;
	main: string;
	domain: unknown;
	workersDev: unknown;
	crons: unknown;
	assets: unknown;
	accessName: unknown;
	access: unknown;
	observability: {
		logs?: { invocationLogs?: boolean };
		traces?: { enabled?: boolean };
	};
	compatibility: { date?: string; flags?: string[] };
	env: Record<string, unknown>;
}

/** The stack file evaluated for one stage (scripts/declared-stage.ts). */
async function declared(env: Env): Promise<Declared> {
	const { output } = await run(["scripts/declared-stage.ts", "plan"], env);
	const line = output.split("\n").find((text) => text.startsWith("{"));
	if (!line) throw new Error(`check:guard failed: no stage\n${output}`);
	return JSON.parse(line) as Declared;
}

/** What each stage declares (README.md, "Stages and release"). */
async function checkStages() {
	const [live, first, preview_] = await Promise.all([
		declared(production),
		declared({ ...production, PRODUCTION_DOMAIN: "unmanaged" }),
		declared(preview),
	]);
	const same = (one: unknown, other: unknown) =>
		JSON.stringify(one) === JSON.stringify(other);
	const both = [live, preview_];
	const bindings = (stage: "preview" | "production") => ({
		APP_ENV: stage,
		APP_RELEASE: HEAD,
		DB: "Cloudflare.D1Database",
		REQUEST_RECORDS: "Cloudflare.AnalyticsEngine.Dataset civic_docket_requests",
		SIGNUP_CLIENT_KEY: "SignupClientKey.text",
		[CALLS.binding]: {
			namespaceId: stage === "production" ? "860301" : "860311",
			simple: { limit: 60, period: 60 },
		},
	});
	// wrangler.jsonc, which the checks run with: comments are whole lines there.
	const local = JSON.parse(
		readFileSync(`${root}wrangler.jsonc`, "utf8").replace(/^\s*\/\/.*$/gm, ""),
	) as {
		compatibility_date: string;
		compatibility_flags: string[];
		assets: { run_worker_first: string[] };
		main: string;
	};
	const facts: [string, boolean][] = [
		[
			"production: its own Worker, on civicobservatory.com only, with workers.dev off",
			live.name === "civic-docket-production" &&
				live.domain === "civicobservatory.com" &&
				live.workersDev === false,
		],
		[
			"production, the first cutover's first apply: the same stage without the domain, on workers.dev without version previews",
			first.domain === null &&
				same(first.workersDev, { enabled: true, previewsEnabled: false }) &&
				same(first.resources, live.resources) &&
				same(first.env, live.env),
		],
		[
			"production: public, with no Access application, policy or token",
			live.access === null &&
				!JSON.stringify(live.resources).includes("Access"),
		],
		[
			"production: its database is retained whatever happens to its declaration",
			live.resources.Database === "Cloudflare.D1Database, retain",
		],
		[
			"preview: its own Worker behind one Access policy, version previews too, which admits the service token and nobody else",
			preview_.name === "civic-docket-preview" &&
				preview_.accessName === "civic-docket-preview (systems only)" &&
				preview_.domain === null &&
				same(preview_.access, {
					previews: true,
					policies: [["non_identity", "serviceToken"]],
				}),
		],
		[
			"both: exactly the bindings the README names, the key minted by the stage, one counter of its own each; no LOCAL_TODAY",
			same(live.env, bindings("production")) &&
				same(preview_.env, bindings("preview")) &&
				!same(CALLS.namespace.production, CALLS.namespace.preview),
		],
		[
			"both: the same resources under the same logical IDs; no bucket, queue, email, model or cron",
			same(Object.keys(live.resources), [
				"Database",
				"SignupClientKey",
				"Website",
			]) &&
				same(Object.keys(preview_.resources), [
					"Database",
					"SignupClientKey",
					"Verifier",
					"Website",
					"Website/Access",
				]) &&
				both.every(({ crons }) => crons === null),
		],
		[
			"both: the sign-up key has 32 bytes, and the database the migrations of this folder",
			both.every(
				({ props }) =>
					props.SignupClientKey?.bytes === 32 &&
					same(props.Database, { migrations: "./migrations" }),
			),
		],
		[
			"both: no invocation logs and no traces, which hold URLs and addresses",
			both.every(
				({ observability }) =>
					observability.logs?.invocationLogs === false &&
					observability.traces?.enabled === false,
			),
		],
		[
			"both: the Worker first for robots.txt, and the entry, compatibility and settings the checks build and run with",
			both.every(
				({ assets, main, compatibility }) =>
					same(assets, { runWorkerFirst: local.assets.run_worker_first }) &&
					same(local.assets.run_worker_first, ["/robots.txt"]) &&
					main === local.main &&
					same(compatibility, {
						date: local.compatibility_date,
						flags: local.compatibility_flags,
					}) &&
					same(compatibility, {
						date: ALCHEMY_COMPATIBILITY.compatibilityDate,
						flags: ALCHEMY_COMPATIBILITY.compatibilityFlags,
					}),
			),
		],
		[
			"both: what Alchemy prints at the end holds the stage and the commit and no ID or address",
			same(live.output, { environment: "production", release: HEAD }) &&
				same(preview_.output, { environment: "preview", release: HEAD }),
		],
	];
	for (const [name, good] of facts) {
		if (!name.includes(CASE)) continue;
		if (!good)
			throw new Error(
				`check:guard failed: ${name}\n${JSON.stringify({ live, first, preview: preview_ }, null, 1)}`,
			);
		cases += 1;
		console.log(`ok - declared: ${name}`);
	}
}

const refusedIn = (what: string, why: string) =>
	`${what} only in production.yml's job after a push to main (${why}).`;

/** Every way the process can fall short of production.yml's job. */
const NOT_THE_JOB: [string, Env, string][] = [
	["no CI at all", without(job, "GITHUB_ACTIONS"), "not GitHub Actions"],
	[
		"a self-hosted runner",
		{ ...job, RUNNER_ENVIRONMENT: "self-hosted" },
		"not a GitHub-hosted runner",
	],
	...["pull_request", "pull_request_target", "workflow_dispatch", "schedule"].map(
		(event): [string, Env, string] => [
			`a ${event} event`,
			{ ...job, GITHUB_EVENT_NAME: event },
			"not a push",
		],
	),
	...["refs/heads/t3/civic-stages", "refs/pull/1/merge", "refs/tags/v1"].map(
		(ref): [string, Env, string] => [
			ref,
			{ ...job, GITHUB_REF: ref },
			"not refs/heads/main",
		],
	),
	...[
		`${WORKFLOWS}/deploy.yml@refs/heads/main`,
		`${WORKFLOWS}/production.yml@refs/heads/other`,
		"somebody/civic-observatory/.github/workflows/production.yml@refs/heads/main",
	].map((workflow): [string, Env, string] => [
		`workflow ${workflow}`,
		{ ...job, GITHUB_WORKFLOW_REF: workflow },
		"not the production workflow",
	]),
	[
		"the job's marker missing",
		without(job, "CIVIC_PRODUCTION_RELEASE"),
		"the production job's marker is missing",
	],
	...["CLAUDECODE", "CLAUDE_CODE_CHILD_SESSION", "CODEX_HOME", "T3CODE_SESSION"].map(
		(name): [string, Env, string] => [
			`an agent session (${name})`,
			{ ...job, [name]: "1" },
			`a coding-agent session (${name})`,
		],
	),
];

const COMMIT = "Deploy refused: APP_RELEASE must be HEAD, the full SHA.";
const DESTROY = "Destroy is refused for the preview and production stages.";
const USE_DOMAIN = "Use: bun scripts/production-domain.ts inspect|move|restore";
const APPROVED = ["--stage", "production", "--production-approved", "a".repeat(40)];
const REFUSED: Case[] = [
	// Production, through the guard.
	...NOT_THE_JOB.map(([name, env, why]) => ({
		name: `guard, production, ${name}`,
		args: guard("deploy", "--yes"),
		env,
		says: refusedIn("Production deploys run", why),
	})),
	{
		name: "guard, the job, without --yes",
		args: guard("deploy"),
		env: job,
		says: "The production job deploys with --yes.",
	},
	{
		name: "guard, the job, PRODUCTION_DOMAIN=cutover",
		args: guard("deploy", "--yes"),
		env: { ...job, PRODUCTION_DOMAIN: "cutover" },
		says: "Set PRODUCTION_DOMAIN to managed or unmanaged.",
	},
	{
		name: "guard, the job, APP_RELEASE another commit",
		args: guard("deploy", "--yes"),
		env: { ...job, APP_RELEASE: OTHER },
		says: COMMIT,
	},
	{
		name: "guard, the job, APP_RELEASE a short SHA",
		args: guard("deploy", "--yes"),
		env: { ...job, APP_RELEASE: HEAD.slice(0, 12) },
		says: COMMIT,
	},
	// Production, past the guard: Alchemy's CLI on the stack file.
	...NOT_THE_JOB.map(([name, env, why]) => ({
		name: `direct, production, ${name}`,
		args: direct("production", "deploy", "--yes"),
		env,
		says: refusedIn("Production deploys run", why),
	})),
	{
		name: "direct, production deploy --dry-run, not the job",
		args: direct("production", "deploy", "--dry-run"),
		env: production,
		says: "Production deploys run only in",
	},
	{
		name: "direct, production dev, not the job",
		args: direct("production", "dev"),
		env: production,
		says: "Production deploys run only in",
		waits: true,
	},
	{
		name: "direct, production destroy, the job itself",
		args: direct("production", "destroy", "--yes"),
		env: job,
		says: DESTROY,
	},
	{
		name: "direct, the job, APP_RELEASE another commit",
		args: direct("production", "deploy", "--yes"),
		env: { ...job, APP_RELEASE: OTHER },
		says: COMMIT,
	},
	{
		name: "direct, stage production with ALCHEMY_STAGE=preview",
		args: direct("production", "deploy", "--yes"),
		env: preview,
		says: "CLI stage must match ALCHEMY_STAGE",
	},
	// Preview and the command line.
	{
		name: "guard, preview with PRODUCTION_DOMAIN",
		args: guard("deploy", "--yes"),
		env: { ...preview, PRODUCTION_DOMAIN: "managed" },
		says: "PRODUCTION_DOMAIN applies only to the production stage.",
	},
	{
		name: "guard, preview, APP_RELEASE another commit",
		args: guard("deploy", "--yes"),
		env: { ...preview, APP_RELEASE: OTHER },
		says: COMMIT,
	},
	{
		name: "direct, preview, APP_RELEASE another commit",
		args: direct("preview", "deploy", "--yes"),
		env: { ...preview, APP_RELEASE: OTHER },
		says: COMMIT,
	},
	{
		name: "direct, preview destroy",
		args: direct("preview", "destroy", "--yes"),
		env: preview,
		says: DESTROY,
	},
	{
		name: "guard, plan --yes",
		args: guard("plan", "--yes"),
		env: preview,
		says: "--yes is allowed only for deploys.",
	},
	{
		name: "guard, an extra argument",
		args: guard("deploy", "--yes", "--force"),
		env: preview,
		says: "Use plan or deploy",
	},
	{
		name: "guard, destroy",
		args: guard("destroy"),
		env: preview,
		says: "Use plan or deploy",
	},
	...["staging", "isolated-preview", "Production", "pr-1", ""].map((stage) => ({
		name: `guard, stage "${stage}"`,
		args: guard("plan"),
		env: { ...preview, ALCHEMY_STAGE: stage },
		says: "Set ALCHEMY_STAGE to preview or production.",
	})),
	{
		name: "guard, an unreadable account ID",
		args: guard("plan"),
		env: { ...preview, CLOUDFLARE_ACCOUNT_ID: "the account" },
		says: "Set the approved CLOUDFLARE_ACCOUNT_ID",
	},
	{
		name: "guard, a release that is no commit",
		args: guard("plan"),
		env: { ...preview, APP_RELEASE: "main" },
		says: "Set APP_RELEASE to the full reviewed commit SHA.",
	},
	// With no account ID the guard asks Cloudflare for it, so these are refused before
	// any request.
	{
		name: "guard, production, not the job, no account ID",
		args: guard("deploy", "--yes"),
		env: without(production, "CLOUDFLARE_ACCOUNT_ID"),
		says: "Production deploys run only in",
	},
	{
		name: "guard, preview, APP_RELEASE another commit, no account ID",
		args: guard("deploy", "--yes"),
		env: {
			...without(preview, "CLOUDFLARE_ACCOUNT_ID"),
			APP_RELEASE: OTHER,
		},
		says: COMMIT,
	},
	{
		name: "guard, no token",
		args: guard("plan"),
		env: without(preview, "CLOUDFLARE_API_TOKEN"),
		says: "An account-scoped CLOUDFLARE_API_TOKEN is required",
	},
	{
		name: "guard, no profile",
		args: guard("plan"),
		env: without(preview, "ALCHEMY_PROFILE"),
		says: "Set ALCHEMY_PROFILE explicitly",
	},
	// The domain. The zone's block has no command at all.
	...NOT_THE_JOB.map(([name, env, why]) => ({
		name: `domain move, ${name}`,
		args: domain("move"),
		env,
		says: refusedIn("The move runs", why),
	})),
	...["rule-off", "rule-on", "block", "toString", ""].map((command) => ({
		name: `domain "${command}", the job itself`,
		args: domain(command),
		env: job,
		says: USE_DOMAIN,
	})),
	...["inspect", "restore"].map((command) => ({
		name: `domain ${command} without a token`,
		args: domain(command),
		env: without(production, "CLOUDFLARE_API_TOKEN"),
		says: "Set CLOUDFLARE_API_TOKEN",
	})),
	...[
		["CLOUDFLARE_API", "https://elsewhere.example", "https://api.cloudflare.com"],
		["CLOUDFLARE_API", "http://127.0.0.1.example:80", "https://api.cloudflare.com"],
		["GITHUB_API_URL", "http://127.0.0.1.example:80", "https://api.github.com"],
	].map(([name = "", value = "", real = ""]) => ({
		name: `domain, ${name} at ${value}`,
		args: domain("inspect"),
		env: { ...production, [name]: value },
		says: `${name} may only be ${real} or on 127.0.0.1.`,
	})),
	// The operator's scripts, and the wait.
	...[
		["load-docket.ts", "no-such-file.json"],
		["signup-switch.ts", "open"],
		["report-docket.ts"],
	].flatMap(([script = "", ...rest]): Case[] => [
		{
			name: `${script}, production without the approval`,
			args: [`scripts/${script}`, ...rest, "--stage", "production"],
			env: base,
			says: "Production is refused without --production-approved",
		},
		{
			name: `${script}, an unknown stage`,
			args: [`scripts/${script}`, ...rest, "--stage", "staging"],
			env: base,
			says: "--stage is preview or production.",
		},
	]),
	{
		name: "signup-switch.ts, production approved, without a token",
		args: ["scripts/signup-switch.ts", "open", ...APPROVED],
		env: without(base, "CLOUDFLARE_API_TOKEN"),
		says: "Set CLOUDFLARE_API_TOKEN",
	},
	{
		name: "await-docket.ts, a subdomain that is an address",
		args: ["scripts/await-docket.ts"],
		env: { ...job, WORKERS_SUBDOMAIN: "elsewhere.example/x" },
		says: "Set WORKERS_SUBDOMAIN",
	},
	{
		name: "await-docket.ts, another address",
		args: ["scripts/await-docket.ts"],
		env: {
			...job,
			WORKERS_SUBDOMAIN: "rehearsal",
			WORKERS_DEV_ORIGIN: "https://elsewhere.example",
		},
		says: "WORKERS_DEV_ORIGIN may only be",
	},
	{
		name: "a build on Cloudflare Workers Builds",
		args: ["node_modules/vite/bin/vite.js", "build"],
		env: { ...base, WORKERS_CI: "1" },
		says: "Cloudflare Workers Builds is not a release path here",
	},
];

const DIRTY: Case[] = (
	[
		["guard, preview, a dirty tree", guard("deploy", "--yes"), preview],
		["guard, the job, a dirty tree", guard("deploy", "--yes"), job],
		[
			"direct, the job, a dirty tree",
			direct("production", "deploy", "--yes"),
			job,
		],
	] as const
).map(([name, args, env]) => ({
	name,
	args,
	env,
	says: "Deploy refused: commit or remove all uncommitted changes.",
}));

// Each waits for Alchemy to give up on the network, so they run together.
const ALLOWED: Case[] = (
	[
		["guard, the job, the domain declared", guard("deploy", "--yes"), job],
		[
			"guard, the job, the domain unmanaged",
			guard("deploy", "--yes"),
			{ ...job, PRODUCTION_DOMAIN: "unmanaged" },
		],
		[
			"guard, production plan from an agent session",
			guard("plan"),
			{ ...production, CLAUDECODE: "1" },
		],
		["guard, preview deploy --yes", guard("deploy", "--yes"), preview],
		["guard, preview plan", guard("plan"), preview],
		[
			"direct, preview plan, APP_RELEASE another commit",
			direct("preview", "plan"),
			{ ...preview, APP_RELEASE: OTHER },
		],
	] as const
).map(([name, args, env]) => ({ name, args, env, allowed: true }));

try {
	const online = await fetch("https://api.cloudflare.com/", {
		signal: AbortSignal.timeout(5_000),
	}).catch(() => undefined);
	if (online)
		throw new Error(
			"Refused: this machine is online. Use `unshare -rn bun run check:guard`.",
		);
	if (git("status", "--porcelain") !== "")
		throw new Error("check:guard needs a clean checkout.");
	console.log(`HEAD ${HEAD}; no network`);
	await checkStages();
	// Eight at a time: most are one short process each.
	for (let at = 0; at < REFUSED.length; at += 8) {
		const results = await Promise.allSettled(REFUSED.slice(at, at + 8).map(check));
		for (const result of results)
			if (result.status === "rejected") throw result.reason;
	}
	if (DIRTY.some(({ name }) => name.includes(CASE))) {
		writeFileSync(probe, "the guard must refuse a dirty tree\n");
		for (const one of DIRTY) await check(one);
		rmSync(probe, { force: true });
	}
	const results = await Promise.allSettled(ALLOWED.map(check));
	for (const result of results)
		if (result.status === "rejected") throw result.reason;
	if (git("status", "--porcelain") !== "")
		throw new Error("check:guard failed: it left the tree changed.");
	if (cases === 0) throw new Error(`check:guard has no case named "${CASE}".`);
	console.log(`check:guard passed (${cases} cases)`);
} catch (error) {
	console.error(error instanceof Error ? error.message : error);
	process.exitCode = 1;
} finally {
	rmSync(probe, { force: true });
	rmSync(home, { recursive: true, force: true });
}
