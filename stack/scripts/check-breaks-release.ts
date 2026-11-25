// The breaks of the stages, the guard, the release and the remote load, for
// check-breaks.ts. Each names the cases its check runs, so that one break takes a
// minute and not ten.
export interface ReleaseBreak {
	what: string;
	check: "guard" | "load" | "release";
	/** What the check must say when it fails. */
	says: RegExp;
	/** And what it must show of it. */
	shows?: RegExp;
	file: string;
	from: string;
	to: string;
	/** The only cases the check runs (STACK_GUARD_CASE, STACK_RELEASE_CASE). */
	only?: string;
}

const INFRA = "scripts/infra.ts";
const STACK = "alchemy.run.ts";
const REMOTE = "scripts/remote-d1.ts";
const LOAD = "scripts/load-docket.ts";
const MOVE = "scripts/production-domain.ts";
const LIVE = "scripts/check-production.ts";
const RUN = "../.github/workflows/production.yml";
const CI = "../.github/workflows/deploy.yml";

const guard = (
	what: string,
	only: string,
	file: string,
	from: string,
	to: string,
): ReleaseBreak => ({
	what,
	check: "guard",
	only,
	says: new RegExp(
		`check:guard failed: .*${only.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
	),
	file,
	from,
	to,
});
const load = (
	what: string,
	says: RegExp,
	file: string,
	from: string,
	to: string,
): ReleaseBreak => ({ what, check: "load", says, file, from, to });
const release = (
	what: string,
	only: string,
	file: string,
	from: string,
	to: string,
	shows?: RegExp,
): ReleaseBreak => ({
	what,
	check: "release",
	only,
	says: new RegExp(
		`check:release failed: .*${only.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
	),
	shows,
	file,
	from,
	to,
});
/** A break of the workflows or the tree: the facts are read first, whatever runs. */
const facts = (
	what: string,
	says: RegExp,
	file: string,
	from: string,
	to: string,
): ReleaseBreak => ({
	what,
	check: "release",
	only: "facts",
	says,
	file,
	from,
	to,
});

export const RELEASE_BREAKS: ReleaseBreak[] = [
	// The stages.
	guard(
		"production's database goes with its declaration",
		"its database is retained",
		STACK,
		".pipe(Alchemy.RemovalPolicy.retain(production))",
		"",
	),
	guard(
		"invocation logs are kept",
		"no invocation logs",
		STACK,
		"invocationLogs: false",
		"invocationLogs: true",
	),
	guard(
		"the sign-up key is short",
		"the sign-up key has 32 bytes",
		STACK,
		"{ bytes: 32 }",
		"{ bytes: 8 }",
	),
	guard(
		"the preview counts with production",
		"one counter of its own each",
		"src/lib/limits.ts",
		"preview: 860311",
		"preview: 860301",
	),
	guard(
		"Access admits everyone to the preview",
		"admits the service token and nobody else",
		STACK,
		"include: [{ serviceToken: verifier.serviceTokenId }],",
		"include: [{ everyone: {} }] as never,",
	),
	guard(
		"production answers on workers.dev too",
		"with workers.dev off",
		STACK,
		"domain: new URL(ORIGIN).hostname, workersDev: false",
		"domain: new URL(ORIGIN).hostname, workersDev: true",
	),
	guard(
		"Alchemy prints the database's ID",
		"holds the stage and the commit and no ID",
		STACK,
		"return { environment: stage, release: infrastructure.release };",
		"return { environment: stage, release: infrastructure.release, databaseId: database.databaseId };",
	),
	guard(
		"robots.txt is a static file",
		"the Worker first for robots.txt",
		STACK,
		'assets: { runWorkerFirst: ["/robots.txt"] },',
		"assets: {},",
	),
	guard(
		"another compatibility date than the checks'",
		"compatibility and settings the checks build and run with",
		STACK,
		'date: "2026-01-14"',
		'date: "2026-06-18"',
	),
	// The guard.
	guard(
		"every command but destroy counts as an apply",
		"direct, preview, unsafe nuke",
		INFRA,
		'process.argv[2] !== "deploy"',
		'process.argv[2] === "destroy"',
	),
	guard(
		"a command after a global option counts as an apply",
		"a global option before it",
		INFRA,
		'process.argv[2] !== "deploy"',
		'!process.argv.slice(2).some((word) => !word.startsWith("-"))',
	),
	guard(
		"any repository's workflow may deploy",
		"workflow somebody/",
		INFRA,
		`env.GITHUB_WORKFLOW_REF !==
		"jessewalberg/civic-observatory/.github/workflows/production.yml@refs/heads/main"`,
		`!env.GITHUB_WORKFLOW_REF?.endsWith("/civic-observatory/.github/workflows/production.yml@refs/heads/main")`,
	),
	guard(
		"any commit may be deployed",
		"APP_RELEASE another commit",
		INFRA,
		"if (release !== head)",
		"if (!head)",
	),
	guard(
		"an agent's session may deploy production",
		"an agent session (T3CODE_SESSION)",
		INFRA,
		"T3CODE_.+|",
		"",
	),
	guard(
		"production is loaded without an approval",
		"production without the approval",
		REMOTE,
		'if (stage === "production" && !/^',
		'if (stage === "nowhere" && !/^',
	),
	guard(
		"Workers Builds may build it",
		"a build on Cloudflare Workers Builds",
		"vite.config.ts",
		'process.env.WORKERS_CI === "1"',
		'process.env.WORKERS_CI === "never"',
	),
	guard(
		"the domain may be moved by anybody",
		"domain move, no CI at all",
		MOVE,
		'	if (run === move) assertProductionJob("The move runs");\n',
		"",
	),
	// The remote load.
	load(
		"any database will do",
		/another app's database, load-docket/,
		REMOTE,
		"`^civic-docket-Database-${stage}-[a-z0-9]{16}$`",
		'"."',
	),
	load(
		"a database's name is compared at its beginning alone",
		/a name that only begins like it/,
		REMOTE,
		"[a-z0-9]{16}$`",
		"[a-z0-9]{16}`",
	),
	load(
		"production is loaded at any commit",
		/production at another commit than the approved one/,
		REMOTE,
		'approved && plain("APP_RELEASE") !== approved',
		'approved && !plain("APP_RELEASE")',
	),
	load(
		"a Worker of another stage will do",
		/a Worker of another stage/,
		REMOTE,
		'if (plain("APP_ENV") !== stage)',
		'if (!plain("APP_ENV"))',
	),
	load(
		"a second database is not noticed",
		/two databases/,
		REMOTE,
		'if (only?.name !== "DB" || second ||',
		'if (only?.name !== "DB" ||',
	),
	load(
		"any tables will do",
		/without this app's tables/,
		REMOTE,
		"!== TABLES.join())",
		'=== "none")',
	),
	load(
		"a lost answer is taken for a failed load",
		/a load whose answer is lost/,
		LOAD,
		"		if (seen?.digest === digest) return undefined;\n",
		"",
	),
	load(
		"the load is several requests",
		/reaches the database as one request/,
		LOAD,
		"return await database.batch(statements);",
		"return (await Promise.all([statements.slice(0, 1), statements.slice(1)].map((some) => database.batch(some)))).flat();",
	),
	load(
		"the stage is not said",
		/production without the approval is refused/,
		REMOTE,
		"	console.log(`Stage: ${stage}`);\n",
		"",
	),
	load(
		"the bundle is connected for before it is read",
		/a raw name field is refused before any call/,
		LOAD,
		"	const bundle = readBundle(raw);\n	const database = await open();\n",
		"	const database = await open();\n	const bundle = readBundle(raw);\n",
	),
	load(
		"the switch is not read back",
		/does not read back as asked fails/,
		"scripts/signup-switch.ts",
		"if (rows.length !== 1 || is !== to)",
		"if (rows.length !== 1)",
	),
	load(
		"the report of a stage holds addresses",
		/the report of a stage holds counts/,
		"scripts/report-docket.ts",
		'release: await one("SELECT max(seq) AS n FROM releases"),',
		'release: await one("SELECT max(seq) AS n FROM releases"), all: await database.rows("SELECT email FROM signups"),',
	),
	load(
		"Wrangler is told to open more than the database",
		/told to open one binding/,
		"scripts/remote-proxy.ts",
		'		DB: { type: "d1", database_id: id, raw: true },\n',
		'		DB: { type: "d1", database_id: id, raw: true },\n		KV: { type: "kv_namespace", id: "0".repeat(32), raw: true },\n',
	),
	load(
		"a refusal prints the database's ID",
		/none of what \d+ runs printed/,
		REMOTE,
		"refuse(`the database of Worker ${name} is not this app's of ${stage}`);",
		"refuse(`the database of Worker ${name} is not this app's of ${stage}${process.stdout.write(id) ? '' : ''}`);",
	),
	load(
		"a load may land whenever it arrives",
		/a load that arrives 620 s late/,
		"scripts/docket-bundle.ts",
		"CASE WHEN abs(unixepoch() - unixepoch(?10)) <= ${SESSION_SECONDS} THEN ?8 ELSE 0 END",
		"?8",
	),
	load(
		"a session that is left behind goes on",
		/after the session's deadline/,
		"scripts/remote-proxy-worker.ts",
		"if (!(Date.now() <= Number(env.UNTIL)))",
		'if (env.UNTIL === "never")',
	),
	load(
		"a session without a readable deadline goes on",
		/a deadline of "soon"/,
		"scripts/remote-proxy-worker.ts",
		"if (!(Date.now() <= Number(env.UNTIL)))",
		'if (env.UNTIL === "" || Date.now() > Number(env.UNTIL))',
	),
	load(
		"the session lasts a day",
		/ends by itself within ten minutes/,
		REMOTE,
		"SESSION_SECONDS * 1_000",
		"86_400_000",
	),
	load(
		"a switch may land whenever it arrives",
		/a switch that arrives late/,
		"scripts/signup-switch.ts",
		"AND unixepoch() <= ?2",
		"AND ?2 = ?2",
	),
	load(
		"an uncertain load does not say until when",
		/says which one is there, and until when/,
		LOAD,
		"may still be made until ${until.toISOString()}, and not after.",
		"may still be made.",
	),
	// What a run prints.
	release(
		"the inspection prints the attachment's ID",
		"the read by hand, where the first cutover is due",
		MOVE,
		"	say(`${label}: ${HOSTNAME} -> ${named(attachment)}`);",
		"	console.log(`${label}: ${HOSTNAME} -> ${named(attachment)} (${attachment?.id})`);",
		/"leaks": \[\s*"a77a/,
	),
	release(
		"a stranger's Worker is named",
		"another Worker holds the domain",
		MOVE,
		': "a Worker this file does not know";',
		": `Worker ${attachment.service}`;",
		/"leaks": \[\s*"a-private-worker/,
	),
	release(
		"the subdomain is an output nobody masked",
		"the load never comes",
		MOVE,
		"	mask(subdomain);\n",
		"",
		/"leaks": \[\s*"rehearsal-subdomain/,
	),
	release(
		"Alchemy's own output is not filtered",
		"the first apply fails",
		INFRA,
		'const inPublic = process.env.GITHUB_ACTIONS === "true";',
		"const inPublic = false;",
		/"leaks": \[\s*"acc0/,
	),
	release(
		"the last line of Alchemy's output is not filtered",
		"the first apply fails",
		INFRA,
		"	if (rest) to.write(`${redact(rest)}\\n`);",
		"	if (rest) to.write(rest);",
		/"leaks": \[\s*"20e0/,
	),
	release(
		"somebody else's text may be a command to the runner",
		"the first apply fails",
		"scripts/public-log.ts",
		'return safe.replace(/^(\\s*)::/gm, "$1: :");',
		"return safe;",
		/a command to the runner: ::set-env/,
	),
	release(
		"Cloudflare's own words are printed as they are",
		"the deploy token is refused",
		"scripts/public-log.ts",
		"	console.error(redact(error instanceof Error ? error.message : otherwise));",
		"	console.error(error instanceof Error ? error.message : otherwise);",
		/"leaks": \[\s*"acc0/,
	),
	// The block.
	release(
		"the domain is moved whatever the block is",
		"somebody takes the block away before the move",
		MOVE,
		`	const block = await readBlock();
	if (block !== "on")`,
		`	const block: string = await readBlock();
	if (block === "never")`,
	),
	release(
		"the domain is given back whatever the block is",
		"the live check fails after somebody took the block away",
		MOVE,
		'if ((await readBlock(3)) === "gone")',
		'if (((await readBlock(3)) as string) === "never")',
		/the old Worker serves without the block/,
	),
	release(
		"a zone that does not answer is one that blocks",
		"the zone answers nothing",
		MOVE,
		'if (moves && block !== "on")',
		'if (moves && block === "gone")',
	),
	release(
		"a challenge is taken for the block",
		"the zone challenges where it blocked",
		MOVE,
		'	if (answer.headers.has("cf-mitigated")) return "unread";\n',
		"",
	),
	release(
		"a block that is gone does not fail the check",
		"check-production release on the domain fails when the zone's block is gone",
		LIVE,
		`? old.status === 403 &&
					!old.headers.has("x-commit-sha") &&
					!old.headers.has("cf-mitigated")`,
		"? old.status > 0",
	),
	release(
		"a block that is gone is found after the move alone",
		"check-production reachable: fails when the block is gone",
		LIVE,
		`old.status !== 403 ||
		old.headers.has("cf-mitigated") ||
		old.headers.has("x-commit-sha")`,
		"old.status === 999",
	),
	// The load, waited for.
	release(
		"the wait takes any commit's data",
		"another commit names the data",
		"scripts/await-docket.ts",
		"if (commit !== expected)",
		"if (!commit)",
	),
	release(
		"the wait takes any number of items",
		"the load has 299 items",
		"scripts/await-docket.ts",
		"if (docket.items < MIN_ITEMS)",
		"if (docket.items < 1)",
	),
	release(
		"half a release counts as one",
		"the load is half stated",
		"scripts/docket-health.ts",
		'typeof value === "number" && Number.isInteger(value) && value > 0;',
		'typeof value === "number";',
	),
	release(
		"another release of the data than the one the wait saw is served",
		"another release of the data is loaded after the move",
		LIVE,
		"!seenBefore || JSON",
		"!!seenBefore || JSON",
	),
	// The check.
	release(
		"pages are not asked for as a browser asks",
		"the zone's page-speed script is in a page",
		LIVE,
		'			Accept: "text/html",\n',
		'			Accept: "*/*",\n',
	),
	release(
		"a page of the sitemap that fails counts",
		"one page of the sitemap that is not read whole fails",
		LIVE,
		"if (answer.status === 200) alive += 1;",
		"if (answer.status > 0) alive += 1;",
	),
	release(
		"a page that is not read whole may be another commit's",
		"a page that is not read whole names another commit",
		LIVE,
		"		ours(answer);\n		if (answer.status === 200) alive",
		"		if (answer.status === 200) alive",
	),
	release(
		"the old function path's 404 may be anybody's",
		"the old function path's 404 is another commit's",
		LIVE,
		"	if (onDomain) clean(old);\n	else ours(old);\n",
		"	clean(old);\n",
	),
	release(
		"a page the edge may change is right",
		"the edge may change a page",
		LIVE,
		`answer.headers.get("cache-control") ===
				"public, max-age=0, must-revalidate, no-transform",`,
		`answer.headers.has("cache-control"),`,
	),
	release(
		"a script of somebody else's is right",
		"a page loads a script of somebody else",
		LIVE,
		"seen.foreign.size === 0,",
		"seen.foreign.size >= 0,",
	),
	release(
		"any header of a static file is right",
		"a static file has no nosniff",
		LIVE,
		"answer.headers.get(name) === value,",
		'value !== "",',
	),
	release(
		"a limit that is not bound is right",
		"check-production fails when the limit is not bound",
		LIVE,
		'call.headers.get("ratelimit-policy") === limitPolicy,',
		'(call.headers.get("ratelimit-policy") ?? limitPolicy) === limitPolicy,',
	),
	release(
		"the preview may be open",
		"check-production preview fails when anyone may read it",
		LIVE,
		`				!outside.headers.has("x-commit-sha"),
			\`/ answered`,
		`				!outside.headers.has("x-commit-sha") || outside.status === 200,
			\`/ answered`,
	),
	// What GitHub's record says, and the domain.
	release(
		"a domain call nobody confirmed is not waited out",
		"59 minutes ago the give-back failed: a run refuses",
		MOVE,
		"const MAY_LAND_MS = 60 * 60_000;",
		"const MAY_LAND_MS = 60;",
	),
	release(
		"a run that GitHub does not list yet is not missed",
		"not yet the later one that finished",
		MOVE,
		"if (gap >= 0)",
		"if (gap >= 1e9)",
	),
	release(
		"a history that has lost its beginning is taken for whole, with the old Worker",
		"a push after the domain was given back by hand, and GitHub’s list has lost its beginning",
		MOVE,
		"if (numbers.length > 0 && numbers[0] !== FIRST_RUN)",
		"if (numbers.length > 1e9)",
		/domain to new/,
	),
	release(
		"a history that has lost its beginning is taken for whole, with the new Worker",
		"GitHub’s list has lost its beginning, where a run finished the cutover, and has one that moved the domain",
		MOVE,
		"if (numbers.length > 0 && numbers[0] !== FIRST_RUN)",
		"if (numbers.length > 1e9)",
		/domain to old/,
	),
	release(
		"a successful run before the first that counts finishes the cutover",
		"the successful run GitHub lists is one before the first that counts",
		MOVE,
		"counted.some((number) => number >= FIRST_RUN)",
		"counted.some((number) => number >= -1e9)",
	),
	release(
		"a successful run that is counted and not listed is none",
		"GitHub counts a successful run and lists none",
		MOVE,
		"if (succeeded.total_count > counted.length || counted.some(Number.isNaN))",
		"if (counted.some(Number.isNaN))",
	),
	release(
		"a list that is cut short is taken for whole",
		"GitHub counts two runs and lists one",
		MOVE,
		"if (entries.size !== answer.total_count)",
		"if (entries.size > answer.total_count)",
	),
	release(
		"a run gives back what it has not moved",
		"somebody moves the domain by hand",
		MOVE,
		`		!tried &&
		process.env.CARRIES_ON !== "true"`,
		`		!tried &&
		process.env.CARRIES_ON === "never"`,
	),
	release(
		"the domain is read back as anybody's",
		"the move takes effect but the listing lags past a minute",
		MOVE,
		"if (now?.service === service) return now;",
		"if (now) return now;",
	),
	release(
		"a give-back with an unanswered move ends well",
		"lands after the domain was given back",
		MOVE,
		'if (unanswered.writes || process.env.MOVE_UNANSWERED === "true")',
		"if (unanswered.writes)",
	),
	release(
		"a domain given back by hand is taken again",
		"a push after the domain was given back by hand",
		MOVE,
		"if (job && legacy && finished)",
		"if (job && legacy && !finished && moved)",
	),
	// The workflows and the tree.
	facts(
		"the wait is left out",
		/inspect, then the cutover in its order/,
		RUN,
		"run: bun scripts/await-docket.ts",
		"run: echo loaded",
	),
	facts(
		"the deploy token reaches a check",
		/one secret, the deploy token/,
		RUN,
		"          EXPECT_DOCKET: ${{ steps.load.outputs.docket }}\n      # Later",
		"          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_PRODUCTION_DEPLOY_TOKEN }}\n          EXPECT_DOCKET: ${{ steps.load.outputs.docket }}\n      # Later",
	),
	facts(
		"a pull request starts the release",
		/starts on a push to this repository's main/,
		RUN,
		"on:\n  push:",
		"on:\n  pull_request:\n  push:",
	),
	facts(
		"the release's GitHub token may write",
		/no permission but the job's two reads/,
		RUN,
		"      contents: read\n",
		"      contents: write\n",
	),
	facts(
		"an action is pinned by a tag",
		/each pinned by commit/,
		RUN,
		"actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803",
		"actions/checkout@v6",
	),
	facts(
		"the release reads a cache",
		/no cache/,
		RUN,
		"          no-cache: true\n",
		"",
	),
	facts(
		"the release runs on a machine of ours",
		/a GitHub-hosted runner/,
		RUN,
		"runs-on: ubuntu-24.04",
		"runs-on: self-hosted",
	),
	facts(
		"a step's name a later run looks for is another",
		/have the names later runs look for/,
		RUN,
		"name: First cutover failed - civicobservatory.com back to civic-observatory",
		"name: Give the domain back",
	),
	facts(
		"a fork's pull request runs with the repository's own rights",
		/deploy\.yml: its two jobs/,
		CI,
		"  pull_request:",
		"  pull_request_target:",
	),
	facts(
		"a check keeps the checkout's credential",
		/no checkout keeps a credential/,
		CI,
		"          persist-credentials: false\n          fetch-depth: 2",
		"          fetch-depth: 2",
	),
	facts(
		"a command deploys past the guard",
		/nothing in this folder can put anything on Cloudflare but the guard/,
		"package.json",
		'"report": "bun scripts/report-docket.ts"',
		'"report": "wrangler deploy"',
	),
	facts(
		"a script of the release reads the zone's rules",
		/no script or step of the release has a call/,
		MOVE,
		"// The zone's block, from outside only.",
		"// GET /zones/x/rulesets",
	),
];
