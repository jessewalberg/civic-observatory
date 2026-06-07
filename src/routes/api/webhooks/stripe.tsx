import { createFileRoute } from "@tanstack/react-router";

// RELOCATED (Clerk migration Phase 2 — see civic-observatory ADR-0002 / convex/http.ts).
//
// The Stripe webhook is now handled INSIDE Convex as an httpAction at
// `https://<deployment>.convex.site/stripe/webhook`, which verifies the
// signature server-side and dispatches to INTERNAL mutations. The old worker
// route forwarded to PUBLIC Convex mutations, which let any client forge a
// subscription event and self-upgrade to pro — this route is retired to close
// that hole.
//
// Repoint the Stripe dashboard webhook endpoint to the Convex .site URL above.
export const Route = createFileRoute("/api/webhooks/stripe")({
	server: {
		handlers: {
			POST: async () =>
				new Response(
					JSON.stringify({
						error:
							"Gone. The Stripe webhook is handled by Convex at /stripe/webhook on the deployment's .convex.site domain.",
					}),
					{ status: 410, headers: { "Content-Type": "application/json" } },
				),
		},
	},
});
