// Enforces the limits of src/lib/limits.ts on server function calls.
import { CALLS, limitPolicy } from "@/lib/limits";
import { env } from "./env";
import { answerHeader, tagRequest } from "./observability";
import { callerKey } from "./signup";

/**
 * Whether this caller has used up the limit. The answer states the limit, when
 * one is bound, and past it says when to try again. A limiter that cannot
 * answer stops nobody. The address is a key in Cloudflare's counter for a
 * minute and is neither logged nor stored here.
 */
export async function overLimit(request: Request): Promise<boolean> {
	const limiter = env[CALLS.binding];
	const address = request.headers.get("cf-connecting-ip");
	if (!limiter || !address) return false;
	answerHeader("RateLimit-Policy", limitPolicy);
	try {
		const { success } = await limiter.limit({ key: callerKey(address) });
		if (success) return false;
	} catch {
		return false;
	}
	answerHeader("Retry-After", String(CALLS.period));
	answerHeader("Cache-Control", "no-store");
	tagRequest("RateLimited");
	return true;
}

/**
 * Whether a call says what it wants in JSON, as the pages do: in its body, or a
 * GET's in its query. Only then does the framework get to read it.
 */
export async function isReadable(request: Request): Promise<boolean> {
	try {
		if (request.method === "GET" || request.method === "HEAD") {
			const payload = new URL(request.url).searchParams.get("payload");
			if (payload !== null) JSON.parse(payload);
			return true;
		}
		if (
			!/^application\/json\b/i.test(request.headers.get("content-type") ?? "")
		)
			return false;
		const body: unknown = JSON.parse(await request.clone().text());
		return typeof body === "object" && body !== null && !Array.isArray(body);
	} catch {
		return false;
	}
}

/**
 * Whether a request's body is at most `bytes` long. Browsers state the length
 * of every call the pages make; a body that states none is counted from a copy,
 * so the handler can still read it.
 */
export async function bodyWithin(
	request: Request,
	bytes: number,
): Promise<boolean> {
	const stated = request.headers.get("content-length");
	if (stated !== null) return Number(stated) <= bytes;
	const reader = request.clone().body?.getReader();
	if (!reader) return true;
	for (let size = 0; ; ) {
		const { done, value } = await reader.read();
		if (done) return true;
		size += value.byteLength;
		if (size > bytes) {
			await reader.cancel().catch(() => {});
			return false;
		}
	}
}
