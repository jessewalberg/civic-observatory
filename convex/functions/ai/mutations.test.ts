import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import schema from "../../schema";
import { modules } from "../../test.setup";

const setup = () => convexTest(schema, modules);

describe("AI summary persistence", () => {
	it("stores source-backed provenance for scraped meeting summaries", async () => {
		const t = setup();
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
				createdAt: Date.now(),
				updatedAt: Date.now(),
			}),
		);
		const meetingDate = new Date("2026-06-15T23:00:00.000Z").getTime();
		const sourceUrl =
			"https://www.coventry-ct.gov/AgendaCenter/ViewFile/Agenda/_06152026-4545?packet=true";
		const meetingId = await t.run(async (ctx) =>
			ctx.db.insert("meetings", {
				municipalityId: municipalityId as Id<"municipalities">,
				title: "Town Council Meeting and Public Hearing: June 15, 2026",
				meetingType: "city_council",
				meetingDate,
				sourceUrl,
				sourceType: "scraped",
				rawContent: "Agenda packet text with enough content to summarize.",
				contentHash: "coventry-06152026-4545",
				status: "processing",
				processingAttempts: 1,
				createdAt: Date.now(),
				updatedAt: Date.now(),
			}),
		);

		const summaryId = await t.mutation(
			internal.functions.ai.mutations.createSummary,
			{
				meetingId: meetingId as Id<"meetings">,
				summary: {
					executiveSummary:
						"The Town Council reviewed the FY 2026/27 budget and related public hearing items.",
					keyDecisions: [
						{
							title: "Budget transfer authorization",
							description:
								"Council reviewed budget transfers and reserve fund usage.",
							topics: ["budget"],
							importance: "high",
						},
					],
					discussionTopics: [
						{
							topic: "Fire grant authorization",
							summary:
								"Council discussed authorization for an Assistance for Fire Fighters Grant.",
							category: "safety",
						},
					],
					upcomingItems: [],
					topics: ["budget", "safety"],
					sentiment: "routine",
					modelUsed: "test-model",
					promptVersion: "test",
					processingTimeMs: 123,
				},
			},
		);

		const summary = await t.run(async (ctx) =>
			ctx.db.get(summaryId as Id<"summaries">),
		);
		expect(summary).toMatchObject({
			meetingId,
			municipalityId,
			meetingDate,
			sourceUrl,
			sourceType: "scraped",
			sourceContentHash: "coventry-06152026-4545",
			status: "summarized",
		});
		expect(summary?.error).toBeUndefined();
	});
});
