import { redirect } from "@tanstack/react-router";

/**
 * Pure guard decision (Phase 3 WorkOS→Clerk): throw a redirect to the sign-in
 * route when the request carries no authenticated Clerk session. Kept separate
 * from the server-fn wrapper so the contract is unit-testable without a router.
 */
export function enforceSignedIn(state: { isAuthenticated: boolean }): void {
	if (!state.isAuthenticated) {
		throw redirect({ to: "/sign-in" });
	}
}
