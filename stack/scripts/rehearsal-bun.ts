// The `bun` and `bunx` of check:release's rehearsal: production.yml's steps call them by
// name, and this plays what a rehearsal must not do again (installing, building, the
// checks before any credential) and runs everything else for real, against the stand-ins
// check-release.ts names in the environment. Never used elsewhere.
import { spawn } from "node:child_process";

const PLAYED = [
	"bun install --frozen-lockfile",
	"bun audit --prod --audit-level=high",
	"bun run check",
	"bun run build",
	"bunx playwright install --with-deps chromium-headless-shell",
	"bun run check:docket",
	"bun run check:signup",
	"bun run check:pages",
	"bun run check:limits",
];

async function play(asked: string[]): Promise<number> {
	const line = asked.join(" ");
	if (PLAYED.includes(line)) {
		if (process.env.CLOUDFLARE_API_TOKEN || process.env.GITHUB_TOKEN)
			throw new Error(`${line} ran with a credential.`);
		console.log(`rehearsal: ${line}`);
		return 0;
	}
	const [tool, ...args] = asked;
	// package.json's deploy:production:ci, which check-release.ts reads.
	const real =
		line === "bun run deploy:production:ci"
			? ["scripts/infra.ts", "deploy", "--yes"]
			: args;
	if (
		tool !== "bun" ||
		!/^scripts\/(?:infra|check-production|production-domain|await-docket)\.ts$/.test(
			real[0] ?? "",
		)
	)
		throw new Error(`The rehearsal has no part for: ${line}`);
	const child = spawn(process.execPath, real, { stdio: "inherit" });
	return new Promise((resolve) =>
		child.on("close", (code) => resolve(code ?? 1)),
	);
}

process.exitCode = await play(process.argv.slice(2));
