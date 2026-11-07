import { z } from "zod";
import { entityId } from "../../id";
import { privateWrite } from "../../procedure";
export const updateStripeCustomer = privateWrite({
	args: {
		userId: entityId("users"),
		stripeCustomerId: z.string(),
	},
	handler: async (ctx, args) => {
		await ctx.data.update(args.userId, {
			stripeCustomerId: args.stripeCustomerId,
			billingMode: "test",
		});
	},
});
export const handleCheckoutCompleted = privateWrite({
	args: {
		stripeCustomerId: z.string(),
		stripeSubscriptionId: z.string(),
		currentPeriodEnd: z.number(),
	},
	handler: async (ctx, args) => {
		// Find user by Stripe customer ID
		const user = await ctx.data
			.select("users")
			.orderBy(["stripeCustomerId", "_creationTime", "_id"])
			.where("stripeCustomerId", "=", args.stripeCustomerId)
			.one();
		if (!user || user.billingMode !== "test") {
			console.error(
				"User not found for Stripe customer:",
				args.stripeCustomerId,
			);
			return;
		}
		// Upgrade user to pro
		await ctx.data.update(user._id, {
			tier: "pro",
			stripeSubscriptionId: args.stripeSubscriptionId,
			stripeCurrentPeriodEnd: args.currentPeriodEnd,
		});
		console.log(`User ${user._id} upgraded to pro`);
	},
});
export const handleSubscriptionUpdated = privateWrite({
	args: {
		stripeSubscriptionId: z.string(),
		currentPeriodEnd: z.number(),
		status: z.string(),
	},
	handler: async (ctx, args) => {
		// Find user by subscription ID
		const users = await ctx.data.select("users").all();
		const user = users.find(
			(u) => u.stripeSubscriptionId === args.stripeSubscriptionId,
		);
		if (!user || user.billingMode !== "test") {
			console.error(
				"User not found for subscription:",
				args.stripeSubscriptionId,
			);
			return;
		}
		// Update subscription period
		const isActive = ["active", "trialing"].includes(args.status);
		await ctx.data.update(user._id, {
			tier: isActive ? "pro" : "free",
			stripeCurrentPeriodEnd: args.currentPeriodEnd,
		});
		console.log(
			`User ${user._id} subscription updated: status=${args.status}, tier=${isActive ? "pro" : "free"}`,
		);
	},
});
export const handleSubscriptionDeleted = privateWrite({
	args: {
		stripeSubscriptionId: z.string(),
	},
	handler: async (ctx, args) => {
		// Find user by subscription ID
		const users = await ctx.data.select("users").all();
		const user = users.find(
			(u) => u.stripeSubscriptionId === args.stripeSubscriptionId,
		);
		if (!user || user.billingMode !== "test") {
			console.error(
				"User not found for subscription:",
				args.stripeSubscriptionId,
			);
			return;
		}
		// Downgrade user to free
		await ctx.data.update(user._id, {
			tier: "free",
			stripeSubscriptionId: undefined,
			stripeCurrentPeriodEnd: undefined,
		});
		console.log(`User ${user._id} downgraded to free (subscription deleted)`);
	},
});
