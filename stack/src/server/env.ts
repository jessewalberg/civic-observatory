import * as cloudflare from "cloudflare:workers";

// Request-time Worker bindings. Local values come from the local-only
// wrangler.jsonc.
export interface AppEnv {
	DB: D1Database;
	APP_ENV: "local" | "preview" | "production";
	/** Keys the hash that stands for a client (./signup.ts). Absent: closed. */
	SIGNUP_CLIENT_KEY?: string;
	/** The rate limit of src/lib/limits.ts; absent locally. */
	LIMIT_CALLS?: RateLimit;
	/** Sanitized request records (./observability.ts); absent locally. */
	REQUEST_RECORDS?: AnalyticsEngineDataset;
	/** Local runs only: today's date, for the checks. No stage sets it. */
	LOCAL_TODAY?: string;
}
// Defer binding lookup until a Worker request, including during local Vite SSR.
export const env = new Proxy({} as AppEnv, {
	get: (_, key) => (cloudflare.env as unknown as AppEnv)[key as keyof AppEnv],
});
