import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import schema from "../../schema";
import { modules } from "../../test.setup";

// Phase 2 (plan §3): the meetings domain admin mutations were the most severe
// part of the original impersonation report — they trusted a client-supplied
// requestingWorkosUserId. Under a Clerk identity, the bridge resolves the
// caller from the JWT; a spoofed admin id is ignored.

const ISSUER = "https://clerk.example.com";

function setup() {
	return convexTest(schema, modules);
}

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

async function seedMunicipality(t: ReturnType<typeof convexTest>) {
	return await t.run(async (ctx) =>
		ctx.db.insert("municipalities", {
			name: "Testville",
			state: "CT",
			platform: "manual" as const,
			isActive: true,
			isVerified: true,
			createdAt: Date.now(),
			updatedAt: Date.now(),
		}),
	);
}

async function seedMeeting(
	t: ReturnType<typeof convexTest>,
	municipalityId: Id<"municipalities">,
) {
	return await t.run(async (ctx) =>
		ctx.db.insert("meetings", {
			municipalityId,
			title: "Council",
			meetingType: "city_council" as const,
			meetingDate: Date.now(),
			sourceType: "manual_entry" as const,
			sourceUrl: "https://example.com/agenda.pdf",
			status: "failed" as const,
			createdAt: Date.now(),
			updatedAt: Date.now(),
		}),
	);
}

describe("meetings admin mutations under the identity bridge", () => {
	it("FIXED: a non-admin Clerk caller spoofing an admin id is denied adminRequeueMeeting", async () => {
		const t = setup();
		await seedUser(t, {
			workosUserId: "user_wos_root",
			email: "root@example.com",
			isAdmin: true,
		});
		await seedUser(t, {
			clerkUserId: "user_clerk_peon",
			email: "peon@example.com",
		});
		const muni = await seedMunicipality(t);
		const meetingId = await seedMeeting(t, muni);
		const asPeon = t.withIdentity({
			subject: "user_clerk_peon",
			issuer: ISSUER,
			email: "peon@example.com",
		});
		await expect(
			asPeon.mutation(api.functions.meetings.mutations.adminRequeueMeeting, {
				meetingId: meetingId as Id<"meetings">,
				requestingWorkosUserId: "user_wos_root", // spoof
			}),
		).rejects.toThrow(/Admin access required/);
	});

	it("an identity-resolved admin passes adminRequeueMeeting without a client id", async () => {
		const t = setup();
		await seedUser(t, {
			clerkUserId: "user_clerk_root",
			email: "root@example.com",
			isAdmin: true,
		});
		const muni = await seedMunicipality(t);
		const meetingId = await seedMeeting(t, muni);
		const asRoot = t.withIdentity({
			subject: "user_clerk_root",
			issuer: ISSUER,
			email: "root@example.com",
		});
		// Should not throw on the auth gate (may no-op on requeue internals).
		await asRoot.mutation(api.functions.meetings.mutations.adminRequeueMeeting, {
			meetingId: meetingId as Id<"meetings">,
		});
	});

	it("legacy (no identity) admin mutation still honors the supplied admin id", async () => {
		const t = setup();
		await seedUser(t, {
			workosUserId: "user_wos_root",
			email: "root@example.com",
			isAdmin: true,
		});
		const muni = await seedMunicipality(t);
		const meetingId = await seedMeeting(t, muni);
		await t.mutation(api.functions.meetings.mutations.adminRequeueMeeting, {
			meetingId: meetingId as Id<"meetings">,
			requestingWorkosUserId: "user_wos_root",
		});
	});
});
