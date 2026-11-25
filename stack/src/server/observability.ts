import { AsyncLocalStorage } from "node:async_hooks";
import { Cause, Effect, Exit, Logger, Option } from "effect";
import { env } from "./env";
import { StorageError } from "./errors";
import { writeLine } from "./log";
import { commitSha } from "./release";

// One record for each request, of allowlisted values only: never a URL, a
// query, an address, an email, a header or a body.
const routes = [
	"ssr",
	"health",
	"sitemap",
	"signup",
	"intent",
	"remove",
] as const;
export type Route = (typeof routes)[number];
type ErrorTag =
	| "StorageError"
	| "UnhandledError"
	| "ServerError"
	| "Interrupted"
	// The caller was over a limit (src/lib/limits.ts); the answer is 429.
	| "RateLimited";

interface BoundaryContext {
	/** Pass only D1 result.meta, never a query, its parameters or rows. */
	database: (meta: {
		duration?: number;
		rows_read?: number;
		rows_written?: number;
	}) => void;
}

const bounded = (value: number | undefined, maximum: number) =>
	typeof value === "number" && Number.isFinite(value)
		? Math.min(maximum, Math.max(0, value))
		: 0;

/** The outermost boundary of the current request, if one is running. */
interface Scope {
	context: BoundaryContext;
	route?: Route;
	errorTag?: ErrorTag;
	status?: number;
	headers?: Map<string, string>;
}
const scopes = new AsyncLocalStorage<Scope>();

/**
 * A header on the current answer, whatever its status. TanStack Start keeps
 * what `setResponseHeader` set only on a 2xx answer.
 */
export function answerHeader(name: string, value: string) {
	const scope = scopes.getStore();
	if (!scope) return;
	scope.headers ??= new Map();
	scope.headers.set(name, value);
}

/** The current page's status, which the router would make a 200 or a 500. */
export function answerStatus(status: number) {
	const scope = scopes.getStore();
	if (scope) scope.status = status;
}

/** Names the current request's record from inside a server function. */
export function nameRequest(route: Route) {
	const scope = scopes.getStore();
	if (scope) scope.route = route;
}

/** Tags a failure the handler answered itself. */
export function tagRequest(errorTag: ErrorTag) {
	const scope = scopes.getStore();
	if (scope) scope.errorTag = errorTag;
}

/** Adds one D1 result's meta to the current record (no query, no rows). */
export function recordDatabase(meta: {
	duration?: number;
	rows_read?: number;
	rows_written?: number;
}) {
	scopes.getStore()?.context.database(meta);
}

async function settle<E>(
	request: Request,
	handle: () => Effect.Effect<Response, E>,
): Promise<{ response: Response; errorTag?: ErrorTag }> {
	// Suppress default Effect cause/message serialization at this boundary.
	const exit = await Effect.runPromiseExit(
		Effect.suspend(handle).pipe(Effect.provide(Logger.layer([]))),
		{ signal: request.signal },
	);
	if (Exit.isSuccess(exit))
		return {
			response: exit.value,
			errorTag: exit.value.status >= 500 ? "ServerError" : undefined,
		};
	if (Cause.hasInterruptsOnly(exit.cause))
		return {
			response: new Response(null, { status: 499 }),
			errorTag: "Interrupted",
		};
	const failure = Cause.findErrorOption(exit.cause);
	if (Option.isSome(failure) && failure.value instanceof StorageError)
		return {
			response: Response.json(
				{ error: "Storage unavailable" },
				{ status: 503 },
			),
			errorTag: "StorageError",
		};
	return {
		response: Response.json(
			{ error: "Internal server error" },
			{ status: 500 },
		),
		errorTag: "UnhandledError",
	};
}

/**
 * One HTTP boundary and one record per request. A boundary nested inside
 * another (a server route under the Worker entry) only maps its own typed
 * failures and names the route; the outermost boundary writes the record.
 */
export async function serve<E>(
	request: Request,
	route: Route,
	handle: () => Effect.Effect<Response, E>,
): Promise<Response> {
	const outer = scopes.getStore();
	if (outer) {
		const settled = await settle(request, handle);
		outer.route = route;
		outer.errorTag = settled.errorTag ?? outer.errorTag;
		return settled.response;
	}
	const requestId = crypto.randomUUID();
	const started = performance.now();
	const database = { duration: 0, rows_read: 0, rows_written: 0 };
	let hasDatabase = false;
	const scope: Scope = {
		context: {
			database: (meta) => {
				hasDatabase = true;
				database.duration = bounded(
					database.duration + bounded(meta.duration, 86_400_000),
					86_400_000,
				);
				database.rows_read = bounded(
					database.rows_read + bounded(meta.rows_read, 1_000_000_000),
					1_000_000_000,
				);
				database.rows_written = bounded(
					database.rows_written + bounded(meta.rows_written, 1_000_000_000),
					1_000_000_000,
				);
			},
		},
	};
	const settled = await scopes.run(scope, () => settle(request, handle));
	const response = settled.response;
	const errorTag = scope.errorTag ?? settled.errorTag;
	const headers = new Headers(response.headers);
	headers.set("X-Request-ID", requestId);
	for (const [name, value] of scope.headers ?? []) headers.set(name, value);
	const status =
		scope.status !== undefined && [200, 500].includes(response.status)
			? scope.status
			: response.status;
	const result = new Response(response.body, { status, headers });
	const environment = /^(local|preview|production)$/.test(env.APP_ENV)
		? env.APP_ENV
		: "unknown";
	const release = /^[a-f0-9]{7,40}$/.test(commitSha) ? commitSha : "unknown";
	const severity = status >= 500 ? "ERROR" : "INFO";
	const named = scope.route ?? route;
	const record = {
		// Built from allowlisted values only; Workers Issues groups by this.
		message: `${named} ${errorTag ?? status}`,
		timestamp: new Date().toISOString(),
		severity,
		app: "civic-observatory-docket",
		environment,
		release,
		requestId,
		route: named,
		method: [
			"GET",
			"HEAD",
			"POST",
			"PUT",
			"PATCH",
			"DELETE",
			"OPTIONS",
		].includes(request.method)
			? request.method
			: "OTHER",
		status,
		elapsedMs: bounded(performance.now() - started, 86_400_000),
		...(errorTag ? { errorTag } : {}),
		...(hasDatabase ? { database } : {}),
	};
	if (environment === "local") return result;
	// Logging is best effort: a broken sink cannot change an answer.
	try {
		writeLine(JSON.stringify(record), severity);
	} catch {
		// Never fall back to raw errors or another sink.
	}
	// The same record in Workers Analytics Engine, at fixed positions: index
	// route; blobs environment, release, route, method, error tag, severity,
	// request ID; doubles status, elapsed ms, D1 ms, rows read, rows written.
	try {
		env.REQUEST_RECORDS?.writeDataPoint({
			indexes: [named],
			blobs: [
				environment,
				release,
				named,
				record.method,
				errorTag ?? "",
				severity,
				requestId,
			],
			doubles: [
				status,
				record.elapsedMs,
				database.duration,
				database.rows_read,
				database.rows_written,
			],
		});
	} catch {
		// Best effort, like the console record.
	}
	return result;
}
