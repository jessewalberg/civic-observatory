import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import schema from "../../schema";
import { modules } from "../../test.setup";

const setup = () => convexTest(schema, modules);

describe("scraper meeting persistence", () => {
	it("stores scraped Coventry meeting metadata and updates scrape job counts", async () => {
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

		const jobId = await t.mutation(
			internal.functions.scrapers.mutations.createScrapeJob,
			{
				municipalityId: municipalityId as Id<"municipalities">,
				triggeredBy: "manual",
			},
		);

		const sourceUrl =
			"https://www.coventry-ct.gov/AgendaCenter/ViewFile/Agenda/_06152026-4545?packet=true";
		const meetingId = await t.mutation(
			internal.functions.scrapers.mutations.createMeetingFromScrape,
			{
				municipalityId: municipalityId as Id<"municipalities">,
				title: "Town Council Meeting and Public Hearing: June 15, 2026",
				meetingType: "city_council",
				meetingDate: new Date("2026-06-15T23:00:00.000Z").getTime(),
				sourceUrl,
				contentHash: "coventry-06152026-4545",
				scrapeJobId: jobId as Id<"scrapeJobs">,
			},
		);

		await t.mutation(
			internal.functions.scrapers.mutations.updateScrapeJobStatus,
			{
				jobId: jobId as Id<"scrapeJobs">,
				status: "completed",
				completedAt: Date.now(),
				meetingsFound: 1,
				meetingsCreated: 1,
				meetingsSkipped: 0,
				meetingsFailed: 0,
			},
		);

		const meeting = await t.run(async (ctx) =>
			ctx.db.get(meetingId as Id<"meetings">),
		);
		expect(meeting).toMatchObject({
			municipalityId,
			title: "Town Council Meeting and Public Hearing: June 15, 2026",
			meetingType: "city_council",
			sourceUrl,
			sourceType: "scraped",
			contentHash: "coventry-06152026-4545",
			scrapeJobId: jobId,
			status: "pending",
		});
		expect(meeting?.slug).toContain("coventry-ct");

		await expect(
			t.query(internal.functions.scrapers.queries.checkMeetingExists, {
				municipalityId: municipalityId as Id<"municipalities">,
				contentHash: "coventry-06152026-4545",
				sourceUrl,
			}),
		).resolves.toMatchObject({
			exists: true,
			meetingId,
			reason: "content_hash",
		});

		const job = await t.run(async (ctx) =>
			ctx.db.get(jobId as Id<"scrapeJobs">),
		);
		expect(job).toMatchObject({
			municipalityId,
			status: "completed",
			triggeredBy: "manual",
			meetingsFound: 1,
			meetingsCreated: 1,
			meetingsSkipped: 0,
			meetingsFailed: 0,
		});
	});
});
