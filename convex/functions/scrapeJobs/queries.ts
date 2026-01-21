import { query, internalQuery } from "../../_generated/server";
import { v } from "convex/values";

// ═══════════════════════════════════════════════════════════════
// GET BY MUNICIPALITY - History for one municipality
// ═══════════════════════════════════════════════════════════════
export const getByMunicipality = query({
  args: {
    municipalityId: v.id("municipalities"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 20;

    const jobs = await ctx.db
      .query("scrapeJobs")
      .withIndex("by_municipality", (q) => q.eq("municipalityId", args.municipalityId))
      .order("desc")
      .take(limit);

    // Get municipality info
    const municipality = await ctx.db.get(args.municipalityId);

    return {
      municipality: municipality
        ? { name: municipality.name, state: municipality.state }
        : null,
      jobs: jobs.map((job) => ({
        ...job,
        // Calculate duration if completed
        durationMs:
          job.completedAt && job.startedAt ? job.completedAt - job.startedAt : null,
      })),
    };
  },
});

// ═══════════════════════════════════════════════════════════════
// GET RECENT - Last N jobs across all municipalities
// ═══════════════════════════════════════════════════════════════
export const getRecent = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;

    const jobs = await ctx.db
      .query("scrapeJobs")
      .withIndex("by_created")
      .order("desc")
      .take(limit);

    // Get municipality info for each job
    const municipalityIds = [...new Set(jobs.map((j) => j.municipalityId))];
    const municipalities = await Promise.all(
      municipalityIds.map((id) => ctx.db.get(id))
    );

    const municipalityMap = new Map(
      municipalities
        .filter((m) => m !== null)
        .map((m) => [m!._id, { name: m!.name, state: m!.state }])
    );

    return jobs.map((job) => ({
      ...job,
      municipality: municipalityMap.get(job.municipalityId) ?? null,
      durationMs:
        job.completedAt && job.startedAt ? job.completedAt - job.startedAt : null,
    }));
  },
});

// ═══════════════════════════════════════════════════════════════
// GET FAILED - Failed jobs for review
// ═══════════════════════════════════════════════════════════════
export const getFailed = query({
  args: {
    limit: v.optional(v.number()),
    since: v.optional(v.number()), // Timestamp to filter from
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;
    const since = args.since ?? Date.now() - 7 * 24 * 60 * 60 * 1000; // Default: last 7 days

    const jobs = await ctx.db
      .query("scrapeJobs")
      .withIndex("by_status", (q) => q.eq("status", "failed"))
      .order("desc")
      .take(limit * 2); // Get extra to filter by date

    // Filter by date
    const filteredJobs = jobs
      .filter((job) => job.createdAt >= since)
      .slice(0, limit);

    // Get municipality info
    const municipalityIds = [...new Set(filteredJobs.map((j) => j.municipalityId))];
    const municipalities = await Promise.all(
      municipalityIds.map((id) => ctx.db.get(id))
    );

    const municipalityMap = new Map(
      municipalities
        .filter((m) => m !== null)
        .map((m) => [m!._id, { name: m!.name, state: m!.state }])
    );

    return filteredJobs.map((job) => ({
      ...job,
      municipality: municipalityMap.get(job.municipalityId) ?? null,
      // Extract first error message for quick view
      firstError: job.errors?.[0]?.message ?? null,
    }));
  },
});

// ═══════════════════════════════════════════════════════════════
// GET STATS - Overall scraping statistics
// ═══════════════════════════════════════════════════════════════
export const getStats = query({
  args: {
    since: v.optional(v.number()), // Timestamp to calculate from
  },
  handler: async (ctx, args) => {
    const since = args.since ?? Date.now() - 24 * 60 * 60 * 1000; // Default: last 24 hours

    const allJobs = await ctx.db
      .query("scrapeJobs")
      .withIndex("by_created")
      .order("desc")
      .collect();

    // Filter by date
    const recentJobs = allJobs.filter((job) => job.createdAt >= since);

    // Calculate stats
    const stats = {
      total: recentJobs.length,
      completed: 0,
      failed: 0,
      partial: 0,
      pending: 0,
      running: 0,
      meetingsFound: 0,
      meetingsCreated: 0,
      meetingsSkipped: 0,
      meetingsFailed: 0,
      avgDurationMs: 0,
    };

    let totalDuration = 0;
    let completedWithDuration = 0;

    for (const job of recentJobs) {
      // Status counts
      stats[job.status as keyof typeof stats]++;

      // Meeting stats
      stats.meetingsFound += job.meetingsFound ?? 0;
      stats.meetingsCreated += job.meetingsCreated ?? 0;
      stats.meetingsSkipped += job.meetingsSkipped ?? 0;
      stats.meetingsFailed += job.meetingsFailed ?? 0;

      // Duration
      if (job.completedAt && job.startedAt) {
        totalDuration += job.completedAt - job.startedAt;
        completedWithDuration++;
      }
    }

    stats.avgDurationMs =
      completedWithDuration > 0 ? Math.round(totalDuration / completedWithDuration) : 0;

    return stats;
  },
});

// ═══════════════════════════════════════════════════════════════
// GET JOB DETAIL - Full details for a single job
// ═══════════════════════════════════════════════════════════════
export const getJobDetail = query({
  args: {
    jobId: v.id("scrapeJobs"),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) return null;

    // Get municipality
    const municipality = await ctx.db.get(job.municipalityId);

    // Get meetings created by this job
    const meetings = await ctx.db
      .query("meetings")
      .filter((q) => q.eq(q.field("scrapeJobId"), args.jobId))
      .collect();

    return {
      ...job,
      municipality: municipality
        ? {
            _id: municipality._id,
            name: municipality.name,
            state: municipality.state,
            platform: municipality.platform,
          }
        : null,
      durationMs:
        job.completedAt && job.startedAt ? job.completedAt - job.startedAt : null,
      meetings: meetings.map((m) => ({
        _id: m._id,
        title: m.title,
        meetingDate: m.meetingDate,
        status: m.status,
      })),
    };
  },
});

// ═══════════════════════════════════════════════════════════════
// GET RUNNING JOBS - Currently running scrape jobs
// ═══════════════════════════════════════════════════════════════
export const getRunning = query({
  args: {},
  handler: async (ctx) => {
    const jobs = await ctx.db
      .query("scrapeJobs")
      .withIndex("by_status", (q) => q.eq("status", "running"))
      .collect();

    // Get municipality info
    const municipalityIds = [...new Set(jobs.map((j) => j.municipalityId))];
    const municipalities = await Promise.all(
      municipalityIds.map((id) => ctx.db.get(id))
    );

    const municipalityMap = new Map(
      municipalities
        .filter((m) => m !== null)
        .map((m) => [m!._id, { name: m!.name, state: m!.state }])
    );

    return jobs.map((job) => ({
      ...job,
      municipality: municipalityMap.get(job.municipalityId) ?? null,
      runningFor: job.startedAt ? Date.now() - job.startedAt : null,
    }));
  },
});
