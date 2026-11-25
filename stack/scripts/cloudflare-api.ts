// The few Cloudflare calls the release and the operator's scripts make themselves
// (production-domain.ts, remote-d1.ts, infra.ts).
import { ORIGIN, WORKERS } from "../src/lib/site";
import { mask, say } from "./public-log";

/** An origin; anything but the real one must be on this machine (rehearsal). */
export function origin(name: string, real: string) {
	const value = process.env[name]?.trim() || real;
	if (value !== real && !/^http:\/\/127\.0\.0\.1:\d+$/.test(value))
		throw new Error(`${name} may only be ${real} or on 127.0.0.1.`);
	return value;
}
export const CLOUDFLARE = origin(
	"CLOUDFLARE_API",
	"https://api.cloudflare.com",
);
const rehearsal = CLOUDFLARE.startsWith("http://127.0.0.1");

/** Waits are two seconds, and short against the rehearsal's stand-in. */
export const wait = (ticks: number) =>
	new Promise((resolve) =>
		setTimeout(resolve, ticks * (rehearsal ? 20 : 2_000)),
	);

interface Envelope<T> {
	success?: boolean;
	errors?: { code?: number; message?: string }[];
	result?: T;
}

/** A call that Cloudflare refused, with what it said. */
export class Declined extends Error {
	codes: number[];
	constructor(message: string, codes: number[]) {
		super(message);
		this.codes = codes;
	}
}
class Unanswered extends Error {}

async function once<T>(
	token: string,
	method: string,
	path: string,
	body?: unknown,
) {
	const where = `${method} ${path.split("?")[0]}`;
	const response = await fetch(`${CLOUDFLARE}/client/v4${path}`, {
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
		throw new Unanswered(
			`${where}: ${error instanceof Error ? error.name : "no answer"}`,
		);
	});
	const text = await response.text().catch(() => "");
	let envelope: Envelope<T> = {};
	try {
		envelope = JSON.parse(text) as Envelope<T>;
	} catch {
		// An edge error page; the status says what happened.
	}
	if (response.ok && envelope.success !== false) return envelope.result as T;
	const errors = envelope.errors ?? [];
	const reason = `${where}: ${response.status} ${errors
		.map((error) => `${error.code} ${error.message}`)
		.join("; ")}`;
	throw response.status === 429 || response.status >= 500
		? new Unanswered(reason)
		: new Declined(
				reason,
				errors.map(({ code }) => Number(code)),
			);
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
	method: string,
	path: string,
	body?: unknown,
	tries = 5,
) {
	for (let attempt = 1; ; attempt++) {
		try {
			return await once<T>(token, method, path, body);
		} catch (error) {
			if (error instanceof Unanswered && method !== "GET")
				unanswered.writes += 1;
			if (!(error instanceof Unanswered) || attempt === tries) throw error;
			say(`no answer, trying again: ${error.message}`);
			await wait(attempt);
		}
	}
}

/** The stage's deploy token. */
export function deployToken() {
	const token = process.env.CLOUDFLARE_API_TOKEN?.trim();
	if (!token)
		throw new Error("Set CLOUDFLARE_API_TOKEN (the stage's deploy token).");
	return token;
}

/** The one account the token reaches. */
export async function account(token: string) {
	const accounts = await call<{ id: string }[]>(
		token,
		"GET",
		"/accounts?per_page=2",
	);
	const [only, second] = accounts;
	if (!only || second)
		throw new Error("The Cloudflare token must reach exactly one account.");
	mask(only.id);
	return only.id;
}

/** The domain and the Workers it moves between. */
export const HOSTNAME = new URL(ORIGIN).hostname;
/** The old app's Worker, kept as the way back. */
export const LEGACY = "civic-observatory";
/** The docket's Worker. */
export const PRODUCTION = WORKERS.production;
/**
 * production.yml's two steps that write the domain. GitHub records a step by its
 * name, and later runs read there how these ended, so their names stay as they
 * are.
 */
export const MOVE_STEP = `First cutover - move ${HOSTNAME} to ${PRODUCTION}`;
export const GIVE_BACK_STEP = `First cutover failed - ${HOSTNAME} back to ${LEGACY}`;

/** Where the domain answers; another place only in the rehearsal. */
export const SITE = () => origin("SITE_ORIGIN", ORIGIN);
/** Where production's Worker answers before it has the domain. */
export function workersDev() {
	const subdomain = process.env.WORKERS_SUBDOMAIN ?? "";
	if (!/^[a-z0-9-]{1,63}$/.test(subdomain))
		throw new Error("Set WORKERS_SUBDOMAIN (the inspection's output).");
	mask(subdomain);
	return origin(
		"WORKERS_DEV_ORIGIN",
		`https://${PRODUCTION}.${subdomain}.workers.dev`,
	);
}
