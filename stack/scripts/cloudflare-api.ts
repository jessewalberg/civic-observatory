// The few Cloudflare calls the release and the operator's scripts make themselves
// (production-domain.ts, remote-d1.ts, infra.ts). What Cloudflare says in words is
// never printed: which call it was, the status, the numbers of its errors, and what
// that means.
import { ORIGIN } from "../src/lib/site";
import {
	classOf,
	fail,
	keep,
	type Line,
	list,
	mask,
	number,
	say,
	Told,
	told,
} from "./public-log";
import { PRODUCTION } from "./release-words";

export {
	GIVE_BACK_STEP,
	HOSTNAME,
	LEGACY,
	MOVE_STEP,
	PRODUCTION,
} from "./release-words";

/** An origin; anything but the real one must be on this machine (rehearsal). */
export function origin(name: OriginName, real: string) {
	const value = process.env[name]?.trim() || real;
	if (value !== real && !/^http:\/\/127\.0\.0\.1:\d+$/.test(value))
		throw new Told(
			told`${ORIGINS[name]} may only be the real one or on 127.0.0.1.`,
		);
	return value;
}
const ORIGINS = {
	CLOUDFLARE_API: told`CLOUDFLARE_API`,
	GITHUB_API_URL: told`GITHUB_API_URL`,
	SITE_ORIGIN: told`SITE_ORIGIN`,
	WORKERS_DEV_ORIGIN: told`WORKERS_DEV_ORIGIN`,
};
type OriginName = keyof typeof ORIGINS;

/** Read when it is needed, so that a wrong one is said like any other error. */
export const CLOUDFLARE = () =>
	origin("CLOUDFLARE_API", "https://api.cloudflare.com");
const rehearsal = () => CLOUDFLARE().startsWith("http://127.0.0.1");

/** Waits are two seconds, and short against the rehearsal's stand-in. */
export const wait = (ticks: number) =>
	new Promise((resolve) =>
		setTimeout(resolve, ticks * (rehearsal() ? 20 : 2_000)),
	);

interface Envelope<T> {
	success?: boolean;
	errors?: { code?: unknown }[];
	result?: T;
}

/** A call that Cloudflare refused. */
export class Declined extends Told {
	readonly codes: number[];
	constructor(line: Line, codes: number[]) {
		super(line);
		this.codes = codes;
	}
}
class Unanswered extends Told {}

/** What a status means here. */
const meaning = (status: number) =>
	status === 401 || status === 403
		? told`the token is not allowed this, or is not valid`
		: status === 404
			? told`there is no such thing`
			: status === 409
				? told`it conflicts with what is there`
				: status === 429 || status >= 500
					? told`Cloudflare did not answer it`
					: told`Cloudflare refused it`;

/** Cloudflare's clock, from its last answer: an instant, and when we heard it. */
let clock: { at: number; heard: number } | undefined;
/**
 * What time it is by Cloudflare's clock, not by this machine's: the last answer's own
 * date, and the time that has passed since, which a wrong clock still counts right.
 */
export function cloudflareNow(): number {
	if (!clock) return fail`Cloudflare has not said what time it is.`;
	return clock.at + (performance.now() - clock.heard);
}

async function once<T>(
	token: string,
	name: Line,
	method: string,
	path: string,
	body?: unknown,
) {
	const response = await fetch(`${CLOUDFLARE()}/client/v4${path}`, {
		method,
		headers: {
			Authorization: `Bearer ${token}`,
			"Content-Type": "application/json",
		},
		body: body === undefined ? undefined : JSON.stringify(body),
		// Bun repeats a request by itself when a kept connection drops.
		keepalive: false,
		signal: AbortSignal.timeout(20_000),
	}).catch((error: unknown) => {
		keep(`${name}: ${String(error)}`);
		throw new Unanswered(told`${name}: no answer (${classOf(error)})`);
	});
	const said = Date.parse(response.headers.get("date") ?? "");
	if (Number.isFinite(said)) clock = { at: said, heard: performance.now() };
	const text = await response.text().catch(() => "");
	let envelope: Envelope<T> = {};
	try {
		envelope = JSON.parse(text) as Envelope<T>;
	} catch {
		// An edge error page; the status says what happened.
	}
	if (response.ok && envelope.success !== false) return envelope.result as T;
	keep(`${name}: ${method} ${path} ${response.status} ${text}`);
	const codes = (Array.isArray(envelope.errors) ? envelope.errors : [])
		.map((error) => number(error?.code))
		.filter((code) => Number.isSafeInteger(code) && code >= 0 && code < 1e7)
		.slice(0, 5);
	const line = told`${name}: HTTP ${response.status}${
		codes.length
			? told`, error ${list(codes.map((code) => told`${code}`))}`
			: told``
	}: ${meaning(response.status)}`;
	throw response.status === 429 || response.status >= 500
		? new Unanswered(line)
		: new Declined(line, codes);
}

/** How many tries to change something Cloudflare has left unanswered so far. */
export const unanswered = { writes: 0 };

/**
 * Every call here is safe to repeat, so a call nobody answered is tried again,
 * five times in all. GitHub ends a cancelled job five minutes after it was
 * cancelled, so a give-back must not wait for longer than that in all.
 *
 * No answer does not say that nothing happened: Cloudflare may carry such a call
 * out later, even after a later try was answered. So a domain write that went
 * unanswered leaves a mark in GitHub's record of the run, and no run goes on
 * before it can land no more (production-domain.ts).
 */
export async function call<T>(
	token: string,
	name: Line,
	method: string,
	path: string,
	body?: unknown,
	tries = 5,
) {
	for (let attempt = 1; ; attempt++) {
		try {
			return await once<T>(token, name, method, path, body);
		} catch (error) {
			if (error instanceof Unanswered && method !== "GET")
				unanswered.writes += 1;
			if (!(error instanceof Unanswered) || attempt === tries) throw error;
			say(told`no answer, trying again: ${error.line}`);
			await wait(attempt);
		}
	}
}

/** The stage's deploy token. */
export function deployToken() {
	const token = process.env.CLOUDFLARE_API_TOKEN?.trim();
	if (!token) return fail`Set CLOUDFLARE_API_TOKEN (the stage's deploy token).`;
	return token;
}

/** The one account the token reaches. */
export async function account(token: string) {
	const accounts = await call<{ id: string }[]>(
		token,
		told`Which account the token reaches`,
		"GET",
		"/accounts?per_page=2",
	);
	const [only, second] = Array.isArray(accounts) ? accounts : [];
	if (!only || second)
		return fail`The Cloudflare token must reach exactly one account.`;
	if (!/^[0-9a-f]{32}$/i.test(only.id))
		return fail`The account's ID is unreadable.`;
	mask(only.id);
	return only.id;
}

/** Where the domain answers; another place only in the rehearsal. */
export const SITE = () => origin("SITE_ORIGIN", ORIGIN);
/** Where production's Worker answers before it has the domain. */
export function workersDev() {
	const subdomain = process.env.WORKERS_SUBDOMAIN ?? "";
	if (!/^[a-z0-9-]{1,63}$/.test(subdomain))
		return fail`Set WORKERS_SUBDOMAIN (the inspection's output).`;
	mask(subdomain);
	return origin(
		"WORKERS_DEV_ORIGIN",
		`https://${PRODUCTION}.${subdomain}.workers.dev`,
	);
}
