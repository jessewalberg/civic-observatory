import { convexTest } from "convex-test";
import type { Doc, Id } from "../../_generated/dataModel";
import { describe, expect, it } from "vitest";
import { api } from "../../_generated/api";
import schema from "../../schema";
import { modules } from "../../test.setup";

// Phase-2 LEGACY-MODE behavior (no Clerk identity): the dual-mode refactor must
// preserve the pre-migration error contract for current WorkOS clients.

function setup() {
	return convexTest(schema, modules);
}

async function seedAdmin(t: ReturnType<typeof convexTest>, workosUserId: string) {
	return await t.run(async (ctx) =>
		ctx.db.insert("users", {
			workosUserId,
			email: `${workosUserId}@example.com`,
			tier: "free" as const,
			isAdmin: true,
			createdAt: Date.now(),
			lastLoginAt: Date.now(),
		}),
	);
}

describe("admin mutations — legacy error contract (no identity)", () => {
	it("setAdminStatus throws the original message for a non-admin requester", async () => {
		const t = setup();
		const target = await t.run(async (ctx) =>
			ctx.db.insert("users", {
				workosUserId: "user_wos_target",
				email: "t@example.com",
				tier: "free" as const,
				createdAt: Date.now(),
				lastLoginAt: Date.now(),
			}),
		);
		await expect(
			t.mutation(api.functions.users.mutations.setAdminStatus, {
				userId: target,
				isAdmin: true,
				requestingWorkosUserId: "user_wos_nobody",
			}),
		).rejects.toThrow("Only admins can modify admin status");
	});

	it("adminUpdateUser throws the original message for a non-admin requester", async () => {
		const t = setup();
		const target = await t.run(async (ctx) =>
			ctx.db.insert("users", {
				workosUserId: "user_wos_target",
				email: "t@example.com",
				tier: "free" as const,
				createdAt: Date.now(),
				lastLoginAt: Date.now(),
			}),
		);
		await expect(
			t.mutation(api.functions.users.mutations.adminUpdateUser, {
				userId: target,
				tier: "pro",
				requestingWorkosUserId: "user_wos_nobody",
			}),
		).rejects.toThrow("Admin access required");
	});

	it("setAdminStatus still works for a legacy admin requester", async () => {
		const t = setup();
		await seedAdmin(t, "user_wos_root");
		const target = await t.run(async (ctx) =>
			ctx.db.insert("users", {
				workosUserId: "user_wos_target",
				email: "t@example.com",
				tier: "free" as const,
				createdAt: Date.now(),
				lastLoginAt: Date.now(),
			}),
		);
		await t.mutation(api.functions.users.mutations.setAdminStatus, {
			userId: target,
			isAdmin: true,
			requestingWorkosUserId: "user_wos_root",
		});
		const row = await t.run(async (ctx) => ctx.db.get(target as Id<"users">));
		expect(row?.isAdmin).toBe(true);
	});

	it("upsertOnLogin still creates/updates on the legacy (no-identity) path", async () => {
		const t = setup();
		const id = await t.mutation(api.functions.users.mutations.upsertOnLogin, {
			workosUserId: "user_wos_new",
			email: "new@example.com",
		});
		const row = await t.run(async (ctx) => ctx.db.get(id as Id<"users">));
		expect(row?.workosUserId).toBe("user_wos_new");
		expect(row?.email).toBe("new@example.com");
	});
});
