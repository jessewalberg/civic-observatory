// The civicobservatory.com move between Workers (docs/runbooks/release.md). Alchemy
// 2.0.0-beta.85 and Cloudflare's documented attach call both refuse a hostname
// another Worker holds, and a detach removes its DNS record until the next attach.
// Cloudflare's Wrangler moves a held custom domain with one call instead
// (`publishCustomDomains`, `override_existing_origin`); the attachment keeps its ID
// and DNS record.
//
// The zone answers 403 to every path under /_serverFn, the old app's function path.
// The docket's functions are elsewhere (src/lib/site.ts), so that block stays on
// before, during and after, whichever Worker holds the domain. Nothing here can
// read or change it: it is asked from outside, as a visitor would meet it. The
// domain is moved, and given back to the old Worker, only while it answers. So a
// call Cloudflare left unanswered, and may still carry out later, can at worst
// leave the domain on a Worker that may serve it. It could still undo what a later
// run finished, which GitHub's concurrency does not prevent: so no run goes on
// until it can land no more.
//   bun scripts/production-domain.ts inspect
//     read only: log the holder, the block and where the cutover stands; in the
//     production job, refuse while that cannot be told or a write may still land,
//     and write `cutover`, `move`, `carries_on` and `workers_subdomain` (masked) to
//     $GITHUB_OUTPUT
//   bun scripts/production-domain.ts move
//     the first cutover, production job only: old Worker -> new Worker
//   bun scripts/production-domain.ts restore
//     rollback: the hostname back to the old Worker; in the production job only
//     what that run, or the run it carries on, has moved
// Both end with the holder as they leave it. What it prints is a closed vocabulary
// (public-log.ts): no ID, and no word of Cloudflare's or GitHub's.
import { appendFileSync } from "node:fs";
import {
	account,
	CLOUDFLARE,
	call,
	deployToken,
	GIVE_BACK_STEP,
	HOSTNAME,
	LEGACY,
	MOVE_STEP,
	origin,
	PRODUCTION,
	SITE,
	unanswered,
	wait,
} from "./cloudflare-api";
import { assertProductionJob } from "./infra";
import {
	complain,
	fail,
	instant,
	keep,
	type Line,
	mask,
	number,
	publicOutput,
	say,
	Told,
	told,
	word,
} from "./public-log";

/**
 * The cutover is finished once one production.yml run has succeeded since this
 * time. If the domain is given back by hand after that, later pushes and re-runs
 * refuse instead of taking it again. Moving it again is a decision: a pull request
 * sets this to a time after the give-back (and FIRST_RUN with it), so the yes on its
 * card covers the move.
 */
const CUTOVER_SINCE = "2026-11-25T00:00:00Z";
/**
 * The first run since then. GitHub numbers a workflow's runs from 1, so a history that
 * begins later has lost its beginning, and with it, perhaps, the run that finished the
 * cutover. A pull request that moves CUTOVER_SINCE raises this to the run after.
 */
const FIRST_RUN = 1;

/** For how long a domain write that nobody confirmed may still take effect. */
const MAY_LAND_MS = 60 * 60_000;

const GITHUB = () => origin("GITHUB_API_URL", "https://api.github.com");
const inJob = () => process.env.GITHUB_ACTIONS === "true";

// What this file says of things, by their names.
const DOMAIN = word(HOSTNAME);
const OLD = told`Worker ${word(LEGACY)}`;
const NEW = told`Worker ${word(PRODUCTION)}`;
const BLOCK = told`the block on /_serverFn`;
const RUNBOOK = told`docs/runbooks/release.md`;

interface Attachment {
	id: string;
	hostname: string;
	service: string;
	zone_id?: string;
}
const isId = (value: unknown): value is string =>
	typeof value === "string" && /^[0-9a-f]{32}$/i.test(value);

async function zone(accountId: string) {
	const zones = await call<{ id: string; account?: { id?: string } }[]>(
		deployToken(),
		told`Which zone the domain is in`,
		"GET",
		`/zones?name=${HOSTNAME}`,
	);
	const [match, second] = (Array.isArray(zones) ? zones : []).filter(
		(z) => z.account?.id === accountId,
	);
	if (!match || second) return fail`Zone ${DOMAIN} is not in this account.`;
	if (!isId(match.id)) return fail`The zone's ID is unreadable.`;
	mask(match.id);
	return match.id;
}

// ---------------------------------------------------------------------------
// The domain.

/** The Worker that holds the hostname, if one does. */
async function holder(accountId: string, tries?: number) {
	const attached = await call<Attachment[]>(
		deployToken(),
		told`Who holds the domain`,
		"GET",
		`/accounts/${accountId}/workers/domains?hostname=${HOSTNAME}`,
		undefined,
		tries,
	);
	if (!Array.isArray(attached))
		return fail`Who holds the domain: the answer is unreadable.`;
	const [exact, second] = attached.filter((d) => d.hostname === HOSTNAME);
	if (second) return fail`${DOMAIN} has two attachments.`;
	if (exact) {
		keep(`held by ${JSON.stringify(exact)}`);
		if (isId(exact.id)) mask(exact.id);
		if (isId(exact.zone_id)) mask(exact.zone_id);
	}
	return exact;
}

/** A Worker of this repository by its name, and no other by any. */
const named = (attachment: Attachment | undefined): Line =>
	!attachment
		? told`no Worker`
		: attachment.service === LEGACY
			? OLD
			: attachment.service === PRODUCTION
				? NEW
				: told`a Worker this file does not know`;
const show = (label: Line, attachment: Attachment | undefined) =>
	say(told`${label}: ${DOMAIN} -> ${named(attachment)}`);

/** Reads the hostname back until `service` holds it. */
async function readBack(accountId: string, service: string) {
	for (let attempt = 0; attempt < 30; attempt++) {
		const now = await holder(accountId);
		if (now?.service === service) return now;
		await wait(1);
	}
	return fail`${DOMAIN} did not move to ${service === LEGACY ? OLD : NEW} in a minute.`;
}

/** Moves the hostname to `service` without detaching it, and reads it back. */
async function override(accountId: string, zoneId: string, service: string) {
	await call(
		deployToken(),
		service === LEGACY ? told`Giving the domain back` : told`Moving the domain`,
		"PUT",
		`/accounts/${accountId}/workers/scripts/${service}/domains/records`,
		{
			override_scope: false,
			override_existing_origin: true,
			override_existing_dns_record: false,
			origins: [{ hostname: HOSTNAME, zone_id: zoneId }],
		},
	);
	return readBack(accountId, service);
}

// ---------------------------------------------------------------------------
// The zone's block, from outside only.

type Block = "on" | "gone" | "unread";
const blockIs = (block: Block): Line =>
	block === "on" ? told`on` : block === "gone" ? told`gone` : told`unread`;

async function ask(path: string) {
	const response = await fetch(`${SITE()}${path}`, {
		redirect: "manual",
		keepalive: false,
		headers: {
			Accept: "text/html",
			"Cache-Control": "no-cache",
			"User-Agent": "civic-observatory-release/1",
		},
		// Short: a give-back of a cancelled run has five minutes in all.
		signal: AbortSignal.timeout(10_000),
	}).catch(() => undefined);
	await response?.arrayBuffer().catch(() => undefined);
	return response;
}

/** One look: what the zone answers, or that nobody said. */
async function lookAtBlock(): Promise<Block> {
	const answer = await ask("/_serverFn/x");
	if (!answer) return "unread";
	// The docket's own answer came past the block, whatever its status.
	if (answer.headers.has("x-commit-sha")) return "gone";
	if (answer.status === 429 || answer.status >= 500) return "unread";
	if (answer.status !== 403) return "gone";
	// A zone that challenges or refuses this machine says nothing of the block.
	if (answer.headers.has("cf-mitigated")) return "unread";
	const other = await ask("/robots.txt");
	return other && other.status !== 403 ? "on" : "unread";
}

/** Asked again, in all five times, while nobody says; a missing block is asked twice. */
async function readBlock(tries = 5): Promise<Block> {
	let block: Block = "unread";
	for (let attempt = 1; attempt <= tries; attempt++) {
		if (attempt > 1) await wait(1);
		const before = block;
		block = await lookAtBlock();
		if (block === "on" || (block === "gone" && before === "gone")) break;
	}
	say(told`${BLOCK}: ${blockIs(block)}`);
	return block;
}

// ---------------------------------------------------------------------------
// Where the cutover stands, by what GitHub recorded of the earlier runs.

/** A read of this repository's runs, with the job's own read-only token. */
async function github<T>(name: Line, path: string): Promise<T> {
	for (let attempt = 1; ; attempt++) {
		const response = await fetch(
			`${GITHUB()}/repos/${process.env.GITHUB_REPOSITORY}/actions${path}`,
			{
				headers: {
					Accept: "application/vnd.github+json",
					Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
					"X-GitHub-Api-Version": "2022-11-28",
				},
				keepalive: false,
				signal: AbortSignal.timeout(30_000),
			},
		).catch(() => undefined);
		if (response?.ok) return (await response.json().catch(() => ({}))) as T;
		const refused =
			response && response.status !== 429 && response.status < 500;
		if (response)
			keep(
				`${name}: ${response.status} ${await response.text().catch(() => "")}`,
			);
		const how = response ? told`HTTP ${response.status}` : told`no answer`;
		if (refused || attempt === 5) return fail`${name}: ${how}. ${LATE}`;
		say(told`no answer, trying again: ${name}`);
		await wait(attempt);
	}
}

const LATE = told`GitHub's record is late or not whole, or a run still goes on. Nothing was changed: run this again in some minutes, or see ${RUNBOOK}, section 7.`;

/**
 * Every entry of one of GitHub's lists: as many as it counts, over all of its
 * pages, each once. It answers a thousand at most, so a longer one is not read
 * either.
 */
async function every<T extends { id: number }>(
	called: Line,
	path: string,
	name: "workflow_runs" | "jobs",
	query: Record<string, string> = {},
) {
	const entries = new Map<number, T>();
	for (let page = 1; ; page++) {
		const answer = await github<Record<string, unknown>>(
			called,
			`${path}?${new URLSearchParams({ ...query, per_page: "100", page: `${page}` })}`,
		);
		const some = answer[name];
		const total = answer.total_count;
		if (!Array.isArray(some) || typeof total !== "number")
			return fail`${called}: it is unreadable. ${LATE}`;
		for (const entry of some as T[]) {
			if (!Number.isSafeInteger(entry?.id))
				return fail`${called}: an entry has no number. ${LATE}`;
			entries.set(entry.id, entry);
		}
		if (some.length === 100 && page < 10) continue;
		if (entries.size !== total)
			return fail`Refusing: ${called} counts ${number(total)} and lists ${entries.size}. ${LATE}`;
		return [...entries.values()];
	}
}

/** A run's status while it has not begun. */
const WAITING = ["queued", "pending", "waiting", "requested"];

interface Run {
	id: number;
	run_number?: number;
	run_attempt?: number;
	status?: string | null;
	conclusion?: string | null;
	created_at?: string;
	run_started_at?: string;
	updated_at?: string;
}
interface Step {
	name: string;
	status?: string;
	conclusion?: string | null;
	started_at?: string | null;
	completed_at?: string | null;
}
interface Job {
	id: number;
	started_at?: string | null;
	completed_at?: string | null;
	steps?: Step[];
}

/** Where the cutover stands. */
interface Cutover {
	/** An attempt of some run ended successfully. */
	finished: boolean;
	/** One that moved the domain, and did not. */
	moved?: Line;
	/** A domain write that may still land: until when, and whose it is. */
	open?: { until: number; whose: Line };
}

/** Whether a step began; GitHub gives a skipped one its times too. */
const began = (step: Step | undefined) =>
	!!step &&
	step.conclusion !== "skipped" &&
	(step.conclusion ? step.started_at !== null : step.status === "in_progress");

/** Whether nothing of a step can land any more. */
const well = (step: Step | undefined) =>
	step?.conclusion === "success" || step?.conclusion === "skipped";

/** When a job ended; where GitHub does not say, the last it knows of it. */
function endOf(job: Job, run: Run) {
	const times = (...dates: (string | null | undefined)[]) =>
		dates.map((date) => Date.parse(date ?? "")).filter(Number.isFinite);
	const steps = job.steps ?? [];
	const known = times(job.completed_at).length
		? times(job.completed_at)
		: times(
				...steps.flatMap((step) => [step.started_at, step.completed_at]),
				...[job.started_at, run.updated_at, run.run_started_at, run.created_at],
			);
	if (!known.length)
		return fail`GitHub has no time for an earlier job. ${LATE}`;
	return Math.max(...known);
}

/**
 * What became of the cutover in every attempt of every run since CUTOVER_SINCE.
 *
 * GitHub's own records decide, not a row of ours: a run ends successfully exactly
 * when it ended without a give-back, so the two can never both be recorded, and no
 * write of ours can be lost or land late. They are there before the database is,
 * and a runner that dies does not take them with it.
 *
 * One success is enough. That there is none has to be shown: by a list that is
 * whole (it counts what it lists, has this run, begins at the first run there was and
 * misses none after it), and by every attempt of every run in it, as GitHub has that
 * run now. A run that is run again loses its old end in the list, and a list can lag.
 */
async function readCutover(): Promise<Cutover> {
	const runs = "/workflows/production.yml/runs";
	const since = {
		branch: "main",
		event: "push",
		created: `>=${CUTOVER_SINCE}`,
	};
	const called = told`GitHub's list of production.yml's runs`;
	const successes = told`GitHub's list of successful runs`;
	const succeeded = await github<{
		total_count?: unknown;
		workflow_runs?: unknown;
	}>(
		successes,
		`${runs}?${new URLSearchParams({ ...since, status: "success", per_page: "100" })}`,
	);
	if (
		typeof succeeded.total_count !== "number" ||
		!Array.isArray(succeeded.workflow_runs)
	)
		return fail`${successes} has no count. ${LATE}`;
	// One it names, of those that count: a count alone says nothing of which they are.
	const counted = (succeeded.workflow_runs as Run[]).map((run) =>
		number(run?.run_number),
	);
	if (counted.some((number) => number >= FIRST_RUN)) return { finished: true };
	if (succeeded.total_count > counted.length || counted.some(Number.isNaN))
		return fail`Refusing: ${successes} counts ${number(succeeded.total_count)} and lists ${counted.length}. ${LATE}`;

	const listed = await every<Run>(called, runs, "workflow_runs", since);
	// This run, by the numbers the runner has; on another machine there is none.
	const own = inJob() ? Number(process.env.GITHUB_RUN_ID) : undefined;
	const attempts = Number(process.env.GITHUB_RUN_ATTEMPT);
	if (inJob() && (!Number.isInteger(attempts) || attempts < 1))
		return fail`GITHUB_RUN_ATTEMPT is unreadable.`;
	if (inJob() && !listed.some(({ id }) => id === own))
		return fail`Refusing: GitHub does not list this run. ${LATE}`;
	// GitHub numbers a workflow's runs one after another.
	const numbers = listed
		.map((run) => number(run.run_number))
		.sort((a, b) => a - b);
	if (numbers.length > 0 && numbers[0] !== FIRST_RUN)
		return fail`Refusing: ${called} begins at run ${number(numbers[0])}, not at run ${FIRST_RUN}. ${LATE}`;
	const gap = numbers.findIndex(
		(number, i) =>
			!Number.isInteger(number) || number !== Number(numbers[0]) + i,
	);
	if (gap >= 0)
		return fail`Refusing: ${called} has run ${number(numbers[gap])} and not the one before it. ${LATE}`;

	const ended: { run: Run; attempt: number }[] = [];
	for (const { id } of listed) {
		const one = told`GitHub's record of run ${id}`;
		const now = id === own ? undefined : await github<Run>(one, `/runs/${id}`);
		const last = now ? (now.run_attempt ?? 1) : attempts - 1;
		for (let attempt = 1; attempt <= last; attempt++) {
			const newest = now && attempt === last;
			const run = newest
				? now
				: await github<Run>(one, `/runs/${id}/attempts/${attempt}`);
			if (run.conclusion === "success") return { finished: true };
			if (run.conclusion) ended.push({ run: { ...run, id }, attempt });
			// One that waits behind this run has not begun. No other can still run.
			else if (!newest || !WAITING.includes(run.status ?? ""))
				return fail`Refusing: GitHub does not say how run ${id}, attempt ${attempt} ended (${word(run.status, told`nothing known`)}). ${LATE}`;
		}
	}

	const cutover: Cutover = { finished: false };
	for (const { run, attempt } of ended) {
		const whose = told`run ${run.id}, attempt ${attempt}`;
		for (const job of await every<Job>(
			told`GitHub's list of the jobs of ${whose}`,
			`/runs/${run.id}/attempts/${attempt}/jobs`,
			"jobs",
		)) {
			const steps = job.steps ?? [];
			const move = steps.find(({ name }) => name === MOVE_STEP);
			const back = steps.find(({ name }) => name === GIVE_BACK_STEP);
			if (began(move)) cutover.moved ??= whose;
			if (well(move) && well(back)) continue;
			// One of the two did not end well, or the runner was lost before they were
			// over: GitHub's record stops where that lost contact, and it may have gone
			// on.
			const bad = steps.find(
				(step) =>
					!step.conclusion || ((step === move || step === back) && !well(step)),
			);
			if (!bad) continue;
			const until = endOf(job, run) + MAY_LAND_MS;
			if (until > Math.max(Date.now(), cutover.open?.until ?? 0))
				cutover.open = {
					until,
					whose: told`${whose} (step "${word(bad.name, told`another step`)}": ${bad.conclusion ? word(bad.conclusion) : told`its runner was lost`})`,
				};
		}
	}
	return cutover;
}

// ---------------------------------------------------------------------------
// The commands.

async function inspect(accountId: string, before: Attachment | undefined) {
	const job = inJob();
	// Nobody, or a Worker this file does not know: a person must look first.
	if (!before)
		return fail`Refusing: ${DOMAIN} is on no Worker at all (a Workers route is not enough: ${RUNBOOK}, section 1).`;
	const { subdomain } = await call<{ subdomain: string }>(
		deployToken(),
		told`The account's workers.dev name`,
		"GET",
		`/accounts/${accountId}/workers/subdomain`,
	);
	if (!/^[a-z0-9-]{1,63}$/.test(subdomain))
		return fail`The account's workers.dev name is unreadable.`;
	// Before it is an output: GitHub prints a step's inputs.
	mask(subdomain);
	const legacy = before.service === LEGACY;
	// Elsewhere, where the job's two values may be missing, the rest is only said.
	if (!job && !(process.env.GITHUB_TOKEN && process.env.GITHUB_REPOSITORY)) {
		await readBlock(2);
		say(
			told`cutover: unread (it needs GITHUB_REPOSITORY and GITHUB_TOKEN: ${RUNBOOK}, the top)`,
		);
		return;
	}
	const { finished, moved, open } = await readCutover();
	if (job && legacy && finished)
		return fail`Refusing: ${DOMAIN} was given back to ${OLD} after a finished release, and no push or re-run moves it again (${RUNBOOK}, Going forward again).`;
	const opens = open && instant(open.until);
	if (job && open && opens)
		return fail`Refusing: ${open.whose} may still write the domain, after its end. Nothing was changed. A run may go on after ${opens} (${RUNBOOK}, section 3).`;
	// Nothing says whose the move was, so nothing says that a run may undo it.
	if (job && !legacy && !finished && !moved)
		return fail`Refusing: ${DOMAIN} is on ${NEW}, and GitHub shows no run since ${instant(Date.parse(CUTOVER_SINCE))} that finished the cutover and none that moved the domain. Nothing was changed. Read the runs (gh run list --workflow production.yml), then ${RUNBOOK}, section 7.`;
	// Only a run that would move the domain stops for the block, before it does
	// anything: the old Worker, which a give-back serves again, needs it.
	const moves = job && legacy;
	const block = await readBlock(moves ? 5 : 2);
	if (moves && block !== "on")
		return fail`Refusing: ${BLOCK} is ${blockIs(block)} while ${OLD} serves ${DOMAIN}. Nothing was changed, and no run changes it: see ${RUNBOOK}, section 7.`;
	say(
		told`cutover: ${
			finished
				? legacy
					? told`finished, and the domain was given back by hand since`
					: told`finished; a later release leaves the domain, the data and the sign-up switch as they are`
				: legacy
					? told`the first one; this run waits for the load and moves the domain`
					: moved
						? told`the first one did not finish; a run carries it on, and gives the domain back if it fails (moved by ${moved})`
						: told`unknown; GitHub shows no run that finished it and none that moved the domain, so no run goes on`
		}`,
	);
	if (open && opens)
		say(
			told`${open.whose} may still write the domain: no run goes on before ${opens}`,
		);
	if (job && process.env.GITHUB_OUTPUT)
		appendFileSync(
			process.env.GITHUB_OUTPUT,
			`cutover=${!finished}\nmove=${legacy}\ncarries_on=${!finished && !legacy}\nworkers_subdomain=${subdomain}\n`,
		);
}

async function move(accountId: string, before: Attachment | undefined) {
	if (before?.service !== LEGACY)
		return fail`Refusing: ${DOMAIN} is not on ${OLD}.`;
	// The new Worker must exist before it can take the hostname.
	await call(
		deployToken(),
		told`Whether ${NEW} is there`,
		"GET",
		`/accounts/${accountId}/workers/scripts/${PRODUCTION}/settings`,
	);
	// Once more, right before the move: a give-back must find it on.
	const block = await readBlock();
	if (block !== "on")
		return fail`Refusing: ${BLOCK} is ${blockIs(block)}. Nothing was moved.`;
	const zoneId = await zone(accountId);
	tell("asked");
	show(told`after`, await override(accountId, zoneId, PRODUCTION));
	// Confirmed, but a try before may land late: only if it is given back does that
	// matter, so the give-back of this run says so.
	if (unanswered.writes) tell("unanswered");
}

/** What the give-back of this run must know of its move. */
function tell(what: "asked" | "unanswered") {
	if (process.env.GITHUB_OUTPUT)
		appendFileSync(process.env.GITHUB_OUTPUT, `${what}=true\n`);
}

async function restore(accountId: string, before: Attachment | undefined) {
	// Whether this run's own move may have moved it: not one that failed before it
	// asked Cloudflare. By hand, and in a run that carries on a move another run
	// made, there is none.
	const outcome = process.env.MOVE_OUTCOME?.trim();
	const tried =
		outcome === "success" ||
		outcome === "cancelled" ||
		(outcome === "failure" && process.env.MOVE_ASKED === "true");
	if (inJob() && !tried && process.env.CARRIES_ON !== "true") {
		say(
			told`Nothing to give back: this run has not moved ${DOMAIN}, and carries on no run that did.`,
		);
		return;
	}
	if (before?.service === LEGACY && !tried) {
		say(told`Nothing to give back: ${DOMAIN} is on ${OLD}.`);
		return;
	}
	// The old Worker serves only behind the block. No run turns it off, and it was
	// on before the move, so a zone that does not answer (the domain is on no
	// Worker, say) does not keep the old site from its domain. A block that is gone
	// does.
	if ((await readBlock(3)) === "gone")
		return fail`Not given back: ${BLOCK} is gone, and ${OLD} serves only behind it. ${DOMAIN} stays on ${named(before)}. Put the block back by hand, then give the domain back (${RUNBOOK}, section 7).`;
	const zoneId = await zone(accountId);
	if (before) {
		// Once a move was tried, the old Worker is named again whatever the listing
		// says, because a listing can lag the move it was read after.
		show(told`after`, await override(accountId, zoneId, LEGACY));
	} else {
		// Documented attach: a hostname that nobody holds has no record to keep.
		await call(
			deployToken(),
			told`Attaching the domain to ${OLD}`,
			"PUT",
			`/accounts/${accountId}/workers/domains`,
			{ hostname: HOSTNAME, service: LEGACY, zone_id: zoneId },
		);
		show(told`after`, await readBack(accountId, LEGACY));
	}
	// A step that ends well says that nothing of this run can land any more.
	if (unanswered.writes || process.env.MOVE_UNANSWERED === "true")
		return fail`${DOMAIN} is on ${OLD}, but Cloudflare left a call that moves it unanswered and may still carry it out: no run goes on for an hour (${RUNBOOK}, section 3).`;
}

/** The holder as a step leaves it, whatever became of the step. */
async function left(accountId: string | undefined) {
	try {
		if (!accountId) return say(told`left: unread (no account)`);
		show(told`left`, await holder(accountId, 2));
	} catch (error) {
		say(
			told`left: unread (${error instanceof Told ? error.line : told`no answer`})`,
		);
	}
}

/** What a command that failed means for the run. */
const MEANS = {
	inspect: told`Nothing was changed. If this is the production run, run it again when the cause is known (${RUNBOOK}, sections 3 and 7).`,
	move: told`If the domain was moved, the give-back step of this run returns it (${RUNBOOK}, section 3).`,
	restore: told`The line "left" says who holds the domain now; what to do is in ${RUNBOOK}, section 7.`,
};

async function main() {
	publicOutput();
	const commands = { inspect, move, restore };
	const name = process.argv[2] ?? "";
	const run = Object.hasOwn(commands, name)
		? commands[name as keyof typeof commands]
		: undefined;
	if (!run || process.argv.length !== 3)
		return fail`Use: bun scripts/production-domain.ts inspect|move|restore`;
	if (run === move) assertProductionJob(told`The move runs`);
	// A wrong one is refused before any call.
	CLOUDFLARE();
	GITHUB();
	const token = deployToken();
	let accountId: string | undefined;
	try {
		accountId = await account(token);
		const before = await holder(accountId);
		show(told`before`, before);
		if (before && before.service !== LEGACY && before.service !== PRODUCTION)
			fail`Refusing: ${DOMAIN} is on ${named(before)}.`;
		await run(accountId, before);
	} catch (error) {
		complain(error, told`The domain step failed.`);
		say(MEANS[name as keyof typeof MEANS]);
		process.exitCode = 1;
	} finally {
		if (run !== inspect) await left(accountId);
	}
}

main().catch((error: unknown) => {
	complain(error, told`The domain step failed.`);
	process.exitCode = 1;
});
