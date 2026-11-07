import { createFileRoute } from "@tanstack/react-router";
import { internal } from "../../../../server/api";
import { env } from "../../../../server/env";
import { invokeTrusted } from "../../../../server/runtime";
export const Route = createFileRoute("/api/webhooks/stripe")({
	server: {
		handlers: {
			POST: async ({ request }) => {
				const signature = request.headers.get("stripe-signature");
				if (!signature)
					return Response.json({ error: "Missing signature" }, { status: 400 });
				try {
					const result = await invokeTrusted(
						env,
						internal.functions.stripe.actions.handleWebhook,
						{ body: await request.text(), signature },
					);
					return Response.json(
						result.ok ? { received: true } : { error: result.error },
						{ status: result.ok ? 200 : 400 },
					);
				} catch {
					return Response.json(
						{ error: "Test billing is not configured" },
						{ status: 503 },
					);
				}
			},
		},
	},
});
