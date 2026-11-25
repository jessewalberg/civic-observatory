// `bun run check:pages`: every kind of page over HTTP and in Chromium
// (stack/README.md; no unit tests, Jesse 2026-10-09). The built Worker in local
// workerd, with DOCKET_BUNDLE's file or the fixture. No cloud call.
import type { Browser } from "@playwright/test";
import { ORIGIN, SITE_NAME } from "../src/lib/site";
import { type BuiltWorker, startBuiltWorker } from "./built-worker";
import {
	type BundleFile,
	checks,
	commit,
	type Document,
	launch,
	loadInto,
	read,
	readBundleFile,
	slug,
} from "./harness";

const { expect, must, done } = checks("check:pages");

const RETIRED = [
	"/explore",
	"/explore/coventry-ct",
	"/pricing",
	"/search",
	"/search?q=housing",
	"/topics",
	"/topics/housing",
	"/meeting/a-meeting",
	"/dashboard",
	"/dashboard/subscriptions",
	"/admin",
	"/admin/users",
	"/sign-in",
	"/sign-in/factor-one?redirect_url=%2Fdashboard",
	"/sign-up",
	"/sign-up/verify",
	"/reset-password",
	"/reset-password?token=a-secret-of-somebody",
	"/Pricing",
];
const HEADERS: [string, RegExp][] = [
	["strict-transport-security", /^max-age=31536000; includeSubDomains$/],
	["x-content-type-options", /^nosniff$/],
	["x-frame-options", /^DENY$/],
	["referrer-policy", /^strict-origin-when-cross-origin$/],
	["permissions-policy", /camera=\(\)/],
	// Nothing is added to a page on its way, and one that was kept is asked for
	// again: an item can be withdrawn.
	["cache-control", /^public, max-age=0, must-revalidate, no-transform$/],
	["x-request-id", /^[0-9a-f-]{36}$/],
];
const BANNED: [string, RegExp][] = [
	["an emoji", /\p{Extended_Pictographic}/u],
	["Clerk or Convex", /\b(?:Clerk|Convex)\b/],
	["urgency", /\bhurry\b|\bact now\b|limited time/i],
	[
		"a made-up crowd",
		/\b\d+\+? (?:subscribers|professionals|readers|customers)\b|trusted by/i,
	],
];

/** Every kind of page, with its status. */
function kinds(bundle: BundleFile): Record<string, string> {
	const paged = [...bundle.towns].sort(
		(a, b) =>
			bundle.items.filter(({ town }) => town === b).length -
			bundle.items.filter(({ town }) => town === a).length,
	)[0] as string;
	const blocked = bundle.sources.find(({ boards }) =>
		boards.every(({ status }) => status === "blocked"),
	)?.town as string;
	const odd =
		bundle.items.find(({ address }) => address === null) ?? bundle.items[0];
	const sourced = bundle.items.find(({ address_source }) => address_source);
	return {
		home: "/",
		second: "/?page=2",
		filtered: `/?town=${slug(paged)}&kind=decision`,
		upcoming: "/?upcoming=1",
		nothing: `/?town=${slug(blocked)}`,
		item: `/item/${bundle.items[0]?.id}`,
		oddItem: `/item/${odd?.id}`,
		sourcedItem: `/item/${sourced?.id}`,
		town: `/town/${slug(paged)}`,
		townSecond: `/town/${slug(paged)}?page=2`,
		notCollected: `/town/${slug(blocked)}`,
		method: "/method",
		privacy: "/privacy",
		terms: "/terms",
	};
}

async function heads(worker: BuiltWorker, paths: Record<string, string>) {
	const head = commit();
	const documents = new Map<string, Document>();
	const nonces = new Set<string>();
	for (const path of Object.values(paths)) {
		const page = await read(worker, path);
		documents.set(path, page);
		expect(page.status === 200 && page.headings === 1, `${path}: 200, one h1`);
		const description = page.meta.get("description") ?? "";
		must(
			page.title.endsWith(` | ${SITE_NAME}`) && page.title.length <= 180,
			`${path}: title "${page.title}"`,
		);
		must(
			description.length >= 40 && description.length <= 260,
			`${path}: description "${description}"`,
		);
		must(
			page.canonical.join() === `${ORIGIN}${path}` &&
				page.meta.get("og:url") === `${ORIGIN}${path}` &&
				page.meta.get("og:title") === page.title &&
				page.meta.get("og:description") === description,
			`${path}: canonical ${page.canonical.join()} and social tags`,
		);
		must(
			page.meta.get("commit") === head &&
				page.headers.get("x-commit-sha") === head,
			`${path}: the commit meta and x-commit-sha name HEAD`,
		);
		for (const [name, value] of HEADERS)
			must(
				value.test(page.headers.get(name) ?? ""),
				`${path}: ${name} is "${page.headers.get(name)}"`,
			);
		const policy = page.headers.get("content-security-policy") ?? "";
		const nonce = policy.match(
			/script-src 'self' 'nonce-([0-9a-f]{32})';/,
		)?.[1];
		must(
			nonce !== undefined &&
				!nonces.has(nonce) &&
				policy.startsWith("default-src 'none';") &&
				!/unsafe|\*|https?:/.test(policy),
			`${path}: the policy admits this site's own files and a new nonce: ${policy}`,
		);
		nonces.add(nonce as string);
		const scripts = [...page.html.matchAll(/<script\b([^>]*)>/g)];
		must(
			scripts.every(([, attributes]) =>
				(attributes ?? "").includes(`nonce="${nonce}"`),
			),
			`${path}: every script has this answer's nonce`,
		);
		must(
			!/<[^>]+\son[a-z]+=|<style\b|\sstyle="/i.test(
				page.html.replace(/<script\b[\s\S]*?<\/script>/g, ""),
			),
			`${path}: no inline handler or style`,
		);
		must(
			!page.html.includes("set-cookie") && !page.headers.has("set-cookie"),
			`${path}: no cookie`,
		);
		must(
			!/application\/ld\+json|itemscope/.test(page.html),
			`${path}: no structured data`,
		);
		for (const [what, pattern] of BANNED)
			must(!pattern.test(`${page.title} ${page.main}`), `${path}: ${what}`);
		must(
			Buffer.byteLength(page.html) < 120_000,
			`${path}: ${Buffer.byteLength(page.html)} bytes of HTML`,
		);
	}
	expect(
		true,
		`${documents.size} pages: title, description, canonical, marker, headers, a policy with a new nonce each, no inline style, no cookie, under 120,000 bytes`,
	);
	const titles = [...documents.values()].map(({ title }) => title);
	expect(new Set(titles).size === titles.length, "every title is its own");
	const robots = (path: string) => documents.get(path)?.meta.get("robots");
	expect(
		robots(paths.filtered as string) === "noindex, follow" &&
			robots(paths.upcoming as string) === "noindex, follow" &&
			robots("/") === undefined &&
			robots("/?page=2") === undefined,
		"a filtered list says noindex, follow; the docket's own pages do not",
	);
	const nothing = documents.get(paths.nothing as string);
	expect(
		nothing?.main.includes("No items match.") === true,
		"a list with nothing in it says so",
	);
	for (const method of ["HEAD", "POST"]) {
		const answer = await worker.send("/method", { method });
		expect(answer.status < 500, `${method} /method answers ${answer.status}`);
	}
	return documents;
}

async function otherAnswers(worker: BuiltWorker) {
	const head = commit();
	for (const path of RETIRED) {
		const page = await read(worker, path);
		must(
			page.status === 410 &&
				!page.headers.has("location") &&
				page.main.includes("This page is gone") &&
				page.references.includes("/") &&
				page.meta.get("robots") === "noindex" &&
				page.meta.get("commit") === head &&
				!page.html
					.replace(/<script\b[\s\S]*?<\/script>/g, "")
					.includes("a-secret-of-somebody"),
			`${path} answers ${page.status}, a plain page`,
		);
		for (const [name, value] of HEADERS)
			must(value.test(page.headers.get(name) ?? ""), `${path}: ${name}`);
	}
	expect(
		true,
		`${RETIRED.length} paths of the old app answer 410 with a plain page`,
	);
	for (const method of ["POST", "HEAD", "PUT"])
		must(
			(await worker.send("/sign-in", { method })).status === 410,
			`${method} /sign-in answers 410`,
		);
	const slash = await worker.send("/pricing/");
	expect(
		slash.status === 307 && slash.headers.get("location") === "/pricing",
		"/pricing/ redirects to /pricing",
	);
	for (const path of [
		"/no-such-page",
		"/exploration",
		"/item",
		"/town",
		"/item/x/y",
		"/api/no-such",
	]) {
		const page = await read(worker, path);
		must(
			page.status === 404 && page.main.includes("Page not found"),
			`${path} answers ${page.status}, not 404 with a plain page`,
		);
		for (const [name, value] of HEADERS)
			must(
				value.test(page.headers.get(name) ?? ""),
				`${path}: ${name} is "${page.headers.get(name)}"`,
			);
	}
	expect(true, "a path that was never there answers 404 with a plain page");
	const health = await worker.send("/api/health");
	const body = (await health.json()) as Record<string, unknown>;
	expect(
		health.status === 200 &&
			health.headers.get("cache-control") === "no-store" &&
			Object.keys(body).join() === "commit,docket,signup" &&
			body.commit === head,
		"/api/health states the commit, the release and the sign-up, and nothing else",
	);
}

async function references(
	worker: BuiltWorker,
	documents: Map<string, Document>,
) {
	const targets = new Set<string>();
	const outside = new Set<string>();
	for (const [path, page] of documents)
		for (const reference of page.references) {
			const url = new URL(reference, `${ORIGIN}${path}`);
			if (url.protocol === "mailto:") {
				must(
					url.pathname === "hello@civicobservatory.com",
					`${path}: mail to ${url.pathname}`,
				);
				continue;
			}
			if (url.origin !== ORIGIN) {
				must(url.protocol === "https:", `${path}: ${reference} is not https`);
				outside.add(url.host);
				continue;
			}
			if (url.hash && url.pathname === new URL(path, ORIGIN).pathname)
				must(
					page.ids.has(url.hash.slice(1)),
					`${path}: ${url.hash} is on the page`,
				);
			targets.add(`${url.pathname}${url.search}`);
		}
	for (const target of targets) {
		const answer = await worker.send(target);
		await answer.arrayBuffer();
		must(answer.status === 200, `${target} answers ${answer.status}`);
	}
	expect(
		true,
		`${targets.size} internal links and files resolve; ${outside.size} hosts are only linked`,
	);
	const loaded = [...documents.values()].flatMap(({ html }) =>
		[
			...html.matchAll(
				/<(?:script|img|link|iframe|source)\b[^>]*?(?:src|href)="([^"]+)"/g,
			),
		]
			.map((match) => match[1] as string)
			.filter(
				(url) =>
					/^https?:|^\/\//.test(url) &&
					!url.startsWith(`${ORIGIN}/`) &&
					url !== ORIGIN,
			),
	);
	expect(loaded.length === 0, "no page loads a file from another host");
}

async function inChromium(
	browser: Browser,
	worker: BuiltWorker,
	paths: string[],
) {
	const host = new URL(worker.base()).host;
	for (const [width, colorScheme] of [
		[360, "light"],
		[390, "dark"],
		[1200, "light"],
		[1200, "dark"],
	] as const) {
		const context = await browser.newContext({
			viewport: { width, height: 900 },
			colorScheme,
		});
		for (const path of paths) {
			const page = await context.newPage();
			const foreign: string[] = [];
			const errors: string[] = [];
			page.on("request", (request) => {
				const url = new URL(request.url());
				if (url.host !== host) foreign.push(url.href);
			});
			page.on("pageerror", (error) => errors.push(error.message));
			page.on("console", (message) => {
				// The page's own 404 or 410 is the only failure it may report.
				if (
					["error", "warning"].includes(message.type()) &&
					!/status of 4(?:04|10)/.test(message.text())
				)
					errors.push(message.text());
			});
			await page.goto(`${worker.base()}${path}`, { waitUntil: "networkidle" });
			const found = await page.evaluate(() => {
				const colors = (element: Element) => {
					const style = getComputedStyle(element);
					return [style.color, getComputedStyle(document.body).backgroundColor];
				};
				return {
					wide: document.documentElement.scrollWidth,
					spills: [...document.querySelectorAll("main *")]
						.filter(
							(box) =>
								box.getBoundingClientRect().right >
									document.documentElement.clientWidth + 1 &&
								!box.closest(".unseen"),
						)
						.map((box) => `${box.tagName}.${box.className}`),
					shadows: [...document.querySelectorAll("body *")].filter((box) => {
						const style = getComputedStyle(box);
						return (
							style.boxShadow !== "none" ||
							style.backgroundImage !== "none" ||
							style.borderTopLeftRadius !== "0px"
						);
					}).length,
					images: document.querySelectorAll("img, svg, canvas, video").length,
					text: colors(document.querySelector("main") as Element),
					soft: [...document.querySelectorAll(".note, .when, dt")].map(
						colors,
					)[0],
					links: [...document.querySelectorAll("main a")].map(colors)[0],
				};
			});
			const ratio = (pair: string[] | undefined) => {
				if (!pair) return 21;
				const light = pair.map((color) => {
					const [r, g, b] = (color.match(/[\d.]+/g) ?? []).map((part) => {
						const value = Number(part) / 255;
						return value <= 0.03928
							? value / 12.92
							: ((value + 0.055) / 1.055) ** 2.4;
					}) as [number, number, number];
					return 0.2126 * r + 0.7152 * g + 0.0722 * b;
				}) as [number, number];
				return (Math.max(...light) + 0.05) / (Math.min(...light) + 0.05);
			};
			const least = Math.min(
				ratio(found.text),
				ratio(found.soft),
				ratio(found.links),
			);
			must(
				foreign.length === 0 && errors.length === 0,
				`${path} at ${width}: ${[...foreign, ...errors].join("\n")}`,
			);
			must(
				found.wide <= width && found.spills.length === 0,
				`${path} at ${width} is ${found.wide} wide, spills ${found.spills.join(", ")}`,
			);
			must(
				found.shadows === 0 && found.images === 0,
				`${path} at ${width}: ${found.shadows} boxes with a shadow, gradient or round corner, ${found.images} images`,
			);
			must(
				least >= 4.5,
				`${path} ${colorScheme}: contrast ${least.toFixed(2)}`,
			);
			must((await context.cookies()).length === 0, `${path}: a cookie`);
			await page.close();
		}
		expect(
			true,
			`${paths.length} pages at ${width} px, ${colorScheme}: own host only, console silent, nothing wider than the screen, contrast of at least 4.5, no cookie`,
		);
		await context.close();
	}
}

/** Reading, filtering and paging with no script at all. */
async function withoutScript(
	browser: Browser,
	worker: BuiltWorker,
	bundle: BundleFile,
) {
	const context = await browser.newContext({ javaScriptEnabled: false });
	const page = await context.newPage();
	await page.goto(worker.base());
	const total = bundle.items.length;
	const shown = await page.locator(".entry").count();
	must(shown === Math.min(25, total), `${shown} items without a script`);
	const decisions = bundle.items.filter(({ kind }) => kind === "decision");
	const town = decisions[0]?.town as string;
	const wanted = decisions.filter((item) => item.town === town).length;
	await page.selectOption('select[name="town"]', slug(town));
	await page.selectOption('select[name="kind"]', "decision");
	await page.locator('.filters button[type="submit"]').click();
	must(
		(await page.locator("#docket h2").innerText()).includes(
			`${town}, decision`,
		) &&
			(await page.locator(".entry").count()) === Math.min(25, wanted) &&
			(await page.locator('select[name="town"]').inputValue()) === slug(town),
		`the filters without a script: ${await page.locator("#docket h2").innerText()}`,
	);
	await page.goto(worker.base());
	await page.locator('a[rel="next"]').click();
	must(
		(await page.locator(".pages").innerText()).includes("Page 2 of"),
		"Older",
	);
	await page.locator('a[rel="prev"]').click();
	must(
		(await page.locator(".pages").innerText()).includes("Page 1 of"),
		"Newer",
	);
	await page.locator(".entry h3 a").first().click();
	must(
		(await page.locator("blockquote").innerText()).length > 0 &&
			(await page.locator("h1").count()) === 1,
		"an item without a script",
	);
	expect(
		true,
		"the list, its filters, its pages and an item work without a script",
	);
	await context.close();
}

/** The keyboard, and what a screen reader is told. */
async function keyboard(browser: Browser, worker: BuiltWorker) {
	await worker.sql("UPDATE settings SET signup_open = 1");
	const page = await browser.newPage({ viewport: { width: 390, height: 800 } });
	await page.goto(worker.base(), { waitUntil: "networkidle" });
	await page.keyboard.press("Tab");
	must(
		(await page.evaluate(() => document.activeElement?.textContent)) ===
			"Skip to content",
		"the first stop is the skip link",
	);
	await page.keyboard.press("Enter");
	await page.keyboard.press("Tab");
	must(
		await page.evaluate(() => document.activeElement?.closest("main") !== null),
		"the skip link goes to the content",
	);
	must(
		(await page.locator(".entry").count()) > 0,
		"the page is whole after a jump inside it",
	);
	const problems = await page.evaluate(() => {
		const found: string[] = [];
		for (const field of document.querySelectorAll("input, select")) {
			const { labels, name } = field as HTMLInputElement;
			if (!labels?.length) found.push(`no label: ${name}`);
		}
		let level = 1;
		for (const heading of document.querySelectorAll("h1, h2, h3, h4")) {
			const next = Number(heading.tagName[1]);
			if (next > level + 1) found.push(`${heading.tagName} after H${level}`);
			level = next;
		}
		for (const region of document.querySelectorAll("[aria-labelledby]"))
			if (
				!document.getElementById(region.getAttribute("aria-labelledby") ?? "")
			)
				found.push("a label that is not there");
		const ids = [...document.querySelectorAll("[id]")].map(({ id }) => id);
		if (new Set(ids).size !== ids.length) found.push("an id twice");
		for (const target of document.querySelectorAll(
			"button, select, input:not([type=checkbox]):not([name=company])",
		))
			if (target.getBoundingClientRect().height < 24)
				found.push(`small target: ${target.textContent}`);
		return found;
	});
	must(problems.length === 0, `the front page: ${problems.join("; ")}`);
	// The form, from the keyboard alone.
	await page.locator('form[data-ready="true"]').waitFor();
	await page.locator('input[name="email"]').focus();
	await page.keyboard.type("keyboard@example.com");
	await page.keyboard.press("Tab");
	await page.keyboard.type("Resident");
	await page.keyboard.press("Tab");
	await page.keyboard.press("Space");
	await page.locator('input[name="email"]').press("Enter");
	await page.getByRole("button", { name: "Remove my address" }).waitFor();
	must(
		(await page.getByRole("status").innerText()) === "Signed up.",
		"a screen reader is told that the sign-up went through",
	);
	await page.getByRole("button", { name: "Remove my address" }).press("Enter");
	await page.getByText("Done.").waitFor();
	await page.close();
	await worker.sql("UPDATE settings SET signup_open = 0");
	expect(
		true,
		"the keyboard reaches the content and the sign-up, fields have labels, headings have an order, and a status is announced",
	);
}

/** A reader who has an item's page asks for it again after it was withdrawn. */
async function withdrawnWhileKept(
	browser: Browser,
	worker: BuiltWorker,
	bundle: BundleFile,
) {
	const id = bundle.items.at(-1)?.id as string;
	const page = await browser.newPage();
	const first = await page.goto(`${worker.base()}/item/${id}`);
	must(first?.status() === 200, `/item/${id} answers ${first?.status()}`);
	await page.locator(".masthead a[href='/method']").click();
	await worker.sql(
		"INSERT INTO withdrawn_items (id, town, board, meeting_date, withdrawn_at) SELECT id, 'A town', board, meeting_date, '2026-05-03T12:00:00Z' FROM items WHERE id = ?1",
		id,
	);
	await worker.sql("DELETE FROM items WHERE id = ?1", id);
	// As a link does: the browser may use what it kept, if it is allowed to.
	const answer = page.waitForResponse((response) =>
		response.url().endsWith(`/item/${id}`),
	);
	await page.evaluate((path) => {
		const link = document.createElement("a");
		link.href = path;
		document.body.append(link);
		link.click();
	}, `/item/${id}`);
	const again = await answer;
	await page
		.getByRole("heading", { name: "This item was withdrawn" })
		.waitFor();
	expect(
		again.status() === 410,
		"a browser that had an item's page learns by a link to it that it was withdrawn",
	);
	await page.close();
}

/** D1 does not answer. */
async function broken(worker: BuiltWorker, paths: Record<string, string>) {
	await worker.configure({ bindings: { APP_ENV: "preview" }, noData: true });
	for (const path of ["/", paths.item, paths.town, "/method"]) {
		const page = await read(worker, path as string);
		must(
			page.status === 503 &&
				page.headers.get("cache-control") === "no-store, no-transform" &&
				page.main.includes("This page could not be loaded") &&
				!/no such table|D1_ERROR|SQLITE|\bat .+\.js:\d+/i.test(page.html),
			`${path} without D1 answers ${page.status}: ${page.html.match(/.{60}(?:no such table|D1_ERROR|SQLITE).{60}/i)?.[0]}`,
		);
	}
	const health = await worker.send("/api/health");
	must(
		health.status === 503 &&
			((await health.json()) as { signup: string }).signup === "closed",
		"/api/health without D1",
	);
	const sitemap = await worker.send("/sitemap.xml");
	must(
		sitemap.status >= 500 &&
			!/no such table|D1_ERROR/i.test(await sitemap.text()),
		`/sitemap.xml without D1 answers ${sitemap.status}`,
	);
	for (const path of ["/privacy", "/terms"])
		must((await read(worker, path)).status === 200, `${path} without D1`);
	expect(
		true,
		"when D1 cannot answer, a page answers 503, says that it could not be loaded and nothing of the inside, and so does health",
	);
}

let worker: BuiltWorker | undefined;
let browser: Browser | undefined;
try {
	const bundle = readBundleFile();
	worker = await startBuiltWorker(
		Number(process.env.STACK_PAGES_PORT ?? 4313),
		{
			bindings: { LOCAL_TODAY: bundle.window.end },
		},
	);
	await loadInto(worker, bundle);
	const paths = kinds(bundle);
	const documents = await heads(worker, paths);
	await otherAnswers(worker);
	await references(worker, documents);
	browser = await launch();
	await inChromium(browser, worker, [
		...Object.values(paths),
		"/pricing",
		"/no-such-page",
	]);
	await worker.sql("UPDATE settings SET signup_open = 1");
	await inChromium(browser, worker, ["/"]);
	await worker.sql("UPDATE settings SET signup_open = 0");
	await withoutScript(browser, worker, bundle);
	await keyboard(browser, worker);
	await withdrawnWhileKept(browser, worker, bundle);
	await broken(worker, paths);
	expect(worker.egress.length === 0, "the Worker sent no request anywhere");
	done();
} catch (error) {
	console.error(error instanceof Error ? error.message : error);
	process.exitCode = 1;
} finally {
	await browser?.close();
	await worker?.stop();
}
