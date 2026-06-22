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

	it("does not statically import Clerk UI controls in the global header", () => {
		const header = readFileSync(
			join(process.cwd(), "src/components/Header.tsx"),
			"utf8",
		);

		expect(header).not.toMatch(
			/import\s+\{[^}]*UserButton[^}]*\}\s+from\s+"@clerk\/tanstack-react-start"/,
		);
		expect(header).not.toMatch(
			/import\s+\{[^}]*SignInButton[^}]*\}\s+from\s+"@clerk\/tanstack-react-start"/,
		);
	});
});
