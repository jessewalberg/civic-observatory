import { action, mutation, internalMutation } from "../../_generated/server";
import { internal } from "../../_generated/api";
import { v } from "convex/values";
import type { Id } from "../../_generated/dataModel";

// Result type for trigger scrape action
interface TriggerScrapeResult {
  success: boolean;
  error?: string;
  jobId?: Id<"scrapeJobs">;
  stats?: {
    found: number;
    created: number;
    skipped: number;
    failed: number;
  };
}

// ═══════════════════════════════════════════════════════════════
// CREATE JOB - Create a new scrape job (internal, used by orchestration)
// ═══════════════════════════════════════════════════════════════
export const create = internalMutation({
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
// UPDATE JOB - Update job status and results (internal)
// ═══════════════════════════════════════════════════════════════
export const update = internalMutation({
  args: {
    jobId: v.id("scrapeJobs"),
    status: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("running"),
        v.literal("completed"),
        v.literal("failed"),
        v.literal("partial")
      )
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
// CANCEL JOB - Mark a running job as cancelled (admin)
// ═══════════════════════════════════════════════════════════════
export const cancel = mutation({
  args: {
    jobId: v.id("scrapeJobs"),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) {
      throw new Error("Job not found");
    }

    // Can only cancel pending or running jobs
    if (job.status !== "pending" && job.status !== "running") {
      throw new Error(`Cannot cancel job with status: ${job.status}`);
    }

    await ctx.db.patch(args.jobId, {
      status: "failed",
      completedAt: Date.now(),
      errors: [
        ...(job.errors ?? []),
        {
          message: "Job cancelled by admin",
          timestamp: Date.now(),
        },
      ],
    });

    return { success: true };
  },
});

// ═══════════════════════════════════════════════════════════════
// RETRY JOB - Create a new job to retry a failed one (admin)
// ═══════════════════════════════════════════════════════════════
export const retry = mutation({
  args: {
    jobId: v.id("scrapeJobs"),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) {
      throw new Error("Job not found");
    }

    // Can only retry failed or partial jobs
    if (job.status !== "failed" && job.status !== "partial") {
      throw new Error(`Cannot retry job with status: ${job.status}`);
    }

    // Create a new job for the same municipality
    const newJobId = await ctx.db.insert("scrapeJobs", {
      municipalityId: job.municipalityId,
      status: "pending",
      triggeredBy: "manual",
      createdAt: Date.now(),
    });

    return { newJobId, municipalityId: job.municipalityId };
  },
});

// ═══════════════════════════════════════════════════════════════
// DELETE OLD JOBS - Clean up old job records (admin/cron)
// ═══════════════════════════════════════════════════════════════
export const deleteOld = internalMutation({
  args: {
    olderThan: v.number(), // Timestamp - delete jobs older than this
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 100;

    const oldJobs = await ctx.db
      .query("scrapeJobs")
      .withIndex("by_created")
      .order("asc")
      .take(limit * 2);

    // Filter to old jobs
    const toDelete = oldJobs
      .filter((job) => job.createdAt < args.olderThan)
      .slice(0, limit);

    // Delete them
    for (const job of toDelete) {
      await ctx.db.delete(job._id);
    }

    return { deleted: toDelete.length };
  },
});

// ═══════════════════════════════════════════════════════════════
// CLEAR STUCK JOBS - Mark stuck running jobs as failed (cron)
// ═══════════════════════════════════════════════════════════════
export const clearStuck = internalMutation({
  args: {
    stuckThreshold: v.optional(v.number()), // ms - jobs running longer than this are stuck
  },
  handler: async (ctx, args) => {
    const threshold = args.stuckThreshold ?? 30 * 60 * 1000; // Default: 30 minutes
    const now = Date.now();

    const runningJobs = await ctx.db
      .query("scrapeJobs")
      .withIndex("by_status", (q) => q.eq("status", "running"))
      .collect();

    let cleared = 0;

    for (const job of runningJobs) {
      const runningTime = job.startedAt ? now - job.startedAt : 0;

      if (runningTime > threshold) {
        await ctx.db.patch(job._id, {
          status: "failed",
          completedAt: now,
          errors: [
            ...(job.errors ?? []),
            {
              message: `Job marked as stuck after ${Math.round(runningTime / 60000)} minutes`,
              timestamp: now,
            },
          ],
        });
        cleared++;
      }
    }

    return { cleared };
  },
});

// ═══════════════════════════════════════════════════════════════
// TRIGGER SCRAPE - Admin action to trigger scrape for a municipality
// ═══════════════════════════════════════════════════════════════
export const triggerScrape = action({
  args: {
    municipalityId: v.id("municipalities"),
    workosUserId: v.string(),
  },
  handler: async (ctx, args): Promise<TriggerScrapeResult> => {
    // Verify user is admin
    const user = await ctx.runQuery(
      internal.functions.users.queries.getByWorkosUserIdInternal,
      { workosUserId: args.workosUserId }
    );

    if (!user?.isAdmin) {
      throw new Error("Unauthorized: Admin access required");
    }

    // Trigger the scraper
    const result: TriggerScrapeResult = await ctx.runAction(
      internal.functions.scrapers.actions.runScraper,
      {
        municipalityId: args.municipalityId,
        triggeredBy: "manual",
        triggeredByUserId: user._id,
      }
    );

    return result;
  },
});
