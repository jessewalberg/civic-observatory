// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { publicProviderSpy, authenticatedProviderSpy } = vi.hoisted(() => ({
	publicProviderSpy: vi.fn(),
	authenticatedProviderSpy: vi.fn(),
}));

vi.mock("convex/react", () => ({
	ConvexProvider: (props: { client?: unknown; children?: React.ReactNode }) => {
		publicProviderSpy(props.client);
		return <div data-testid="public-convex-provider">{props.children}</div>;
	},
	ConvexReactClient: class MockConvexReactClient {
		url: string;

		constructor(url: string) {
			this.url = url;
		}
	},
}));

vi.mock("./AuthenticatedConvexProvider", () => ({
	AuthenticatedConvexProvider: (props: { children?: React.ReactNode }) => {
		authenticatedProviderSpy();
		return (
			<div data-testid="authenticated-convex-provider">{props.children}</div>
		);
	},
}));

import {
	AppConvexProvider,
	requiresAuthenticatedProviders,
	showsAuthenticatedHeaderControls,
} from "./AppConvexProvider";

describe("AppConvexProvider", () => {
	afterEach(() => {
		cleanup();
		vi.unstubAllEnvs();
		publicProviderSpy.mockClear();
		authenticatedProviderSpy.mockClear();
	});

	it("uses plain Convex on public routes without mounting Clerk", () => {
		vi.stubEnv("VITE_CONVEX_URL", "https://example.convex.cloud");

		render(
			<AppConvexProvider mode="public">
				<span>app-children</span>
			</AppConvexProvider>,
		);

		expect(screen.getByTestId("public-convex-provider")).toBeDefined();
		expect(screen.getByText("app-children")).toBeDefined();
		expect(publicProviderSpy).toHaveBeenCalledTimes(1);
		expect(authenticatedProviderSpy).not.toHaveBeenCalled();
	});

	it("uses the authenticated provider only when explicitly requested", async () => {
		vi.stubEnv("VITE_CONVEX_URL", "https://example.convex.cloud");

		render(
			<AppConvexProvider mode="authenticated">
				<span>private-children</span>
			</AppConvexProvider>,
		);

		expect(
			await screen.findByTestId("authenticated-convex-provider"),
		).toBeDefined();
		expect(screen.getByText("private-children")).toBeDefined();
		expect(publicProviderSpy).not.toHaveBeenCalled();
		expect(authenticatedProviderSpy).toHaveBeenCalledTimes(1);
	});
});

describe("provider route boundaries", () => {
	it("limits Clerk/Convex auth providers to auth and protected routes", () => {
		expect(requiresAuthenticatedProviders("/")).toBe(false);
		expect(requiresAuthenticatedProviders("/explore")).toBe(false);
		expect(requiresAuthenticatedProviders("/explore/austin-tx")).toBe(false);
		expect(requiresAuthenticatedProviders("/pricing")).toBe(false);
		expect(requiresAuthenticatedProviders("/meeting/austin-tx-2026")).toBe(
			false,
		);

		expect(requiresAuthenticatedProviders("/sign-in")).toBe(true);
		expect(requiresAuthenticatedProviders("/sign-up/setup")).toBe(true);
		expect(requiresAuthenticatedProviders("/dashboard")).toBe(true);
		expect(requiresAuthenticatedProviders("/admin/users")).toBe(true);
	});

	it("shows authenticated header controls only on protected app routes", () => {
		expect(showsAuthenticatedHeaderControls("/sign-in")).toBe(false);
		expect(showsAuthenticatedHeaderControls("/pricing")).toBe(false);
		expect(showsAuthenticatedHeaderControls("/dashboard")).toBe(true);
		expect(showsAuthenticatedHeaderControls("/admin/coverage")).toBe(true);
	});
});
