// `bun run report [--state <folder>]`: counts only, from the local D1
// (stack/README.md, "Sign-up"). Every email counts once. No statement here
// answers with an email, a town list, a token or a client's hash.
import { parseArgs } from "node:util";
import { openDatabase } from "./local-d1";

/** One row for each email: its earliest, and whether any of its rows asked. */
const PEOPLE = `(SELECT s.role, s.towns, f.asked FROM signups s JOIN (
	SELECT min(id) AS id, max(paid_intent_at IS NOT NULL) AS asked FROM signups GROUP BY email
) f ON f.id = s.id)`;

const { values } = parseArgs({ options: { state: { type: "string" } } });
const database = await openDatabase(values.state);
try {
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
	console.log(
		JSON.stringify(
			{
				signup_open:
					(await one("SELECT signup_open AS n FROM settings WHERE id = 1")) ===
					1,
				submissions: await one("SELECT count(*) AS n FROM signups"),
				signups: await one(`SELECT count(*) AS n FROM ${PEOPLE}`),
				signups_by_role: await table(
					`SELECT role AS label, count(*) AS n FROM ${PEOPLE} GROUP BY role ORDER BY role`,
				),
				signups_by_town: await table(
					`SELECT j.value AS label, count(*) AS n FROM ${PEOPLE} p, json_each(p.towns) j GROUP BY j.value ORDER BY j.value`,
				),
				paid_intents: await one(
					`SELECT count(*) AS n FROM ${PEOPLE} WHERE asked`,
				),
				paid_intents_by_role: await table(
					`SELECT role AS label, count(*) AS n FROM ${PEOPLE} WHERE asked GROUP BY role ORDER BY role`,
				),
				requests_by_day: days,
			},
			null,
			2,
		),
	);
} finally {
	await database.close();
}
