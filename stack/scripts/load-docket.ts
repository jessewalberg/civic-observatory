// `bun run load <file> [--shrink "<why>"] [--state <folder>]`: loads one
// docket-v1 bundle into the local D1 (stack/README.md, "Data"). Local only.
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import {
	CURRENT,
	checkShrink,
	loadStatements,
	Refused,
	readBundle,
	readCurrent,
} from "./docket-bundle";
import { openDatabase } from "./local-d1";

async function main() {
	const { values, positionals } = parseArgs({
		allowPositionals: true,
		options: { shrink: { type: "string" }, state: { type: "string" } },
	});
	const [file] = positionals;
	if (!file || positionals.length > 1)
		throw new Error(
			'Use: bun run load <file> [--shrink "<why>"] [--state <folder>]',
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
	const database = await openDatabase(values.state);
	try {
		const current = readCurrent((await database.batch([CURRENT]))[0]?.rows);
		if (current?.digest === bundle.digest) {
			console.log(
				`Release ${current.seq} is this file already; nothing was written.`,
			);
			return;
		}
		checkShrink(bundle, current, shrink);
		const now = new Date().toISOString();
		// Said before the batch, so a check can interrupt it there.
		console.log(`Loading ${bundle.items.length} items.`);
		const results = await database.batch(
			loadStatements(bundle, current, shrink, now),
		);
		const written = results.reduce((sum, result) => sum + result.written, 0);
		const [gone] = await database.rows(
			"SELECT count(*) AS n FROM withdrawn_items WHERE withdrawn_at = ?1",
			now,
		);
		console.log(
			`Release ${(current?.seq ?? 0) + 1}: ${bundle.items.length} items, ${bundle.meetings.length} meetings, ${bundle.towns.length} towns; ${gone?.n} withdrawn now; ${written} rows written.`,
		);
	} finally {
		await database.close();
	}
}

try {
	await main();
} catch (error) {
	console.error(error instanceof Error ? error.message : error);
	process.exitCode = 1;
}
