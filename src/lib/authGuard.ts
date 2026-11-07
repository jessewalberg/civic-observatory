import { redirect } from "@tanstack/react-router";
export function enforceSignedIn(state: { isAuthenticated: boolean }): void {
	if (!state.isAuthenticated) {
		throw redirect({ to: "/sign-in" });
	}
}
