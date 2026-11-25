// `bun run report [--state <folder>] [--stage preview|production …]`: counts only, from
// the local D1 or a stage's (README.md, "Sign-up"). Every email counts once. No
// statement here answers with an email, a town list, a token or a client's hash.
import { parseArgs } from "node:util";
import type { Database } from "./local-d1";
import { complainHere, told } from "./public-log";
import { chooseStage, STAGE_OPTIONS } from "./remote-d1";

/** One row for each email: its earliest, and whether any of its rows asked. */
const PEOPLE = `(SELECT s.role, s.towns, f.asked FROM signups s JOIN (
	SELECT min(id) AS id, max(paid_intent_at IS NOT NULL) AS asked FROM signups GROUP BY email
) f ON f.id = s.id)`;

async function report(database: Database) {
	const table = async (sql: string) => {
		const rows = await database.rows(sql);
		return Object.fromEntries(
			rows.map(({ label, n }) => [String(label), Number(n)]),
		);
	};
	const one = async (sql: string) =>
		Number((await database.rows(sql))[0]?.n ?? 0);
	const days: Record<string, Record<string, number>> = {};
	for (const { day, kind, count } of await database.rows(
		"SELECT day, kind, count FROM counters ORDER BY day, kind",
	)) {
		const label = String(day);
		days[label] ??= {};
		days[label][String(kind)] = Number(count);
	}
	return {
		release: await one("SELECT max(seq) AS n FROM releases"),
		items: await one("SELECT count(*) AS n FROM items"),
		withdrawn_items: await one("SELECT count(*) AS n FROM withdrawn_items"),
		signup_open:
			(await one("SELECT signup_open AS n FROM settings WHERE id = 1")) === 1,
		submissions: await one("SELECT count(*) AS n FROM signups"),
		signups: await one(`SELECT count(*) AS n FROM ${PEOPLE}`),
		signups_by_role: await table(
			`SELECT role AS label, count(*) AS n FROM ${PEOPLE} GROUP BY role ORDER BY role`,
		),
		signups_by_town: await table(
			`SELECT j.value AS label, count(*) AS n FROM ${PEOPLE} p, json_each(p.towns) j GROUP BY j.value ORDER BY j.value`,
		),
		paid_intents: await one(`SELECT count(*) AS n FROM ${PEOPLE} WHERE asked`),
		paid_intents_by_role: await table(
			`SELECT role AS label, count(*) AS n FROM ${PEOPLE} WHERE asked GROUP BY role ORDER BY role`,
		),
		requests_by_day: days,
	};
}

async function main() {
	const { values } = parseArgs({ options: STAGE_OPTIONS });
	const database = await chooseStage(values).open();
	try {
		console.log(JSON.stringify(await report(database), null, 2));
	} finally {
		await database.close();
	}
}

try {
	await main();
} catch (error) {
	complainHere(error, told`The report failed.`);
	process.exitCode = 1;
}
