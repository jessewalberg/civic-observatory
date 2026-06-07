// @vitest-environment jsdom
// Phase 4: AppConvexProvider always mounts Clerk + Convex-Clerk (WorkOS path
// removed). These tests pin that the publishable key flows to ClerkProvider and
// ConvexProviderWithClerk gets a real client + the exact Clerk useAuth hook.
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { clerkProviderSpy, convexWithClerkSpy, mockedUseAuth } = vi.hoisted(
	() => ({
		clerkProviderSpy: vi.fn(),
		convexWithClerkSpy: vi.fn(),
		mockedUseAuth: () => ({ isLoaded: true, isSignedIn: false }),
	}),
);

vi.mock("@clerk/tanstack-react-start", () => ({
	ClerkProvider: (props: {
		publishableKey?: string;
		children?: React.ReactNode;
	}) => {
		clerkProviderSpy(props.publishableKey);
		return <div data-testid="clerk-provider">{props.children}</div>;
	},
	useAuth: mockedUseAuth,
}));
vi.mock("convex/react-clerk", () => ({
	ConvexProviderWithClerk: (props: {
		client?: unknown;
		useAuth?: unknown;
		children?: React.ReactNode;
	}) => {
		convexWithClerkSpy({ client: props.client, useAuth: props.useAuth });
		return <div data-testid="convex-with-clerk">{props.children}</div>;
	},
}));
// UserBootstrap hits real Convex hooks; this test only asserts provider wiring.
vi.mock("./UserBootstrap", () => ({ UserBootstrap: () => null }));

import { ConvexReactClient } from "convex/react";
import { AppConvexProvider } from "./AppConvexProvider";

describe("AppConvexProvider (Clerk + Convex)", () => {
	afterEach(() => {
		cleanup();
		vi.unstubAllEnvs();
		clerkProviderSpy.mockClear();
		convexWithClerkSpy.mockClear();
	});

	it("mounts ClerkProvider + ConvexProviderWithClerk with the full contract", () => {
		vi.stubEnv("VITE_CLERK_PUBLISHABLE_KEY", "pk_test_fake123");
		vi.stubEnv("VITE_CONVEX_URL", "https://example.convex.cloud");

		render(
			<AppConvexProvider>
				<span>app-children</span>
			</AppConvexProvider>,
		);

		expect(screen.getByTestId("clerk-provider")).toBeDefined();
		expect(screen.getByTestId("convex-with-clerk")).toBeDefined();
		expect(screen.getByText("app-children")).toBeDefined();
		expect(clerkProviderSpy).toHaveBeenCalledWith("pk_test_fake123");
		expect(convexWithClerkSpy).toHaveBeenCalledTimes(1);
		const wired = convexWithClerkSpy.mock.calls[0][0];
		expect(wired.client).toBeInstanceOf(ConvexReactClient);
		expect(wired.useAuth).toBe(mockedUseAuth);
	});
});
