// `node scripts/remote-proxy.ts <database id>`: Wrangler's own connection to one D1
// database, for remote-d1.ts (docs/runbooks/release.md, section 6). Node runs it,
// because Wrangler does not support Bun as its runtime. It deploys nothing: Wrangler
// uploads its proxy Worker as an edge preview, which answers only with the session's
// token, and listens on this machine's loopback. It ends when its input does, which
// is when whoever started it has ended, however that was.
import { startRemoteProxySession } from "wrangler";

const [id = "", ...more] = process.argv.slice(2);
const { CLOUDFLARE_ACCOUNT_ID: accountId, CLOUDFLARE_API_TOKEN: apiToken } =
	process.env;
if (!/^[0-9a-f-]{36}$/.test(id) || more.length > 0 || !accountId || !apiToken) {
	console.error("Use: bun run load … --stage (scripts/remote-d1.ts)");
	process.exit(1);
}

process.stdin.on("end", () => process.exit(0));
process.stdin.on("error", () => process.exit(0));
process.stdin.resume();

const session = await startRemoteProxySession(
	// One binding: this database, and nothing else of the account.
	{ DB: { type: "d1", database_id: id, remote: true } },
	{
		workerName: "civic-docket-load",
		auth: { accountId, apiToken: { apiToken } },
	},
);
await session.ready;
console.log(
	JSON.stringify({ connection: String(session.remoteProxyConnectionString) }),
);
