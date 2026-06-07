import { useConvexAuth, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Doc } from "../../convex/_generated/dataModel";

/**
 * Current Convex user, derived from the Clerk identity that Convex sees via
 * ctx.auth (Phase 2 bridge). No client-supplied id is passed — the `current`
 * query returns the caller's OWN row, which is what closes the impersonation
 * hole. Returns undefined while loading, null when signed out / no row.
 */
export function useConvexUser(): Doc<"users"> | null | undefined {
	const { isAuthenticated } = useConvexAuth();
	return useQuery(api.functions.users.queries.current, isAuthenticated ? {} : "skip");
}

/**
 * Current user plus derived auth/tier state, for components.
 */
export function useCurrentUser(): {
	user: Doc<"users"> | null | undefined;
	isLoading: boolean;
	isAuthenticated: boolean;
	tier: "anonymous" | "free" | "pro";
} {
	const { isAuthenticated: clerkAuthed, isLoading: clerkLoading } =
		useConvexAuth();
	const convexUser = useConvexUser();

	const isLoading = clerkLoading || (clerkAuthed && convexUser === undefined);
	const isAuthenticated = clerkAuthed && !!convexUser;

	return {
		user: clerkAuthed ? convexUser : null,
		isLoading,
		isAuthenticated,
		tier: convexUser?.tier ?? "anonymous",
	};
}

/**
 * Get the user's tier for rate limiting. Anonymous users get limited access.
 */
export function getUserTier(
	convexUser: Doc<"users"> | null | undefined,
): "anonymous" | "free" | "pro" {
	if (!convexUser) return "anonymous";
	return convexUser.tier;
}

/**
 * Check if user is a pro subscriber.
 */
export function isPro(convexUser: Doc<"users"> | null | undefined): boolean {
	return convexUser?.tier === "pro";
}

/**
 * Check if user is an admin.
 */
export function isAdmin(convexUser: Doc<"users"> | null | undefined): boolean {
	return convexUser?.isAdmin === true;
}
