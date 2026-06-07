import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../../_generated/api";
import schema from "../../schema";
import { modules } from "../../test.setup";

// Phase 2 (plan §3): route the usage domain through the ctx.auth identity
// bridge. Under a Clerk identity, usage is read/written for the CALLER — the
// client-supplied workosUserId is ignored, so a caller can neither inflate
// another user's usage nor read it.

const ISSUER = "https://clerk.example.com";

function setup() {
	return convexTest(schema, modules);
}

async function seedUser(
	t: ReturnType<typeof convexTest>,
	o: { workosUserId?: string; clerkUserId?: string; email: string },
) {
	return await t.run(async (ctx) =>
		ctx.db.insert("users", {
			email: o.email,
			workosUserId: o.workosUserId,
			clerkUserId: o.clerkUserId,
			tier: "free" as const,
			createdAt: Date.now(),
			lastLoginAt: Date.now(),
		}),
	);
}

describe("usage domain under the identity bridge", () => {
	it("recordUsage logs against the CALLER, ignoring a spoofed workosUserId", async () => {
		const t = setup();
		const victim = await seedUser(t, {
			workosUserId: "user_wos_victim",
			email: "victim@example.com",
		});
		const callerId = await seedUser(t, {
			clerkUserId: "user_clerk_caller",
			email: "caller@example.com",
		});
		const asCaller = t.withIdentity({
			subject: "user_clerk_caller",
			issuer: ISSUER,
			email: "caller@example.com",
		});

		await asCaller.mutation(api.functions.usage.mutations.recordUsage, {
			action: "summary_view",
			windowType: "day",
		});

		// The victim accrued nothing; the caller's own record incremented.
		const victimRecords = await t.run(async (ctx) =>
			ctx.db
				.query("usageRecords")
				.filter((q) => q.eq(q.field("userId"), victim))
				.collect(),
		);
		expect(victimRecords).toHaveLength(0);
		const callerRecords = await t.run(async (ctx) =>
			ctx.db
				.query("usageRecords")
				.filter((q) => q.eq(q.field("userId"), callerId))
				.collect(),
		);
		expect(callerRecords.length).toBeGreaterThan(0);
	});

	it("getUsageStats returns the CALLER's tier/usage, ignoring a spoofed id", async () => {
		const t = setup();
		await seedUser(t, { workosUserId: "user_wos_other", email: "other@example.com" });
		await seedUser(t, {
			clerkUserId: "user_clerk_caller",
			email: "caller@example.com",
		});
		const asCaller = t.withIdentity({
			subject: "user_clerk_caller",
			issuer: ISSUER,
			email: "caller@example.com",
		});
		const stats = await asCaller.query(
			api.functions.usage.queries.getUsageStats,
			{},
		);
		// Resolves the caller (a real free-tier user), not the spoofed target.
		expect(stats).not.toBeNull();
		expect(stats?.tier).toBe("free");
	});

});
