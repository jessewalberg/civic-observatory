"use node";

import { v } from "convex/values";
import Stripe from "stripe";
import { internal } from "../../_generated/api";
import { action, internalAction } from "../../_generated/server";

function getStripe() {
	const key = process.env.STRIPE_SECRET_KEY;
	if (!key) throw new Error("STRIPE_SECRET_KEY not configured");
	return new Stripe(key, {
		apiVersion: "2025-12-15.clover",
	});
}

export const createCheckoutSession = action({
	args: {},
	handler: async (ctx): Promise<{ url: string | null }> => {
		const stripe = getStripe();
		const priceId = process.env.STRIPE_PRO_PRICE_ID;
		if (!priceId) throw new Error("STRIPE_PRO_PRICE_ID not configured");
		const appUrl = process.env.VITE_APP_URL || "http://localhost:3000";

		// Identity-first: a caller can only checkout for THEMSELVES.
		const user = await ctx.runQuery(
			internal.functions.users.queries.getCurrentInternal,
			{},
		);

		if (!user) {
			throw new Error("User not found");
		}

		// Check if user already has a Stripe customer ID
		let customerId = user.stripeCustomerId;

		if (!customerId) {
			// Create a new Stripe customer
			const customer = await stripe.customers.create({
				email: user.email,
				metadata: {
					convexUserId: user._id,
				},
			});
			customerId = customer.id;

			// Update user with Stripe customer ID
			await ctx.runMutation(
				internal.functions.stripe.mutations.updateStripeCustomer,
				{
					userId: user._id,
					stripeCustomerId: customerId,
				},
			);
		}

		// Create checkout session
		const session = await stripe.checkout.sessions.create({
			customer: customerId,
			mode: "subscription",
			payment_method_types: ["card"],
			line_items: [
				{
					price: priceId,
					quantity: 1,
				},
			],
			success_url: `${appUrl}/pricing?success=true`,
			cancel_url: `${appUrl}/pricing?canceled=true`,
			metadata: {
				convexUserId: user._id,
			},
		});

		return { url: session.url };
	},
});

export const createPortalSession = action({
	args: {},
	handler: async (ctx): Promise<{ url: string }> => {
		const stripe = getStripe();
		const appUrl = process.env.VITE_APP_URL || "http://localhost:3000";

		// Identity-first: a caller can only open THEIR OWN billing portal.
		const user = await ctx.runQuery(
			internal.functions.users.queries.getCurrentInternal,
			{},
		);

		if (!user) {
			throw new Error("User not found");
		}

		if (!user.stripeCustomerId) {
			throw new Error("No Stripe customer found for user");
		}

		// Create portal session
		const session = await stripe.billingPortal.sessions.create({
			customer: user.stripeCustomerId,
			return_url: `${appUrl}/pricing`,
		});

		return { url: session.url };
	},
});

// ═══════════════════════════════════════════════════════════════
// WEBHOOK — relocated from the worker (Clerk migration Phase 2, ADR).
// Signature verification + dispatch run server-side in Convex so the
// subscription mutations are internalMutation (no longer client-callable).
// Called only by the convex/http.ts httpAction with the raw body + signature.
// ═══════════════════════════════════════════════════════════════
export const handleWebhook = internalAction({
	args: {
		body: v.string(),
		signature: v.string(),
	},
	handler: async (ctx, args): Promise<{ ok: boolean; error?: string }> => {
		const stripe = getStripe();
		const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
		if (!webhookSecret) {
			throw new Error("STRIPE_WEBHOOK_SECRET not configured");
		}

		let event: Stripe.Event;
		try {
			event = stripe.webhooks.constructEvent(
				args.body,
				args.signature,
				webhookSecret,
			);
		} catch (err) {
			console.error("Stripe webhook signature verification failed:", err);
			return { ok: false, error: "Invalid signature" };
		}

		switch (event.type) {
			case "checkout.session.completed": {
				const session = event.data.object as Stripe.Checkout.Session;
				if (
					session.mode === "subscription" &&
					session.subscription &&
					session.customer
				) {
					const subscription = (await stripe.subscriptions.retrieve(
						session.subscription as string,
					)) as Stripe.Subscription & { current_period_end?: number };
					await ctx.runMutation(
						internal.functions.stripe.mutations.handleCheckoutCompleted,
						{
							stripeCustomerId: session.customer as string,
							stripeSubscriptionId: subscription.id,
							currentPeriodEnd: (subscription.current_period_end ?? 0) * 1000,
						},
					);
				}
				break;
			}
			case "customer.subscription.updated": {
				const subscription = event.data.object as Stripe.Subscription & {
					current_period_end?: number;
				};
				await ctx.runMutation(
					internal.functions.stripe.mutations.handleSubscriptionUpdated,
					{
						stripeSubscriptionId: subscription.id,
						currentPeriodEnd: (subscription.current_period_end ?? 0) * 1000,
						status: subscription.status,
					},
				);
				break;
			}
			case "customer.subscription.deleted": {
				const subscription = event.data.object as Stripe.Subscription;
				await ctx.runMutation(
					internal.functions.stripe.mutations.handleSubscriptionDeleted,
					{ stripeSubscriptionId: subscription.id },
				);
				break;
			}
			default:
				console.log("Unhandled Stripe event type:", event.type);
		}

		return { ok: true };
	},
});
