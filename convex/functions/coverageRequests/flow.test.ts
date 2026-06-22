import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import schema from "../../schema";
import { modules } from "../../test.setup";

const ISSUER = "https://clerk.example.com";
const NOW = new Date("2026-06-21T12:00:00.000Z").getTime();
const setup = () => convexTest(schema, modules);
const coverageRequestsApi = api.functions.coverageRequests;
const coverageRequestsInternal = internal.functions.coverageRequests;

beforeEach(() => {
	vi.stubEnv("CLOUDFLARE_API_TOKEN", "cf_test_token");
	vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "cf_account_123");
});

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllEnvs();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe("coverage request flow", () => {
	it("captures requester identity, requested municipality details, and topic interest", async () => {
		const t = setup();
		const userId = await seedUser(t);
		const asUser = t.withIdentity({
			subject: "user_clerk",
			issuer: ISSUER,
			email: "resident@example.test",
		});

		const requestId = await asUser.mutation(
			coverageRequestsApi.mutations.create,
			{
				municipalityName: "Coventry",
				state: "Connecticut",
				websiteUrl: "https://coventry.example.test",
				meetingsPageUrl: "https://coventry.example.test/agendas",
				requesterEmail: "fallback@example.test",
				topicInterests: ["Budget & Finance", "Zoning"],
				notes: "Planning board minutes matter most.",
			},
		);

		const request = await t.run(async (ctx) =>
			ctx.db.get(requestId as Id<"coverageRequests">),
		);
		expect(request).toMatchObject({
			municipalityName: "Coventry",
			state: "Connecticut",
			websiteUrl: "https://coventry.example.test",
			meetingsPageUrl: "https://coventry.example.test/agendas",
			requesterEmail: "resident@example.test",
			requesterUserId: userId,
			topicInterests: ["Budget & Finance", "Zoning"],
			status: "requested",
			priority: "medium",
			createdAt: expect.any(Number),
			updatedAt: expect.any(Number),
		});
	}, 10_000);

	it("lets admins prioritize, seed municipality setup, and advance request status", async () => {
		const t = setup();
		await seedAdmin(t);
		const requestId = await t.mutation(coverageRequestsApi.mutations.create, {
			municipalityName: "Missing City",
			state: "Rhode Island",
			requesterEmail: "tipster@example.test",
			topicInterests: ["Housing & Development"],
			meetingsPageUrl: "https://missing.example.test/meetings",
		});
		const asAdmin = t.withIdentity({
			subject: "admin_clerk",
			issuer: ISSUER,
			email: "admin@example.test",
		});

		await expect(
			asAdmin.mutation(coverageRequestsApi.mutations.updateStatus, {
				requestId,
				status: "discovered",
				priority: "high",
				statusReason: "Legistar source found.",
			}),
		).resolves.toMatchObject({ status: "discovered" });

		const municipalityId = await asAdmin.mutation(
			coverageRequestsApi.mutations.seedMunicipality,
			{
				requestId,
				platform: "generic",
			},
		);

		const [request, municipality] = await t.run(async (ctx) =>
			Promise.all([
				ctx.db.get(requestId as Id<"coverageRequests">),
				ctx.db.get(municipalityId as Id<"municipalities">),
			]),
		);
		expect(municipality).toMatchObject({
			name: "Missing City",
			state: "Rhode Island",
			meetingsPageUrl: "https://missing.example.test/meetings",
			coverageStatus: "unpublished",
			isActive: false,
			isVerified: false,
		});
		expect(request).toMatchObject({
			status: "discovered",
			priority: "high",
			seededMunicipalityId: municipalityId,
			statusReason: "Legistar source found.",
		});

		const adminList = await asAdmin.query(
			coverageRequestsApi.queries.listForAdmin,
			{ status: "discovered" },
		);
		if (!adminList) {
			throw new Error("Expected admin coverage request list");
		}
		expect(adminList.map((row: { _id: string }) => row._id)).toEqual([
			requestId,
		]);
	});

	it("links same-municipality requests and notifies each requester when seeded coverage is published", async () => {
		vi.useFakeTimers();
		const t = setup();
		await seedAdmin(t);
		const firstRequestId = await t.mutation(
			coverageRequestsApi.mutations.create,
			{
				municipalityName: "Shared Town",
				state: "Connecticut",
				requesterEmail: "first@example.test",
				topicInterests: ["Public Safety"],
				meetingsPageUrl: "https://shared.example.test/meetings",
			},
		);
		const secondRequestId = await t.mutation(
			coverageRequestsApi.mutations.create,
			{
				municipalityName: " shared   town ",
				state: "Connecticut",
				requesterEmail: "second@example.test",
				topicInterests: ["Budget & Finance"],
			},
		);
		const asAdmin = t.withIdentity({
			subject: "admin_clerk",
			issuer: ISSUER,
			email: "admin@example.test",
		});
		const fetchMock = vi.fn(async () => okEmailResponse());
		vi.stubGlobal("fetch", fetchMock);

		const municipalityId = await asAdmin.mutation(
			coverageRequestsApi.mutations.seedMunicipality,
			{
				requestId: firstRequestId,
				platform: "generic",
			},
		);
		await asAdmin.mutation(
			api.functions.municipalities.mutations.setCoverageStatus,
			{
				id: municipalityId,
				status: "published",
				reason: "Coverage launched",
				overrideReason: "Operator verified source manually.",
			},
		);
		await t.finishAllScheduledFunctions(vi.runAllTimers);

		const [firstRequest, secondRequest] = await t.run(async (ctx) =>
			Promise.all([
				ctx.db.get(firstRequestId as Id<"coverageRequests">),
				ctx.db.get(secondRequestId as Id<"coverageRequests">),
			]),
		);
		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(
			(fetchMock.mock.calls as unknown as Array<[string, RequestInit]>).map(
				([, init]) => JSON.parse(init.body as string),
			),
		).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ to: "first@example.test" }),
				expect.objectContaining({ to: "second@example.test" }),
			]),
		);
		expect(firstRequest).toMatchObject({
			status: "active",
			seededMunicipalityId: municipalityId,
			notificationStatus: "sent",
		});
		expect(secondRequest).toMatchObject({
			status: "active",
			seededMunicipalityId: municipalityId,
			notificationStatus: "sent",
		});
	});

	it("sends a Cloudflare email notification when requested coverage becomes active", async () => {
		const t = setup();
		await seedAdmin(t);
		const requestId = await t.mutation(coverageRequestsApi.mutations.create, {
			municipalityName: "Active Town",
			state: "Connecticut",
			requesterEmail: "resident@example.test",
			topicInterests: ["Public Safety"],
		});
		const fetchMock = vi.fn(async () => okEmailResponse());
		vi.stubGlobal("fetch", fetchMock);

		await expect(
			t.action(coverageRequestsInternal.actions.notifyActive, {
				requestId,
			}),
		).resolves.toEqual({ success: true });

		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [, init] = fetchMock.mock.calls[0] as unknown as [
			string,
			RequestInit,
		];
		const body = JSON.parse(init.body as string);
		expect(body).toMatchObject({
			to: "resident@example.test",
			subject: "Coverage is now active for Active Town, Connecticut",
			headers: {
				"X-Civic-Delivery-Key": `coverage-request/${requestId}`,
			},
		});
		expect(body.html).toContain("Active Town");
		expect(body.html).toContain("/explore");

		const request = await t.run(async (ctx) =>
			ctx.db.get(requestId as Id<"coverageRequests">),
		);
		expect(request).toMatchObject({
			notificationStatus: "sent",
			notifiedAt: expect.any(Number),
		});
		expect(request?.notificationError).toBeUndefined();
	});
});

async function seedUser(t: ReturnType<typeof convexTest>) {
	return await t.run(async (ctx) =>
		ctx.db.insert("users", {
			clerkUserId: "user_clerk",
			email: "resident@example.test",
			tier: "free",
			isAdmin: false,
			createdAt: NOW,
			lastLoginAt: NOW,
		}),
	);
}

async function seedAdmin(t: ReturnType<typeof convexTest>) {
	await t.run(async (ctx) =>
		ctx.db.insert("users", {
			clerkUserId: "admin_clerk",
			email: "admin@example.test",
			tier: "free",
			isAdmin: true,
			createdAt: NOW,
			lastLoginAt: NOW,
		}),
	);
}

function okEmailResponse() {
	return new Response(
		JSON.stringify({
			success: true,
			errors: [],
			messages: [],
			result: {
				message_id: "<coverage_request@example.com>",
				delivered: [],
				queued: ["resident@example.test"],
				permanent_bounces: [],
			},
		}),
		{
			status: 200,
			headers: { "Content-Type": "application/json" },
		},
	);
}
