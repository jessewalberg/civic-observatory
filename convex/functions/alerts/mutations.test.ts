import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import schema from "../../schema";
import { modules } from "../../test.setup";

const setup = () => convexTest(schema, modules);

describe("minimal dashboard alert generation", () => {
	it("creates one unread feed item for an active municipality subscription", async () => {
		const t = setup();
		const now = Date.now();
		const userId = await t.run(async (ctx) =>
			ctx.db.insert("users", {
				clerkUserId: "user_coventry",
				email: "reader@example.test",
				name: "Coventry Reader",
				tier: "free",
				createdAt: now,
				lastLoginAt: now,
			}),
		);
		const municipalityId = await t.run(async (ctx) =>
			ctx.db.insert("municipalities", {
				name: "Coventry",
				state: "Connecticut",
				county: "Tolland",
				population: 12435,
				timezone: "America/New_York",
				websiteUrl: "https://www.coventry-ct.gov",
				meetingsPageUrl: "https://www.coventry-ct.gov/AgendaCenter",
				platform: "civicplus",
				isActive: true,
				isVerified: true,
				createdAt: now,
				updatedAt: now,
			}),
		);
		const meetingId = await t.run(async (ctx) =>
			ctx.db.insert("meetings", {
				municipalityId: municipalityId as Id<"municipalities">,
				title: "Town Council Meeting: June 1, 2026",
				meetingType: "city_council",
				meetingDate: new Date("2026-06-01T23:00:00.000Z").getTime(),
				sourceUrl:
					"https://www.coventry-ct.gov/AgendaCenter/ViewFile/Agenda/_06012026-4529?packet=true",
				sourceType: "scraped",
				rawContent: "Agenda packet content.",
				contentHash: "coventry-06012026-4529",
				status: "summarized",
				createdAt: now,
				updatedAt: now,
			}),
		);
		const summaryId = await t.run(async (ctx) =>
			ctx.db.insert("summaries", {
				meetingId: meetingId as Id<"meetings">,
				version: 1,
				executiveSummary:
					"Council reviewed appointments, finance reports, and correspondence.",
				keyDecisions: [],
				discussionTopics: [
					{
						topic: "Finance Committee report",
						summary: "Council reviewed Finance Committee reports.",
						category: "budget",
					},
				],
				upcomingItems: [],
				topics: ["budget", "other"],
				modelUsed: "test",
				promptVersion: "test",
				processingTimeMs: 10,
				municipalityId: municipalityId as Id<"municipalities">,
				meetingDate: new Date("2026-06-01T23:00:00.000Z").getTime(),
				sourceUrl:
					"https://www.coventry-ct.gov/AgendaCenter/ViewFile/Agenda/_06012026-4529?packet=true",
				sourceType: "scraped",
				sourceContentHash: "coventry-06012026-4529",
				status: "summarized",
				createdAt: now,
			}),
		);
		const subscriptionId = await t.run(async (ctx) =>
			ctx.db.insert("subscriptions", {
				userId: userId as Id<"users">,
				municipalityId: municipalityId as Id<"municipalities">,
				alertFrequency: "weekly",
				emailEnabled: false,
				isActive: true,
				createdAt: now,
				updatedAt: now,
			}),
		);

		await expect(
			t.mutation(internal.functions.alerts.mutations.generateAlerts, {
				meetingId: meetingId as Id<"meetings">,
				summaryId: summaryId as Id<"summaries">,
			}),
		).resolves.toMatchObject({ created: 1, skipped: 0, errors: [] });

		await expect(
			t.mutation(internal.functions.alerts.mutations.generateAlerts, {
				meetingId: meetingId as Id<"meetings">,
				summaryId: summaryId as Id<"summaries">,
			}),
		).resolves.toMatchObject({ created: 0, skipped: 1, errors: [] });

		const alerts = await t.run(async (ctx) => ctx.db.query("alerts").collect());
		expect(alerts).toHaveLength(1);
		expect(alerts[0]).toMatchObject({
			userId,
			subscriptionId,
			meetingId,
			summaryId,
			matchedTopics: ["budget", "other"],
			status: "sent",
		});
		expect(alerts[0].sentAt).toEqual(expect.any(Number));
		expect(alerts[0].scheduledFor).toBeUndefined();

		const feed = await t.query(api.functions.alerts.queries.getFeed, {
			userId: userId as Id<"users">,
			limit: 10,
		});
		expect(feed).toHaveLength(1);
		expect(feed[0]).toMatchObject({
			_id: alerts[0]._id,
			isNew: true,
			matchedTopics: ["budget", "other"],
			meeting: { title: "Town Council Meeting: June 1, 2026" },
			municipality: { name: "Coventry", state: "Connecticut" },
		});
	});
});
