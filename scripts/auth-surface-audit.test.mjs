import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { auditAuthSurface } from "./auth-surface-audit.mjs";

describe("auth surface audit", () => {
	it("accepts the current Clerk-only auth surface", async () => {
		const result = await auditAuthSurface({ rootDir: process.cwd() });

		expect(result.ok).toBe(true);
		expect(result.violations).toEqual([]);
	});

	it("flags WorkOS dependencies, env vars, and legacy trust args", async () => {
		const rootDir = mkdtempSync(join(tmpdir(), "auth-surface-audit-"));
		try {
			writeFileSync(
				join(rootDir, "package.json"),
				JSON.stringify({
					dependencies: { "@workos-inc/authkit-react": "1.0.0" },
				}),
			);
			writeFileSync(join(rootDir, ".env.example"), "WORKOS_ADMIN_USER_ID=\n");
			writeFileSync(
				join(rootDir, "active.ts"),
				"export const args = { requestingWorkosUserId: 'user_wos_root' };\n",
			);

			const result = await auditAuthSurface({ rootDir });

			expect(result.ok).toBe(false);
			expect(result.violations.map((violation) => violation.kind)).toEqual([
				"dependency",
				"env",
				"legacy-trust-arg",
			]);
		} finally {
			rmSync(rootDir, { recursive: true, force: true });
		}
	});
});
