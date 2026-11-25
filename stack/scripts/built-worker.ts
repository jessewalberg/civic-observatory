// The built Worker in local workerd through Miniflare, for the checks:
// migrations on a disposable D1 store, a production build with local bindings,
// and what a stage binds on top of it. Every request the Worker sends is
// recorded and refused. No cloud account, token or provider call.
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, readdirSync, rmSync } from "node:fs";
import type { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import { Miniflare, Response as WorkerResponse } from "miniflare";
import { unstable_getMiniflareWorkerOptions } from "wrangler";
import { CALLS } from "../src/lib/limits";
import { BATCH_WORKER, type Rows, type Value } from "./local-d1";

const root = fileURLToPath(new URL("..", import.meta.url));

export interface WorkerSettings {
	/** Plain bindings on top of the build's own. */
	bindings?: Record<string, string>;
	/** Bind the rate limit, or a service that cannot answer it. */
	limit?: "bound" | "broken";
	/** Serve https, with a certificate of Miniflare's own. */
	https?: boolean;
	/** Bind another, empty database: every read fails. */
	noData?: boolean;
}

function tool(command: string, args: string[]) {
	const result = spawnSync(`node_modules/.bin/${command}`, args, {
		cwd: root,
		env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
		encoding: "utf8",
	});
	if (result.status !== 0)
		throw new Error(
			`${command} ${args.join(" ")} failed (${result.status})\n${result.stdout}\n${result.stderr}`,
		);
}

export async function startBuiltWorker(port: number, first: WorkerSettings) {
	/** Relative to stack/: what `--state` of the scripts takes. */
	const state = `.smoke/built-${randomUUID()}`;
	/** Requests the Worker sent, as "METHOD origin/path". */
	const egress: string[] = [];
	/** Lines the Worker wrote to its console. */
	const lines: string[] = [];
	const read = (stream: Readable) => {
		let rest = "";
		stream.on("data", (chunk: Buffer) => {
			const parts = (rest + chunk.toString("utf8")).split("\n");
			rest = parts.pop() ?? "";
			lines.push(...parts);
		});
	};

	function options(settings: WorkerSettings) {
		const built = unstable_getMiniflareWorkerOptions(
			`${root}dist/server/wrangler.json`,
		);
		const { modulesRules: _, ...worker } = built.workerOptions;
		const modules = readdirSync(`${root}dist/server`, { recursive: true })
			.map(String)
			.filter((path) => path.endsWith(".js") && path !== "index.js");
		return {
			host: "127.0.0.1",
			port,
			https: settings.https ?? false,
			d1Persist: `${root}${state}/v3/d1`,
			handleRuntimeStdio(stdout: Readable, stderr: Readable) {
				read(stdout);
				read(stderr);
			},
			workers: [
				{
					...worker,
					name: "app",
					rootPath: `${root}dist/server`,
					modules: ["index.js", ...modules].map((path) => ({
						type: "ESModule" as const,
						path,
					})),
					bindings: { ...worker.bindings, ...settings.bindings },
					...(settings.noData
						? { d1Databases: { DB: "00000000-0000-0000-0000-00000000000e" } }
						: {}),
					...(settings.limit === "bound"
						? {
								ratelimits: {
									[CALLS.binding]: {
										simple: { limit: CALLS.calls, period: CALLS.period },
									},
								},
							}
						: {}),
					...(settings.limit === "broken"
						? { serviceBindings: { [CALLS.binding]: "ops" } }
						: {}),
					outboundService(request: { method: string; url: string }) {
						const url = new URL(request.url);
						egress.push(`${request.method} ${url.origin}${url.pathname}`);
						return new WorkerResponse("refused", { status: 599 });
					},
				},
				{
					name: "ops",
					compatibilityDate: "2026-01-14",
					modules: true,
					d1Databases: worker.d1Databases,
					script: BATCH_WORKER,
				},
			],
		} as ConstructorParameters<typeof Miniflare>[0];
	}

	let settings = first;
	let miniflare: Miniflare | undefined;
	const stop = async () => {
		await miniflare?.dispose();
		miniflare = undefined;
		rmSync(`${root}${state}`, { recursive: true, force: true });
	};
	const start = async () => {
		miniflare = new Miniflare(options(settings));
		await miniflare.ready;
	};
	try {
		mkdirSync(`${root}${state}`, { recursive: true });
		tool("wrangler", [
			"d1",
			"migrations",
			"apply",
			"DB",
			"--local",
			"--persist-to",
			state,
		]);
		tool("vite", ["build"]);
		await start();
	} catch (error) {
		await stop();
		throw error;
	}
	const base = () => `${settings.https ? "https" : "http"}://127.0.0.1:${port}`;

	/** A request to the Worker; the certificate here is Miniflare's own. */
	const send = (path: string, init: RequestInit = {}) =>
		fetch(`${base()}${path}`, {
			redirect: "manual",
			// A refused body stays unread, and workerd closes the connection.
			keepalive: false,
			...init,
			...(settings.https ? { tls: { rejectUnauthorized: false } } : {}),
		} as RequestInit);

	return {
		base,
		egress,
		lines,
		send,
		state,
		stop,
		/** Restarts the Worker with other bindings; D1 keeps its rows. */
		async configure(next: WorkerSettings) {
			settings = next;
			await miniflare?.setOptions(options(settings));
		},
		/** Runs something that opens this D1 itself, with the Worker stopped. */
		async whileStopped<T>(run: () => T | Promise<T>): Promise<T> {
			await miniflare?.dispose();
			miniflare = undefined;
			try {
				return await run();
			} finally {
				await start();
			}
		},
		/** One statement against the Worker's D1. */
		async sql(statement: string, ...params: Value[]): Promise<Rows> {
			const response = await send("/", {
				method: "POST",
				headers: { "MF-Route-Override": "ops" },
				body: JSON.stringify([[statement, params]]),
			});
			if (!response.ok) throw new Error(await response.text());
			const [result] = (await response.json()) as { rows: Rows }[];
			return result?.rows ?? [];
		},
	};
}

export type BuiltWorker = Awaited<ReturnType<typeof startBuiltWorker>>;
