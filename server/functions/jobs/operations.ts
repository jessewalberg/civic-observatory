import { z } from "zod";
import { recoverInterrupted } from "../../jobs";
import { requireAdmin } from "../../lib/auth";
import { defineRead, defineTask, ServiceError } from "../../procedure";

export interface JobRow {
	id: string;
	path: string;
	state: string;
	attempts: number;
	error: string | null;
	due_at: number;
	lease_until: number | null;
	started_at: number | null;
	finished_at: number | null;
}
export const list = defineRead({
	args: {
		state: z.enum(["attention", "all"]).default("attention"),
		limit: z.number().int().min(1).max(100).default(50),
	},
	handler: async (ctx, args): Promise<JobRow[]> => {
		await requireAdmin(ctx);
		const rows = await ctx.env.DB.prepare(
			`SELECT id,path,state,attempts,error,due_at,lease_until,started_at,finished_at FROM jobs ${args.state === "attention" ? "WHERE state IN ('failed','interrupted') OR (state='running' AND lease_until<=?)" : "WHERE ? IS NOT NULL"} ORDER BY COALESCE(finished_at,started_at,due_at) DESC LIMIT ?`,
		)
			.bind(Date.now(), args.limit)
			.all<JobRow>();
		return rows.results;
	},
});
export const attempts = defineRead({
	args: { jobId: z.string() },
	handler: async (ctx, args) => {
		await requireAdmin(ctx);
		return (
			await ctx.env.DB.prepare(
				"SELECT attempt,state,error,started_at,finished_at,reconciliation FROM job_attempts WHERE job_id=? ORDER BY attempt DESC LIMIT 20",
			)
				.bind(args.jobId)
				.all<{
					attempt: number;
					state: string;
					error: string | null;
					started_at: number;
					finished_at: number | null;
					reconciliation: string | null;
				}>()
		).results;
	},
});
export const retry = defineTask({
	args: {
		jobId: z.string(),
		externalEffectsChecked: z.literal(true),
		reconciliation: z.string().trim().min(12).max(400),
	},
	handler: async (ctx, args) => {
		await requireAdmin(ctx);
		await recoverInterrupted(ctx.env);
		// No automatic replay after either a partial failure or a kill. The owner
		// must inspect provider results first; HTTP success alone is not idempotency.
		const token = crypto.randomUUID();
		const result = await ctx.env.DB.batch([
			ctx.env.DB.prepare(
				"UPDATE jobs SET state='pending',due_at=?,token=?,lease_until=NULL,started_at=NULL,finished_at=NULL WHERE id=? AND (state='failed' OR (state='interrupted' AND lease_until<=?))",
			).bind(Date.now(), token, args.jobId, Date.now()),
			ctx.env.DB.prepare(
				"UPDATE job_attempts SET reconciliation=? WHERE job_id=? AND attempt=(SELECT attempts FROM jobs WHERE id=? AND token=? AND state='pending')",
			).bind(args.reconciliation, args.jobId, args.jobId, token),
		]);
		if (!result[0].meta.changes)
			throw new ServiceError(
				409,
				"Job is not safely retryable; a running or already queued attempt cannot be replayed",
			);
		return { queued: true };
	},
});
