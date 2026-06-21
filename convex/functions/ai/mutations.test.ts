import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import schema from "../../schema";
import { modules } from "../../test.setup";

const setup = () => convexTest(schema, modules);

afterEach(() => {
	vi.unstubAllEnvs();
	vi.unstubAllGlobals();
});

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

	it("keeps agenda preview and final summaries as separate records", async () => {
		const t = setup();
		const municipalityId = await t.run(async (ctx) =>
			ctx.db.insert("municipalities", {
				name: "Coventry",
				state: "Connecticut",
				platform: "manual",
				isActive: true,
				isVerified: true,
				createdAt: Date.now(),
				updatedAt: Date.now(),
			}),
		);
		const meetingId = await t.run(async (ctx) =>
			ctx.db.insert("meetings", {
				municipalityId: municipalityId as Id<"municipalities">,
				title: "Town Council Bond Hearing",
				meetingType: "city_council",
				meetingDate: Date.now() + 7 * 24 * 60 * 60 * 1000,
				sourceType: "manual_entry",
				sourceUrl: "https://example.test/agenda.pdf",
				rawContent: "Agenda includes a bond hearing.",
				status: "pending",
				createdAt: Date.now(),
				updatedAt: Date.now(),
			}),
		);

		const agendaSummaryId = await t.mutation(
			internal.functions.ai.mutations.createSummary,
			{
				meetingId: meetingId as Id<"meetings">,
				kind: "agenda_preview",
				summary: buildSummary("Agenda preview for the upcoming bond hearing."),
			},
		);
		const finalSummaryId = await t.mutation(
			internal.functions.ai.mutations.createSummary,
			{
				meetingId: meetingId as Id<"meetings">,
				kind: "summary",
				summary: buildSummary("Final summary after the bond hearing."),
			},
		);

		const summaries = await t.run(async (ctx) =>
			ctx.db
				.query("summaries")
				.withIndex("by_meeting", (q) =>
					q.eq("meetingId", meetingId as Id<"meetings">),
				)
				.collect(),
		);

		expect(summaries).toHaveLength(2);
		expect(summaries).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					_id: agendaSummaryId,
					kind: "agenda_preview",
					executiveSummary: "Agenda preview for the upcoming bond hearing.",
				}),
				expect.objectContaining({
					_id: finalSummaryId,
					kind: "summary",
					executiveSummary: "Final summary after the bond hearing.",
				}),
			]),
		);
	});

	it("summarizes future agenda previews without consuming final summary processing", async () => {
		const t = setup();
		vi.stubEnv("OPENROUTER_API_KEY", "test-openrouter-key");
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => {
				return new Response(
					JSON.stringify({
						choices: [
							{
								message: {
									content: JSON.stringify({
										executiveSummary:
											"The upcoming agenda includes a bond hearing and public safety staffing item.",
										keyDecisions: [],
										discussionTopics: [
											{
												topic: "Bond hearing",
												summary: "Council will hear a bond proposal.",
												category: "budget",
											},
										],
										publicComments: null,
										upcomingItems: [],
										topics: ["budget", "safety"],
										sentiment: "routine",
									}),
								},
							},
						],
					}),
					{
						status: 200,
						headers: { "Content-Type": "application/json" },
					},
				);
			}),
		);
		const now = Date.now();
		const municipalityId = await t.run(async (ctx) =>
			ctx.db.insert("municipalities", {
				name: "Coventry",
				state: "Connecticut",
				platform: "manual",
				isActive: true,
				isVerified: true,
				createdAt: now,
				updatedAt: now,
			}),
		);
		const userId = await t.run(async (ctx) =>
			ctx.db.insert("users", {
				clerkUserId: "agenda_alert_reader",
				email: "reader@example.test",
				tier: "free",
				createdAt: now,
				lastLoginAt: now,
			}),
		);
		const meetingId = await t.run(async (ctx) =>
			ctx.db.insert("meetings", {
				municipalityId: municipalityId as Id<"municipalities">,
				title: "Town Council Bond Hearing",
				meetingType: "city_council",
				meetingDate: now + 7 * 24 * 60 * 60 * 1000,
				sourceType: "manual_entry",
				sourceUrl: "https://example.test/agenda.pdf",
				rawContent:
					"Agenda includes a bond hearing and public safety staffing item.",
				status: "pending",
				createdAt: now,
				updatedAt: now,
			}),
		);
		await t.run(async (ctx) =>
			ctx.db.insert("subscriptions", {
				userId: userId as Id<"users">,
				municipalityId: municipalityId as Id<"municipalities">,
				topicFilters: ["Budget & Finance"],
				alertFrequency: "daily",
				emailEnabled: true,
				agendaAlertsEnabled: true,
				isActive: true,
				createdAt: now,
				updatedAt: now,
			}),
		);

		await expect(
			t.action(internal.functions.ai.summarize.summarizeMeeting, {
				meetingId: meetingId as Id<"meetings">,
				kind: "agenda_preview",
			}),
		).resolves.toEqual({ success: true });

		const { meeting, summaries, alerts } = await t.run(async (ctx) => ({
			meeting: await ctx.db.get(meetingId as Id<"meetings">),
			summaries: await ctx.db
				.query("summaries")
				.withIndex("by_meeting", (q) =>
					q.eq("meetingId", meetingId as Id<"meetings">),
				)
				.collect(),
			alerts: await ctx.db.query("alerts").collect(),
		}));

		expect(meeting).toMatchObject({ status: "pending" });
		expect(summaries).toMatchObject([
			{
				kind: "agenda_preview",
				executiveSummary:
					"The upcoming agenda includes a bond hearing and public safety staffing item.",
			},
		]);
		expect(alerts).toMatchObject([
			{
				kind: "agenda_preview",
				userId,
				meetingId,
			},
		]);
	});

	it("does not let future pending agenda previews starve ready final summaries", async () => {
		const t = setup();
		const now = Date.now();
		const municipalityId = await t.run(async (ctx) =>
			ctx.db.insert("municipalities", {
				name: "Coventry",
				state: "Connecticut",
				platform: "manual",
				isActive: true,
				isVerified: true,
				createdAt: now,
				updatedAt: now,
			}),
		);
		await t.run(async (ctx) =>
			ctx.db.insert("meetings", {
				municipalityId: municipalityId as Id<"municipalities">,
				title: "Future Agenda Preview",
				meetingType: "city_council",
				meetingDate: now + 7 * 24 * 60 * 60 * 1000,
				sourceType: "manual_entry",
				rawContent: "Future agenda content.",
				status: "pending",
				createdAt: now,
				updatedAt: now,
			}),
		);
		const readyMeetingId = await t.run(async (ctx) =>
			ctx.db.insert("meetings", {
				municipalityId: municipalityId as Id<"municipalities">,
				title: "Past Meeting Ready for Final Summary",
				meetingType: "city_council",
				meetingDate: now - 24 * 60 * 60 * 1000,
				sourceType: "manual_entry",
				rawContent: "Past meeting content.",
				status: "pending",
				createdAt: now + 1,
				updatedAt: now + 1,
			}),
		);

		await expect(
			t.query(internal.functions.ai.queries.getPendingMeetings, { limit: 1 }),
		).resolves.toMatchObject([{ _id: readyMeetingId }]);
	});
});

function buildSummary(executiveSummary: string) {
	return {
		executiveSummary,
		keyDecisions: [],
		discussionTopics: [],
		upcomingItems: [],
		topics: ["budget"],
		sentiment: "routine" as const,
		modelUsed: "test-model",
		promptVersion: "test",
		processingTimeMs: 123,
	};
}
