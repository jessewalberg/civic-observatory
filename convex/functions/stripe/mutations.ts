import { v } from "convex/values";
import { internalMutation } from "../../_generated/server";

export const updateStripeCustomer = internalMutation({
	args: {
		userId: v.id("users"),
		stripeCustomerId: v.string(),
	},
	handler: async (ctx, args) => {
		await ctx.db.patch(args.userId, {
			stripeCustomerId: args.stripeCustomerId,
		});
	},
});

// Public mutations for webhook handlers (signature verified on the API route)
export const handleCheckoutCompleted = internalMutation({
	args: {
		stripeCustomerId: v.string(),
		stripeSubscriptionId: v.string(),
		currentPeriodEnd: v.number(),
	},
	handler: async (ctx, args) => {
		// Find user by Stripe customer ID
		const user = await ctx.db
			.query("users")
			.withIndex("by_stripe_customer", (q) =>
				q.eq("stripeCustomerId", args.stripeCustomerId),
			)
			.first();

		if (!user) {
			console.error(
				"User not found for Stripe customer:",
				args.stripeCustomerId,
			);
			return;
		}

		// Upgrade user to pro
		await ctx.db.patch(user._id, {
			tier: "pro",
			stripeSubscriptionId: args.stripeSubscriptionId,
			stripeCurrentPeriodEnd: args.currentPeriodEnd,
		});

		console.log(`User ${user._id} upgraded to pro`);
	},
});

export const handleSubscriptionUpdated = internalMutation({
	args: {
		stripeSubscriptionId: v.string(),
		currentPeriodEnd: v.number(),
		status: v.string(),
	},
	handler: async (ctx, args) => {
		// Find user by subscription ID
		const users = await ctx.db.query("users").collect();
		const user = users.find(
			(u) => u.stripeSubscriptionId === args.stripeSubscriptionId,
		);

		if (!user) {
			console.error(
				"User not found for subscription:",
				args.stripeSubscriptionId,
			);
			return;
		}

		// Update subscription period
		const isActive = ["active", "trialing"].includes(args.status);

		await ctx.db.patch(user._id, {
			tier: isActive ? "pro" : "free",
			stripeCurrentPeriodEnd: args.currentPeriodEnd,
		});

		console.log(
			`User ${user._id} subscription updated: status=${args.status}, tier=${isActive ? "pro" : "free"}`,
		);
	},
});

export const handleSubscriptionDeleted = internalMutation({
	args: {
		stripeSubscriptionId: v.string(),
	},
	handler: async (ctx, args) => {
		// Find user by subscription ID
		const users = await ctx.db.query("users").collect();
		const user = users.find(
			(u) => u.stripeSubscriptionId === args.stripeSubscriptionId,
		);

		if (!user) {
			console.error(
				"User not found for subscription:",
				args.stripeSubscriptionId,
			);
			return;
		}

		// Downgrade user to free
		await ctx.db.patch(user._id, {
			tier: "free",
			stripeSubscriptionId: undefined,
			stripeCurrentPeriodEnd: undefined,
		});

		console.log(`User ${user._id} downgraded to free (subscription deleted)`);
	},
});
