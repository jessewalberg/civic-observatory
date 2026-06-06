// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// Mock the Clerk + Convex-Clerk integration modules to lightweight
// passthroughs: these tests prove OUR gating/wiring (which provider mounts,
// with which props), not Clerk's internals.
const clerkProviderSpy = vi.fn();
const convexWithClerkSpy = vi.fn();

vi.mock("@clerk/tanstack-react-start", () => ({
	ClerkProvider: (props: { publishableKey?: string; children?: React.ReactNode }) => {
		clerkProviderSpy(props.publishableKey);
		return <div data-testid="clerk-provider">{props.children}</div>;
	},
	useAuth: () => ({ isLoaded: true, isSignedIn: false }),
}));
vi.mock("convex/react-clerk", () => ({
	ConvexProviderWithClerk: (props: { useAuth?: unknown; children?: React.ReactNode }) => {
		convexWithClerkSpy(typeof props.useAuth);
		return <div data-testid="convex-with-clerk">{props.children}</div>;
	},
}));

import { AppConvexProvider } from "./AppConvexProvider";

describe("AppConvexProvider (Phase 1 gated mount)", () => {
	afterEach(() => {
		cleanup();
		vi.unstubAllEnvs();
		clerkProviderSpy.mockClear();
		convexWithClerkSpy.mockClear();
	});

	it("renders the legacy WorkOS path untouched when Clerk is not configured", () => {
		vi.stubEnv("VITE_CLERK_PUBLISHABLE_KEY", "");
		vi.stubEnv("VITE_CONVEX_URL", "https://example.convex.cloud");

		render(
			<AppConvexProvider user={null}>
				<span>app-children</span>
			</AppConvexProvider>,
		);

		expect(screen.getByText("app-children")).toBeDefined();
		expect(screen.queryByTestId("clerk-provider")).toBeNull();
		expect(clerkProviderSpy).not.toHaveBeenCalled();
	});

	it("mounts ClerkProvider + ConvexProviderWithClerk when a key is configured", () => {
		vi.stubEnv("VITE_CLERK_PUBLISHABLE_KEY", "pk_test_fake123");
		vi.stubEnv("VITE_CONVEX_URL", "https://example.convex.cloud");

		render(
			<AppConvexProvider user={null}>
				<span>app-children</span>
			</AppConvexProvider>,
		);

		expect(screen.getByTestId("clerk-provider")).toBeDefined();
		expect(screen.getByTestId("convex-with-clerk")).toBeDefined();
		expect(screen.getByText("app-children")).toBeDefined();
		// Our wiring passes the publishable key + a useAuth hook through.
		expect(clerkProviderSpy).toHaveBeenCalledWith("pk_test_fake123");
		expect(convexWithClerkSpy).toHaveBeenCalledWith("function");
	});

	it("still provides the WorkOS user context in Clerk mode (transition phases need both)", async () => {
		vi.stubEnv("VITE_CLERK_PUBLISHABLE_KEY", "pk_test_fake123");
		vi.stubEnv("VITE_CONVEX_URL", "https://example.convex.cloud");
		const { useWorkOSUser } = await import("./ConvexClientProvider");

		function Probe() {
			const user = useWorkOSUser();
			return <span>{user ? user.id : "no-user"}</span>;
		}

		render(
			<AppConvexProvider user={{ id: "user_wos_1" } as never}>
				<Probe />
			</AppConvexProvider>,
		);

		expect(screen.getByText("user_wos_1")).toBeDefined();
	});
});
