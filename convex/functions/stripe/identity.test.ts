import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import schema from "../../schema";
import { modules } from "../../test.setup";

// Phase 2 (plan §3): the Stripe webhook handlers were PUBLIC mutations — any
// client could call handleCheckoutCompleted with their own stripeCustomerId
// and self-upgrade to pro for free, bypassing the Stripe signature check
// entirely. They are now internalMutation, reachable only from the
// signature-verified Convex httpAction (convex/http.ts → handleWebhook).

const setup = () => convexTest(schema, modules);

async function seedUser(
	t: ReturnType<typeof convexTest>,
	o: { email: string; stripeCustomerId?: string; tier?: "free" | "pro" },
) {
	return await t.run(async (ctx) =>
		ctx.db.insert("users", {
			email: o.email,
			stripeCustomerId: o.stripeCustomerId,
			tier: o.tier ?? "free",
			createdAt: Date.now(),
			lastLoginAt: Date.now(),
		}),
	);
}

describe("Stripe webhook handlers are internal-only (self-upgrade closed)", () => {
	it("handleCheckoutCompleted upgrades the matching customer to pro (internal path)", async () => {
		const t = setup();
		const userId = await seedUser(t, {
			email: "buyer@example.com",
			stripeCustomerId: "cus_123",
		});
		await t.mutation(
			internal.functions.stripe.mutations.handleCheckoutCompleted,
			{
				stripeCustomerId: "cus_123",
				stripeSubscriptionId: "sub_123",
				currentPeriodEnd: Date.now() + 30 * 24 * 3600 * 1000,
			},
		);
		const user = await t.run(async (ctx) => ctx.db.get(userId as Id<"users">));
		expect(user?.tier).toBe("pro");
		expect(user?.stripeSubscriptionId).toBe("sub_123");
	});

	it("handleSubscriptionDeleted downgrades the user to free (internal path)", async () => {
		const t = setup();
		const userId = await t.run(async (ctx) =>
			ctx.db.insert("users", {
				email: "buyer@example.com",
				tier: "pro" as const,
				stripeSubscriptionId: "sub_123",
				createdAt: Date.now(),
				lastLoginAt: Date.now(),
			}),
		);
		await t.mutation(
			internal.functions.stripe.mutations.handleSubscriptionDeleted,
			{ stripeSubscriptionId: "sub_123" },
		);
		const user = await t.run(async (ctx) => ctx.db.get(userId as Id<"users">));
		expect(user?.tier).toBe("free");
		expect(user?.stripeSubscriptionId).toBeUndefined();
	});

	it("handleSubscriptionUpdated reflects the Stripe status into the tier (internal path)", async () => {
		const t = setup();
		const userId = await t.run(async (ctx) =>
			ctx.db.insert("users", {
				email: "buyer@example.com",
				tier: "pro" as const,
				stripeSubscriptionId: "sub_123",
				createdAt: Date.now(),
				lastLoginAt: Date.now(),
			}),
		);
		await t.mutation(
			internal.functions.stripe.mutations.handleSubscriptionUpdated,
			{
				stripeSubscriptionId: "sub_123",
				currentPeriodEnd: Date.now(),
				status: "canceled",
			},
		);
		const user = await t.run(async (ctx) => ctx.db.get(userId as Id<"users">));
		expect(user?.tier).toBe("free"); // non-active status downgrades
	});
});
