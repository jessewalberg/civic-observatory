import Stripe from "stripe";
import { z } from "zod";
import { internal } from "../../api";
import { env } from "../../env";
import { defineTask, privateTask } from "../../procedure";

function getStripe() {
	const key = env.STRIPE_SECRET_KEY;
	if (!key || !/^(sk|rk)_test_/.test(key))
		throw new Error("Stripe requires a test-mode secret key");
	return new Stripe(key, {
		apiVersion: "2025-12-15.clover",
	});
}
function periodEnd(subscription: Stripe.Subscription): number {
	if (!subscription.items.data.length)
		throw new Error("Subscription has no valid billing period");
	let end = subscription.items.data[0].current_period_end;
	for (const item of subscription.items.data) {
		if (
			!Number.isFinite(item.current_period_end) ||
			item.current_period_end <= 0
		)
			throw new Error("Subscription has no valid billing period");
		end = Math.max(end, item.current_period_end);
	}
	return end * 1000;
}
export const createCheckoutSession = defineTask({
	args: {},
	handler: async (
		ctx,
	): Promise<{
		url: string | null;
	}> => {
		const stripe = getStripe();
		const priceId = env.STRIPE_PRO_PRICE_ID;
		if (!priceId) throw new Error("STRIPE_PRO_PRICE_ID not configured");
		const appUrl = env.APP_URL;
		// Identity-first: a caller can only checkout for THEMSELVES.
		const user = await ctx.call(
			internal.functions.users.queries.getCurrentInternal,
			{},
		);
		if (!user) {
			throw new Error("User not found");
		}
		if (user.stripeCustomerId && user.billingMode !== "test")
			throw new Error("Imported live billing is unavailable in test mode");
		let customerId = user.stripeCustomerId;
		if (!customerId) {
			// Create a new Stripe customer
			const customer = await stripe.customers.create({
				email: user.email,
				metadata: {
					appUserId: user._id,
				},
			});
			customerId = customer.id;
			// Update user with Stripe customer ID
			await ctx.call(internal.functions.stripe.mutations.updateStripeCustomer, {
				userId: user._id,
				stripeCustomerId: customerId,
			});
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
				appUserId: user._id,
			},
		});
		return { url: session.url };
	},
});
export const createPortalSession = defineTask({
	args: {},
	handler: async (
		ctx,
	): Promise<{
		url: string;
	}> => {
		const stripe = getStripe();
		const appUrl = env.APP_URL;
		// Identity-first: a caller can only open THEIR OWN billing portal.
		const user = await ctx.call(
			internal.functions.users.queries.getCurrentInternal,
			{},
		);
		if (!user) {
			throw new Error("User not found");
		}
		if (user.billingMode !== "test")
			throw new Error("Imported live billing is unavailable in test mode");
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
// ═══════════════════════════════════════════════════════════════
export const handleWebhook = privateTask({
	args: {
		body: z.string(),
		signature: z.string(),
	},
	handler: async (
		ctx,
		args,
	): Promise<{
		ok: boolean;
		error?: string;
	}> => {
		const stripe = getStripe();
		const webhookSecret = env.STRIPE_WEBHOOK_SECRET;
		if (!webhookSecret) {
			throw new Error("STRIPE_WEBHOOK_SECRET not configured");
		}
		let event: Stripe.Event;
		try {
			event = await stripe.webhooks.constructEventAsync(
				args.body,
				args.signature,
				webhookSecret,
				undefined,
				Stripe.createSubtleCryptoProvider(),
			);
			if (event.livemode)
				return { ok: false, error: "Live Stripe events are disabled" };
		} catch {
			console.error("Stripe webhook signature verification failed");
			return { ok: false, error: "Invalid signature" };
		}
		let change:
			| { kind: "ignored" }
			| {
					kind: "checkout";
					customerId: string;
					subscriptionId: string;
					periodEnd: number;
			  }
			| {
					kind: "updated";
					subscriptionId: string;
					periodEnd: number;
					status: string;
			  }
			| { kind: "deleted"; subscriptionId: string } = { kind: "ignored" };
		switch (event.type) {
			case "checkout.session.completed": {
				const session = event.data.object as Stripe.Checkout.Session;
				if (
					session.mode === "subscription" &&
					session.subscription &&
					session.customer
				) {
					const subscription = await stripe.subscriptions.retrieve(
						session.subscription as string,
					);
					change = {
						kind: "checkout",
						customerId: session.customer as string,
						subscriptionId: subscription.id,
						periodEnd: periodEnd(subscription),
					};
				}
				break;
			}
			case "customer.subscription.updated": {
				const subscription = event.data.object as Stripe.Subscription;
				change = {
					kind: "updated",
					subscriptionId: subscription.id,
					periodEnd: periodEnd(subscription),
					status: subscription.status,
				};
				break;
			}
			case "customer.subscription.deleted": {
				const subscription = event.data.object as Stripe.Subscription;
				change = { kind: "deleted", subscriptionId: subscription.id };
				break;
			}
			default:
				console.log("Unhandled Stripe event type:", event.type);
		}
		await ctx.call(internal.functions.stripe.mutations.applyEvent, {
			eventId: event.id,
			eventType: event.type,
			change,
		});
		return { ok: true };
	},
});
