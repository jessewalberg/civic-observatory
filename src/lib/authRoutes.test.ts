import { describe, expect, it } from "vitest";
import {
	requiresAuthenticatedProviders,
	requiresClerkRequestMiddleware,
	showsAuthenticatedHeaderControls,
} from "./authRoutes";

describe("auth route boundaries", () => {
	it("uses authenticated client providers only for auth and protected routes", () => {
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

	it("runs Clerk request middleware only where server auth state is needed", () => {
		expect(requiresClerkRequestMiddleware("/", "router")).toBe(false);
		expect(requiresClerkRequestMiddleware("/explore", "router")).toBe(false);
		expect(requiresClerkRequestMiddleware("/pricing", "router")).toBe(false);

		expect(requiresClerkRequestMiddleware("/sign-in", "router")).toBe(true);
		expect(requiresClerkRequestMiddleware("/dashboard", "router")).toBe(true);
		expect(requiresClerkRequestMiddleware("/admin/users", "router")).toBe(true);
		expect(requiresClerkRequestMiddleware("/__clerk/handshake", "router")).toBe(
			true,
		);
		expect(requiresClerkRequestMiddleware("/_server", "serverFn")).toBe(true);
	});
});
