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

		expect(header).not.toMatch(/from\s+"@clerk\/tanstack-react-start"/);
		expect(header).not.toMatch(
			/import\s+\{[^}]*UserButton[^}]*\}\s+from\s+"@clerk\/tanstack-react-start"/,
		);
		expect(header).not.toMatch(
			/import\s+\{[^}]*SignInButton[^}]*\}\s+from\s+"@clerk\/tanstack-react-start"/,
		);
	});

	it("keeps the public provider shell free of Clerk imports", () => {
		const providerShell = readFileSync(
			join(process.cwd(), "src/components/AppConvexProvider.tsx"),
			"utf8",
		);

		expect(providerShell).not.toMatch(/@clerk\/tanstack-react-start/);
		expect(providerShell).not.toMatch(/convex\/react-clerk/);
	});

	it("keeps signed-out public routes off Clerk and Convex auth hooks", () => {
		const publicRouteFiles = [
			"src/routes/index.tsx",
			"src/routes/search.tsx",
			"src/routes/topics/$topic.tsx",
			"src/routes/pricing.tsx",
			"src/routes/explore/$municipalityId.tsx",
			"src/routes/meeting/$meetingId.tsx",
		];

		for (const routeFile of publicRouteFiles) {
			const source = readFileSync(join(process.cwd(), routeFile), "utf8");

			expect(source, routeFile).not.toMatch(
				/from\s+"@clerk\/tanstack-react-start"/,
			);
			expect(source, routeFile).not.toMatch(/\buseConvexAuth\b/);
		}
	});

	it("keeps the public coverage request dialog auth-free by default", () => {
		const dialog = readFileSync(
			join(process.cwd(), "src/components/CoverageRequestDialog.tsx"),
			"utf8",
		);

		expect(dialog).not.toMatch(/useCurrentUser/);
		expect(dialog).not.toMatch(/\buseConvexAuth\b/);
	});
});
