import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { User } from "@workos-inc/node";
import type { Doc } from "../../convex/_generated/dataModel";
import { useWorkOSUser } from "../components/ConvexClientProvider";

// Re-export server functions for convenience
export { getAuth, getSignInUrl, getSignUpUrl, signOut } from "../authkit/serverFunctions";

/**
 * Hook to get the current Convex user based on WorkOS user
 * Can optionally pass a WorkOS user, otherwise uses context
 */
export function useConvexUser(workosUser?: User | null) {
  const contextUser = useWorkOSUser();
  const user = workosUser !== undefined ? workosUser : contextUser;

  const convexUser = useQuery(
    api.functions.users.queries.getByWorkosUserId,
    user ? { workosUserId: user.id } : "skip"
  );
  return convexUser;
}

/**
 * Hook to get current user with their tier information
 * Can optionally pass a WorkOS user, otherwise uses context
 */
export function useCurrentUser(workosUser?: User | null): {
  user: Doc<"users"> | null | undefined;
  isLoading: boolean;
  isAuthenticated: boolean;
  tier: "anonymous" | "free" | "pro";
} {
  const contextUser = useWorkOSUser();
  const user = workosUser !== undefined ? workosUser : contextUser;
  const convexUser = useConvexUser(user);

  const isLoading = user !== null && convexUser === undefined;
  const isAuthenticated = user !== null && convexUser !== null;

  return {
    user: convexUser,
    isLoading,
    isAuthenticated,
    tier: convexUser?.tier ?? "anonymous",
  };
}

/**
 * Get the user's tier for rate limiting
 * Anonymous users get limited access
 */
export function getUserTier(convexUser: Doc<"users"> | null | undefined): "anonymous" | "free" | "pro" {
  if (!convexUser) return "anonymous";
  return convexUser.tier;
}

/**
 * Check if user is authenticated
 */
export function isAuthenticated(workosUser: User | null): workosUser is User {
  return workosUser !== null;
}

/**
 * Check if user is a pro subscriber
 */
export function isPro(convexUser: Doc<"users"> | null | undefined): boolean {
  return convexUser?.tier === "pro";
}

/**
 * Check if user is an admin
 */
export function isAdmin(convexUser: Doc<"users"> | null | undefined): boolean {
  return convexUser?.isAdmin === true;
}
