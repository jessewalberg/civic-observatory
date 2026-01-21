import { internalMutation } from "../../_generated/server";
import { v } from "convex/values";

// ═══════════════════════════════════════════════════════════════
// CREATE SCRAPE JOB - Create a new scrape job record
// ═══════════════════════════════════════════════════════════════
export const createScrapeJob = internalMutation({
  args: {
    municipalityId: v.id("municipalities"),
    triggeredBy: v.union(v.literal("cron"), v.literal("manual"), v.literal("webhook")),
    triggeredByUserId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const jobId = await ctx.db.insert("scrapeJobs", {
      municipalityId: args.municipalityId,
      status: "pending",
      triggeredBy: args.triggeredBy,
      triggeredByUserId: args.triggeredByUserId,
      createdAt: Date.now(),
    });

    return jobId;
  },
});

// ═══════════════════════════════════════════════════════════════
// UPDATE SCRAPE JOB STATUS - Update job status and results
// ═══════════════════════════════════════════════════════════════
export const updateScrapeJobStatus = internalMutation({
  args: {
    jobId: v.id("scrapeJobs"),
    status: v.union(
      v.literal("pending"),
      v.literal("running"),
      v.literal("completed"),
      v.literal("failed"),
      v.literal("partial")
    ),
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    meetingsFound: v.optional(v.number()),
    meetingsCreated: v.optional(v.number()),
    meetingsSkipped: v.optional(v.number()),
    meetingsFailed: v.optional(v.number()),
    errors: v.optional(
      v.array(
        v.object({
          message: v.string(),
          url: v.optional(v.string()),
          timestamp: v.number(),
        })
      )
    ),
  },
  handler: async (ctx, args) => {
    const { jobId, ...updates } = args;

    // Remove undefined values
    const cleanUpdates: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) {
        cleanUpdates[key] = value;
      }
    }

    await ctx.db.patch(jobId, cleanUpdates);
  },
});

// ═══════════════════════════════════════════════════════════════
// UPDATE MUNICIPALITY SCRAPE STATUS - Update after scraping
// ═══════════════════════════════════════════════════════════════
export const updateMunicipalityScrapeStatus = internalMutation({
  args: {
    municipalityId: v.id("municipalities"),
    status: v.union(v.literal("success"), v.literal("failed"), v.literal("partial")),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const updates: Record<string, unknown> = {
      lastScrapedAt: Date.now(),
      lastScrapeStatus: args.status,
      updatedAt: Date.now(),
    };

    if (args.error) {
      updates.lastScrapeError = args.error;
    } else {
      updates.lastScrapeError = undefined;
    }

    await ctx.db.patch(args.municipalityId, updates);
  },
});

// ═══════════════════════════════════════════════════════════════
// CREATE MEETING FROM SCRAPE - Create meeting from scraped data
// ═══════════════════════════════════════════════════════════════
export const createMeetingFromScrape = internalMutation({
  args: {
    municipalityId: v.id("municipalities"),
    title: v.string(),
    meetingType: v.union(
      v.literal("city_council"),
      v.literal("school_board"),
      v.literal("planning_commission"),
      v.literal("zoning_board"),
      v.literal("budget_committee"),
      v.literal("other")
    ),
    meetingDate: v.number(),
    sourceUrl: v.string(),
    rawContent: v.optional(v.string()),
    contentHash: v.optional(v.string()),
    scrapeJobId: v.id("scrapeJobs"),
  },
  handler: async (ctx, args) => {
    const meetingId = await ctx.db.insert("meetings", {
      municipalityId: args.municipalityId,
      title: args.title,
      meetingType: args.meetingType,
      meetingDate: args.meetingDate,
      sourceUrl: args.sourceUrl,
      sourceType: "scraped",
      rawContent: args.rawContent,
      contentHash: args.contentHash,
      status: args.rawContent ? "pending" : "skipped",
      scrapeJobId: args.scrapeJobId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    return meetingId;
  },
});

// ═══════════════════════════════════════════════════════════════
// ADD SCRAPE JOB ERROR - Append error to job's error list
// ═══════════════════════════════════════════════════════════════
export const addScrapeJobError = internalMutation({
  args: {
    jobId: v.id("scrapeJobs"),
    error: v.object({
      message: v.string(),
      url: v.optional(v.string()),
      timestamp: v.number(),
    }),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) return;

    const errors = job.errors ?? [];
    errors.push(args.error);

    await ctx.db.patch(args.jobId, { errors });
  },
});
