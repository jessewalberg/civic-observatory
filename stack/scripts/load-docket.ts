// `bun run load <file> [--shrink "<why>"]`: loads one docket-v1 bundle into the local
// D1 (`--state <folder>` for another), or with `--stage preview` or
// `--stage production --production-approved <commit>` into a stage's (README.md,
// "Data"; docs/runbooks/release.md, section 6). The file is read and refused on this
// machine, before any call; the load itself is one batch, which is one transaction.
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import {
	CURRENT,
	checkShrink,
	checkStored,
	loadStatements,
	NOW,
	Refused,
	readBundle,
	readCurrent,
	readNow,
	SESSION_SECONDS,
	STORED,
} from "./docket-bundle";
import type { Database, Statement } from "./local-d1";
import { complainHere, told } from "./public-log";
import { chooseStage, STAGE_OPTIONS } from "./remote-d1";

/** The current release, what is stored, and the database's own time. */
async function look(database: Database) {
	const [current, now, stored] = await database.batch([CURRENT, NOW, STORED]);
	return {
		current: readCurrent(current?.rows),
		now: readNow(now?.rows),
		stored: stored?.rows,
	};
}

/** The load's batch; undefined if it was done and only its answer was lost. */
async function run(
	database: Database,
	statements: Statement[],
	digest: string,
	until: string,
) {
	try {
		return await database.batch(statements);
	} catch (error) {
		const why = error instanceof Error ? error.message : "no answer";
		const seen = await look(database).catch(() => undefined);
		if (seen?.current?.digest === digest) return undefined;
		throw new Error(
			`The load failed, whole: ${why}\n${
				seen === undefined
					? "The current release could not be read."
					: `Release ${seen.current?.seq ?? "none"} is there.`
			} If the database never answered, the load may still be made until ${until}, and not after. Run the same command again: it loads, or says that it is there.`,
		);
	}
}

async function main() {
	const { values, positionals } = parseArgs({
		allowPositionals: true,
		options: { ...STAGE_OPTIONS, shrink: { type: "string" } },
	});
	const { open } = chooseStage(values);
	const [file] = positionals;
	if (!file || positionals.length > 1)
		throw new Error(
			'Use: bun run load <file> [--shrink "<why>"] [--state <folder>] [--stage preview|production [--production-approved <commit>]]',
		);
	const shrink = values.shrink?.trim();
	if (values.shrink !== undefined && (!shrink || shrink.length < 10))
		throw new Error("--shrink needs a reason.");
	let raw: unknown;
	try {
		raw = JSON.parse(readFileSync(file, "utf8"));
	} catch {
		throw new Refused(["the file is not JSON, or cannot be read"]);
	}
	const bundle = readBundle(raw);
	const database = await open();
	try {
		const { current, now, stored } = await look(database);
		if (current?.digest === bundle.digest) {
			const counts = checkStored(bundle, stored, false);
			console.log(
				`Release ${current.seq} is this file already (${counts}); nothing was written.`,
			);
			return;
		}
		checkShrink(bundle, current, shrink);
		const last = SESSION_SECONDS * 1_000;
		const until = `${new Date(Date.parse(now) + last).toISOString()} by the database's clock, ${new Date(Date.now() + last).toISOString()} by this machine's`;
		// Said before the batch, so a check can interrupt it there.
		console.log(`Loading ${bundle.items.length} items.`);
		const results = await run(
			database,
			loadStatements(bundle, current, shrink, now),
			bundle.digest,
			until,
		);
		// Counted by what is there, not by what was sent.
		const after = await look(database);
		if (after.current?.digest !== bundle.digest)
			throw new Error(
				`Release ${after.current?.seq ?? "none"} is there: another load came after this one, which was made.`,
			);
		const counts = checkStored(bundle, after.stored, true);
		const [gone] = await database.rows(
			"SELECT count(*) AS n FROM withdrawn_items WHERE withdrawn_at = ?1",
			now,
		);
		console.log(
			`Release ${(current?.seq ?? 0) + 1}: ${counts}; ${gone?.n} withdrawn now; ${
				results
					? `${results.reduce((sum, result) => sum + result.written, 0)} rows written`
					: "the answer was lost, and the release is there"
			}.`,
		);
	} finally {
		await database.close();
	}
}

try {
	await main();
} catch (error) {
	complainHere(error, told`The load failed.`);
	process.exitCode = 1;
}
