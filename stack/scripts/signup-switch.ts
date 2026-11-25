// `bun run signup open|closed [--stage preview|production …]`: the sign-up's switch, one
// row, of the local D1 or a stage's (docs/runbooks/release.md, section 5). One
// statement, and then a read back, which is what it prints.
import { parseArgs } from "node:util";
import { complain } from "./public-log";
import { chooseStage, STAGE_OPTIONS } from "./remote-d1";

async function main() {
	const { values, positionals } = parseArgs({
		allowPositionals: true,
		options: STAGE_OPTIONS,
	});
	const { open } = chooseStage(values);
	const [to] = positionals;
	if ((to !== "open" && to !== "closed") || positionals.length !== 1)
		throw new Error(
			"Use: bun run signup open|closed [--state <folder>] [--stage preview|production [--production-approved <commit>]]",
		);
	const database = await open();
	try {
		await database.batch([
			[
				"UPDATE settings SET signup_open = ?1 WHERE id = 1",
				[to === "open" ? 1 : 0],
			],
		]);
		const rows = await database.rows("SELECT id, signup_open FROM settings");
		const is = rows[0]?.signup_open === 1 ? "open" : "closed";
		if (rows.length !== 1 || is !== to)
			throw new Error(`Sign-up reads back as ${is}, not ${to}.`);
		console.log(`Sign-up is ${is}.`);
	} finally {
		await database.close();
	}
}

try {
	await main();
} catch (error) {
	complain(error, "The switch failed.");
	process.exitCode = 1;
}
