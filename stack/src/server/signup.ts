// The sign-up's writes (stack/README.md, "Sign-up"). Nothing here logs, throws or
// answers with an email, an address or a token's hash.
import { ROLES, type Role } from "@/lib/docket";
import { SIGNUP } from "@/lib/limits";
import { env } from "./env";
import { recordDatabase } from "./observability";

export interface SignupInput {
	email: string;
	role: Role;
	towns: string[];
	/** A field no person sees; whoever fills it stores nothing. */
	company: string;
}

// One address, of characters a mailbox really has, and no control character.
const EMAIL =
	/^[^\s@<>(),;:"\\[\]\p{C}]+@[^\s@<>(),;:"\\[\]\p{C}]+\.[^\s@<>(),;:"\\[\]\p{C}]+$/u;

/** What a page sends, checked; anything else is refused before any read. */
export function readSignup(
	data: unknown,
): SignupInput | "email" | "role" | "towns" {
	const raw = (data ?? {}) as Record<string, unknown>;
	const email =
		typeof raw.email === "string" ? raw.email.trim().toLowerCase() : "";
	if (email.length > 254 || !EMAIL.test(email)) return "email";
	if (typeof raw.role !== "string" || !Object.hasOwn(ROLES, raw.role))
		return "role";
	if (
		!Array.isArray(raw.towns) ||
		raw.towns.length === 0 ||
		raw.towns.length > 100 ||
		!raw.towns.every((town) => typeof town === "string" && town.length <= 60)
	)
		return "towns";
	return {
		email,
		role: raw.role as Role,
		towns: [...new Set(raw.towns as string[])].sort(),
		company: typeof raw.company === "string" ? raw.company.trim() : "",
	};
}

/** A token as the browser holds it, or nothing. */
export const readToken = (data: unknown): string | undefined => {
	const token = (data as { token?: unknown } | null | undefined)?.token;
	return typeof token === "string" && /^[0-9a-f]{64}$/.test(token)
		? token
		: undefined;
};

const hex = (bytes: ArrayBuffer | Uint8Array) =>
	Array.from(new Uint8Array(bytes), (byte) =>
		byte.toString(16).padStart(2, "0"),
	).join("");
const newToken = () => hex(crypto.getRandomValues(new Uint8Array(32)));
const sha256 = async (value: string) =>
	hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));

/**
 * Whom a limit counts: an IPv4 address, or the /64 an IPv6 address sits in,
 * because one connection holds a whole /64.
 */
export function callerKey(address: string | null): string {
	const value = (address ?? "").trim().toLowerCase();
	if (!value) return "unknown";
	if (!value.includes(":")) return value;
	// An IPv4 address written as IPv6 (::ffff:192.0.2.1).
	if (value.includes(".")) return value.slice(value.lastIndexOf(":") + 1);
	const [head = "", tail] = value.split("::");
	const left = head.split(":").filter(Boolean);
	const right = tail?.split(":").filter(Boolean) ?? [];
	const missing = Math.max(0, 8 - left.length - right.length);
	return `${[...left, ...Array<string>(missing).fill("0"), ...right]
		.slice(0, 4)
		.map((group) => group.padStart(4, "0"))
		.join(":")}::/64`;
}

// Without a secret, a local run makes a key of its own and every other stage
// has none.
let localKey: string | undefined;
function clientKey(): string | undefined {
	const secret = env.SIGNUP_CLIENT_KEY?.trim();
	if (secret && secret.length >= 32) return secret;
	if (env.APP_ENV !== "local") return undefined;
	localKey ??= newToken();
	return localKey;
}

async function clientHash(secret: string, address: string | null) {
	const encode = (value: string) => new TextEncoder().encode(value);
	const key = await crypto.subtle.importKey(
		"raw",
		encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	return hex(
		await crypto.subtle.sign(
			"HMAC",
			key,
			encode(`docket-signup-client:v1:${callerKey(address)}`),
		),
	);
}

// ?1 the attempt, ?2 the client, ?3 now, ?4 the start of the hour. The one
// statement that takes a place, and the only one that counts them.
const TAKE_PLACE = `INSERT INTO signup_attempts (id, client, at)
SELECT ?1, ?2, ?3
WHERE (SELECT signup_open FROM settings WHERE id = 1) = 1
	AND (SELECT count(*) FROM signup_attempts WHERE client = ?2 AND at > ?4) < ${SIGNUP.perClient}
	AND (SELECT count(*) FROM signup_attempts WHERE at > ?4) < ${SIGNUP.inAll}
RETURNING id`;

// The rest of a sign-up happens only for an attempt that took a place.
const PLACE = "EXISTS (SELECT 1 FROM signup_attempts WHERE id = ?1)";

const STORE = `INSERT INTO signups (id, email, role, towns, created_at)
SELECT ?2, ?3, ?4, ?5, ?6 WHERE ${PLACE}
ON CONFLICT (email) DO NOTHING`;

const STORE_TOKEN = `INSERT INTO signup_tokens (token_hash, signup_id, made, created_at)
SELECT ?2, s.id, s.id = ?3, ?4 FROM signups s WHERE s.email = ?5 AND ${PLACE}`;

// Why there was no place: read in the same batch, so as the insert saw it.
const WHY = `SELECT (SELECT signup_open FROM settings WHERE id = 1) AS open,
	(SELECT min(at) FROM (SELECT at FROM signup_attempts WHERE client = ?1 AND at > ?2 ORDER BY at DESC LIMIT ${SIGNUP.perClient})) AS mine,
	(SELECT count(*) FROM signup_attempts WHERE client = ?1 AND at > ?2) AS mine_count,
	(SELECT min(at) FROM (SELECT at FROM signup_attempts WHERE at > ?2 ORDER BY at DESC LIMIT ${SIGNUP.inAll})) AS every`;

export type SignupAnswer =
	| { status: "ok"; token: string }
	| { status: "closed" }
	| { status: "limited"; retryAfter: number }
	| { status: "invalid"; field: "email" | "role" | "towns" };

export async function signUp(
	input: SignupInput,
	address: string | null,
): Promise<SignupAnswer> {
	const token = newToken();
	if (input.company) return { status: "ok", token };
	const secret = clientKey();
	if (!secret) return { status: "closed" };
	const known = await env.DB.prepare("SELECT slug FROM towns").all<{
		slug: string;
	}>();
	recordDatabase(known.meta);
	const slugs = new Set(known.results.map(({ slug }) => slug));
	if (!input.towns.every((town) => slugs.has(town)))
		return { status: "invalid", field: "towns" };

	const now = Date.now();
	const since = now - SIGNUP.windowMs;
	const attempt = crypto.randomUUID();
	const signup = crypto.randomUUID();
	const client = await clientHash(secret, address);
	const [taken, , , why] = await env.DB.batch<Record<string, unknown>>([
		env.DB.prepare(TAKE_PLACE).bind(attempt, client, now, since),
		env.DB.prepare(STORE).bind(
			attempt,
			signup,
			input.email,
			input.role,
			JSON.stringify(input.towns),
			now,
		),
		env.DB.prepare(STORE_TOKEN).bind(
			attempt,
			await sha256(token),
			signup,
			now,
			input.email,
		),
		env.DB.prepare(WHY).bind(client, since),
		env.DB.prepare(
			`INSERT INTO counters (day, kind, count)
			SELECT ?2, 'signup_limited', 1 WHERE NOT ${PLACE} AND (SELECT signup_open FROM settings WHERE id = 1) = 1
			ON CONFLICT (day, kind) DO UPDATE SET count = count + 1`,
		).bind(attempt, new Date(now).toISOString().slice(0, 10)),
	]);
	if (taken) recordDatabase(taken.meta);
	if (taken?.results.length === 1) return { status: "ok", token };
	const reason = why?.results[0];
	if (reason?.open !== 1) return { status: "closed" };
	const oldest = Number(
		Number(reason.mine_count) >= SIGNUP.perClient ? reason.mine : reason.every,
	);
	return {
		status: "limited",
		retryAfter: Math.max(1, Math.ceil((oldest + SIGNUP.windowMs - now) / 1000)),
	};
}

/** Records the paid intent of a token's sign-up, once. */
export async function recordIntent(token: string): Promise<boolean> {
	const hash = await sha256(token);
	const [, known] = await env.DB.batch<Record<string, unknown>>([
		env.DB.prepare(
			`INSERT INTO paid_intents (signup_id, created_at)
			SELECT signup_id, ?2 FROM signup_tokens WHERE token_hash = ?1
			ON CONFLICT (signup_id) DO NOTHING`,
		).bind(hash, Date.now()),
		env.DB.prepare(
			"SELECT 1 AS known FROM signup_tokens WHERE token_hash = ?1",
		).bind(hash),
	]);
	if (known) recordDatabase(known.meta);
	return known?.results.length === 1;
}

/**
 * Deletes the sign-up this token made, with its tokens and intent; any other
 * token is only forgotten itself. Nothing in the answer tells which.
 */
export async function removeSignup(token: string): Promise<void> {
	const hash = await sha256(token);
	const results = await env.DB.batch([
		env.DB.prepare(
			"DELETE FROM signups WHERE id = (SELECT signup_id FROM signup_tokens WHERE token_hash = ?1 AND made = 1)",
		).bind(hash),
		env.DB.prepare("DELETE FROM signup_tokens WHERE token_hash = ?1").bind(
			hash,
		),
	]);
	for (const { meta } of results) recordDatabase(meta);
}

/**
 * Counts one page request, and deletes the hashes of clients whose hour is
 * over.
 */
export async function countPage(kind: string): Promise<void> {
	const now = Date.now();
	await env.DB.batch([
		env.DB.prepare(
			"INSERT INTO counters (day, kind, count) VALUES (?1, ?2, 1) ON CONFLICT (day, kind) DO UPDATE SET count = count + 1",
		).bind(new Date(now).toISOString().slice(0, 10), kind),
		env.DB.prepare("DELETE FROM signup_attempts WHERE at <= ?1").bind(
			now - SIGNUP.windowMs,
		),
	]);
}
