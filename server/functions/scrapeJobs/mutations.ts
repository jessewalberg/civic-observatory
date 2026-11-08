import { z } from "zod";
import { internal } from "../../api";
import { entityId } from "../../id";
import { requireAdmin } from "../../lib/auth";
import type { Id } from "../../model";
import { defineTask, defineWrite, privateWrite } from "../../procedure";

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
export const create = privateWrite({
	args: {
		municipalityId: entityId("municipalities"),
		triggeredBy: z.union([
			z.literal("cron"),
			z.literal("manual"),
			z.literal("webhook"),
		]),
		triggeredByUserId: entityId("users").optional(),
	},
	handler: async (ctx, args) => {
		const jobId = await ctx.data.add("scrapeJobs", {
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
export const update = privateWrite({
	args: {
		jobId: entityId("scrapeJobs"),
		status: z
			.union([
				z.literal("pending"),
				z.literal("running"),
				z.literal("completed"),
				z.literal("failed"),
				z.literal("partial"),
			])
			.optional(),
		startedAt: z.number().optional(),
		completedAt: z.number().optional(),
		meetingsFound: z.number().optional(),
		meetingsCreated: z.number().optional(),
		meetingsSkipped: z.number().optional(),
		meetingsFailed: z.number().optional(),
		errors: z
			.array(
				z.object({
					message: z.string(),
					url: z.string().optional(),
					timestamp: z.number(),
				}),
			)
			.optional(),
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
		await ctx.data.update(jobId, cleanUpdates);
	},
});
// ═══════════════════════════════════════════════════════════════
// CANCEL JOB - Mark a running job as cancelled (admin)
// ═══════════════════════════════════════════════════════════════
export const cancel = defineWrite({
	args: {
		jobId: entityId("scrapeJobs"),
	},
	handler: async (ctx, args) => {
		// Was an UNAUTHENTICATED public mutation despite "cancelled by admin".
		await requireAdmin(ctx, "Admin access required");
		const job = await ctx.data.find(args.jobId);
		if (!job) {
			throw new Error("Job not found");
		}
		// Can only cancel pending or running jobs
		if (job.status !== "pending" && job.status !== "running") {
			throw new Error(`Cannot cancel job with status: ${job.status}`);
		}
		await ctx.data.update(args.jobId, {
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
// RETRY JOB - Retry a failed scrape job (admin action)
// ═══════════════════════════════════════════════════════════════
export const retry = defineTask({
	args: {
		jobId: entityId("scrapeJobs"),
	},
	handler: async (
		ctx,
		args,
	): Promise<{
		scheduled: boolean;
		municipalityId?: Id<"municipalities">;
		error?: string;
	}> => {
		// Verify admin
		const user = await ctx.call(
			internal.functions.users.queries.getCurrentInternal,
			{},
		);
		if (!user?.isAdmin) {
			throw new Error("Unauthorized: Admin access required");
		}
		// Get the failed job
		const job = await ctx.call(internal.functions.scrapers.queries.getJob, {
			jobId: args.jobId,
		});
		if (!job) {
			return { scheduled: false, error: "Job not found" };
		}
		if (job.status !== "failed" && job.status !== "partial") {
			return {
				scheduled: false,
				error: `Cannot retry job with status: ${job.status}`,
			};
		}
		// Schedule the scraper
		await ctx.jobs.enqueue(0, internal.functions.scrapers.actions.runScraper, {
			municipalityId: job.municipalityId,
			triggeredBy: "manual",
			triggeredByUserId: user._id,
		});
		return { scheduled: true, municipalityId: job.municipalityId };
	},
});
// ═══════════════════════════════════════════════════════════════
// DELETE OLD JOBS - Clean up old job records (admin/cron)
// ═══════════════════════════════════════════════════════════════
export const deleteOld = privateWrite({
	args: {
		olderThan: z.number(), // Timestamp - delete jobs older than this
		limit: z.number().optional(),
	},
	handler: async (ctx, args) => {
		const limit = args.limit ?? 100;
		const oldJobs = await ctx.data
			.select("scrapeJobs")
			.orderBy(["createdAt", "_creationTime", "_id"])
			.direction("asc")
			.limit(limit * 2);
		// Filter to old jobs
		const toDelete = oldJobs
			.filter((job) => job.createdAt < args.olderThan)
			.slice(0, limit);
		// Delete them
		for (const job of toDelete) {
			await ctx.data.remove(job._id);
		}
		return { deleted: toDelete.length };
	},
});
// ═══════════════════════════════════════════════════════════════
// CLEAR STUCK JOBS - Mark stuck running jobs as failed (cron)
// ═══════════════════════════════════════════════════════════════
export const clearStuck = privateWrite({
	args: {
		stuckThreshold: z.number().optional(), // ms - jobs running longer than this are stuck
	},
	handler: async (ctx, args) => {
		const threshold = args.stuckThreshold ?? 30 * 60 * 1000; // Default: 30 minutes
		const now = Date.now();
		const runningJobs = await ctx.data
			.select("scrapeJobs")
			.orderBy(["status", "_creationTime", "_id"])
			.where("status", "=", "running")
			.all();
		let cleared = 0;
		for (const job of runningJobs) {
			const runningTime = job.startedAt ? now - job.startedAt : 0;
			if (runningTime > threshold) {
				await ctx.data.update(job._id, {
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
export const triggerScrape = defineTask({
	args: {
		municipalityId: entityId("municipalities"),
	},
	handler: async (ctx, args): Promise<TriggerScrapeResult> => {
		// Verify user is admin
		const user = await ctx.call(
			internal.functions.users.queries.getCurrentInternal,
			{},
		);
		if (!user?.isAdmin) {
			throw new Error("Unauthorized: Admin access required");
		}
		// Trigger the scraper
		const result: TriggerScrapeResult = await ctx.call(
			internal.functions.scrapers.actions.runScraper,
			{
				municipalityId: args.municipalityId,
				triggeredBy: "manual",
				triggeredByUserId: user._id,
			},
		);
		return result;
	},
});
