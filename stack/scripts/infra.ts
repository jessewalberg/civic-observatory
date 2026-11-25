// The guarded entry point for every Alchemy command (README.md, "Stages and
// release"): stages `preview` and `production` only, the production marker
// CIVIC_PRODUCTION_RELEASE, and the production refusals on every path to Alchemy.
// Bun runs it and, through it, Alchemy's CLI (`process.execPath` is Bun's binary).
import { execFileSync, spawn } from "node:child_process";
import type { Readable } from "node:stream";
import { fileURLToPath, pathToFileURL } from "node:url";
import { account, deployToken } from "./cloudflare-api";
import { complain, redact } from "./public-log";

export const STAGES = ["preview", "production"] as const;
export type StageName = (typeof STAGES)[number];

// Production has one phase and, at the first cutover, two applies: `unmanaged`
// deploys the Worker and leaves the domain with the old one, so it can be loaded
// and checked on workers.dev before the domain moves; `managed`, the default and
// every later release, declares the domain.
export const PRODUCTION_DOMAINS = ["managed", "unmanaged"] as const;
export type ProductionDomain = (typeof PRODUCTION_DOMAINS)[number];

const root = fileURLToPath(new URL("..", import.meta.url));

// Local Git only: call before Alchemy can build or contact providers.
export function assertDeployCommit(release: string) {
	const options = { cwd: root, encoding: "utf8" as const };
	if (execFileSync("git", ["status", "--porcelain"], options) !== "")
		throw new Error(
			"Deploy refused: commit or remove all uncommitted changes.",
		);
	const head = execFileSync("git", ["rev-parse", "HEAD"], options).trim();
	// The whole SHA: vite.config.ts bakes it as the release marker.
	if (release !== head)
		throw new Error("Deploy refused: APP_RELEASE must be HEAD, the full SHA.");
}

// The account follows from the account-owned token, so no account ID is stored
// in a file or a reference.
async function deriveAccountId() {
	if (process.env.CLOUDFLARE_ACCOUNT_ID) return;
	if (!process.env.CLOUDFLARE_API_TOKEN?.trim()) return;
	process.env.CLOUDFLARE_ACCOUNT_ID = await account(deployToken());
}

// Coding-agent sessions (the variables Alchemy's own interactive check reads, plus
// T3): a production deploy never runs from one.
const AGENT_VARIABLE =
	/^(AI_AGENT|CLAUDECODE|CLAUDE_CODE(_.+)?|CODEX_.+|T3CODE_.+|GEMINI_CLI|OPENCODE|AUGMENT_AGENT|GOOSE_PROVIDER|JUNIE_DATA|AIDER_MODEL|REPL_ID)$/;

// The one production release route: production.yml's job on a GitHub-hosted runner
// after a push to main of this repository. Returns why the current process is not
// that job. A convenience check, not a security boundary: the deploy token is kept
// by the operator and in the main-only GitHub environment `production`.
export function productionJobRefusal(
	env: NodeJS.ProcessEnv = process.env,
): string | undefined {
	if (env.GITHUB_ACTIONS !== "true") return "not GitHub Actions";
	if (env.RUNNER_ENVIRONMENT !== "github-hosted")
		return "not a GitHub-hosted runner";
	if (env.GITHUB_EVENT_NAME !== "push") return "not a push";
	if (env.GITHUB_REF !== "refs/heads/main") return "not refs/heads/main";
	if (
		env.GITHUB_WORKFLOW_REF !==
		"jessewalberg/civic-observatory/.github/workflows/production.yml@refs/heads/main"
	)
		return "not the production workflow";
	if (env.CIVIC_PRODUCTION_RELEASE !== "production.yml")
		return "the production job's marker is missing";
	const agent = Object.keys(env).find(
		(name) => AGENT_VARIABLE.test(name) && env[name],
	);
	if (agent) return `a coding-agent session (${agent})`;
	return undefined;
}

/** Refuses what only the production job may do; `what` starts the sentence. */
export function assertProductionJob(what: string) {
	const refusal = productionJobRefusal();
	if (refusal)
		throw new Error(
			`${what} only in production.yml's job after a push to main (${refusal}).`,
		);
}

/**
 * Whether this process runs a read-only plan. The guard's action
 * (`bun scripts/infra.ts <action>`) and Alchemy's command (`alchemy <command>`,
 * which loads alchemy.run.ts) both sit at argv[2]. Only an exact `plan` is
 * read-only: deploy (with or without --dry-run) counts as an apply, and nothing
 * else of Alchemy's is allowed at all.
 */
export const readOnlyPlan = (argv: readonly string[] = process.argv) =>
	argv[2] === "plan";

// Configuration plus local Git: no profile reads, provider construction or cloud
// calls. alchemy.run.ts calls it first, so every entry path (this guard or
// Alchemy's CLI on the stack file) meets the same checks, including the apply
// checks below, before Alchemy builds anything or contacts a provider.
export function readInfrastructure() {
	const stage = process.env.ALCHEMY_STAGE;
	if (!STAGES.includes(stage as StageName))
		throw new Error("Set ALCHEMY_STAGE to preview or production.");
	const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
	if (!accountId || !/^[a-f0-9]{32}$/i.test(accountId))
		throw new Error(
			"Set the approved CLOUDFLARE_ACCOUNT_ID (32 hex characters).",
		);
	if (!process.env.CLOUDFLARE_API_TOKEN?.trim())
		throw new Error(
			"An account-scoped CLOUDFLARE_API_TOKEN is required; no profile fallback.",
		);
	const profile = process.env.ALCHEMY_PROFILE;
	if (!profile || !/^[a-z0-9][a-z0-9_-]*$/.test(profile))
		throw new Error("Set ALCHEMY_PROFILE explicitly for the approved stage.");
	const release = process.env.APP_RELEASE;
	if (!release || !/^[a-f0-9]{40}$/.test(release))
		throw new Error("Set APP_RELEASE to the full reviewed commit SHA.");
	const domain = process.env.PRODUCTION_DOMAIN?.trim() || undefined;
	if (stage !== "production" && domain)
		throw new Error("PRODUCTION_DOMAIN applies only to the production stage.");
	if (domain && !PRODUCTION_DOMAINS.includes(domain as ProductionDomain))
		throw new Error("Set PRODUCTION_DOMAIN to managed or unmanaged.");
	// An apply, by any path, runs only from a clean tree whose HEAD is APP_RELEASE,
	// the release marker the Worker serves, and a production apply only in the
	// production job. Every other command of Alchemy's is refused for both stages and
	// in the job itself, nested ones and ones this does not know included: `destroy`,
	// `dev`, `drift --repair`, `state …`, and `unsafe nuke`, which deletes whatever the
	// token reaches in the account and knows no stage.
	if (!readOnlyPlan()) {
		if (process.argv[2] !== "deploy")
			throw new Error(
				"Only plan and deploy are allowed for the preview and production stages.",
			);
		if (stage === "production") assertProductionJob("Production deploys run");
		assertDeployCommit(release);
	}
	return {
		stage: stage as StageName,
		accountId,
		profile,
		release,
		productionDomain: (domain ?? "managed") as ProductionDomain,
	};
}

/** One of Alchemy's streams, a line at a time, without what must not be public. */
async function filtered(from: Readable, to: NodeJS.WriteStream) {
	let rest = "";
	from.setEncoding("utf8");
	for await (const chunk of from) {
		const lines = (rest + chunk).split(/\r?\n|\r/);
		rest = lines.pop() ?? "";
		for (const line of lines) to.write(`${redact(line)}\n`);
	}
	if (rest) to.write(`${redact(rest)}\n`);
}

/** Alchemy's CLI; in GitHub Actions, where its output is public, through a filter. */
async function alchemy(args: string[]) {
	const inPublic = process.env.GITHUB_ACTIONS === "true";
	const child = spawn(
		process.execPath,
		["node_modules/alchemy/bin/cli.js", ...args],
		{
			cwd: root,
			stdio: inPublic ? ["ignore", "pipe", "pipe"] : "inherit",
		},
	);
	const ended = new Promise<number>((resolve, reject) => {
		child.on("error", reject);
		child.on("close", (code) => resolve(code ?? 1));
	});
	await Promise.all([
		child.stdout && filtered(child.stdout, process.stdout),
		child.stderr && filtered(child.stderr, process.stderr),
	]);
	return ended;
}

if (
	process.argv[1] &&
	import.meta.url === pathToFileURL(process.argv[1]).href
) {
	void main();
}

async function main() {
	try {
		const action = process.argv[2] ?? "";
		// Alchemy refuses its approval prompt in agent sessions. `preview` (systems
		// only) may pre-approve a deploy with --yes. Production deploys only in
		// production.yml's job, approved by the owner's yes on the merge card; plan
		// stays available everywhere.
		const yes = process.argv[3] === "--yes";
		if (
			!["plan", "deploy"].includes(action) ||
			process.argv.length !== (yes ? 4 : 3)
		)
			throw new Error(
				"Use plan or deploy (optionally deploy --yes) without other arguments; select ALCHEMY_STAGE.",
			);
		if (yes && action !== "deploy")
			throw new Error("--yes is allowed only for deploys.");
		if (action === "deploy" && process.env.ALCHEMY_STAGE === "production") {
			assertProductionJob("Production deploys run");
			if (!yes) throw new Error("The production job deploys with --yes.");
		}
		if (action === "deploy") assertDeployCommit(process.env.APP_RELEASE ?? "");
		await deriveAccountId();
		const { stage, profile } = readInfrastructure();
		// Even plan can bootstrap Alchemy's state store remotely. Never use it as a
		// local dry check.
		process.exitCode = await alchemy([
			action,
			"--stage",
			stage,
			"--profile",
			profile,
			"--config",
			"alchemy.run.ts",
			...(yes ? ["--yes"] : []),
		]);
	} catch (error) {
		complain(error, "Infrastructure configuration is invalid.");
		process.exitCode = 1;
	}
}
