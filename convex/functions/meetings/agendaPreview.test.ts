import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import schema from "../../schema";
import { modules } from "../../test.setup";

const setup = () => convexTest(schema, modules);
const ISSUER = "https://clerk.example.com";

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllEnvs();
	vi.unstubAllGlobals();
});

describe("meeting agenda preview scheduling", () => {
	it("summarizes future uploaded agendas for opt-in alerts while leaving final processing pending", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-06-21T15:00:00.000Z"));
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
		const t = setup();
		const userId = await t.run(async (ctx) =>
			ctx.db.insert("users", {
				clerkUserId: "future_agenda_uploader",
				email: "reader@example.test",
				tier: "free",
				createdAt: Date.now(),
				lastLoginAt: Date.now(),
			}),
		);
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
		await t.run(async (ctx) =>
			ctx.db.insert("subscriptions", {
				userId: userId as Id<"users">,
				municipalityId: municipalityId as Id<"municipalities">,
				topicFilters: ["Budget & Finance"],
				alertFrequency: "daily",
				emailEnabled: true,
				agendaAlertsEnabled: true,
				isActive: true,
				createdAt: Date.now(),
				updatedAt: Date.now(),
			}),
		);
		const asUploader = t.withIdentity({
			subject: "future_agenda_uploader",
			issuer: ISSUER,
			email: "reader@example.test",
		});

		const meetingId = await asUploader.mutation(
			api.functions.meetings.mutations.create,
			{
				municipalityId: municipalityId as Id<"municipalities">,
				title: "Town Council Bond Hearing",
				meetingType: "city_council",
				meetingDate: Date.UTC(2026, 5, 28, 15, 0),
				rawContent:
					"Agenda includes a bond hearing and public safety staffing item.",
				sourceUrl: "https://example.test/agenda.pdf",
			},
		);

		await t.finishAllScheduledFunctions(vi.runAllTimers);

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
});
