// Phase 3 (WorkOS→Clerk migration): SSR route-guard seam. Routes call the
// requireAuth server-fn whose entire decision lives in enforceSignedIn —
// pure, so the redirect contract is provable without a router harness.
import { describe, expect, it, vi } from "vitest";

const { redirectSpy } = vi.hoisted(() => ({
	redirectSpy: vi.fn((opts: { to: string }) => ({
		__redirect: true,
		...opts,
	})),
}));

vi.mock("@tanstack/react-router", () => ({
	redirect: redirectSpy,
}));

import { enforceSignedIn } from "./authGuard";

describe("enforceSignedIn (Phase 3 route guard)", () => {
	it("throws a redirect to /sign-in when the request is unauthenticated", () => {
		let thrown: unknown;
		try {
			enforceSignedIn({ isAuthenticated: false });
		} catch (e) {
			thrown = e;
		}
		expect(redirectSpy).toHaveBeenCalledWith({ to: "/sign-in" });
		expect(thrown).toEqual({ __redirect: true, to: "/sign-in" });
	});

	it("returns without throwing when the request is authenticated", () => {
		expect(() => enforceSignedIn({ isAuthenticated: true })).not.toThrow();
	});
});
