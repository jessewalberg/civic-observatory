import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";
import { modules } from "../test.setup";
import {
	ensureCurrentUserFromIdentity,
	getCurrentUser,
	getIdentityOrThrow,
	requireAdmin,
} from "./auth";

const ISSUER = "https://clerk.example.com";
const setup = () => convexTest(schema, modules);

describe("Convex auth helpers", () => {
	it("throws an explicit authorization error without an identity", async () => {
		const t = setup();

		await expect(
			t.run(async (ctx) => await getIdentityOrThrow(ctx)),
		).rejects.toThrow(/Not authenticated/);
	});

	it("looks up, creates, and reuses the current Clerk user", async () => {
		const t = setup();
		const asUser = t.withIdentity({
			subject: "user_clerk_helper",
			issuer: ISSUER,
			email: "helper@example.com",
			name: "Helper User",
		});

		await expect(
			asUser.run(async (ctx) => await getCurrentUser(ctx)),
		).resolves.toBeNull();

		const created = await asUser.run(
			async (ctx) => await ensureCurrentUserFromIdentity(ctx),
		);
		expect(created).toMatchObject({
			clerkUserId: "user_clerk_helper",
			email: "helper@example.com",
			name: "Helper User",
			tier: "free",
		});

		const reused = await asUser.run(
			async (ctx) => await ensureCurrentUserFromIdentity(ctx),
		);
		expect(reused._id).toBe(created._id);

		const rows = await t.run(
			async (ctx) => await ctx.db.query("users").collect(),
		);
		expect(rows).toHaveLength(1);
	});

	it("requires the current identity to resolve to an admin user", async () => {
		const t = setup();
		await t.run(async (ctx) => {
			await ctx.db.insert("users", {
				clerkUserId: "user_clerk_member",
				email: "member@example.com",
				tier: "free",
				createdAt: Date.now(),
				lastLoginAt: Date.now(),
			});
			await ctx.db.insert("users", {
				clerkUserId: "user_clerk_admin",
				email: "admin@example.com",
				tier: "free",
				isAdmin: true,
				createdAt: Date.now(),
				lastLoginAt: Date.now(),
			});
		});

		const asMember = t.withIdentity({
			subject: "user_clerk_member",
			issuer: ISSUER,
			email: "member@example.com",
		});
		await expect(
			asMember.run(async (ctx) => await requireAdmin(ctx, "Admin required")),
		).rejects.toThrow(/Admin required/);

		const asAdmin = t.withIdentity({
			subject: "user_clerk_admin",
			issuer: ISSUER,
			email: "admin@example.com",
		});
		const admin = await asAdmin.run(
			async (ctx) => await requireAdmin(ctx, "Admin required"),
		);
		expect(admin._id).toMatch(/users$/);
		expect(admin._id as Id<"users">).toBe(admin._id);
	});
});
