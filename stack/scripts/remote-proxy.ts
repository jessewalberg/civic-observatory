// `node scripts/remote-proxy.ts <database id> <until>`: Wrangler's connection to one D1
// database, for remote-d1.ts (docs/runbooks/release.md, section 6). Node runs it, because
// Wrangler does not support Bun as its runtime. It deploys nothing: Wrangler uploads the
// proxy (remote-proxy-worker.ts) as an edge preview, which answers only with the session's
// token and only until the deadline, and listens on this machine's loopback. It ends when
// its input does, which is when whoever started it has ended, however that was.
import { fileURLToPath } from "node:url";
import { unstable_startWorker } from "wrangler";

const [id = "", until = "", ...more] = process.argv.slice(2);
const { CLOUDFLARE_ACCOUNT_ID: accountId, CLOUDFLARE_API_TOKEN: apiToken } =
	process.env;
if (
	!/^[0-9a-f-]{36}$/.test(id) ||
	!/^\d{13}$/.test(until) ||
	more.length > 0 ||
	!accountId ||
	!apiToken
) {
	console.error("Use: bun run load … --stage (scripts/remote-d1.ts)");
	process.exit(1);
}

process.stdin.on("end", () => process.exit(0));
process.stdin.on("error", () => process.exit(0));
process.stdin.resume();
// Ten minutes from here, whatever this machine's clock says.
setTimeout(() => process.exit(0), 600_000);

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));
// As Wrangler's own startRemoteProxySession does, with our entry.
const worker = await unstable_startWorker({
	// Never deployed: the name of the edge preview alone.
	name: "civic-docket-load",
	entrypoint: here("remote-proxy-worker.ts"),
	config: here(
		"../node_modules/wrangler/templates/remoteBindings/wrangler.jsonc",
	),
	compatibilityDate: "2025-04-28",
	// One binding of the account's: this database, as the service behind it.
	bindings: {
		DB: { type: "d1", database_id: id, raw: true },
		UNTIL: { type: "plain_text", value: until },
	},
	dev: {
		remote: "minimal",
		auth: { accountId, apiToken: { apiToken } },
		server: { hostname: "127.0.0.1", port: 0 },
		inspector: false,
		logLevel: "error",
	},
});
worker.raw.addListener("error", (event: unknown) => {
	const { cause, reason } = event as { cause?: Error; reason?: string };
	console.error(`${reason ?? ""} ${cause?.message ?? ""}`);
	process.exit(1);
});
await worker.raw.proxy.localServerReady.promise;
console.log(JSON.stringify({ connection: String(await worker.url) }));
