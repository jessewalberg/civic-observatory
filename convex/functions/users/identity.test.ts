import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../../_generated/api";
import schema from "../../schema";
import { modules } from "../../test.setup";

// Phase 2 (docs/plans/2026-06-02-civic-pulse-workos-to-clerk.md §3): the
// ctx.auth identity bridge. With a Clerk identity present, the server derives
// WHO IS CALLING from the JWT — client-supplied ids are ignored, so the
// Phase-0 impersonation hole is closed in Clerk mode. Legacy (no-identity)
// callers keep today's behavior until Phase 5 removes the fallback.

const ISSUER = "https://clerk.example.com";

function setup() {
	return convexTest(schema, modules);
}

type UserOverrides = Partial<{
	workosUserId: string;
	clerkUserId: string;
	email: string;
	tier: "free" | "pro";
	isAdmin: boolean;
}>;

async function seedUser(
	t: ReturnType<typeof convexTest>,
	overrides: UserOverrides = {},
) {
	return await t.run(async (ctx) => {
		return await ctx.db.insert("users", {
			workosUserId: "user_wos_alice",
			email: "alice@example.com",
			tier: "free" as const,
			createdAt: Date.now(),
			lastLoginAt: Date.now(),
			...overrides,
		});
	});
}

describe("ensureFromIdentity (lazy claim/create)", () => {
	it("throws without an authenticated identity", async () => {
		const t = setup();
		await expect(
			t.mutation(api.functions.users.mutations.ensureFromIdentity, {}),
		).rejects.toThrow(/Not authenticated/);
	});

	it("creates a Clerk-era user (no workosUserId) on first authenticated call", async () => {
		const t = setup();
		const asNew = t.withIdentity({
			subject: "user_clerk_new",
			issuer: ISSUER,
			email: "new@example.com",
			name: "New Person",
		});
		const id = await asNew.mutation(
			api.functions.users.mutations.ensureFromIdentity,
			{},
		);
		const user = await t.run(async (ctx) => ctx.db.get(id));
		expect(user?.clerkUserId).toBe("user_clerk_new");
		expect(user?.email).toBe("new@example.com");
		expect(user?.workosUserId).toBeUndefined();
		expect(user?.tier).toBe("free");
	});

	it("lazy-claims an existing WorkOS-era user by email", async () => {
		const t = setup();
		const existing = await seedUser(t, {
			email: "alice@example.com",
			tier: "pro",
		});
		const asAlice = t.withIdentity({
			subject: "user_clerk_alice",
			issuer: ISSUER,
			email: "alice@example.com",
		});
		const id = await asAlice.mutation(
			api.functions.users.mutations.ensureFromIdentity,
			{},
		);
		expect(id).toBe(existing);
		const user = await t.run(async (ctx) => ctx.db.get(existing));
		expect(user?.clerkUserId).toBe("user_clerk_alice");
		// Claimed, not duplicated: tier/stripe history survives the migration.
		expect(user?.tier).toBe("pro");
		expect(user?.workosUserId).toBe("user_wos_alice");
	});

	it("is idempotent: second call resolves the same row by clerk id", async () => {
		const t = setup();
		const asUser = t.withIdentity({
			subject: "user_clerk_x",
			issuer: ISSUER,
			email: "x@example.com",
		});
		const first = await asUser.mutation(
			api.functions.users.mutations.ensureFromIdentity,
			{},
		);
		const second = await asUser.mutation(
			api.functions.users.mutations.ensureFromIdentity,
			{},
		);
		expect(second).toBe(first);
		const count = await t.run(async (ctx) =>
			(await ctx.db.query("users").collect()).length,
		);
		expect(count).toBe(1);
	});

	it("never claims a row that already belongs to a different Clerk user", async () => {
		const t = setup();
		await seedUser(t, {
			email: "shared@example.com",
			clerkUserId: "user_clerk_owner",
		});
		const asIntruder = t.withIdentity({
			subject: "user_clerk_intruder",
			issuer: ISSUER,
			email: "shared@example.com",
		});
		const id = await asIntruder.mutation(
			api.functions.users.mutations.ensureFromIdentity,
			{},
		);
		const intruderRow = await t.run(async (ctx) => ctx.db.get(id));
		// A NEW row is created; the owner's row is untouched.
		expect(intruderRow?.clerkUserId).toBe("user_clerk_intruder");
		const owner = await t.run(async (ctx) =>
			ctx.db
				.query("users")
				.withIndex("by_clerk_id", (q) => q.eq("clerkUserId", "user_clerk_owner"))
				.unique(),
		);
		expect(owner?.clerkUserId).toBe("user_clerk_owner");
	});
});

describe("identity overrides client-supplied ids (the security fix)", () => {
	it("FIXED in Clerk mode: a non-admin passing an admin's id is DENIED the user list", async () => {
		const t = setup();
		await seedUser(t, {
			workosUserId: "user_wos_root",
			email: "root@example.com",
			isAdmin: true,
		});
		const asPeon = t.withIdentity({
			subject: "user_clerk_peon",
			issuer: ISSUER,
			email: "peon@example.com",
		});
		await asPeon.mutation(api.functions.users.mutations.ensureFromIdentity, {});

		// The Phase-0 impersonation move: pass the admin's id. With an identity
		// present the server ignores the argument entirely.
		const result = await asPeon.query(api.functions.users.queries.listAll, {
			requestingWorkosUserId: "user_wos_root",
		});
		expect(result).toEqual([]);
	});

	it("FIXED in Clerk mode: getAdminStats denies the same impersonation", async () => {
		const t = setup();
		await seedUser(t, {
			workosUserId: "user_wos_root",
			email: "root@example.com",
			isAdmin: true,
		});
		const asPeon = t.withIdentity({
			subject: "user_clerk_peon",
			issuer: ISSUER,
			email: "peon@example.com",
		});
		await asPeon.mutation(api.functions.users.mutations.ensureFromIdentity, {});

		const stats = await asPeon.query(api.functions.users.queries.getAdminStats, {
			requestingWorkosUserId: "user_wos_root",
		});
		expect(stats).toBeNull();
	});

	it("FIXED: upsertOnLogin is refused under a Clerk identity (no email-rewrite attack)", async () => {
		const t = setup();
		const victim = await seedUser(t, {
			workosUserId: "user_wos_victim",
			email: "victim@example.com",
			tier: "pro",
		});
		const asAttacker = t.withIdentity({
			subject: "user_clerk_attacker",
			issuer: ISSUER,
			email: "attacker@example.com",
		});
		// The exploit Codex found: rewrite the victim row's email to the
		// attacker's, then claim it. The mutation must refuse outright.
		await expect(
			asAttacker.mutation(api.functions.users.mutations.upsertOnLogin, {
				workosUserId: "user_wos_victim",
				email: "attacker@example.com",
			}),
		).rejects.toThrow(/disabled under Clerk/);
		const row = await t.run(async (ctx) => ctx.db.get(victim));
		expect(row?.email).toBe("victim@example.com"); // untouched
	});

	it("FIXED: getByWorkosUserId ignores the client id under identity (no row-read leak)", async () => {
		const t = setup();
		await seedUser(t, {
			workosUserId: "user_wos_victim",
			email: "victim@example.com",
			tier: "pro",
		});
		const asPeon = t.withIdentity({
			subject: "user_clerk_peon",
			issuer: ISSUER,
			email: "peon@example.com",
		});
		await asPeon.mutation(api.functions.users.mutations.ensureFromIdentity, {});
		// Asking for the victim's row by workos id returns the CALLER's own row.
		const got = await asPeon.query(
			api.functions.users.queries.getByWorkosUserId,
			{ workosUserId: "user_wos_victim" },
		);
		expect(got?.clerkUserId).toBe("user_clerk_peon");
		expect(got?.email).toBe("peon@example.com");
	});

	it("FIXED: isAdmin ignores a spoofed admin id under identity", async () => {
		const t = setup();
		await seedUser(t, {
			workosUserId: "user_wos_root",
			email: "root@example.com",
			isAdmin: true,
		});
		const asPeon = t.withIdentity({
			subject: "user_clerk_peon",
			issuer: ISSUER,
			email: "peon@example.com",
		});
		await asPeon.mutation(api.functions.users.mutations.ensureFromIdentity, {});
		await expect(
			asPeon.query(api.functions.users.queries.isAdmin, {
				workosUserId: "user_wos_root",
			}),
		).resolves.toBe(false);
	});

	it("FIXED: setAdminStatus denies a non-admin Clerk caller spoofing an admin id", async () => {
		const t = setup();
		const target = await seedUser(t, {
			workosUserId: "user_wos_target",
			email: "target@example.com",
		});
		await seedUser(t, {
			workosUserId: "user_wos_root",
			email: "root@example.com",
			isAdmin: true,
		});
		const asPeon = t.withIdentity({
			subject: "user_clerk_peon",
			issuer: ISSUER,
			email: "peon@example.com",
		});
		await asPeon.mutation(api.functions.users.mutations.ensureFromIdentity, {});
		await expect(
			asPeon.mutation(api.functions.users.mutations.setAdminStatus, {
				userId: target,
				isAdmin: true,
				requestingWorkosUserId: "user_wos_root",
			}),
		).rejects.toThrow(/Only admins/);
	});

	it("an identity-resolved ADMIN passes the gate without any client-supplied id", async () => {
		const t = setup();
		await seedUser(t, {
			clerkUserId: "user_clerk_root",
			email: "root@example.com",
			isAdmin: true,
		});
		const asRoot = t.withIdentity({
			subject: "user_clerk_root",
			issuer: ISSUER,
			email: "root@example.com",
		});
		const result = await asRoot.query(api.functions.users.queries.listAll, {});
		expect(result).toMatchObject({ total: 1, hasMore: false });
	});
});
