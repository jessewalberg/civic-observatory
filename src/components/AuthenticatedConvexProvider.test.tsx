// @vitest-environment jsdom
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

vi.mock("./UserBootstrap", () => ({ UserBootstrap: () => null }));

import { ConvexReactClient } from "convex/react";
import { AuthenticatedConvexProvider } from "./AuthenticatedConvexProvider";

describe("AuthenticatedConvexProvider", () => {
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
			<AuthenticatedConvexProvider>
				<span>app-children</span>
			</AuthenticatedConvexProvider>,
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
