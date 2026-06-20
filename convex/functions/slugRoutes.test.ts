import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";
import { modules } from "../test.setup";

const ISSUER = "https://clerk.example.com";
const setup = () => convexTest(schema, modules);

async function seedUser(
	t: ReturnType<typeof convexTest>,
	o: {
		clerkUserId: string;
		email: string;
		isAdmin?: boolean;
	},
) {
	return await t.run(async (ctx) =>
		ctx.db.insert("users", {
			email: o.email,
			clerkUserId: o.clerkUserId,
			isAdmin: o.isAdmin,
			tier: "free" as const,
			createdAt: Date.now(),
			lastLoginAt: Date.now(),
		}),
	);
}

describe("public SEO slug persistence", () => {
	it("persists unique municipality slugs on admin create", async () => {
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

		const firstId = await asRoot.mutation(
			api.functions.municipalities.mutations.create,
			{
				name: "Austin",
				state: "Texas",
				platform: "manual",
			},
		);
		const secondId = await asRoot.mutation(
			api.functions.municipalities.mutations.create,
			{
				name: "Austin",
				state: "Texas",
				platform: "manual",
			},
		);

		const [first, second] = await t.run(async (ctx) =>
			Promise.all([
				ctx.db.get(firstId as Id<"municipalities">),
				ctx.db.get(secondId as Id<"municipalities">),
			]),
		);
		expect(first?.slug).toBe("austin-tx");
		expect(second?.slug).toBe("austin-tx-2");
	});

	it("resolves municipality records by slug or legacy ID", async () => {
		const t = setup();
		const municipalityId = await t.run(async (ctx) =>
			ctx.db.insert("municipalities", {
				name: "Austin",
				state: "Texas",
				slug: "austin-tx",
				platform: "manual" as const,
				isActive: true,
				isVerified: true,
				createdAt: Date.now(),
				updatedAt: Date.now(),
			}),
		);

		const bySlug = await t.query(
			api.functions.municipalities.queries.getBySlug,
			{
				slug: "austin-tx",
			},
		);
		const byId = await t.query(
			api.functions.municipalities.queries.getByIdentifier,
			{ identifier: municipalityId },
		);

		expect(bySlug?._id).toBe(municipalityId);
		expect(byId?._id).toBe(municipalityId);
	});

	it("persists meeting slugs on user upload create", async () => {
		const t = setup();
		await seedUser(t, {
			clerkUserId: "user_clerk_uploader",
			email: "uploader@example.com",
		});
		const municipalityId = await t.run(async (ctx) =>
			ctx.db.insert("municipalities", {
				name: "Austin",
				state: "Texas",
				slug: "austin-tx",
				platform: "manual" as const,
				isActive: true,
				isVerified: true,
				createdAt: Date.now(),
				updatedAt: Date.now(),
			}),
		);
		const asUploader = t.withIdentity({
			subject: "user_clerk_uploader",
			issuer: ISSUER,
			email: "uploader@example.com",
		});

		const meetingId = await asUploader.mutation(
			api.functions.meetings.mutations.create,
			{
				municipalityId: municipalityId as Id<"municipalities">,
				title: "City Council Regular Meeting",
				meetingType: "city_council",
				meetingDate: Date.UTC(2030, 0, 15),
			},
		);

		const meeting = await t.run(async (ctx) =>
			ctx.db.get(meetingId as Id<"meetings">),
		);
		expect(meeting?.slug).toBe(
			"austin-tx-2030-01-15-city-council-regular-meeting",
		);
	});
});
