// A D1 binding on this machine, asked over HTTP: the local database as Wrangler
// keeps it, or, with a connection that remote-d1.ts opened, a stage's own. The
// scripts and the checks use the same one.
import { join } from "node:path";
import { Miniflare, type RemoteProxyConnectionString } from "miniflare";

export type Value = string | number | null;
export type Statement = [sql: string, params: Value[]];
export type Rows = Record<string, unknown>[];
export interface Database {
	batch(statements: Statement[]): Promise<{ rows: Rows; written: number }[]>;
	rows(sql: string, ...params: Value[]): Promise<Rows>;
	close(): Promise<void>;
}

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

export const openDatabase = (state = ".wrangler/state"): Promise<Database> =>
	serve({
		d1Persist: join(state, "v3", "d1"),
		d1Databases: { DB: DATABASE },
	});

/** A stage's database, through the connection Wrangler made to it. */
export const openRemote = (id: string, connection: string): Promise<Database> =>
	serve({
		d1Databases: {
			DB: {
				id,
				remoteProxyConnectionString: new URL(
					connection,
				) as RemoteProxyConnectionString,
			},
		},
	});

async function serve(bindings: {
	d1Persist?: string;
	d1Databases:
		| Record<string, string>
		| Record<
				string,
				{ id: string; remoteProxyConnectionString: RemoteProxyConnectionString }
		  >;
}): Promise<Database> {
	const miniflare = new Miniflare({
		modules: true,
		script: BATCH_WORKER,
		compatibilityDate: "2026-01-14",
		host: "127.0.0.1",
		port: 0,
		...bindings,
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
