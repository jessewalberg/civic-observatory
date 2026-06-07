import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import schema from "../../schema";
import { modules } from "../../test.setup";

// Phase 2 (plan §3): municipalities admin mutations trusted a client-supplied
// requestingWorkosUserId, and several mutations were unauthenticated public
// backdoors. Route through the ctx.auth bridge + close the backdoors.

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

async function seedMunicipality(t: ReturnType<typeof convexTest>, state = "CT") {
	return await t.run(async (ctx) =>
		ctx.db.insert("municipalities", {
			name: "Testville",
			state,
			platform: "manual" as const,
			isActive: true,
			isVerified: true,
			createdAt: Date.now(),
			updatedAt: Date.now(),
		}),
	);
}

describe("municipalities admin mutations under the identity bridge", () => {
	it("FIXED: a non-admin Clerk caller spoofing an admin id is denied update", async () => {
		const t = setup();
		await seedUser(t, { workosUserId: "user_wos_root", email: "root@example.com", isAdmin: true });
		await seedUser(t, { clerkUserId: "user_clerk_peon", email: "peon@example.com" });
		const muni = await seedMunicipality(t);
		const asPeon = t.withIdentity({ subject: "user_clerk_peon", issuer: ISSUER, email: "peon@example.com" });
		await expect(
			asPeon.mutation(api.functions.municipalities.mutations.update, {
				id: muni as Id<"municipalities">,
				name: "Hacked",
			}),
		).rejects.toThrow(/Admin access required|admin/i);
	});

	it("an identity-resolved admin passes update with no client id", async () => {
		const t = setup();
		await seedUser(t, { clerkUserId: "user_clerk_root", email: "root@example.com", isAdmin: true });
		const muni = await seedMunicipality(t);
		const asRoot = t.withIdentity({ subject: "user_clerk_root", issuer: ISSUER, email: "root@example.com" });
		await asRoot.mutation(api.functions.municipalities.mutations.update, {
			id: muni as Id<"municipalities">,
			name: "Renamed",
		});
		const row = await t.run(async (ctx) => ctx.db.get(muni as Id<"municipalities">));
		expect(row?.name).toBe("Renamed");
	});

	it("FIXED: fixState now requires admin (was an unauthenticated backdoor)", async () => {
		const t = setup();
		await seedUser(t, { clerkUserId: "user_clerk_peon", email: "peon@example.com" });
		const muni = await seedMunicipality(t, "CT");
		const asPeon = t.withIdentity({ subject: "user_clerk_peon", issuer: ISSUER, email: "peon@example.com" });
		await expect(
			asPeon.mutation(api.functions.municipalities.mutations.fixState, {
				id: muni as Id<"municipalities">,
				state: "NY",
			}),
		).rejects.toThrow(/Admin access required|admin/i);
		const row = await t.run(async (ctx) => ctx.db.get(muni as Id<"municipalities">));
		expect(row?.state).toBe("CT"); // untouched
	});

	it("FIXED: updateScrapeStatus is backend-only (internalMutation)", async () => {
		const t = setup();
		const muni = await seedMunicipality(t);
		// Internal path works (the scrape pipeline).
		await t.mutation(internal.functions.municipalities.mutations.updateScrapeStatus, {
			id: muni as Id<"municipalities">,
			status: "success",
		});
		const row = await t.run(async (ctx) => ctx.db.get(muni as Id<"municipalities">));
		expect(row?.lastScrapeStatus).toBe("success");
	});

});
