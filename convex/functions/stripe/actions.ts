"use node";

import { v } from "convex/values";
import { action } from "../../_generated/server";
import { internal } from "../../_generated/api";
import Stripe from "stripe";

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2025-12-15.clover",
  });
}

export const createCheckoutSession = action({
  args: {
    workosUserId: v.string(),
  },
  handler: async (ctx, args): Promise<{ url: string | null }> => {
    const stripe = getStripe();
    const priceId = process.env.STRIPE_PRO_PRICE_ID!;
    const appUrl = process.env.VITE_APP_URL || "http://localhost:3000";

    // Get user from database
    const user = await ctx.runQuery(
      internal.functions.users.queries.getByWorkosUserIdInternal,
      { workosUserId: args.workosUserId }
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
          workosUserId: args.workosUserId,
          convexUserId: user._id,
        },
      });
      customerId = customer.id;

      // Update user with Stripe customer ID
      await ctx.runMutation(internal.functions.stripe.mutations.updateStripeCustomer, {
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
        workosUserId: args.workosUserId,
        convexUserId: user._id,
      },
    });

    return { url: session.url };
  },
});

export const createPortalSession = action({
  args: {
    workosUserId: v.string(),
  },
  handler: async (ctx, args): Promise<{ url: string }> => {
    const stripe = getStripe();
    const appUrl = process.env.VITE_APP_URL || "http://localhost:3000";

    // Get user from database
    const user = await ctx.runQuery(
      internal.functions.users.queries.getByWorkosUserIdInternal,
      { workosUserId: args.workosUserId }
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
