// @vitest-environment jsdom
// Phase 4 (WorkOS→Clerk): useCurrentUser must derive identity from Clerk +
// the Convex `current` query (which reads ctx.auth) — NOT by passing a
// client-supplied workosUserId. These tests pin that contract.
import { describe, expect, it, vi } from "vitest";

const { useConvexAuthSpy, currentQueryRef, useQuerySpy } = vi.hoisted(() => ({
	useConvexAuthSpy: vi.fn(),
	currentQueryRef: { __ref: "users.queries.current" },
	useQuerySpy: vi.fn(),
}));

vi.mock("convex/react", () => ({
	useConvexAuth: useConvexAuthSpy,
	useQuery: useQuerySpy,
}));

vi.mock("../../convex/_generated/api", () => ({
	api: { functions: { users: { queries: { current: currentQueryRef } } } },
}));

import { useCurrentUser } from "./auth";

describe("useCurrentUser (Phase 4 Clerk-derived identity)", () => {
	it("queries the identity-derived `current` query with NO workosUserId arg", () => {
		useConvexAuthSpy.mockReturnValue({
			isAuthenticated: true,
			isLoading: false,
		});
		useQuerySpy.mockReturnValue({ _id: "u1", tier: "pro", isAdmin: false });

		const result = useCurrentUser();

		// The query ref is the identity query, and the args are empty/skip — never
		// a client-supplied id (the impersonation hole Phase 2 closed).
		expect(useQuerySpy).toHaveBeenCalledTimes(1);
		const [ref, args] = useQuerySpy.mock.calls[0];
		expect(ref).toBe(currentQueryRef);
		expect(args).not.toMatchObject({ workosUserId: expect.anything() });
		expect(result.isAuthenticated).toBe(true);
		expect(result.tier).toBe("pro");
	});

	it("is anonymous + skips the query when Clerk is signed out", () => {
		useConvexAuthSpy.mockReturnValue({
			isAuthenticated: false,
			isLoading: false,
		});
		useQuerySpy.mockReturnValue(undefined);

		const result = useCurrentUser();

		expect(useQuerySpy).toHaveBeenCalledWith(currentQueryRef, "skip");
		expect(result.isAuthenticated).toBe(false);
		expect(result.tier).toBe("anonymous");
		expect(result.user).toBeNull();
	});
});
