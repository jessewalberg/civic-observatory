import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

const http = httpRouter();

// Stripe webhook (relocated from the worker route — Clerk migration Phase 2).
// This V8 httpAction is a thin transport: it reads the raw body + signature and
// hands them to the node internalAction, which verifies the Stripe signature
// and dispatches to the internalMutation handlers. Because the handlers are
// internal, they can no longer be called directly by a client to forge a
// subscription event and self-upgrade to pro.
//
// Point the Stripe dashboard webhook at: https://<deployment>.convex.site/stripe/webhook
http.route({
	path: "/stripe/webhook",
	method: "POST",
	handler: httpAction(async (ctx, request) => {
		const signature = request.headers.get("stripe-signature");
		if (!signature) {
			return new Response(JSON.stringify({ error: "Missing signature" }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			});
		}
		const body = await request.text();

		const result = await ctx.runAction(
			internal.functions.stripe.actions.handleWebhook,
			{ body, signature },
		);
		if (!result.ok) {
			return new Response(JSON.stringify({ error: result.error }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			});
		}
		return new Response(JSON.stringify({ received: true }), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		});
	}),
});

export default http;
