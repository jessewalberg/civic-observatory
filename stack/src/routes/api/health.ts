import { createFileRoute } from "@tanstack/react-router";
import { Effect } from "effect";
import { readHealth } from "@/server/docket";
import { attempt } from "@/server/errors";
import { serve } from "@/server/observability";
import { commitSha } from "@/server/release";

// The release check's read: the commit this Worker was built from, the release
// of the data, and whether sign-up is open. When D1 cannot answer, the status is
// 503 and sign-up reads as closed.
export const Route = createFileRoute("/api/health")({
	server: {
		handlers: {
			GET: ({ request }) =>
				serve(request, "health", () =>
					attempt(readHealth).pipe(
						Effect.map((state) => ({
							...state,
							database: "reachable",
							status: 200,
						})),
						Effect.catchTag("StorageError", () =>
							Effect.succeed({
								docket: null,
								signup: "closed",
								database: "unreachable",
								status: 503,
							}),
						),
						Effect.map(({ status, ...state }) =>
							Response.json(
								{ commit: commitSha, ...state },
								{ status, headers: { "Cache-Control": "no-store" } },
							),
						),
					),
				),
		},
	},
});
