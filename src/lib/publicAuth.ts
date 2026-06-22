import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { useAuthenticatedShell } from "./authShell";

export type PublicAuthState = {
	user: Doc<"users"> | null | undefined;
	userId?: Id<"users">;
	userEmail?: string;
	isAuthenticated: boolean;
	isLoading: boolean;
	tier: "anonymous" | "free" | "pro";
};

export function usePublicAuthState(): PublicAuthState {
	const hasAuthenticatedShell = useAuthenticatedShell();
	const user = useQuery(
		api.functions.users.queries.current,
		hasAuthenticatedShell ? {} : "skip",
	);

	return {
		user,
		userId: user?._id,
		userEmail: user?.email,
		isAuthenticated: Boolean(user),
		isLoading: hasAuthenticatedShell && user === undefined,
		tier: user?.tier ?? "anonymous",
	};
}
