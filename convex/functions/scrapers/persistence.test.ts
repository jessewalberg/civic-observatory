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

	it("does not treat a matching content hash in another municipality as a duplicate", async () => {
		const t = setup();
		const firstMunicipalityId = await t.run(async (ctx) =>
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
		const secondMunicipalityId = await t.run(async (ctx) =>
			ctx.db.insert("municipalities", {
				name: "Mansfield",
				state: "Connecticut",
				county: "Tolland",
				population: 25000,
				timezone: "America/New_York",
				websiteUrl: "https://www.mansfieldct.gov",
				meetingsPageUrl: "https://www.mansfieldct.gov/AgendaCenter",
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
				municipalityId: firstMunicipalityId as Id<"municipalities">,
				triggeredBy: "manual",
			},
		);

		await t.mutation(
			internal.functions.scrapers.mutations.createMeetingFromScrape,
			{
				municipalityId: firstMunicipalityId as Id<"municipalities">,
				title: "Agenda for April 13, 2026",
				meetingType: "other",
				meetingDate: new Date("2026-04-13T23:00:00.000Z").getTime(),
				sourceUrl:
					"https://www.coventry-ct.gov/AgendaCenter/ViewFile/Agenda/_04132026-4485",
				contentHash: "same-title-date-hash",
				scrapeJobId: jobId as Id<"scrapeJobs">,
			},
		);

		await expect(
			t.query(internal.functions.scrapers.queries.checkMeetingExists, {
				municipalityId: secondMunicipalityId as Id<"municipalities">,
				contentHash: "same-title-date-hash",
				sourceUrl:
					"https://www.mansfieldct.gov/AgendaCenter/ViewFile/Agenda/_04132026-4485",
			}),
		).resolves.toEqual({ exists: false });
	});

	it("deduplicates CivicPlus AgendaCenter HTML, PDF, and packet URL variants", async () => {
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
		const meetingId = await t.mutation(
			internal.functions.scrapers.mutations.createMeetingFromScrape,
			{
				municipalityId: municipalityId as Id<"municipalities">,
				title: "Town Council Meeting and Public Hearing: June 15, 2026",
				meetingType: "city_council",
				meetingDate: new Date("2026-06-15T23:00:00.000Z").getTime(),
				sourceUrl:
					"https://www.coventry-ct.gov/AgendaCenter/ViewFile/Agenda/_06152026-4545?packet=true",
				contentHash: "legacy-packet-hash",
				scrapeJobId: jobId as Id<"scrapeJobs">,
			},
		);

		await expect(
			t.query(internal.functions.scrapers.queries.checkMeetingExists, {
				municipalityId: municipalityId as Id<"municipalities">,
				contentHash: "new-html-hash",
				sourceUrl:
					"https://www.coventry-ct.gov/AgendaCenter/ViewFile/Agenda/_06152026-4545?html=true",
			}),
		).resolves.toMatchObject({
			exists: true,
			meetingId,
			reason: "source_url",
		});
	});

	it("deduplicates a legacy document URL row when a scraper now reports the detail page", async () => {
		const t = setup();
		const municipalityId = await t.run(async (ctx) =>
			ctx.db.insert("municipalities", {
				name: "Bridgeport",
				state: "Connecticut",
				county: "Fairfield",
				population: 148000,
				timezone: "America/New_York",
				websiteUrl: "https://bridgeportct.legistar.com",
				meetingsPageUrl: "https://bridgeportct.legistar.com/Calendar.aspx",
				platform: "granicus",
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
		const meetingId = await t.mutation(
			internal.functions.scrapers.mutations.createMeetingFromScrape,
			{
				municipalityId: municipalityId as Id<"municipalities">,
				title: "City Council - 6:00 PM",
				meetingType: "city_council",
				meetingDate: new Date("2026-06-15T22:00:00.000Z").getTime(),
				sourceUrl:
					"https://bridgeportct.legistar.com/View.ashx?M=A&ID=12345&GUID=abc",
				contentHash: "legacy-title-date-hash",
				scrapeJobId: jobId as Id<"scrapeJobs">,
			},
		);

		await expect(
			t.query(internal.functions.scrapers.queries.checkMeetingExists, {
				municipalityId: municipalityId as Id<"municipalities">,
				contentHash: "new-url-aware-hash",
				sourceUrl:
					"https://bridgeportct.legistar.com/MeetingDetail.aspx?ID=12345",
				alternateSourceUrls: [
					"https://bridgeportct.legistar.com/View.ashx?M=A&ID=12345&GUID=abc",
				],
			}),
		).resolves.toMatchObject({
			exists: true,
			meetingId,
			reason: "source_url",
		});
	});

	it("repairs a failed packet-backed meeting when the scraper sees its agenda URL", async () => {
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
		const meetingId = await t.mutation(
			internal.functions.scrapers.mutations.createMeetingFromScrape,
			{
				municipalityId: municipalityId as Id<"municipalities">,
				title: "Town Council Steering Committee Meeting: June 22, 2026",
				meetingType: "city_council",
				meetingDate: new Date("2026-06-22T00:00:00.000Z").getTime(),
				sourceUrl:
					"https://www.coventry-ct.gov/AgendaCenter/ViewFile/Agenda/_06222026-4549?packet=true",
				contentHash: "legacy-packet-hash",
				scrapeJobId: jobId as Id<"scrapeJobs">,
			},
		);
		await t.run(async (ctx) => {
			await ctx.db.patch(meetingId as Id<"meetings">, {
				status: "failed",
				processingError: "fetch failed",
				updatedAt: Date.now(),
			});
		});

		await t.mutation(
			internal.functions.scrapers.mutations.refreshExistingMeetingFromScrape,
			{
				meetingId: meetingId as Id<"meetings">,
				sourceUrl:
					"https://www.coventry-ct.gov/AgendaCenter/ViewFile/Agenda/_06222026-4549?html=true",
				contentHash: "canonical-html-hash",
				scrapeJobId: jobId as Id<"scrapeJobs">,
			},
		);

		const meeting = await t.run(async (ctx) =>
			ctx.db.get(meetingId as Id<"meetings">),
		);
		expect(meeting).toMatchObject({
			sourceUrl:
				"https://www.coventry-ct.gov/AgendaCenter/ViewFile/Agenda/_06222026-4549?html=true",
			contentHash: "canonical-html-hash",
			status: "pending",
			scrapeJobId: jobId,
		});
		expect(meeting?.processingError).toBeUndefined();
	});
});
