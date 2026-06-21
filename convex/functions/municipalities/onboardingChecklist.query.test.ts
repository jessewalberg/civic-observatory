import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import schema from "../../schema";
import { modules } from "../../test.setup";

const ISSUER = "https://clerk.example.com";
const now = new Date("2026-06-21T12:00:00.000Z").getTime();
const setup = () => convexTest(schema, modules);

describe("municipality onboarding checklist query", () => {
	it("derives admin checklist rows from validation, scrape, meeting, summary, and publish state", async () => {
		const t = setup();
		await seedAdmin(t);
		const readyId = await seedMunicipality(t, {
			name: "Ready Falls",
			isActive: true,
			isVerified: true,
		});
		const blockedId = await seedMunicipality(t, {
			name: "Blocked Borough",
			meetingsPageUrl: undefined,
			platform: "manual",
			isActive: false,
			isVerified: false,
		});
		await seedValidationRun(t, readyId, { status: "passed", meetingsFound: 2 });
		await seedScrapeJob(t, readyId, { status: "completed", meetingsFound: 2 });
		const meetingId = await seedMeeting(t, readyId, { status: "summarized" });
		await seedSummary(t, meetingId, readyId);

		const asAdmin = t.withIdentity({
			subject: "admin_clerk",
			issuer: ISSUER,
			email: "admin@example.com",
		});

		const rows = await asAdmin.query(
			api.functions.municipalities.queries.listOnboardingChecklists,
			{},
		);

		expect(rows).not.toBeNull();
		const byId = Object.fromEntries(
			(rows ?? []).map((row) => [row.municipality.id, row]),
		);

		expect(byId[readyId]?.overallStatus).toBe("completed");
		expect(byId[readyId]?.nextAction).toBeNull();
		expect(byId[blockedId]?.overallStatus).toBe("blocked");
		expect(byId[blockedId]?.nextAction).toBe("Add a meetings source URL");
		expect(byId[blockedId]?.steps.map((step) => step.status)).toEqual([
			"next-action",
			"blocked",
			"blocked",
			"blocked",
			"blocked",
		]);
	});

	it("returns null for non-admin callers", async () => {
		const t = setup();
		await seedUser(t);

		const asUser = t.withIdentity({
			subject: "user_clerk",
			issuer: ISSUER,
			email: "user@example.com",
		});

		await expect(
			asUser.query(
				api.functions.municipalities.queries.listOnboardingChecklists,
				{},
			),
		).resolves.toBeNull();
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
		name: string;
		meetingsPageUrl: string;
		platform: "granicus" | "civicplus" | "generic" | "manual";
		isActive: boolean;
		isVerified: boolean;
	}> = {},
) {
	return await t.run(async (ctx) =>
		ctx.db.insert("municipalities", {
			name: overrides.name ?? "Validation Falls",
			state: "CT",
			meetingsPageUrl:
				"meetingsPageUrl" in overrides
					? overrides.meetingsPageUrl
					: "https://example.test/agendas",
			platform: overrides.platform ?? "civicplus",
			scrapeConfig: { frequencyHours: 24 },
			isActive: overrides.isActive ?? false,
			isVerified: overrides.isVerified ?? false,
			createdAt: now,
			updatedAt: now,
		}),
	);
}

async function seedValidationRun(
	t: ReturnType<typeof convexTest>,
	municipalityId: Id<"municipalities">,
	overrides: Partial<{
		status: "passed" | "partial" | "failed";
		meetingsFound: number;
	}>,
) {
	await t.run(async (ctx) =>
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
			createdAt: now - 60_000,
			completedAt: now - 59_000,
			durationMs: 1000,
		}),
	);
}

async function seedScrapeJob(
	t: ReturnType<typeof convexTest>,
	municipalityId: Id<"municipalities">,
	overrides: Partial<{
		status: "pending" | "running" | "completed" | "failed" | "partial";
		meetingsFound: number;
	}>,
) {
	await t.run(async (ctx) =>
		ctx.db.insert("scrapeJobs", {
			municipalityId,
			status: overrides.status ?? "completed",
			completedAt: now - 30_000,
			meetingsFound: overrides.meetingsFound ?? 1,
			meetingsCreated: overrides.meetingsFound ?? 1,
			triggeredBy: "manual",
			createdAt: now - 40_000,
		}),
	);
}

async function seedMeeting(
	t: ReturnType<typeof convexTest>,
	municipalityId: Id<"municipalities">,
	overrides: Partial<{
		status: "pending" | "processing" | "summarized" | "failed" | "skipped";
	}> = {},
) {
	return await t.run(async (ctx) =>
		ctx.db.insert("meetings", {
			municipalityId,
			title: "Town Council",
			meetingType: "city_council",
			meetingDate: now - 20_000,
			sourceUrl: "https://example.test/meeting.pdf",
			sourceType: "scraped",
			status: overrides.status ?? "summarized",
			createdAt: now - 20_000,
			updatedAt: now - 20_000,
		}),
	);
}

async function seedSummary(
	t: ReturnType<typeof convexTest>,
	meetingId: Id<"meetings">,
	municipalityId: Id<"municipalities">,
) {
	await t.run(async (ctx) =>
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
			meetingDate: now - 20_000,
			sourceType: "scraped",
			status: "summarized",
			createdAt: now,
		}),
	);
}
