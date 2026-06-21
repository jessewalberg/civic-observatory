import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import schema from "../../schema";
import { modules } from "../../test.setup";

const ISSUER = "https://clerk.example.com";
const now = new Date("2026-06-21T12:00:00.000Z").getTime();
const setup = () => convexTest(schema, modules);

describe("scraper validation runs", () => {
	it("persists and retrieves structured diagnostics for admin review", async () => {
		const t = setup();
		await seedAdmin(t);
		const municipalityId = await seedMunicipality(t);

		const runId = await t.mutation(
			internal.functions.scrapers.mutations.saveValidationRun,
			{
				municipalityId: municipalityId as Id<"municipalities">,
				sourceUrl: "https://example.civicplus.com/AgendaCenter",
				configuredPlatform: "civicplus",
				detectedPlatform: "civicplus",
				selectedPlatform: "civicplus",
				status: "partial",
				checks: [
					{
						name: "document_links",
						status: "warning",
						message:
							"Only 1 of 2 meetings had document links or inline content.",
					},
				],
				stats: {
					meetingsFound: 2,
					documentReady: 1,
					summaryReady: 1,
					duplicates: 0,
					errors: 0,
				},
				meetingSample: [
					{
						title: "Town Council",
						meetingDate: now,
						sourceUrl: "https://example.civicplus.com/AgendaCenter/ViewFile/1",
						documentUrl:
							"https://example.civicplus.com/AgendaCenter/ViewFile/1.pdf",
						hasRawContent: false,
						documentReady: true,
						summaryReady: true,
						duplicate: false,
					},
				],
				errors: [],
				createdAt: now,
				completedAt: now + 150,
				durationMs: 150,
			},
		);

		const asAdmin = t.withIdentity({
			subject: "admin_clerk",
			issuer: ISSUER,
			email: "admin@example.com",
		});

		const runs = await asAdmin.query(
			api.functions.scrapers.queries.listValidationRuns,
			{
				municipalityId: municipalityId as Id<"municipalities">,
				limit: 5,
			},
		);

		expect(runs).not.toBeNull();
		expect(runs?.[0]).toMatchObject({
			_id: runId,
			municipalityId,
			sourceUrl: "https://example.civicplus.com/AgendaCenter",
			status: "partial",
			durationMs: 150,
			municipality: {
				name: "Validation Falls",
				state: "CT",
				platform: "civicplus",
			},
			stats: {
				meetingsFound: 2,
				documentReady: 1,
				summaryReady: 1,
			},
		});
	});

	it("hides validation diagnostics from non-admin callers", async () => {
		const t = setup();
		await seedUser(t);

		const asUser = t.withIdentity({
			subject: "user_clerk",
			issuer: ISSUER,
			email: "user@example.com",
		});

		await expect(
			asUser.query(api.functions.scrapers.queries.listValidationRuns, {
				limit: 5,
			}),
		).resolves.toBeNull();
	});

	it("runs validation without publishing meetings or changing municipality scrape state", async () => {
		const t = setup();
		await seedAdmin(t);
		const municipalityId = await seedMunicipality(t, {
			platform: "manual",
			meetingsPageUrl: "https://example.test/manual-agendas",
		});

		const asAdmin = t.withIdentity({
			subject: "admin_clerk",
			issuer: ISSUER,
			email: "admin@example.com",
		});

		const result = await asAdmin.action(
			api.functions.scrapers.actions.validateScraper,
			{
				municipalityId: municipalityId as Id<"municipalities">,
				platform: "manual",
			},
		);

		expect(result).toMatchObject({
			success: false,
			status: "failed",
			sourceUrl: "https://example.test/manual-agendas",
			configuredPlatform: "manual",
		});

		const { municipality, meetings } = await t.run(async (ctx) => ({
			municipality: await ctx.db.get(municipalityId as Id<"municipalities">),
			meetings: await ctx.db.query("meetings").collect(),
		}));
		expect(meetings).toEqual([]);
		expect(municipality).toMatchObject({
			isActive: false,
			isVerified: false,
			platform: "manual",
		});
		expect(municipality?.lastScrapedAt).toBeUndefined();
		expect(municipality?.lastScrapeStatus).toBeUndefined();

		const runs = await asAdmin.query(
			api.functions.scrapers.queries.listValidationRuns,
			{ municipalityId: municipalityId as Id<"municipalities"> },
		);
		expect(runs?.[0]?._id).toBe(result.runId);
	});
});

async function seedAdmin(t: ReturnType<typeof convexTest>) {
	await t.run(async (ctx) =>
		ctx.db.insert("users", {
			clerkUserId: "admin_clerk",
			email: "admin@example.com",
			tier: "free",
			isAdmin: true,
			createdAt: now,
			lastLoginAt: now,
		}),
	);
}

async function seedUser(t: ReturnType<typeof convexTest>) {
	await t.run(async (ctx) =>
		ctx.db.insert("users", {
			clerkUserId: "user_clerk",
			email: "user@example.com",
			tier: "free",
			isAdmin: false,
			createdAt: now,
			lastLoginAt: now,
		}),
	);
}

async function seedMunicipality(
	t: ReturnType<typeof convexTest>,
	overrides: Partial<{
		platform: "granicus" | "civicplus" | "generic" | "manual";
		meetingsPageUrl: string;
	}> = {},
) {
	return await t.run(async (ctx) =>
		ctx.db.insert("municipalities", {
			name: "Validation Falls",
			state: "CT",
			meetingsPageUrl:
				overrides.meetingsPageUrl ??
				"https://example.civicplus.com/AgendaCenter",
			platform: overrides.platform ?? "civicplus",
			scrapeConfig: { frequencyHours: 24 },
			isActive: false,
			isVerified: false,
			createdAt: now,
			updatedAt: now,
		}),
	);
}
