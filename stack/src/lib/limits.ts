// The limits, stated once (stack/README.md, "Sign-up" and "Limits and headers").
// No imports: a deploy process can read this file too.

export interface Limit {
	/** The Worker binding (src/server/env.ts). */
	binding: "LIMIT_CALLS";
	/** Calls one address may make in `period` seconds. */
	calls: number;
	/** Seconds: Cloudflare offers 10 and 60 only. */
	period: 10 | 60;
}

/**
 * Every server function call. A person makes three at most; many people can
 * share an address. The sign-up's own limits below are exact.
 */
export const CALLS: Limit = { binding: "LIMIT_CALLS", calls: 60, period: 60 };

/** A limit as its response header states it (RateLimit-Policy, IETF draft). */
export const limitPolicy = `"calls";q=${CALLS.calls};w=${CALLS.period}`;

/** The largest body a server function reads: an email, a role and 13 towns. */
export const MAX_CALL_BYTES = 4 * 1024;

/** Sign-up submissions in a rolling hour, counted in D1. */
export const SIGNUP = {
	windowMs: 60 * 60 * 1000,
	perClient: 5,
	inAll: 60,
} as const;

/** Items on one page of a list. */
export const PAGE_SIZE = 25;
