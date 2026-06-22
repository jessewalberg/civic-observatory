import { describe, expect, it } from "vitest";
import {
	getAppProviderMode,
	hasClerkSessionCookie,
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

	it("detects Clerk's app-domain session cookie without treating empty cookies as signed in", () => {
		expect(hasClerkSessionCookie(null)).toBe(false);
		expect(hasClerkSessionCookie("")).toBe(false);
		expect(hasClerkSessionCookie("foo=bar; theme=dark")).toBe(false);
		expect(hasClerkSessionCookie("__session=")).toBe(false);
		expect(hasClerkSessionCookie("theme=dark; __session=jwt; foo=bar")).toBe(
			true,
		);
	});

	it("keeps signed-out public routes on the public provider but upgrades signed-in public routes", () => {
		expect(getAppProviderMode("/", false)).toBe("public");
		expect(getAppProviderMode("/explore/austin-tx", false)).toBe("public");
		expect(getAppProviderMode("/pricing", false)).toBe("public");

		expect(getAppProviderMode("/", true)).toBe("authenticated");
		expect(getAppProviderMode("/explore/austin-tx", true)).toBe(
			"authenticated",
		);
		expect(getAppProviderMode("/pricing", true)).toBe("authenticated");
		expect(getAppProviderMode("/dashboard", false)).toBe("authenticated");
	});

	it("shows authenticated header controls only on protected app routes", () => {
		expect(showsAuthenticatedHeaderControls("/sign-in")).toBe(false);
		expect(showsAuthenticatedHeaderControls("/pricing")).toBe(false);
		expect(showsAuthenticatedHeaderControls("/dashboard")).toBe(true);
		expect(showsAuthenticatedHeaderControls("/admin/coverage")).toBe(true);
	});

	it("shows signed-in controls on public routes only when a session cookie exists", () => {
		expect(showsAuthenticatedHeaderControls("/pricing", false)).toBe(false);
		expect(showsAuthenticatedHeaderControls("/pricing", true)).toBe(true);
		expect(showsAuthenticatedHeaderControls("/explore/austin-tx", true)).toBe(
			true,
		);
		expect(showsAuthenticatedHeaderControls("/sign-in", true)).toBe(false);
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

	it("runs Clerk request middleware for public router requests only when a session cookie exists", () => {
		expect(requiresClerkRequestMiddleware("/", "router", false)).toBe(false);
		expect(requiresClerkRequestMiddleware("/explore", "router", false)).toBe(
			false,
		);
		expect(requiresClerkRequestMiddleware("/", "router", true)).toBe(true);
		expect(requiresClerkRequestMiddleware("/explore", "router", true)).toBe(
			true,
		);
	});
});
