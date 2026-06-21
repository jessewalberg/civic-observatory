import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import schema from "../../schema";
import { modules } from "../../test.setup";

const ISSUER = "https://clerk.example.com";
const setup = () => convexTest(schema, modules);

describe("municipality coverage health query", () => {
	it("derives coverage health from Convex municipality, meeting, summary, and scrape job rows", async () => {
		const t = setup();
		await seedAdmin(t);
		const liveId = await seedMunicipality(t, {
			name: "Liveville",
			lastScrapedAt: Date.now() - 60 * 60 * 1000,
			lastScrapeStatus: "success",
		});
		const failingId = await seedMunicipality(t, {
			name: "Failtown",
			lastScrapedAt: Date.now() - 60 * 60 * 1000,
			lastScrapeStatus: "failed",
			lastScrapeError: "agenda page returned 500",
		});
		const unsupportedId = await seedMunicipality(t, {
			name: "Unsupported Borough",
			isActive: false,
			meetingsPageUrl: undefined,
		});

		const liveMeetingId = await seedMeeting(t, liveId, {
			status: "summarized",
			sourceUrl: "https://example.test/live.pdf",
		});
		await seedSummary(t, liveMeetingId, liveId);
		await seedMeeting(t, failingId, { status: "failed" });
		await seedScrapeJob(t, liveId, { status: "completed" });
		await seedScrapeJob(t, failingId, {
			status: "failed",
			errors: [{ message: "agenda page returned 500", timestamp: Date.now() }],
		});

		const asAdmin = t.withIdentity({
			subject: "admin_clerk",
			issuer: ISSUER,
			email: "admin@example.com",
		});

		const health = await asAdmin.query(
			api.functions.municipalities.queries.listCoverageHealth,
			{},
		);

		expect(health).not.toBeNull();
		const byId = Object.fromEntries(
			(health ?? []).map((row) => [row.municipality.id, row.health]),
		);

		expect(byId[liveId]?.state).toBe("live");
		expect(byId[liveId]?.documentAvailabilityPct).toBe(100);
		expect(byId[liveId]?.summaryStatus.summaryCoveragePct).toBe(100);
		expect(byId[failingId]?.state).toBe("failing");
		expect(byId[failingId]?.lastFailure?.message).toBe(
			"agenda page returned 500",
		);
		expect(byId[unsupportedId]?.state).toBe("unsupported");
	});
});

async function seedAdmin(t: ReturnType<typeof convexTest>) {
	await t.run(async (ctx) =>
		ctx.db.insert("users", {
			clerkUserId: "admin_clerk",
			email: "admin@example.com",
			tier: "free",
			isAdmin: true,
			createdAt: Date.now(),
			lastLoginAt: Date.now(),
		}),
	);
}

async function seedMunicipality(
	t: ReturnType<typeof convexTest>,
	overrides: Partial<{
		name: string;
		isActive: boolean;
		meetingsPageUrl: string;
		lastScrapedAt: number;
		lastScrapeStatus: "success" | "failed" | "partial";
		lastScrapeError: string;
	}>,
) {
	return await t.run(async (ctx) =>
		ctx.db.insert("municipalities", {
			name: overrides.name ?? "Testville",
			state: "CT",
			meetingsPageUrl:
				"meetingsPageUrl" in overrides
					? overrides.meetingsPageUrl
					: "https://example.test/agenda",
			platform: "civicplus",
			scrapeConfig: { frequencyHours: 24 },
			isActive: overrides.isActive ?? true,
			isVerified: true,
			lastScrapedAt: overrides.lastScrapedAt,
			lastScrapeStatus: overrides.lastScrapeStatus,
			lastScrapeError: overrides.lastScrapeError,
			createdAt: Date.now(),
			updatedAt: Date.now(),
		}),
	);
}

async function seedMeeting(
	t: ReturnType<typeof convexTest>,
	municipalityId: Id<"municipalities">,
	overrides: Partial<{
		status: "pending" | "processing" | "summarized" | "failed" | "skipped";
		sourceUrl: string;
	}> = {},
) {
	return await t.run(async (ctx) =>
		ctx.db.insert("meetings", {
			municipalityId,
			title: "Town Council",
			meetingType: "city_council",
			meetingDate: Date.now(),
			sourceUrl: overrides.sourceUrl,
			sourceType: "scraped",
			status: overrides.status ?? "summarized",
			createdAt: Date.now(),
			updatedAt: Date.now(),
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
			executiveSummary: "Council reviewed the budget.",
			keyDecisions: [],
			discussionTopics: [],
			upcomingItems: [],
			topics: ["budget"],
			modelUsed: "test-model",
			promptVersion: "test-prompt",
			processingTimeMs: 1000,
			municipalityId,
			meetingDate: Date.now(),
			sourceType: "scraped",
			status: "summarized",
			createdAt: Date.now(),
		}),
	);
}

async function seedScrapeJob(
	t: ReturnType<typeof convexTest>,
	municipalityId: Id<"municipalities">,
	overrides: Partial<{
		status: "pending" | "running" | "completed" | "failed" | "partial";
		errors: Array<{ message: string; timestamp: number }>;
	}>,
) {
	await t.run(async (ctx) =>
		ctx.db.insert("scrapeJobs", {
			municipalityId,
			status: overrides.status ?? "completed",
			completedAt: Date.now(),
			meetingsFound: 1,
			meetingsCreated: 1,
			errors: overrides.errors,
			triggeredBy: "manual",
			createdAt: Date.now(),
		}),
	);
}
