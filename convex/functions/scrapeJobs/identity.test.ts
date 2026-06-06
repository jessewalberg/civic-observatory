import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import schema from "../../schema";
import { modules } from "../../test.setup";

// Phase 2 (plan §3): scrapeJobs. `cancel` was an UNAUTHENTICATED public
// mutation (despite "cancelled by admin"); `retry` (an action) checked admin
// via a spoofable client workosUserId. Route both through identity.

const ISSUER = "https://clerk.example.com";
const setup = () => convexTest(schema, modules);

async function seedUser(
	t: ReturnType<typeof convexTest>,
	o: { workosUserId?: string; clerkUserId?: string; email: string; isAdmin?: boolean },
) {
	return await t.run(async (ctx) =>
		ctx.db.insert("users", {
			email: o.email,
			workosUserId: o.workosUserId,
			clerkUserId: o.clerkUserId,
			isAdmin: o.isAdmin,
			tier: "free" as const,
			createdAt: Date.now(),
			lastLoginAt: Date.now(),
		}),
	);
}

async function seedJob(t: ReturnType<typeof convexTest>) {
	return await t.run(async (ctx) => {
		const muni = await ctx.db.insert("municipalities", {
			name: "Testville",
			state: "CT",
			platform: "manual" as const,
			isActive: true,
			isVerified: true,
			createdAt: Date.now(),
			updatedAt: Date.now(),
		});
		return await ctx.db.insert("scrapeJobs", {
			municipalityId: muni,
			status: "running" as const,
			triggeredBy: "manual" as const,
			startedAt: Date.now(),
			createdAt: Date.now(),
		});
	});
}

describe("scrapeJobs cancel under the identity bridge", () => {
	it("FIXED: a non-admin Clerk caller cannot cancel a job (was unauthenticated)", async () => {
		const t = setup();
		await seedUser(t, { clerkUserId: "user_clerk_peon", email: "peon@example.com" });
		const jobId = await seedJob(t);
		const asPeon = t.withIdentity({ subject: "user_clerk_peon", issuer: ISSUER, email: "peon@example.com" });
		await expect(
			asPeon.mutation(api.functions.scrapeJobs.mutations.cancel, {
				jobId: jobId as Id<"scrapeJobs">,
			}),
		).rejects.toThrow(/Admin access required/);
		const job = await t.run(async (ctx) => ctx.db.get(jobId as Id<"scrapeJobs">));
		expect(job?.status).toBe("running"); // untouched
	});

	it("an identity-resolved admin can cancel", async () => {
		const t = setup();
		await seedUser(t, { clerkUserId: "user_clerk_root", email: "root@example.com", isAdmin: true });
		const jobId = await seedJob(t);
		const asRoot = t.withIdentity({ subject: "user_clerk_root", issuer: ISSUER, email: "root@example.com" });
		await asRoot.mutation(api.functions.scrapeJobs.mutations.cancel, {
			jobId: jobId as Id<"scrapeJobs">,
		});
		const job = await t.run(async (ctx) => ctx.db.get(jobId as Id<"scrapeJobs">));
		expect(job?.status).toBe("failed");
	});

	it("legacy (no identity) cancel still honors a supplied admin id", async () => {
		const t = setup();
		await seedUser(t, { workosUserId: "user_wos_root", email: "root@example.com", isAdmin: true });
		const jobId = await seedJob(t);
		await t.mutation(api.functions.scrapeJobs.mutations.cancel, {
			jobId: jobId as Id<"scrapeJobs">,
			requestingWorkosUserId: "user_wos_root",
		});
		const job = await t.run(async (ctx) => ctx.db.get(jobId as Id<"scrapeJobs">));
		expect(job?.status).toBe("failed");
	});
});
