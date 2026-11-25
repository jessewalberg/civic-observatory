// production.yml's wait in the middle of the first cutover (docs/runbooks/release.md,
// section 3): asks the new Worker's own address, every 20 seconds for up to 60
// minutes, until the commit this run deployed names a release with enough items. The
// operator loads it meanwhile (section 6). Public requests only, no credential; what
// it prints is counts.
//   bun scripts/await-docket.ts
// Writes `docket` (the release as the later checks expect it) to $GITHUB_OUTPUT. The
// rehearsal's address, on this machine, gets seconds.
import { appendFileSync } from "node:fs";
import { workersDev } from "./cloudflare-api";
import { type Docket, MIN_ITEMS, readDocket } from "./docket-health";
import { complain, say } from "./public-log";

const expected = process.env.APP_RELEASE ?? "";

/** What the new Worker says now: its release, or why that is not it yet. */
async function look(base: string): Promise<Docket | string> {
	const response = await fetch(`${base}/api/health`, {
		redirect: "manual",
		keepalive: false,
		headers: {
			Accept: "application/json",
			"Cache-Control": "no-cache",
			"User-Agent": "civic-observatory-release/1",
		},
		signal: AbortSignal.timeout(15_000),
	}).catch(() => undefined);
	if (!response) return "no answer";
	const body = await response.text().catch(() => "");
	const commit = response.headers.get("x-commit-sha");
	if (commit !== expected)
		return `${response.status}, ${commit ? `commit ${commit.slice(0, 12)}` : "not the docket"}`;
	if (response.status !== 200) return `${response.status}, no database yet`;
	const { docket, commit: stated } = readDocket(body);
	if (stated !== expected) return "another commit's report";
	if (!docket) return "no release is loaded";
	if (docket.items < MIN_ITEMS)
		return `release ${docket.release} has ${docket.items} items, fewer than ${MIN_ITEMS}`;
	return docket;
}

async function main() {
	if (process.argv.length !== 2)
		throw new Error("Use: bun scripts/await-docket.ts");
	if (!/^[0-9a-f]{40}$/.test(expected))
		throw new Error("Set APP_RELEASE to the full deployed commit SHA.");
	const base = workersDev();
	const local = base.startsWith("http://127.0.0.1");
	const step = local ? 100 : 20_000;
	const deadline = Date.now() + (local ? 3_000 : 60 * 60_000);
	say(
		`Waiting for the load, up to 60 minutes: bun run load <file> --stage production --production-approved ${expected}`,
	);
	let said = "";
	for (;;) {
		const seen = await look(base);
		if (typeof seen !== "string") {
			say(
				`Loaded: release ${seen.release}, ${seen.items} items, ${seen.towns} towns.`,
			);
			if (process.env.GITHUB_OUTPUT)
				appendFileSync(
					process.env.GITHUB_OUTPUT,
					`docket=${seen.release}:${seen.items}:${seen.towns}\n`,
				);
			return;
		}
		if (seen !== said) say(`not yet: ${seen}`);
		said = seen;
		if (Date.now() > deadline)
			throw new Error(
				`The load never came (last: ${seen}). Nothing was moved; load it, and run this again (docs/runbooks/release.md, section 3).`,
			);
		await new Promise((resolve) => setTimeout(resolve, step));
	}
}

main().catch((error: unknown) => {
	complain(error, "The wait failed.");
	process.exitCode = 1;
});
