import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import schema from "../../schema";
import { modules } from "../../test.setup";

const setup = () => convexTest(schema, modules);
const NOW = new Date("2026-06-21T12:00:00.000Z").getTime();

describe("alert digest queries", () => {
	it("excludes pending digest alerts when coverage is paused", async () => {
		const t = setup();
		const userId = await seedUser(t);
		const publishedMunicipalityId = await seedMunicipality(t, {
			name: "Published Falls",
			coverageStatus: "published",
		});
		const pausedMunicipalityId = await seedMunicipality(t, {
			name: "Paused Falls",
			coverageStatus: "paused",
		});
		const publishedAlertId = await seedDigestAlert(t, {
			userId,
			municipalityId: publishedMunicipalityId,
			frequency: "daily",
		});
		await seedDigestAlert(t, {
			userId,
			municipalityId: pausedMunicipalityId,
			frequency: "daily",
		});

		const pending = await t.query(
			internal.functions.alerts.queries.getPendingByFrequency,
			{ frequency: "daily" },
		);
		expect(pending.map((item) => item.alert._id)).toEqual([publishedAlertId]);

		const digest = await t.query(
			internal.functions.alerts.queries.getPendingForUserDigest,
			{ frequency: "daily" },
		);
		expect(digest).toHaveLength(1);
		expect(digest[0]?.alerts.map((item) => item.alert._id)).toEqual([
			publishedAlertId,
		]);
	});
});

async function seedUser(t: ReturnType<typeof convexTest>) {
	return await t.run(async (ctx) =>
		ctx.db.insert("users", {
			clerkUserId: "digest_user",
			email: "digest@example.test",
			tier: "free",
			createdAt: NOW,
			lastLoginAt: NOW,
		}),
	);
}

async function seedMunicipality(
	t: ReturnType<typeof convexTest>,
	overrides: {
		name: string;
		coverageStatus: "published" | "unpublished" | "paused";
	},
) {
	return await t.run(async (ctx) =>
		ctx.db.insert("municipalities", {
			name: overrides.name,
			state: "Connecticut",
			platform: "manual",
			coverageStatus: overrides.coverageStatus,
			isActive: true,
			isVerified: true,
			createdAt: NOW,
			updatedAt: NOW,
		}),
	);
}

async function seedDigestAlert(
	t: ReturnType<typeof convexTest>,
	args: {
		userId: Id<"users">;
		municipalityId: Id<"municipalities">;
		frequency: "daily" | "weekly";
	},
) {
	const meetingId = await t.run(async (ctx) =>
		ctx.db.insert("meetings", {
			municipalityId: args.municipalityId,
			title: "Town Council Digest",
			meetingType: "city_council",
			meetingDate: NOW - 60_000,
			sourceType: "manual_entry",
			rawContent: "Council reviewed the budget.",
			status: "summarized",
			createdAt: NOW - 60_000,
			updatedAt: NOW - 60_000,
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
			municipalityId: args.municipalityId,
			meetingDate: NOW - 60_000,
			sourceType: "manual_entry",
			status: "summarized",
			createdAt: NOW,
		}),
	);
	const subscriptionId = await t.run(async (ctx) =>
		ctx.db.insert("subscriptions", {
			userId: args.userId,
			municipalityId: args.municipalityId,
			alertFrequency: args.frequency,
			emailEnabled: true,
			isActive: true,
			createdAt: NOW,
			updatedAt: NOW,
		}),
	);

	return await t.run(async (ctx) =>
		ctx.db.insert("alerts", {
			userId: args.userId,
			subscriptionId,
			meetingId,
			summaryId,
			municipalityId: args.municipalityId,
			matchedTopics: ["budget"],
			status: "pending",
			scheduledFor: NOW - 1000,
			createdAt: NOW - 1000,
		}),
	);
}
