// `bun run check:breaks [part of a break's words]`: breaks the app on purpose, one
// way at a time, in a scratch copy, and expects the check named to fail for it
// (stack/README.md). Slow, and not in CI: it is how the checks themselves are
// checked. Each break's text must occur exactly once in its file.
import { spawn } from "node:child_process";
import {
	cpSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { root } from "./harness";

type Check = "docket" | "signup" | "pages" | "limits";
interface Break {
	what: string;
	check: Check;
	/** What the check must say when it fails. */
	says: RegExp;
	file: string;
	from: string;
	to: string;
}
const breakIt = (
	check: Check,
	what: string,
	says: RegExp,
	file: string,
	from: string,
	to: string,
): Break => ({ what, check, says, file, from, to });

const LOADER = "scripts/docket-bundle.ts";
const DOCKET = "src/server/docket.ts";
const SIGNUP = "src/server/signup.ts";
const START = "src/start.ts";

const BREAKS: Break[] = [
	// The loader.
	breakIt(
		"docket",
		"the loader takes raw name fields for any other",
		/the loader refuses a raw applicant field/,
		LOADER,
		'const RAW_NAMES = ["applicant", "owner", "name"];',
		"const RAW_NAMES: string[] = [];",
	),
	breakIt(
		"docket",
		"the loader does not see duplicates",
		/the loader refuses a duplicate item/,
		LOADER,
		"if (seen.has(key)) reasons",
		"if (seen.has(`${key}?`)) reasons",
	),
	breakIt(
		"docket",
		"a meeting may be of any board",
		/the loader refuses a meeting, with its items, of a board/,
		LOADER,
		"else if (!boardsOf.get(found.town)?.has(String(found.board)))",
		"else if (!boardsOf.get(found.town))",
	),
	breakIt(
		"docket",
		"a meeting may be of a board of any town",
		/the loader refuses a board that only another town lists/,
		LOADER,
		"!boardsOf.get(found.town)?.has(String(found.board))",
		"![...boardsOf.values()].some((all) => all.has(String(found.board)))",
	),
	breakIt(
		"docket",
		"a source link may be anything that is not empty",
		/the loader refuses a source link that is a script/,
		LOADER,
		"	source_url: field(url),",
		"	source_url: field(string(2000)),",
	),
	breakIt(
		"docket",
		"a release may lose any number of items",
		/fewer|are refused, and D1 is as it was/,
		LOADER,
		"bundle.items.length >= 0.8 * current.items",
		"bundle.items.length > 0",
	),
	breakIt(
		"docket",
		"the same release is written again",
		/the same bundle again/,
		"scripts/load-docket.ts",
		"current?.digest === bundle.digest",
		'current?.digest === "never"',
	),
	breakIt(
		"docket",
		"a load is not counted at its end",
		/a load that lost a part of its items fails/,
		"migrations/0001_docket.sql",
		"loaded_count INTEGER CHECK (loaded_count = item_count)",
		"loaded_count INTEGER",
	),
	breakIt(
		"docket",
		"a load is not one transaction",
		/the old release is whole|neither the old release nor the new one/,
		"scripts/local-d1.ts",
		`await env.DB.batch(
				statements.map(([sql, params]) => env.DB.prepare(sql).bind(...params)),
			);`,
		`[];
			for (const [sql, params] of statements)
				results.push(await env.DB.prepare(sql).bind(...params).all());`,
	),
	breakIt(
		"docket",
		"a load takes a number that another load cannot have taken",
		/the second fails whole/,
		LOADER,
		"const seq = (current?.seq ?? 0) + 1;",
		"const seq = (current?.seq ?? 0) + 1 + Math.floor(Math.random() * 1e6);",
	),
	breakIt(
		"docket",
		"a dropped item is forgotten",
		/a release that drops two items/,
		LOADER,
		"?1 FROM items i JOIN towns t ON t.slug = i.town_slug`",
		"?1 FROM items i JOIN towns t ON t.slug = i.town_slug WHERE 0`",
	),
	// The pages of the docket.
	breakIt(
		"docket",
		"a withdrawn item answers 200",
		/answers 410 and says it was withdrawn/,
		"src/server/functions.ts",
		"answerStatus(410);",
		"answerStatus(200);",
	),
	breakIt(
		"docket",
		"the oldest item comes first",
		/shows \d+ items, not exactly/,
		DOCKET,
		"ORDER BY i.meeting_date DESC, i.town_slug",
		"ORDER BY i.meeting_date, i.town_slug",
	),
	breakIt(
		"docket",
		"a cancelled item is upcoming",
		/shows \d+ items, not exactly/,
		DOCKET,
		" AND i.status <> 'cancelled'",
		"",
	),
	breakIt(
		"docket",
		"pages overlap by one item",
		/shows \d+ items, not exactly/,
		DOCKET,
		"(page - 1) * PAGE_SIZE)",
		"Math.max(0, (page - 1) * PAGE_SIZE - 1))",
	),
	breakIt(
		"docket",
		"a page past the last one is empty and not missing",
		/past the last page, answers 404/,
		DOCKET,
		"return page > pages\n",
		"return page > pages + 1e9\n",
	),
	breakIt(
		"docket",
		"a date that has passed is still upcoming",
		/its outcome is not collected/,
		DOCKET,
		'row.status === "upcoming" && date < now',
		'row.status === "upcoming" && date > "9999"',
	),
	breakIt(
		"docket",
		"an item shows its quote twice",
		/shows its quote once/,
		"src/routes/item.$id.tsx",
		"				<Quote item={item} />",
		"				<Quote item={item} />\n				<Quote item={item} />",
	),
	breakIt(
		"docket",
		"an item does not link to its document",
		/links to its source document/,
		"src/routes/item.$id.tsx",
		"<a href={item.sourceUrl} ",
		'<a href="/" ',
	),
	breakIt(
		"docket",
		"a town does not say that it is not collected",
		/says whether the town is collected/,
		"src/routes/town.$slug.tsx",
		"{town.town} is not collected. Its boards",
		"{town.town} has nothing. Its boards",
	),
	// The sign-up.
	breakIt(
		"signup",
		"the limit for one client is not in the statement",
		/of 50 at once from one address/,
		SIGNUP,
		"WHERE client = ?2 AND at > ?4) < ${SIGNUP.perClient}",
		"WHERE client = ?2 AND at > ?4) < 1000",
	),
	breakIt(
		"signup",
		"the limit for all is not in the statement",
		/of 100 at once from 100 addresses/,
		SIGNUP,
		"WHERE at > ?4) < ${SIGNUP.inAll}",
		"WHERE at > ?4) < 1000",
	),
	breakIt(
		"signup",
		"the sign-up is stored whether or not it took a place",
		/of 50 at once from one address/,
		SIGNUP,
		'const PLACE = "EXISTS (SELECT 1 FROM signup_attempts WHERE id = ?1)";',
		'const PLACE = "?1 = ?1";',
	),
	breakIt(
		"signup",
		"every IPv6 address is a client of its own",
		/an IPv6 \/64 is one caller/,
		SIGNUP,
		".slice(0, 4)",
		".slice(0, 8)",
	),
	breakIt(
		"signup",
		"the client is stored as its address",
		/the keyed hash of the caller/,
		SIGNUP,
		"const client = await clientHash(secret, address);",
		"const client = (await clientHash(secret, address)) && callerKey(address);",
	),
	breakIt(
		"signup",
		"the token is stored as it is",
		/D1 only its hash/,
		SIGNUP,
		"			await sha256(token),",
		"			token,",
	),
	breakIt(
		"signup",
		"an email may be there once",
		/another submission of the same address is a row of its own/,
		"migrations/0001_docket.sql",
		"	email TEXT NOT NULL,",
		"	email TEXT NOT NULL UNIQUE,",
	),
	breakIt(
		"signup",
		"a repeat changes the earlier row",
		/the first one stays as it was|nobody else's|changed somebody else's/,
		SIGNUP,
		"	for (const { meta } of results) recordDatabase(meta);",
		`	for (const { meta } of results) recordDatabase(meta);
	await env.DB.prepare("UPDATE signups SET role = ?1 WHERE email = ?2").bind(input.role, input.email).run();`,
	),
	breakIt(
		"signup",
		"a repeat is told that the address is known",
		/an answer tells whether an address was there/,
		SIGNUP,
		'	if (taken?.results.length === 1) return { status: "ok", token };',
		`	if (taken?.results.length === 1) {
		const same = (await env.DB.prepare("SELECT id FROM signups WHERE email = ?1").bind(input.email).all()).results;
		return { status: "ok", token, ...(same.length > 1 ? { known: true } : {}) };
	}`,
	),
	breakIt(
		"signup",
		"a header tells that the address is known",
		/an answer tells whether an address was there/,
		SIGNUP,
		"	const [taken, , why] = results;",
		`	const [taken, , why] = results;
	const same = (await env.DB.prepare("SELECT id FROM signups WHERE email = ?1").bind(input.email).all()).results;
	if (same.length > 1) (await import("./observability")).answerHeader("X-Again", "1");`,
	),
	breakIt(
		"signup",
		"a sign-up looks for the address first",
		/D1's work tells whether an address was there/,
		SIGNUP,
		"	for (const { meta } of results) recordDatabase(meta);",
		`	for (const { meta } of results) recordDatabase(meta);
	recordDatabase((await env.DB.prepare("SELECT id FROM signups WHERE email = ?1").bind(input.email).all()).meta);`,
	),
	breakIt(
		"signup",
		"a token is tied to the address's earlier row",
		/a token marks the intent of its own submission/,
		SIGNUP,
		"		WHERE token_hash = ?1 RETURNING 1 AS known`,",
		"		WHERE id = (SELECT min(id) FROM signups WHERE email = (SELECT email FROM signups WHERE token_hash = ?1)) RETURNING 1 AS known`,",
	),
	breakIt(
		"signup",
		"an intent answers differently for an address that was there",
		/an answer tells whether an address was there/,
		SIGNUP,
		"RETURNING 1 AS known`,",
		"RETURNING iif((SELECT count(*) FROM signups o WHERE o.email = signups.email) > 1, NULL, 1) AS known`,",
	),
	breakIt(
		"signup",
		"any token of the address removes all of it",
		/and nothing else/,
		SIGNUP,
		'"DELETE FROM signups WHERE token_hash = ?1",',
		'"DELETE FROM signups WHERE email = (SELECT email FROM signups WHERE token_hash = ?1)",',
	),
	breakIt(
		"signup",
		"removing leaves the sign-up",
		/Remove my address deletes the sign-up/,
		SIGNUP,
		"DELETE FROM signups WHERE token_hash = ?1",
		"DELETE FROM signups WHERE 0 AND token_hash = ?1",
	),
	breakIt(
		"signup",
		"the report counts submissions as people",
		/the report counts each email once/,
		"scripts/report-docket.ts",
		"FROM signups GROUP BY email",
		"FROM signups GROUP BY id",
	),
	breakIt(
		"signup",
		"the closed row is not asked",
		/with the row closed, a submission is refused/,
		SIGNUP,
		`WHERE (SELECT signup_open FROM settings WHERE id = 1) = 1
	AND`,
		`WHERE (SELECT signup_open FROM settings WHERE id = 1) >= 0
	AND`,
	),
	breakIt(
		"signup",
		"a stage without a secret makes one up",
		/a stage without the secret answers as closed/,
		SIGNUP,
		'	if (env.APP_ENV !== "local") return undefined;\n',
		"",
	),
	breakIt(
		"signup",
		"hashes of callers are never deleted",
		/deletes every caller's hash/,
		SIGNUP,
		"DELETE FROM signup_attempts WHERE at <= ?1",
		"DELETE FROM signup_attempts WHERE at <= ?1 - 1e15",
	),
	breakIt(
		"signup",
		"the framework's own words reach the log",
		/the Worker logs records and nothing else/,
		"src/server/log.ts",
		'if (quiet || env.APP_ENV === "local") return;',
		"if (!quiet) return;",
	),
	breakIt(
		"signup",
		"the report lists the emails",
		/the report holds no email/,
		"scripts/report-docket.ts",
		"GROUP BY j.value ORDER BY j.value`",
		"GROUP BY j.value UNION ALL SELECT email, 1 FROM signups`",
	),
	// The pages.
	breakIt(
		"pages",
		"the policy admits any inline script",
		/the policy admits this site's own files/,
		"src/server/security.ts",
		"'nonce-${nonce}'",
		"'unsafe-inline'",
	),
	breakIt(
		"pages",
		"the edge may add a script to a page",
		/cache-control is/,
		"src/server/security.ts",
		'"public, max-age=0, must-revalidate"}, no-transform`,',
		'"public, max-age=0, must-revalidate"}`,',
	),
	breakIt(
		"limits",
		"a page may be changed and kept without asking",
		/says that nothing may be added to it/,
		"src/server/security.ts",
		"	untouched(response);\n",
		"	if (!response) untouched(response);\n",
	),
	breakIt(
		"pages",
		"a page that was kept is shown without asking",
		/cache-control is/,
		"src/server/security.ts",
		'"public, max-age=0, must-revalidate"}',
		'"public, max-age=3600"}',
	),
	breakIt(
		"pages",
		"D1's own words reach a page",
		/without D1 answers/,
		"src/server/functions.ts",
		`	} catch {
		tagRequest("StorageError");
		answerStatus(503);`,
		`	} catch (cause) {
		if (cause) throw cause;
		answerStatus(503);`,
	),
	breakIt(
		"pages",
		"a page loads a file from another host",
		/no page loads a file from another host|the policy/,
		"src/routes/__root.tsx",
		'{ rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },',
		'{ rel: "icon", href: "https://icons.example/favicon.svg", type: "image/svg+xml" },',
	),
	breakIt(
		"pages",
		"a page of the old app answers 200",
		/\/pricing answers 200/,
		"src/routes/pricing.tsx",
		"	server: { handlers: { ANY: gone } },\n",
		"",
	),
	breakIt(
		"pages",
		"every page says it is the front page",
		/canonical/,
		"src/lib/site.ts",
		"const url = `${ORIGIN}${path}`;",
		"const url = `${ORIGIN}/${path.slice(0, 0)}`;",
	),
	breakIt(
		"pages",
		"a filtered list may be indexed",
		/a filtered list says noindex/,
		"src/routes/index.tsx",
		'...(words ? { robots: "noindex, follow" as const } : {}),',
		"",
	),
	breakIt(
		"pages",
		"a page is wider than a phone",
		/is \d+ wide, spills/,
		"src/styles.css",
		".facts dd {\n	margin: 0;",
		".facts dd {\n	margin: 0;\n	min-width: 40rem;",
	),
	breakIt(
		"pages",
		"the quiet text is too light",
		/contrast/,
		"src/styles.css",
		"--soft: #5a564c;",
		"--soft: #aaa598;",
	),
	breakIt(
		"pages",
		"the filters need a script",
		/the filters without a script/,
		"src/components/items.tsx",
		'action="/#docket" method="get"',
		'action="/#docket" method="dialog"',
	),
	// The limits.
	breakIt(
		"limits",
		"functions are where the firewall blocks them",
		/first call is under \/_fn\//,
		"vite.config.ts",
		"tanstackStart({ serverFns: { base: FUNCTIONS } })",
		"tanstackStart()",
	),
	breakIt(
		"limits",
		"the old function path is not refused",
		/_serverFn.* answers|_SERVERFN.* answers/,
		START,
		"		noOldFunctions,\n",
		"",
	),
	breakIt(
		"limits",
		"a body may be of any size",
		/a body over \d+ bytes answers 413/,
		START,
		"if (!(await bodyWithin(request, MAX_CALL_BYTES)))",
		"if (!(await bodyWithin(request, 1e9)))",
	),
	breakIt(
		"limits",
		"calls are not limited",
		/the next one answers 429/,
		START,
		"if (await overLimit(request))",
		"if (!(await overLimit(request)) && !request.url)",
	),
	breakIt(
		"limits",
		"a preview may be indexed",
		/preview: robots are disallowed/,
		START,
		'const production = env.APP_ENV === "production";',
		'const production = env.APP_ENV !== "local";',
	),
	breakIt(
		"limits",
		"production answers plain http",
		/plain http with a redirect/,
		"src/server/security.ts",
		'url.protocol !== "http:"',
		'url.protocol !== "ftp:"',
	),
];

const folder = `${root}.smoke/breaks-${process.pid}`;
const LEFT_OUT = [
	"node_modules",
	"dist",
	".smoke",
	".wrangler",
	".tanstack",
	// Biome refuses a second configuration below the first.
	"biome.json",
];
/** Each runner has ports of its own. */
const RUNNERS = 3;

function copyOf(one: Break, at: number): string {
	const copy = `${folder}/${at}`;
	mkdirSync(copy, { recursive: true });
	for (const entry of readdirSync(root))
		if (!LEFT_OUT.includes(entry))
			cpSync(`${root}${entry}`, `${copy}/${entry}`, { recursive: true });
	symlinkSync(`${root}node_modules`, `${copy}/node_modules`);
	const file = `${copy}/${one.file}`;
	const text = readFileSync(file, "utf8");
	if (text.split(one.from).length !== 2)
		throw new Error(
			`"${one.what}": its text occurs ${text.split(one.from).length - 1} times in ${one.file}`,
		);
	writeFileSync(
		file,
		text.replace(one.from, () => one.to),
	);
	return copy;
}

function run(one: Break, copy: string, runner: number) {
	return new Promise<{ code: number | null; said: string }>((resolve) => {
		const port = String(4400 + runner * 10);
		const child = spawn(process.execPath, [`scripts/check-${one.check}.ts`], {
			cwd: copy,
			env: {
				...process.env,
				DOCKET_BUNDLE: "",
				[`STACK_${one.check.toUpperCase()}_PORT`]: port,
			},
		});
		let said = "";
		const add = (chunk: Buffer) => {
			said += chunk.toString();
		};
		child.stdout.on("data", add);
		child.stderr.on("data", add);
		// A check that never ends has not caught anything.
		const late = setTimeout(() => {
			said += "\nstopped after five minutes";
			child.kill("SIGKILL");
		}, 300_000);
		child.on("close", (code) => {
			clearTimeout(late);
			resolve({ code, said });
		});
	});
}

const wanted = process.argv[2] ?? "";
const chosen = BREAKS.filter(({ what }) => what.includes(wanted));
const queue = [...chosen.entries()];
const missed: string[] = [];
mkdirSync(folder, { recursive: true });
try {
	for (const one of chosen) {
		const text = readFileSync(`${root}${one.file}`, "utf8");
		if (text.split(one.from).length !== 2)
			throw new Error(
				`"${one.what}": its text occurs ${text.split(one.from).length - 1} times in ${one.file}`,
			);
	}
	await Promise.all(
		Array.from({ length: RUNNERS }, async (_, runner) => {
			for (let next = queue.shift(); next; next = queue.shift()) {
				const [at, one] = next;
				const copy = copyOf(one, at);
				const { code, said } = await run(one, copy, runner);
				rmSync(copy, { recursive: true, force: true });
				const failure = said.match(/check:\w+ failed: [^\n]*/)?.[0] ?? "";
				if (code !== 0 && one.says.test(failure))
					console.log(
						`caught - ${one.what}\n         ${failure.slice(0, 160)}`,
					);
				else {
					missed.push(one.what);
					console.log(`MISSED - ${one.what} (${code})\n${said.slice(-1500)}`);
				}
			}
		}),
	);
	console.log(
		`check:breaks: ${chosen.length - missed.length} of ${chosen.length} breaks caught`,
	);
	if (missed.length > 0 || chosen.length === 0) process.exitCode = 1;
} finally {
	rmSync(folder, { recursive: true, force: true });
}
