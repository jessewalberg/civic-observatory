// A local D1 as Wrangler keeps it, for scripts/load-docket.ts and
// scripts/report-docket.ts. Nothing here is remote.
import { join } from "node:path";
import { Miniflare } from "miniflare";

export type Value = string | number | null;
export type Statement = [sql: string, params: Value[]];
export type Rows = Record<string, unknown>[];

// Asked over HTTP: Miniflare's own binding proxy blocks this thread for every
// call. One batch is one transaction.
export const BATCH_WORKER = `export default {
	async fetch(request, env) {
		const statements = await request.json();
		try {
			const results = await env.DB.batch(
				statements.map(([sql, params]) => env.DB.prepare(sql).bind(...params)),
			);
			return Response.json(results.map((result) => ({
				rows: result.results,
				written: result.meta.rows_written,
			})));
		} catch (error) {
			return new Response(String(error), { status: 400 });
		}
	},
};`;

/** wrangler.jsonc's, so the database that `bun run db:local` made is found. */
const DATABASE = "00000000-0000-0000-0000-000000000001";

export async function openDatabase(state = ".wrangler/state") {
	const miniflare = new Miniflare({
		modules: true,
		script: BATCH_WORKER,
		compatibilityDate: "2026-01-14",
		host: "127.0.0.1",
		port: 0,
		d1Persist: join(state, "v3", "d1"),
		d1Databases: { DB: DATABASE },
	});
	const { origin } = await miniflare.ready;
	const batch = async (statements: Statement[]) => {
		const response = await fetch(origin, {
			method: "POST",
			body: JSON.stringify(statements),
			keepalive: false,
		});
		if (!response.ok) throw new Error(`D1: ${await response.text()}`);
		return (await response.json()) as { rows: Rows; written: number }[];
	};
	const close = async () => {
		if (open.delete(close)) await miniflare.dispose();
	};
	open.add(close);
	return {
		batch,
		rows: async (sql: string, ...params: Value[]) =>
			(await batch([[sql, params]]))[0]?.rows ?? [],
		close,
	};
}

const open = new Set<() => Promise<void>>();
/** Closes what a check that failed left open, so that it can end. */
export async function closeDatabases() {
	for (const close of [...open]) await close();
}
