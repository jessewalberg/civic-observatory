import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import schema from "../../schema";
import { modules } from "../../test.setup";

const ISSUER = "https://clerk.example.com";

function setup() {
	return convexTest(schema, modules);
}

async function seedUser(
	t: ReturnType<typeof convexTest>,
	o: {
		clerkUserId: string;
		email: string;
		tier?: "free" | "pro";
	},
) {
	const now = Date.now();
	return await t.run(async (ctx) =>
		ctx.db.insert("users", {
			clerkUserId: o.clerkUserId,
			email: o.email,
			tier: o.tier ?? "free",
			createdAt: now,
			lastLoginAt: now,
		}),
	);
}

async function seedMunicipality(
	t: ReturnType<typeof convexTest>,
	name: string,
) {
	const now = Date.now();
	return await t.run(async (ctx) =>
		ctx.db.insert("municipalities", {
			name,
			state: "Connecticut",
			platform: "manual" as const,
			isActive: true,
			isVerified: true,
			createdAt: now,
			updatedAt: now,
		}),
	);
}

async function seedMeetingAndSummary(
	t: ReturnType<typeof convexTest>,
	municipalityId: Id<"municipalities">,
	options: {
		meetingType?:
			| "city_council"
			| "school_board"
			| "planning_commission"
			| "zoning_board"
			| "budget_committee"
			| "other";
		executiveSummary?: string;
		topics?: string[];
	} = {},
) {
	const now = Date.now();
	const meetingId = await t.run(async (ctx) =>
		ctx.db.insert("meetings", {
			municipalityId,
			title: "Town Council Bond Hearing",
			meetingType: options.meetingType ?? ("city_council" as const),
			meetingDate: Date.UTC(2026, 5, 18),
			sourceType: "manual_entry" as const,
			sourceUrl: "https://example.test/agenda.pdf",
			rawContent:
				options.executiveSummary ??
				"Council discussed school safety and a park bond.",
			status: "summarized" as const,
			createdAt: now,
			updatedAt: now,
		}),
	);
	const summaryId = await t.run(async (ctx) =>
		ctx.db.insert("summaries", {
			meetingId,
			version: 1,
			executiveSummary:
				options.executiveSummary ??
				"Council reviewed a park bond and school safety staffing.",
			keyDecisions: [
				{
					title: "Park bond advanced",
					description: "Council advanced a bond item for park repairs.",
					topics: ["budget"],
				},
			],
			discussionTopics: [
				{
					topic: "Public Safety",
					summary: "School safety staffing was discussed.",
					category: "safety",
				},
			],
			upcomingItems: [],
			topics: options.topics ?? ["budget", "public safety"],
			modelUsed: "test",
			promptVersion: "test",
			processingTimeMs: 1,
			municipalityId,
			meetingDate: Date.UTC(2026, 5, 18),
			sourceUrl: "https://example.test/agenda.pdf",
			sourceType: "manual_entry" as const,
			sourceContentHash: "summary-hash",
			status: "summarized" as const,
			createdAt: now,
		}),
	);
	return {
		meetingId: meetingId as Id<"meetings">,
		summaryId: summaryId as Id<"summaries">,
	};
}

describe("subscription summary matching model", () => {
	it("returns deterministic topic and keyword match data for eligible Pro immediate subscriptions", async () => {
		const t = setup();
		const municipalityId = await seedMunicipality(t, "Coventry");
		const userId = await seedUser(t, {
			clerkUserId: "user_pro_reader",
			email: "reader@example.test",
			tier: "pro",
		});
		const { meetingId, summaryId } = await seedMeetingAndSummary(
			t,
			municipalityId as Id<"municipalities">,
		);
		const subscriptionId = await t.run(async (ctx) =>
			ctx.db.insert("subscriptions", {
				userId: userId as Id<"users">,
				municipalityId: municipalityId as Id<"municipalities">,
				topicFilters: ["Budget & Finance"],
				meetingTypes: ["city_council"],
				keywordsInclude: ["bond"],
				keywordsExclude: ["zoning"],
				alertFrequency: "immediate" as const,
				emailEnabled: true,
				isActive: true,
				createdAt: Date.now(),
				updatedAt: Date.now(),
			}),
		);

		await expect(
			t.query(internal.functions.subscriptions.queries.getMatchingForSummary, {
				meetingId,
				summaryId,
			}),
		).resolves.toMatchObject([
			{
				subscription: { _id: subscriptionId },
				matchedTopics: ["budget"],
				matchedKeywords: ["bond"],
			},
		]);

		await expect(
			t.mutation(internal.functions.alerts.mutations.generateAlerts, {
				meetingId,
				summaryId,
			}),
		).resolves.toMatchObject({ created: 1, skipped: 0, errors: [] });

		const [alert] = await t.run(async (ctx) =>
			ctx.db.query("alerts").collect(),
		);
		expect(alert).toMatchObject({
			userId,
			subscriptionId,
			meetingId,
			summaryId,
			matchedTopics: ["budget"],
			matchedKeywords: ["bond"],
		});
	});

	it("filters municipality, meeting type, topic, keywords, inactive, missing-user, and tier-gated subscriptions", async () => {
		const t = setup();
		const municipalityId = await seedMunicipality(t, "Coventry");
		const otherMunicipalityId = await seedMunicipality(t, "Mansfield");
		const missingUserId = await seedUser(t, {
			clerkUserId: "user_deleted",
			email: "deleted@example.test",
		});
		const freeUserId = await seedUser(t, {
			clerkUserId: "user_free",
			email: "free@example.test",
		});
		const proUserId = await seedUser(t, {
			clerkUserId: "user_pro",
			email: "pro@example.test",
			tier: "pro",
		});
		const { meetingId, summaryId } = await seedMeetingAndSummary(
			t,
			municipalityId as Id<"municipalities">,
		);
		await t.run(async (ctx) => ctx.db.delete(missingUserId as Id<"users">));

		await t.run(async (ctx) => {
			const base = {
				userId: proUserId as Id<"users">,
				alertFrequency: "daily" as const,
				emailEnabled: true,
				isActive: true,
				createdAt: Date.now(),
				updatedAt: Date.now(),
			};
			return Promise.all([
				ctx.db.insert("subscriptions", {
					...base,
					municipalityId: otherMunicipalityId as Id<"municipalities">,
				}),
				ctx.db.insert("subscriptions", {
					...base,
					municipalityId: municipalityId as Id<"municipalities">,
					topicFilters: ["Zoning"],
				}),
				ctx.db.insert("subscriptions", {
					...base,
					municipalityId: municipalityId as Id<"municipalities">,
					meetingTypes: ["school_board"],
				}),
				ctx.db.insert("subscriptions", {
					...base,
					municipalityId: municipalityId as Id<"municipalities">,
					keywordsInclude: ["library"],
				}),
				ctx.db.insert("subscriptions", {
					...base,
					municipalityId: municipalityId as Id<"municipalities">,
					keywordsExclude: ["bond"],
				}),
				ctx.db.insert("subscriptions", {
					...base,
					municipalityId: municipalityId as Id<"municipalities">,
					isActive: false,
				}),
				ctx.db.insert("subscriptions", {
					...base,
					userId: freeUserId as Id<"users">,
					municipalityId: municipalityId as Id<"municipalities">,
					alertFrequency: "immediate" as const,
				}),
				ctx.db.insert("subscriptions", {
					...base,
					userId: missingUserId as Id<"users">,
					municipalityId: municipalityId as Id<"municipalities">,
				}),
			]);
		});

		await expect(
			t.query(internal.functions.subscriptions.queries.getMatchingForSummary, {
				meetingId,
				summaryId,
			}),
		).resolves.toEqual([]);

		await expect(
			t.mutation(internal.functions.alerts.mutations.generateAlerts, {
				meetingId,
				summaryId,
			}),
		).resolves.toMatchObject({ created: 0, skipped: 7, errors: [] });
	});

	it("does not match topic filters on generic shared tokens", async () => {
		const t = setup();
		const municipalityId = await seedMunicipality(t, "Coventry");
		const userId = await seedUser(t, {
			clerkUserId: "user_public_safety",
			email: "safety@example.test",
			tier: "pro",
		});
		const { meetingId, summaryId } = await seedMeetingAndSummary(
			t,
			municipalityId as Id<"municipalities">,
			{
				executiveSummary:
					"Public works crews discussed road drainage and sidewalk repairs.",
				topics: ["public works"],
			},
		);
		await t.run(async (ctx) =>
			ctx.db.insert("subscriptions", {
				userId: userId as Id<"users">,
				municipalityId: municipalityId as Id<"municipalities">,
				topicFilters: ["Public Safety"],
				alertFrequency: "daily" as const,
				emailEnabled: true,
				isActive: true,
				createdAt: Date.now(),
				updatedAt: Date.now(),
			}),
		);

		await expect(
			t.query(internal.functions.subscriptions.queries.getMatchingForSummary, {
				meetingId,
				summaryId,
			}),
		).resolves.toEqual([]);
	});

	it("prevents duplicate summary/subscription matches", async () => {
		const t = setup();
		const municipalityId = await seedMunicipality(t, "Coventry");
		const userId = await seedUser(t, {
			clerkUserId: "user_daily",
			email: "daily@example.test",
		});
		const { meetingId, summaryId } = await seedMeetingAndSummary(
			t,
			municipalityId as Id<"municipalities">,
		);
		await t.run(async (ctx) =>
			ctx.db.insert("subscriptions", {
				userId: userId as Id<"users">,
				municipalityId: municipalityId as Id<"municipalities">,
				alertFrequency: "daily" as const,
				emailEnabled: true,
				isActive: true,
				createdAt: Date.now(),
				updatedAt: Date.now(),
			}),
		);

		await expect(
			t.mutation(internal.functions.alerts.mutations.generateAlerts, {
				meetingId,
				summaryId,
			}),
		).resolves.toMatchObject({ created: 1, skipped: 0, errors: [] });
		await expect(
			t.mutation(internal.functions.alerts.mutations.generateAlerts, {
				meetingId,
				summaryId,
			}),
		).resolves.toMatchObject({ created: 0, skipped: 1, errors: [] });
		await expect(
			t.query(internal.functions.subscriptions.queries.getMatchingForSummary, {
				meetingId,
				summaryId,
			}),
		).resolves.toEqual([]);
	});

	it("derives public subscription ownership from the Clerk identity", async () => {
		const t = setup();
		const municipalityId = await seedMunicipality(t, "Coventry");
		const ownerId = await seedUser(t, {
			clerkUserId: "user_owner",
			email: "owner@example.test",
		});
		await seedUser(t, {
			clerkUserId: "user_attacker",
			email: "attacker@example.test",
		});
		const asOwner = t.withIdentity({
			subject: "user_owner",
			issuer: ISSUER,
			email: "owner@example.test",
		});
		const asAttacker = t.withIdentity({
			subject: "user_attacker",
			issuer: ISSUER,
			email: "attacker@example.test",
		});

		const subscriptionId = await asOwner.mutation(
			api.functions.subscriptions.mutations.create,
			{
				municipalityId: municipalityId as Id<"municipalities">,
				alertFrequency: "daily",
				emailEnabled: true,
			},
		);

		const row = await t.run(async (ctx) =>
			ctx.db.get(subscriptionId as Id<"subscriptions">),
		);
		expect(row?.userId).toBe(ownerId);

		await expect(
			asAttacker.mutation(api.functions.subscriptions.mutations.update, {
				subscriptionId: subscriptionId as Id<"subscriptions">,
				alertFrequency: "weekly",
			}),
		).rejects.toThrow(/Not authorized/);

		await expect(
			asOwner.mutation(api.functions.subscriptions.mutations.update, {
				subscriptionId: subscriptionId as Id<"subscriptions">,
				alertFrequency: "weekly",
			}),
		).resolves.toMatchObject({ success: true });
	});

	it("denies free users when creating or updating Pro-only immediate subscriptions", async () => {
		const t = setup();
		const municipalityId = await seedMunicipality(t, "Coventry");
		await seedUser(t, {
			clerkUserId: "user_free",
			email: "free@example.test",
		});
		const asFree = t.withIdentity({
			subject: "user_free",
			issuer: ISSUER,
			email: "free@example.test",
		});

		await expect(
			asFree.mutation(api.functions.subscriptions.mutations.create, {
				municipalityId: municipalityId as Id<"municipalities">,
				alertFrequency: "immediate",
			}),
		).rejects.toThrow(/Immediate alerts are only available for Pro users/);

		const subscriptionId = await asFree.mutation(
			api.functions.subscriptions.mutations.create,
			{
				municipalityId: municipalityId as Id<"municipalities">,
				alertFrequency: "daily",
			},
		);

		await expect(
			asFree.mutation(api.functions.subscriptions.mutations.update, {
				subscriptionId: subscriptionId as Id<"subscriptions">,
				alertFrequency: "immediate",
			}),
		).rejects.toThrow(/Immediate alerts are only available for Pro users/);
	});
});
