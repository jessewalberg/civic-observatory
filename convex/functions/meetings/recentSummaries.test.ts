import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import schema from "../../schema";
import { modules } from "../../test.setup";

describe("recent municipality summaries", () => {
	it("selects qualified summaries before applying the display limit", async () => {
		const t = convexTest(schema, modules);
		const { municipalityId, newerId, olderId } = await t.run(async (ctx) => {
			const municipalityId = await ctx.db.insert("municipalities", {
				name: "Testville",
				state: "CT",
				platform: "manual",
				isActive: true,
				isVerified: true,
				coverageStatus: "published",
				createdAt: 1,
				updatedAt: 1,
			});
			const insertMeeting = (meetingDate: number) =>
				ctx.db.insert("meetings", {
					municipalityId,
					title: `Meeting ${meetingDate}`,
					meetingType: "city_council",
					meetingDate,
					sourceType: "manual_entry",
					status: "summarized",
					createdAt: meetingDate,
					updatedAt: meetingDate,
				});
			const insertSummary = (
				meetingId: Id<"meetings">,
				executiveSummary: string,
				kind: "summary" | "agenda_preview" = "summary",
			) =>
				ctx.db.insert("summaries", {
					meetingId,
					version: 1,
					executiveSummary,
					keyDecisions: [],
					discussionTopics: [],
					upcomingItems: [],
					topics: [],
					modelUsed: "test",
					promptVersion: "test",
					processingTimeMs: 1,
					kind,
					createdAt: 1,
				});

			const olderId = await insertMeeting(1);
			await insertSummary(olderId, "Older valid summary");
			const newerId = await insertMeeting(2);
			await insertSummary(newerId, "Newer valid summary");
			for (let date = 3; date <= 22; date++) {
				const meetingId = await insertMeeting(date);
				if (date % 2 === 0) {
					await insertSummary(meetingId, "   ");
				} else if (date % 3 === 0) {
					await insertSummary(meetingId, "Agenda only", "agenda_preview");
				}
			}
			return { municipalityId, newerId, olderId };
		});

		const summaries = await t.query(
			api.functions.meetings.queries.listRecentSummariesByMunicipality,
			{ municipalityId },
		);
		expect(summaries.map(({ _id }) => _id)).toEqual([newerId, olderId]);
		expect(summaries.map(({ executiveSummary }) => executiveSummary)).toEqual([
			"Newer valid summary",
			"Older valid summary",
		]);
	});
});
