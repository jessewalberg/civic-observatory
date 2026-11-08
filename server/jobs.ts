import { internal } from "./api";
import type { Endpoint } from "./contract";
import type { Bindings } from "./env";
import { invokeTrusted } from "./runtime";

// A scheduled Worker has a 15-minute wall limit. Never automatically reclaim an
// ambiguous attempt: a provider may already have charged or delivered its work.
export const JOB_LEASE_MS = 20 * 60_000;
const schedules = {
	"*/5 * * * *": internal.functions.email.actions.processImmediateAlerts,
	"0 7 * * *": internal.functions.ai.summarize.processNewlyPastMeetings,
	"0 8 * * *": internal.functions.email.actions.sendDailyDigest,
	"0 8 * * 1": internal.functions.email.actions.sendWeeklyDigest,
};
export function failureDetail(env: Bindings, failure: unknown): string {
	let message =
		failure instanceof Error
			? `${failure.name}: ${failure.message}`
			: String(failure);
	for (const [key, secret] of Object.entries(env))
		if (
			/SECRET|TOKEN|API_KEY/i.test(key) &&
			typeof secret === "string" &&
			secret.length > 3
		)
			message = message.replaceAll(secret, "[redacted]");
	return message
		.replace(/https?:\/\/[^\s"<>]+/g, (value) => {
			try {
				const url = new URL(value);
				return `${url.protocol}//${url.hostname}${url.pathname}`;
			} catch {
				return "[URL redacted]";
			}
		})
		.replace(
			/(?:Bearer\s+|(?:sk|pk)_(?:test|live)_)[\w.-]+/gi,
			"[credential redacted]",
		)
		.slice(0, 1500);
}
export async function recoverInterrupted(env: Bindings) {
	const now = Date.now();
	await env.DB.batch([
		env.DB.prepare(
			"INSERT OR IGNORE INTO job_attempts(job_id,attempt,state,error,started_at,finished_at) SELECT id,attempts,'interrupted','Worker stopped before recording a result; reconcile external effects before retrying',COALESCE(started_at,due_at),? FROM jobs WHERE state='running' AND lease_until<=?",
		).bind(now, now),
		env.DB.prepare(
			"UPDATE job_attempts SET state='interrupted',finished_at=?,error='Worker stopped before recording a result; reconcile external effects before retrying' WHERE state='running' AND job_id IN (SELECT id FROM jobs WHERE state='running' AND lease_until<=?)",
		).bind(now, now),
		env.DB.prepare(
			"UPDATE jobs SET state='interrupted',finished_at=?,error='Worker stopped before recording a result; reconcile external effects before retrying' WHERE state='running' AND lease_until<=?",
		).bind(now, now),
	]);
}
export async function runScheduled(
	env: Bindings,
	cron: string,
	scheduledTime: number,
) {
	if (env.SCHEDULED_ENABLED !== "true") return;
	await recoverInterrupted(env);
	const endpoint = schedules[cron as keyof typeof schedules];
	if (endpoint)
		await env.DB.prepare(
			"INSERT OR IGNORE INTO jobs(id,path,args,due_at) VALUES (?,?,?,?)",
		)
			.bind(
				`cron:${cron}:${scheduledTime}`,
				endpoint.path,
				JSON.stringify(cron === "0 7 * * *" ? { limit: 20 } : {}),
				scheduledTime,
			)
			.run();
	const now = Date.now();
	const token = crypto.randomUUID();
	// Claim only the job being executed. A second cron cannot steal a running job,
	// even after its lease: expiration moves it to manual reconciliation instead.
	const job = await env.DB.prepare(
		"UPDATE jobs SET state='running',token=?,lease_until=?,started_at=?,finished_at=NULL,error='Running; interruption will require reconciliation',attempts=attempts+1 WHERE id=(SELECT id FROM jobs WHERE state='pending' AND due_at<=? ORDER BY due_at,id LIMIT 1) RETURNING id,path,args,attempts",
	)
		.bind(token, now + JOB_LEASE_MS, now, now)
		.first<{ id: string; path: string; args: string; attempts: number }>();
	if (!job) return;
	// The claim itself is durable if the Worker dies before this history insert.
	await env.DB.prepare(
		"INSERT INTO job_attempts(job_id,attempt,state,started_at) VALUES(?,?,'running',?)",
	)
		.bind(job.id, job.attempts, now)
		.run();
	let error: string | null = null;
	try {
		const result = await invokeTrusted(
			env,
			{ path: job.path, kind: "task" } as Endpoint<unknown, unknown>,
			JSON.parse(job.args),
		);
		if (
			result &&
			typeof result === "object" &&
			"success" in result &&
			result.success === false
		)
			throw new Error(
				"error" in result
					? String(result.error)
					: "Procedure reported an unsuccessful result",
			);
	} catch (failure) {
		error = failureDetail(env, failure);
	}
	const state = error ? "failed" : "completed";
	const finished = Date.now();
	await env.DB.batch([
		env.DB.prepare(
			"UPDATE jobs SET state=?,error=?,finished_at=? WHERE id=? AND token=? AND state='running'",
		).bind(state, error, finished, job.id, token),
		env.DB.prepare(
			"UPDATE job_attempts SET state=?,error=?,finished_at=? WHERE job_id=? AND attempt=? AND EXISTS(SELECT 1 FROM jobs WHERE id=? AND token=? AND state=?)",
		).bind(state, error, finished, job.id, job.attempts, job.id, token, state),
	]);
}
