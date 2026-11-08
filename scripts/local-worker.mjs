import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

// Use the runtime shipped with the pinned Wrangler, not a mocked procedure/store.
const require = createRequire(import.meta.url);
const wranglerRoot = path.dirname(require.resolve("wrangler/package.json"));
const runtime = await import(
	pathToFileURL(require.resolve("miniflare", { paths: [wranglerRoot] })).href
);
export const NetworkResponse = runtime.Response;
export async function localWorker({
	state,
	bindings,
	outbound,
	initialize = true,
}) {
	const root = path.resolve("dist/server");
	const modules = [
		"index.js",
		...fs
			.readdirSync(root, { recursive: true })
			.filter((file) => file.endsWith(".js") && file !== "index.js"),
	].map((file) => ({
		type: "ESModule",
		path: path.join(root, file),
		contents: fs.readFileSync(path.join(root, file), "utf8"),
	}));
	let current = { ...bindings };
	const options = () => ({
		...runtime.convertV4MiniflareOptions({
			name: "civic-local",
			modules,
			modulesRoot: root,
			compatibilityDate: "2026-11-07",
			compatibilityFlags: ["nodejs_compat"],
			bindings: current,
			d1Databases: ["DB"],
			r2Buckets: ["DOCUMENTS"],
			outboundService: outbound,
			log: new runtime.Log(0),
		}),
		resourcePersistencePath: path.join(state, "resources"),
		isolatedResourcePersistencePath: path.join(state, "isolated"),
	});
	const mf = new runtime.Miniflare(options());
	try {
		let db = await mf.getD1Database("DB");
		for (const file of initialize
			? fs
					.readdirSync("migrations")
					.filter((file) => file.endsWith(".sql"))
					.sort()
			: []) {
			let sql = "";
			for (const line of fs
				.readFileSync(path.join("migrations", file), "utf8")
				.split("\n")) {
				sql += `${line}\n`;
				if (
					line.trim().endsWith(";") &&
					(!sql.includes("CREATE TRIGGER") || line.trim() === "END;")
				) {
					await db.prepare(sql).run();
					sql = "";
				}
			}
		}
		return {
			get db() {
				return db;
			},
			mf,
			fetch: (...args) => mf.dispatchFetch(...args),
			scheduled: async () => {
				await (await mf.getWorker()).scheduled({
					cron: "* * * * *",
					scheduledTime: Date.now(),
				});
			},
			setBindings: async (updates) => {
				current = { ...current, ...updates };
				await mf.setOptions(options());
				db = await mf.getD1Database("DB");
			},
			close: () => mf.dispose(),
		};
	} catch (error) {
		await mf.dispose();
		throw error;
	}
}
