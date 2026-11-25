import { execFileSync } from "node:child_process";
import { fileURLToPath, URL } from "node:url";
import { cloudflare } from "@cloudflare/vite-plugin";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { FUNCTIONS } from "./src/lib/site";

// The checkout's full commit, served by /api/health, x-commit-sha and the page.
const commit = execFileSync("git", ["rev-parse", "HEAD"], {
	cwd: fileURLToPath(new URL(".", import.meta.url)),
	encoding: "utf8",
}).trim();

export default defineConfig({
	define: { "import.meta.env.VITE_COMMIT_SHA": JSON.stringify(commit) },
	// Server source maps go with the Worker upload, never into public assets.
	environments: { ssr: { build: { sourcemap: "hidden" } } },
	resolve: {
		alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
	},
	plugins: [
		// Local bindings from wrangler.jsonc, and nothing remote.
		cloudflare({ viteEnvironment: { name: "ssr" }, remoteBindings: false }),
		// Not the default `/_serverFn`, which a firewall rule blocks for the whole
		// zone (src/lib/site.ts). The browser's calls and the Worker's dispatch
		// both follow this.
		tanstackStart({ serverFns: { base: FUNCTIONS } }),
		viteReact(),
	],
});
