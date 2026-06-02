import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

// Standalone Vitest config: deliberately does NOT load vite.config.ts, so the
// Cloudflare Workers vite plugin (and its workers runner) stays out of the test
// run. Unit tests execute in a plain Node environment where CommonJS deps work.
export default defineConfig({
	plugins: [tsconfigPaths({ projects: ["./tsconfig.json"] })],
	test: {
		environment: "node",
		include: ["src/**/*.test.{ts,tsx}", "convex/**/*.test.{ts,tsx}"],
	},
});
