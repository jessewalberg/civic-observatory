import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import schema from "../../schema";
import { modules } from "../../test.setup";

const NOW = new Date("2026-06-21T12:00:00.000Z").getTime();
const setup = () => convexTest(schema, modules);

describe("public summary discovery", () => {
	it("searches public summaries across municipality, meeting title, topics, and summary text", async () => {
		const t = setup();
		const publishedId = await seedMunicipality(t, {
			name: "Published Falls",
			coverageStatus: "published",
		});
		const hiddenId = await seedMunicipality(t, {
			name: "Hidden Falls",
			coverageStatus: "unpublished",
		});
		await seedSummaryBundle(t, publishedId, {
			title: "Housing committee reviews zoning overlay",
			topics: ["housing", "zoning"],
			executiveSummary:
				"Council discussed an affordable housing overlay near transit.",
		});
		await seedSummaryBundle(t, hiddenId, {
			title: "Hidden housing plan",
			topics: ["housing"],
			executiveSummary: "This unpublished coverage should stay private.",
		});

		const results = await t.query(
			api.functions.summaries.queries.searchPublicSummaries,
			{ query: "housing", limit: 10 },
		);

		expect(results).toHaveLength(1);
		expect(results[0]).toMatchObject({
			title: "Housing committee reviews zoning overlay",
			municipality: {
				name: "Published Falls",
				state: "Connecticut",
			},
			status: "summarized",
			topics: ["housing", "zoning"],
		});
		expect(results[0]?.summarySnippet).toContain("affordable housing");
	});

	it("maps public topic feed slugs and excludes unpublished coverage", async () => {
		const t = setup();
		const publishedId = await seedMunicipality(t, {
			name: "Schooltown",
			coverageStatus: "published",
		});
		const hiddenId = await seedMunicipality(t, {
			name: "Hidden Schooltown",
			coverageStatus: "paused",
		});
		await seedSummaryBundle(t, publishedId, {
			title: "Board reviews school transportation",
			topics: ["education", "transportation"],
			executiveSummary:
				"The school board reviewed bus routes and enrollment changes.",
		});
		await seedSummaryBundle(t, hiddenId, {
			title: "Paused school budget",
			topics: ["education"],
			executiveSummary: "Paused public coverage should not appear.",
		});

		const results = await t.query(
			api.functions.summaries.queries.listPublicTopicFeed,
			{ topic: "schools", limit: 10 },
		);

		expect(results.map((result) => result.municipality.name)).toEqual([
			"Schooltown",
		]);
		expect(results[0]?.topics).toEqual(["education", "transportation"]);
	});

	it("orders public discovery results by meeting date and applies limits after coverage gating", async () => {
		const t = setup();
		const publishedId = await seedMunicipality(t, {
			name: "Date Falls",
			coverageStatus: "published",
		});
		const hiddenId = await seedMunicipality(t, {
			name: "Hidden Date Falls",
			coverageStatus: "paused",
		});
		await seedSummaryBundle(t, publishedId, {
			title: "Old budget hearing",
			topics: ["budget"],
			executiveSummary: "Older public summary.",
			meetingDate: NOW - 2 * 86_400_000,
		});
		await seedSummaryBundle(t, hiddenId, {
			title: "Newest hidden budget hearing",
			topics: ["budget"],
			executiveSummary: "Hidden summary should not consume the result limit.",
			meetingDate: NOW + 86_400_000,
		});
		await seedSummaryBundle(t, publishedId, {
			title: "Newest public budget hearing",
			topics: ["budget"],
			executiveSummary: "Newest visible summary.",
			meetingDate: NOW,
		});

		const results = await t.query(
			api.functions.summaries.queries.searchPublicSummaries,
			{ limit: 2 },
		);

		expect(results.map((result) => result.title)).toEqual([
			"Newest public budget hearing",
			"Old budget hearing",
		]);
	});
});

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
			slug: overrides.name.toLowerCase().replaceAll(" ", "-"),
			state: "Connecticut",
			platform: "civicplus",
			meetingsPageUrl: "https://example.test/meetings",
			coverageStatus: overrides.coverageStatus,
			isActive: true,
			isVerified: true,
			createdAt: NOW,
			updatedAt: NOW,
		}),
	);
}

async function seedSummaryBundle(
	t: ReturnType<typeof convexTest>,
	municipalityId: Id<"municipalities">,
	overrides: {
		title: string;
		topics: string[];
		executiveSummary: string;
		meetingDate?: number;
	},
) {
	const meetingId = await t.run(async (ctx) =>
		ctx.db.insert("meetings", {
			municipalityId,
			title: overrides.title,
			slug: overrides.title.toLowerCase().replaceAll(" ", "-"),
			meetingType: "school_board",
			meetingDate: overrides.meetingDate ?? NOW,
			sourceUrl: "https://example.test/agenda.pdf",
			sourceType: "scraped",
			status: "summarized",
			createdAt: NOW,
			updatedAt: NOW,
		}),
	);

	await t.run(async (ctx) =>
		ctx.db.insert("summaries", {
			meetingId,
			version: 1,
			executiveSummary: overrides.executiveSummary,
			keyDecisions: [
				{
					title: "Adopt work plan",
					description: "Members discussed implementation timing.",
					topics: overrides.topics,
				},
			],
			discussionTopics: overrides.topics.map((topic) => ({
				topic,
				summary: `${topic} discussion`,
				category: topic,
			})),
			upcomingItems: [],
			topics: overrides.topics,
			modelUsed: "test-model",
			promptVersion: "test-prompt",
			processingTimeMs: 1000,
			municipalityId,
			meetingDate: overrides.meetingDate ?? NOW,
			sourceUrl: "https://example.test/agenda.pdf",
			sourceType: "scraped",
			status: "summarized",
			createdAt: NOW,
		}),
	);
}
