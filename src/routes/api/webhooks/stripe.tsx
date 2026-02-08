import { createFileRoute } from "@tanstack/react-router";
import { ConvexHttpClient } from "convex/browser";
import Stripe from "stripe";
import { api } from "../../../../convex/_generated/api";

function getStripe() {
	if (!process.env.STRIPE_SECRET_KEY) {
		throw new Error("STRIPE_SECRET_KEY not configured");
	}
	return new Stripe(process.env.STRIPE_SECRET_KEY, {
		apiVersion: "2025-12-15.clover",
	});
}

export const Route = createFileRoute("/api/webhooks/stripe")({
	server: {
		handlers: {
			POST: async ({ request }) => {
				const body = await request.text();
				const signature = request.headers.get("stripe-signature");

				if (!signature) {
					return new Response(JSON.stringify({ error: "Missing signature" }), {
						status: 400,
						headers: { "Content-Type": "application/json" },
					});
				}

				let event: Stripe.Event;

				const stripe = getStripe();
				const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
				if (!webhookSecret) {
					throw new Error("STRIPE_WEBHOOK_SECRET not configured");
				}

				try {
					event = stripe.webhooks.constructEvent(
						body,
						signature,
						webhookSecret,
					);
				} catch (err) {
					console.error("Webhook signature verification failed:", err);
					return new Response(JSON.stringify({ error: "Invalid signature" }), {
						status: 400,
						headers: { "Content-Type": "application/json" },
					});
				}

				const convexUrl = process.env.VITE_CONVEX_URL;
				if (!convexUrl) {
					console.error("VITE_CONVEX_URL not configured");
					return new Response(
						JSON.stringify({ error: "Server configuration error" }),
						{
							status: 500,
							headers: { "Content-Type": "application/json" },
						},
					);
				}

				const convex = new ConvexHttpClient(convexUrl);

				try {
					switch (event.type) {
						case "checkout.session.completed": {
							const session = event.data.object as Stripe.Checkout.Session;

							if (
								session.mode === "subscription" &&
								session.subscription &&
								session.customer
							) {
								// Get subscription details
								const subscriptionData = await stripe.subscriptions.retrieve(
									session.subscription as string,
								);
								const subscription = subscriptionData as Stripe.Subscription & {
									current_period_end?: number;
								};

								await convex.mutation(
									api.functions.stripe.mutations.handleCheckoutCompleted,
									{
										stripeCustomerId: session.customer as string,
										stripeSubscriptionId: subscription.id,
										currentPeriodEnd:
											(subscription.current_period_end ?? 0) * 1000,
									},
								);

								console.log(
									"Checkout completed for customer:",
									session.customer,
								);
							}
							break;
						}

						case "customer.subscription.updated": {
							const subscription = event.data.object as Stripe.Subscription & {
								current_period_end?: number;
							};

							await convex.mutation(
								api.functions.stripe.mutations.handleSubscriptionUpdated,
								{
									stripeSubscriptionId: subscription.id,
									currentPeriodEnd:
										(subscription.current_period_end ?? 0) * 1000,
									status: subscription.status,
								},
							);

							console.log(
								"Subscription updated:",
								subscription.id,
								subscription.status,
							);
							break;
						}

						case "customer.subscription.deleted": {
							const subscription = event.data.object as Stripe.Subscription;

							await convex.mutation(
								api.functions.stripe.mutations.handleSubscriptionDeleted,
								{
									stripeSubscriptionId: subscription.id,
								},
							);

							console.log("Subscription deleted:", subscription.id);
							break;
						}

						case "invoice.payment_failed": {
							const invoice = event.data.object as Stripe.Invoice;

							console.error(
								"Payment failed for customer:",
								invoice.customer,
								"Invoice:",
								invoice.id,
								"Attempt:",
								invoice.attempt_count,
							);

							// The subscription status will be updated via customer.subscription.updated
							// which handles the transition to past_due or canceled status
							break;
						}

						default:
							console.log("Unhandled event type:", event.type);
					}

					return new Response(JSON.stringify({ received: true }), {
						status: 200,
						headers: { "Content-Type": "application/json" },
					});
				} catch (err) {
					console.error("Error processing webhook:", err);
					return new Response(
						JSON.stringify({ error: "Webhook processing failed" }),
						{
							status: 500,
							headers: { "Content-Type": "application/json" },
						},
					);
				}
			},
		},
	},
});
