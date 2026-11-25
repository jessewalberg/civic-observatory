// The Worker exactly as Alchemy builds it for a stage: its own build child
// (@alchemy.run/cloudflare, Workers/ViteBuildChildRunner), run as its provider runs
// it, with no plan, state, credential or network. check:release serves this output,
// so what it proves is what a release uploads, not a similar build.
import { spawnSync } from "node:child_process";
import {
	cpSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deserialize, serialize } from "node:v8";

const root = fileURLToPath(new URL("..", import.meta.url));

interface Built {
	clientDirectory: string;
	serverBundle: { files: { path: string; content: string | Uint8Array }[] };
}

export interface AlchemyBuild {
	/** Where the Worker's modules are. */
	server: string;
	/** Module paths under `server`; the first is the entry. */
	modules: string[];
	/** The static files, `_headers` included. */
	client: string;
}

/** As alchemy.run.ts declares; check:guard compares the two. */
export const ALCHEMY_COMPATIBILITY = {
	compatibilityDate: "2026-01-14",
	compatibilityFlags: ["nodejs_compat"],
};

export function alchemyBuild(into: string, release: string): AlchemyBuild {
	const scratch = mkdtempSync(join(into, "build-"));
	const outputPath = join(scratch, "result.v8");
	try {
		const child = spawnSync(
			process.execPath,
			[
				"run",
				join(
					root,
					"node_modules/@alchemy.run/cloudflare/src/Workers/ViteBuildChildRunner.ts",
				),
			],
			{
				cwd: root,
				env: { ...process.env, NODE_ENV: "production", APP_RELEASE: release },
				input: serialize({
					rootDir: root,
					env: {},
					main: join(root, "src/server.ts"),
					framework: undefined,
					...ALCHEMY_COMPATIBILITY,
					viteEnvironments: undefined,
					outputPath,
				}),
				maxBuffer: 64 * 1024 * 1024,
			},
		);
		if (child.status !== 0)
			throw new Error(
				`Alchemy's build failed (${child.status})\n${child.stdout}\n${child.stderr}`,
			);
		const built = deserialize(readFileSync(outputPath)) as Built;
		const server = join(into, "server");
		const modules: string[] = [];
		for (const { path, content } of built.serverBundle.files) {
			mkdirSync(dirname(join(server, path)), { recursive: true });
			writeFileSync(join(server, path), content);
			modules.push(path);
		}
		// Another build would replace it under a running Worker.
		const client = join(into, "client");
		cpSync(built.clientDirectory, client, { recursive: true });
		return { server, modules, client };
	} finally {
		rmSync(scratch, { recursive: true, force: true });
	}
}
