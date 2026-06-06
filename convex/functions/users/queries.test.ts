import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../../_generated/api";
import schema from "../../schema";
import { modules } from "../../test.setup";

// Phase 0 baseline (docs/plans/2026-06-02-civic-pulse-workos-to-clerk.md):
// capture CURRENT behavior of the users queries before the Clerk/ctx.auth
// migration. Several of these tests intentionally document the existing
// client-supplied-identity vulnerability — Phase 2 replaces the workosUserId
// args with ctx.auth and must flip those expectations.

function setup() {
	return convexTest(schema, modules);
}

type UserOverrides = Partial<{
	workosUserId: string;
	email: string;
	tier: "free" | "pro";
	isAdmin: boolean;
	createdAt: number;
	lastLoginAt: number;
}>;

async function seedUser(
	t: ReturnType<typeof convexTest>,
	overrides: UserOverrides = {},
) {
	return await t.run(async (ctx) => {
		return await ctx.db.insert("users", {
			workosUserId: "user_alice",
			email: "alice@example.com",
			tier: "free" as const,
			createdAt: Date.now(),
			lastLoginAt: Date.now(),
			...overrides,
		});
	});
}

describe("users queries (pre-Clerk baseline)", () => {
	it("getByWorkosUserId returns the matching user", async () => {
		const t = setup();
		await seedUser(t);
		const user = await t.query(api.functions.users.queries.getByWorkosUserId, {
			workosUserId: "user_alice",
		});
		expect(user?.email).toBe("alice@example.com");
	});

	it("getByWorkosUserId returns null for an unknown id", async () => {
		const t = setup();
		const user = await t.query(api.functions.users.queries.getByWorkosUserId, {
			workosUserId: "user_nobody",
		});
		expect(user).toBeNull();
	});

	it("isAdmin is false for a non-admin and true for an admin", async () => {
		const t = setup();
		await seedUser(t);
		await seedUser(t, {
			workosUserId: "user_root",
			email: "root@example.com",
			isAdmin: true,
		});
		await expect(
			t.query(api.functions.users.queries.isAdmin, {
				workosUserId: "user_alice",
			}),
		).resolves.toBe(false);
		await expect(
			t.query(api.functions.users.queries.isAdmin, {
				workosUserId: "user_root",
			}),
		).resolves.toBe(true);
	});

	it("getAdminBootstrapStatus lets an existing user claim initial admin only when no admin exists", async () => {
		const t = setup();
		await seedUser(t);
		const before = await t.query(
			api.functions.users.queries.getAdminBootstrapStatus,
			{ workosUserId: "user_alice" },
		);
		expect(before.canClaimInitialAdmin).toBe(true);

		await seedUser(t, {
			workosUserId: "user_root",
			email: "root@example.com",
			isAdmin: true,
		});
		const after = await t.query(
			api.functions.users.queries.getAdminBootstrapStatus,
			{ workosUserId: "user_alice" },
		);
		expect(after.hasAnyAdmin).toBe(true);
		expect(after.canClaimInitialAdmin).toBe(false);
	});

	it("listAll returns an empty array (not the paginated shape) when the requester is not an admin", async () => {
		const t = setup();
		await seedUser(t);
		const result = await t.query(api.functions.users.queries.listAll, {
			requestingWorkosUserId: "user_alice",
		});
		// Baseline quirk: non-admin gets [], admin gets {users, total, hasMore}.
		expect(result).toEqual([]);
	});

	// ── SECURITY BASELINE (the bug this migration exists to fix) ──────────────
	// Identity is a client-supplied string: ANY caller that passes an admin's
	// workosUserId is treated as that admin. There is no ctx.auth check anywhere.
	// Phase 2 must make these calls derive identity from ctx.auth, at which point
	// this test MUST be rewritten to expect denial for an unauthenticated caller.
	it("VULNERABILITY: an unauthenticated caller passing an admin's id receives the full user list", async () => {
		const t = setup();
		await seedUser(t);
		await seedUser(t, {
			workosUserId: "user_root",
			email: "root@example.com",
			isAdmin: true,
		});
		const result = await t.query(api.functions.users.queries.listAll, {
			requestingWorkosUserId: "user_root", // impersonation: no session needed
		});
		expect(result).toMatchObject({ total: 2, hasMore: false });
	});

	it("LEGACY MODE (until Phase 5): a no-identity caller passing an admin's id receives admin stats", async () => {
		const t = setup();
		await seedUser(t);
		await seedUser(t, {
			workosUserId: "user_root",
			email: "root@example.com",
			isAdmin: true,
		});
		// Same client-supplied identity gate as listAll: getAdminStats trusts
		// requestingWorkosUserId. Non-admin id → null, admin id → full stats,
		// no session required for either.
		await expect(
			t.query(api.functions.users.queries.getAdminStats, {
				requestingWorkosUserId: "user_alice",
			}),
		).resolves.toBeNull();
		const stats = await t.query(api.functions.users.queries.getAdminStats, {
			requestingWorkosUserId: "user_root", // impersonation: no session needed
		});
		expect(stats).toMatchObject({ totalUsers: 2, adminUsers: 1 });
	});
});
