import { waitUntil } from "cloudflare:workers";
import {
	createCsrfMiddleware,
	createMiddleware,
	createStart,
} from "@tanstack/react-start";
import { MAX_CALL_BYTES } from "@/lib/limits";
import { pageKind } from "@/lib/page-kind";
import { OLD_FUNCTIONS } from "@/lib/site";
import { env } from "@/server/env";
import { bodyWithin, isReadable, overLimit } from "@/server/rate-limit";
import { commitSha } from "@/server/release";
import { countPage } from "@/server/signup";
import publicRobots from "../public/robots.txt?raw";

// Only production is indexed: on every other stage /robots.txt disallows
// everything and every Worker answer carries `X-Robots-Tag: noindex`. The
// Worker runs first for /robots.txt (wrangler.jsonc).
const robots = createMiddleware({ type: "request" }).server(
	async ({ request, pathname, next }) => {
		const production = env.APP_ENV === "production";
		if (pathname === "/robots.txt")
			return new Response(
				request.method === "HEAD"
					? null
					: production
						? publicRobots
						: "User-agent: *\nDisallow: /\n",
				{
					headers: {
						"Content-Type": "text/plain; charset=utf-8",
						...(production ? {} : { "X-Robots-Tag": "noindex" }),
					},
				},
			);
		const result = await next();
		if (!production) result.response.headers.set("X-Robots-Tag", "noindex");
		return result;
	},
);
// The commit marker (x-commit-sha), on every answer.
const releaseHeader = createMiddleware({ type: "request" }).server(
	async ({ next }) => {
		const result = await next();
		result.response.headers.set("x-commit-sha", commitSha);
		return result;
	},
);
// Nothing of this app is under the Start default function path (src/lib/site.ts).
// Whoever asks for it gets a 404, whatever the method and the headers.
const noOldFunctions = createMiddleware({ type: "request" }).server(
	async ({ pathname, next }) =>
		pathname.toLowerCase().startsWith(OLD_FUNCTIONS.toLowerCase())
			? new Response("Not found", {
					status: 404,
					headers: {
						"Content-Type": "text/plain; charset=utf-8",
						"Cache-Control": "no-store",
					},
				})
			: next(),
);
// A custom start instance replaces TanStack Start's default request middleware,
// including its CSRF check for server functions, so it is listed here.
const csrf = createCsrfMiddleware({
	filter: (ctx) => ctx.handlerType === "serverFn",
});
// A server function's body is parsed before its handler runs, so the limits on
// its size and on how often it is called come first.
const boundedCalls = createMiddleware({ type: "request" }).server(
	async ({ request, handlerType, next }) => {
		if (handlerType !== "serverFn") return next();
		if (!(await bodyWithin(request, MAX_CALL_BYTES)))
			return new Response(null, { status: 413 });
		if (await overLimit(request))
			return new Response("Too many requests.", {
				status: 429,
				headers: { "Content-Type": "text/plain; charset=utf-8" },
			});
		if (!(await isReadable(request)))
			return new Response(null, { status: 400 });
		return next();
	},
);
// One count for each page that was answered (src/lib/page-kind.ts). It never
// delays or breaks the answer.
const pageCounts = createMiddleware({ type: "request" }).server(
	async ({ request, handlerType, next }) => {
		const result = await next();
		if (
			handlerType === "router" &&
			request.method === "GET" &&
			result.response.status === 200 &&
			result.response.headers.get("content-type")?.startsWith("text/html")
		) {
			const kind = pageKind(new URL(request.url));
			if (kind) waitUntil(countPage(kind).catch(() => {}));
		}
		return result;
	},
);
export const startInstance = createStart(() => ({
	requestMiddleware: [
		releaseHeader,
		robots,
		noOldFunctions,
		csrf,
		boundedCalls,
		pageCounts,
	],
}));
