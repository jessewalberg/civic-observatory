import { z } from "zod";
import { entityId } from "../../id";
import { privateWrite } from "../../procedure";
export const updateStripeCustomer = privateWrite({
	args: { userId: entityId("users"), stripeCustomerId: z.string() },
	handler: async (ctx, args) => {
		await ctx.data.update(args.userId, {
			stripeCustomerId: args.stripeCustomerId,
			billingMode: "test",
		});
	},
});
export const applyEvent = privateWrite({
	args: {
		eventId: z.string().min(1),
		eventType: z.string(),
		change: z.discriminatedUnion("kind", [
			z.object({
				kind: z.literal("checkout"),
				customerId: z.string(),
				subscriptionId: z.string(),
				periodEnd: z.number().positive(),
			}),
			z.object({
				kind: z.literal("updated"),
				subscriptionId: z.string(),
				periodEnd: z.number().positive(),
				status: z.string(),
			}),
			z.object({ kind: z.literal("deleted"), subscriptionId: z.string() }),
			z.object({ kind: z.literal("ignored") }),
		]),
	},
	handler: async (ctx, args): Promise<{ duplicate: boolean }> => {
		if (!(await ctx.data.claimStripeEvent(args.eventId, args.eventType)))
			return { duplicate: true };
		const change = args.change;
		if (change.kind === "ignored") return { duplicate: false };
		const user = await ctx.data
			.select("users")
			.where(
				change.kind === "checkout"
					? "stripeCustomerId"
					: "stripeSubscriptionId",
				"=",
				change.kind === "checkout" ? change.customerId : change.subscriptionId,
			)
			.only();
		if (!user || user.billingMode !== "test")
			throw new Error(
				"Test billing account mapping is unavailable; event was not acknowledged",
			);
		if (change.kind === "checkout")
			await ctx.data.update(user._id, {
				tier: "pro",
				stripeSubscriptionId: change.subscriptionId,
				stripeCurrentPeriodEnd: change.periodEnd,
			});
		else if (change.kind === "updated")
			await ctx.data.update(user._id, {
				tier: ["active", "trialing"].includes(change.status) ? "pro" : "free",
				stripeCurrentPeriodEnd: change.periodEnd,
			});
		else
			await ctx.data.update(user._id, {
				tier: "free",
				stripeSubscriptionId: undefined,
				stripeCurrentPeriodEnd: undefined,
			});
		return { duplicate: false };
	},
});
