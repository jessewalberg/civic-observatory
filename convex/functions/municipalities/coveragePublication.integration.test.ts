import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import schema from "../../schema";
import { modules } from "../../test.setup";

const ISSUER = "https://clerk.example.com";
const NOW = new Date("2026-06-21T12:00:00.000Z").getTime();
const setup = () => convexTest(schema, modules);

describe("coverage publication integration", () => {
	it("filters public municipality surfaces to published coverage while admins can inspect all rows", async () => {
		const t = setup();
		await seedAdmin(t);
		const publishedId = await seedMunicipality(t, {
			name: "Published Falls",
			slug: "published-falls-connecticut",
			coverageStatus: "published",
			isActive: false,
			isVerified: false,
		});
		const unpublishedId = await seedMunicipality(t, {
			name: "Unpublished Falls",
			slug: "unpublished-falls-connecticut",
			coverageStatus: "unpublished",
			isActive: true,
			isVerified: true,
		});
		const pausedId = await seedMunicipality(t, {
			name: "Paused Falls",
			slug: "paused-falls-connecticut",
			coverageStatus: "paused",
			isActive: true,
			isVerified: true,
		});

		const publicList = await t.query(
			api.functions.municipalities.queries.list,
			{
				state: "Connecticut",
			},
		);
		expect(publicList.map((municipality) => municipality._id)).toEqual([
			publishedId,
		]);

		const stateGroups = await t.query(
			api.functions.municipalities.queries.listByState,
			{ activeOnly: true },
		);
		expect(stateGroups).toEqual([
			{
				state: "Connecticut",
				count: 1,
				municipalities: [
					expect.objectContaining({
						_id: publishedId,
						name: "Published Falls",
					}),
				],
			},
		]);

		const searchResults = await t.query(
			api.functions.municipalities.queries.search,
			{ query: "Falls", limit: 10 },
		);
		expect(searchResults.map((municipality) => municipality._id)).toEqual([
			publishedId,
		]);

		await expect(
			t.query(api.functions.municipalities.queries.getByIdentifier, {
				identifier: "unpublished-falls-connecticut",
			}),
		).resolves.toBeNull();
		await expect(
			t.query(api.functions.municipalities.queries.getByIdentifier, {
				identifier: pausedId,
			}),
		).resolves.toBeNull();

		const asAdmin = t.withIdentity({
			subject: "admin_clerk",
			issuer: ISSUER,
			email: "admin@example.com",
		});
		const adminList = await asAdmin.query(
			api.functions.municipalities.queries.list,
			{ state: "Connecticut" },
		);
		expect(adminList.map((municipality) => municipality._id).sort()).toEqual(
			[publishedId, unpublishedId, pausedId].sort(),
		);
	});

	it("sets coverage status with validation or override and records audit events", async () => {
		const t = setup();
		await seedAdmin(t);
		const municipalityId = await seedMunicipality(t, {
			name: "Audit Falls",
			coverageStatus: "unpublished",
			isActive: true,
			isVerified: true,
		});
		const asAdmin = t.withIdentity({
			subject: "admin_clerk",
			issuer: ISSUER,
			email: "admin@example.com",
		});

		await expect(
			asAdmin.mutation(
				api.functions.municipalities.mutations.setCoverageStatus,
				{
					id: municipalityId,
					status: "published",
					reason: "Ready for launch",
				},
			),
		).rejects.toThrow(/validation.*override/i);

		const validationRunId = await seedValidationRun(t, municipalityId, {
			status: "passed",
			meetingsFound: 2,
		});

		await expect(
			asAdmin.mutation(
				api.functions.municipalities.mutations.setCoverageStatus,
				{
					id: municipalityId,
					status: "published",
					reason: "Validated scraper output",
				},
			),
		).resolves.toMatchObject({ coverageStatus: "published" });

		await expect(
			asAdmin.mutation(
				api.functions.municipalities.mutations.setCoverageStatus,
				{
					id: municipalityId,
					status: "paused",
					reason: "Temporarily hiding outdated agenda links",
				},
			),
		).resolves.toMatchObject({ coverageStatus: "paused" });

		await expect(
			asAdmin.mutation(
				api.functions.municipalities.mutations.setCoverageStatus,
				{
					id: municipalityId,
					status: "published",
					reason: "Manual operator override",
					overrideReason: "Fresh minutes were uploaded manually.",
				},
			),
		).resolves.toMatchObject({ coverageStatus: "published" });

		const municipality = await t.run(async (ctx) => ctx.db.get(municipalityId));
		expect(municipality).toMatchObject({
			coverageStatus: "published",
			coverageStatusReason: "Manual operator override",
			coverageStatusOverrideReason: "Fresh minutes were uploaded manually.",
		});

		const events = await t.run(async (ctx) =>
			ctx.db
				.query("coveragePublicationEvents")
				.withIndex("by_municipality_created", (q) =>
					q.eq("municipalityId", municipalityId),
				)
				.collect(),
		);
		expect(events.map((event) => event.toStatus)).toEqual([
			"published",
			"paused",
			"published",
		]);
		expect(events[0]).toMatchObject({
			fromStatus: "unpublished",
			toStatus: "published",
			latestValidationRunId: validationRunId,
		});
		expect(events[2]).toMatchObject({
			fromStatus: "paused",
			toStatus: "published",
			overrideReason: "Fresh minutes were uploaded manually.",
		});
	});

	it("blocks subscriptions and alert candidates for unpublished or paused coverage", async () => {
		const t = setup();
		const userId = await seedUser(t);
		const publishedId = await seedMunicipality(t, {
			name: "Subscribed Falls",
			coverageStatus: "published",
		});
		const pausedId = await seedMunicipality(t, {
			name: "Paused Alerts",
			coverageStatus: "paused",
		});
		const unpublishedId = await seedMunicipality(t, {
			name: "Unpublished Alerts",
			coverageStatus: "unpublished",
		});

		const asUser = t.withIdentity({
			subject: "user_clerk",
			issuer: ISSUER,
			email: "user@example.com",
		});

		await expect(
			asUser.mutation(api.functions.subscriptions.mutations.create, {
				municipalityId: publishedId,
				alertFrequency: "daily",
			}),
		).resolves.toBeTruthy();
		await expect(
			asUser.mutation(api.functions.subscriptions.mutations.create, {
				municipalityId: unpublishedId,
				alertFrequency: "daily",
			}),
		).rejects.toThrow(/not accepting subscriptions/i);
		await expect(
			asUser.mutation(api.functions.subscriptions.mutations.create, {
				municipalityId: pausedId,
				alertFrequency: "daily",
			}),
		).rejects.toThrow(/not accepting subscriptions/i);

		const { meetingId, summaryId } = await seedMeetingWithSummary(t, pausedId);
		await t.run(async (ctx) =>
			ctx.db.insert("subscriptions", {
				userId,
				municipalityId: pausedId,
				alertFrequency: "daily",
				emailEnabled: true,
				isActive: true,
				createdAt: NOW,
				updatedAt: NOW,
			}),
		);

		await expect(
			t.mutation(internal.functions.alerts.mutations.generateAlerts, {
				meetingId,
				summaryId,
			}),
		).resolves.toMatchObject({
			created: 0,
			skipped: 1,
			skippedByReason: { coverage_status: 1 },
			errors: [],
		});
	});
});

async function seedAdmin(t: ReturnType<typeof convexTest>) {
	await t.run(async (ctx) =>
		ctx.db.insert("users", {
			clerkUserId: "admin_clerk",
			email: "admin@example.com",
			tier: "free",
			isAdmin: true,
			createdAt: NOW,
			lastLoginAt: NOW,
		}),
	);
}

async function seedUser(t: ReturnType<typeof convexTest>) {
	return await t.run(async (ctx) =>
		ctx.db.insert("users", {
			clerkUserId: "user_clerk",
			email: "user@example.com",
			tier: "free",
			isAdmin: false,
			createdAt: NOW,
			lastLoginAt: NOW,
		}),
	);
}

async function seedMunicipality(
	t: ReturnType<typeof convexTest>,
	overrides: Partial<{
		name: string;
		slug: string;
		coverageStatus: "published" | "unpublished" | "paused";
		isActive: boolean;
		isVerified: boolean;
	}> = {},
) {
	return await t.run(async (ctx) =>
		ctx.db.insert("municipalities", {
			name: overrides.name ?? "Validation Falls",
			state: "Connecticut",
			slug: overrides.slug,
			meetingsPageUrl: "https://example.test/agendas",
			platform: "civicplus",
			scrapeConfig: { frequencyHours: 24 },
			coverageStatus: overrides.coverageStatus ?? "unpublished",
			isActive: overrides.isActive ?? true,
			isVerified: overrides.isVerified ?? true,
			createdAt: NOW,
			updatedAt: NOW,
		}),
	);
}

async function seedValidationRun(
	t: ReturnType<typeof convexTest>,
	municipalityId: Id<"municipalities">,
	overrides: Partial<{
		status: "passed" | "partial" | "failed";
		meetingsFound: number;
	}> = {},
) {
	return await t.run(async (ctx) =>
		ctx.db.insert("scraperValidationRuns", {
			municipalityId,
			sourceUrl: "https://example.test/agendas",
			configuredPlatform: "civicplus",
			detectedPlatform: "civicplus",
			selectedPlatform: "civicplus",
			status: overrides.status ?? "passed",
			checks: [
				{
					name: "platform_detection",
					status: "pass",
					message: "Using CivicPlus scraper.",
				},
				{
					name: "meeting_extraction",
					status: "pass",
					message: "2 meetings extracted.",
				},
			],
			stats: {
				meetingsFound: overrides.meetingsFound ?? 1,
				documentReady: 1,
				summaryReady: 1,
				duplicates: 0,
				errors: 0,
			},
			meetingSample: [],
			errors: [],
			createdAt: NOW - 60_000,
			completedAt: NOW - 59_000,
			durationMs: 1000,
		}),
	);
}

async function seedMeetingWithSummary(
	t: ReturnType<typeof convexTest>,
	municipalityId: Id<"municipalities">,
) {
	const meetingId = await t.run(async (ctx) =>
		ctx.db.insert("meetings", {
			municipalityId,
			title: "Town Council",
			meetingType: "city_council",
			meetingDate: NOW - 20_000,
			sourceUrl: "https://example.test/meeting.pdf",
			sourceType: "scraped",
			rawContent: "Council reviewed the budget.",
			status: "summarized",
			createdAt: NOW - 20_000,
			updatedAt: NOW - 20_000,
		}),
	);
	const summaryId = await t.run(async (ctx) =>
		ctx.db.insert("summaries", {
			meetingId,
			version: 1,
			executiveSummary: "Council reviewed agenda items.",
			keyDecisions: [],
			discussionTopics: [],
			upcomingItems: [],
			topics: ["budget"],
			modelUsed: "test-model",
			promptVersion: "test-prompt",
			processingTimeMs: 1000,
			municipalityId,
			meetingDate: NOW - 20_000,
			sourceType: "scraped",
			status: "summarized",
			createdAt: NOW,
		}),
	);

	return { meetingId, summaryId };
}
