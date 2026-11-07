import { Effect } from "effect";
import { internal } from "./api";
import type { Endpoint } from "./contract";
import type { Bindings } from "./env";
import { invokeTrusted } from "./runtime";

const schedules = {
	"*/5 * * * *": internal.functions.email.actions.processImmediateAlerts,
	"0 7 * * *": internal.functions.ai.summarize.processNewlyPastMeetings,
	"0 8 * * *": internal.functions.email.actions.sendDailyDigest,
	"0 8 * * 1": internal.functions.email.actions.sendWeeklyDigest,
};
export async function runScheduled(
	env: Bindings,
	cron: string,
	scheduledTime: number,
) {
	if (env.SCHEDULED_ENABLED !== "true") return;
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
	const claimed = await env.DB.prepare(
		"UPDATE jobs SET lease_until=?, attempts=attempts+1 WHERE id IN (SELECT id FROM jobs WHERE due_at<=? AND (lease_until IS NULL OR lease_until<?) AND attempts<5 ORDER BY due_at LIMIT 3) RETURNING id,path,args,attempts",
	)
		.bind(now + 10 * 60000, now, now)
		.all<{
			id: string;
			path: string;
			args: string;
			attempts: number;
		}>();
	await Effect.runPromise(
		Effect.forEach(
			claimed.results,
			(job) =>
				Effect.tryPromise({
					try: async () => {
						try {
							await invokeTrusted(
								env,
								{ path: job.path, kind: "task" } as Endpoint<unknown, unknown>,
								JSON.parse(job.args),
							);
							await env.DB.prepare("DELETE FROM jobs WHERE id=?")
								.bind(job.id)
								.run();
						} catch {
							// Keep failed work inspectable; never log input bodies or credentials.
							await env.DB.prepare(
								"UPDATE jobs SET lease_until=NULL,due_at=?,error=? WHERE id=?",
							)
								.bind(
									Date.now() + 60000 * job.attempts,
									"Background procedure failed",
									job.id,
								)
								.run();
						}
					},
					catch: (error) =>
						error instanceof Error ? error : new Error("Job storage failed"),
				}),
			{ concurrency: 1, discard: true },
		),
	);
}
