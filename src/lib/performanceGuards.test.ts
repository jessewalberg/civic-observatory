import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("public performance guards", () => {
	it("does not statically import router devtools from the root route", () => {
		const rootRoute = readFileSync(
			join(process.cwd(), "src/routes/__root.tsx"),
			"utf8",
		);

		expect(rootRoute).not.toMatch(
			/import\s+\{[^}]*TanStackRouterDevtools[^}]*\}\s+from\s+"@tanstack\/react-router-devtools"/,
		);
		expect(rootRoute).toContain("import.meta.env.DEV");
	});
});
