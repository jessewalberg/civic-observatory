// Security headers on every answer the Worker makes (stack/README.md, "Limits and
// headers"). Static files are served without the Worker, so public/_headers
// states the same ones for them; check:limits compares the two.
import { AsyncLocalStorage } from "node:async_hooks";
import { env } from "./env";

/** The same on every answer. */
const SECURITY_HEADERS = {
	"Strict-Transport-Security": "max-age=31536000; includeSubDomains",
	"X-Content-Type-Options": "nosniff",
	"X-Frame-Options": "DENY",
	"Referrer-Policy": "strict-origin-when-cross-origin",
	"Permissions-Policy": "camera=(), microphone=(), geolocation=()",
} as const;

/** The current request's nonce, which the router puts on its inline scripts. */
const nonces = new AsyncLocalStorage<string>();
export const currentNonce = () => nonces.getStore();

/** Hexadecimal: 128 random bits. */
const newNonce = () =>
	[...crypto.getRandomValues(new Uint8Array(16))]
		.map((byte) => byte.toString(16).padStart(2, "0"))
		.join("");

/**
 * What the pages use and nothing else: their own scripts, stylesheet, icon and
 * calls, and the inline scripts this answer made itself.
 */
const contentSecurityPolicy = (nonce: string) =>
	[
		"default-src 'none'",
		`script-src 'self' 'nonce-${nonce}'`,
		"style-src 'self'",
		"img-src 'self'",
		"connect-src 'self'",
		"form-action 'self'",
		"frame-ancestors 'none'",
		"base-uri 'none'",
	].join("; ");

/**
 * Runs a request with a fresh nonce and puts every security header on its
 * answer.
 */
export async function secured(
	handle: () => Promise<Response>,
): Promise<Response> {
	const nonce = newNonce();
	const response = await nonces.run(nonce, handle);
	for (const [name, value] of Object.entries(SECURITY_HEADERS))
		response.headers.set(name, value);
	response.headers.set("Content-Security-Policy", contentSecurityPolicy(nonce));
	return response;
}

/**
 * Production answers plain http with a redirect and nothing else: an email must
 * not cross the network in the clear, and browsers ignore HSTS on http.
 */
export function httpsRedirect(request: Request): Response | undefined {
	const url = new URL(request.url);
	if (env.APP_ENV !== "production" || url.protocol !== "http:")
		return undefined;
	return new Response(null, {
		status: 308,
		headers: {
			Location: `https://${url.hostname}${url.pathname}${url.search}`,
		},
	});
}
