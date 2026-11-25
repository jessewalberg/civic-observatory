import handler, { createServerEntry } from "@tanstack/react-start/server-entry";
import { Effect } from "effect";
import { quietConsole } from "@/server/log";
import { serve } from "@/server/observability";
import { httpsRedirect, secured } from "@/server/security";

// Every request enters the boundary here, recorded as `ssr` (pages, server
// functions, robots.txt, unmatched paths and methods). A server route's own
// `serve` call nests inside it and only renames the route and maps its typed
// failures, so each request yields exactly one record. Every answer carries
// the security headers, and production answers https only.
export default createServerEntry({
	fetch(request, opts) {
		quietConsole();
		return secured(() =>
			serve(request, "ssr", () =>
				Effect.promise(
					async () => httpsRedirect(request) ?? handler.fetch(request, opts),
				),
			),
		);
	},
});
