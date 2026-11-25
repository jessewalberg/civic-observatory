// `bun run screenshots <folder>`: pictures of the pages for a person to look at,
// with DOCKET_BUNDLE's file or the fixture. Not a check.
import { mkdirSync } from "node:fs";
import type { Browser } from "@playwright/test";
import { type BuiltWorker, startBuiltWorker } from "./built-worker";
import { launch, loadInto, readBundleFile, slug } from "./harness";

const folder = process.argv[2];
if (!folder) throw new Error("Use: bun run screenshots <folder>");
mkdirSync(folder, { recursive: true });

let worker: BuiltWorker | undefined;
let browser: Browser | undefined;
try {
	const bundle = readBundleFile();
	worker = await startBuiltWorker(
		Number(process.env.STACK_SHOTS_PORT ?? 4315),
		{
			bindings: { LOCAL_TODAY: bundle.window.end },
		},
	);
	await loadInto(worker, bundle);
	browser = await launch();
	const blocked = bundle.sources.find(({ boards }) =>
		boards.every(({ status }) => status === "blocked"),
	)?.town as string;
	const item =
		bundle.items.find(({ address_source }) => address_source) ??
		bundle.items[0];
	const decided = bundle.items.find(({ kind }) => kind === "decision");
	const paths: [string, string][] = [
		["home", "/"],
		["filtered", `/?town=${slug(decided?.town as string)}&kind=decision`],
		["item", `/item/${decided?.id}`],
		["item-address", `/item/${item?.id}`],
		["town", `/town/${slug(decided?.town as string)}`],
		["not-collected", `/town/${slug(blocked)}`],
		["method", "/method"],
		["gone", "/pricing"],
	];
	for (const width of [390, 1200])
		for (const colorScheme of ["light", "dark"] as const) {
			const context = await browser.newContext({
				viewport: { width, height: width === 390 ? 844 : 900 },
				colorScheme,
			});
			const page = await context.newPage();
			const shot = (title: string, fullPage = false) =>
				page.screenshot({
					path: `${folder}/${title}-${width}-${colorScheme}.png`,
					fullPage,
				});
			for (const [title, path] of paths) {
				await page.goto(`${worker.base()}${path}`, {
					waitUntil: "networkidle",
				});
				await shot(
					title,
					["item", "item-address", "not-collected"].includes(title),
				);
			}
			await worker.sql("UPDATE settings SET signup_open = 1");
			await page.goto(worker.base(), { waitUntil: "networkidle" });
			await shot("signup-open");
			await page.locator('form[data-ready="true"]').waitFor();
			await page.fill('input[name="email"]', "reader@example.com");
			await page.selectOption('select[name="role"]', "builder_developer");
			await page.click('button[type="submit"]:has-text("Sign up")');
			await shot("signup-no-town");
			await page.locator('input[name="towns"]').first().check();
			await page.click('button[type="submit"]:has-text("Sign up")');
			await page.getByRole("button", { name: /^Tell me/ }).click();
			await page.getByText("Noted.").waitFor();
			await shot("signup-done");
			await page.getByRole("button", { name: "Remove my address" }).click();
			await page.getByText("Done.").waitFor();
			await shot("signup-removed");
			await worker.sql("UPDATE settings SET signup_open = 0");
			await context.close();
		}
	console.log(`pictures in ${folder}`);
} finally {
	await browser?.close();
	await worker?.stop();
}
