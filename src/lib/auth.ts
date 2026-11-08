import { api } from "../../server/api";
import type { Doc } from "../../server/model";
import { useRead } from "./data";
import { useSessionState } from "./session";
export function useAppUser(): Doc<"users"> | null | undefined {
	const { isAuthenticated } = useSessionState();
	return useRead(
		api.functions.users.queries.current,
		isAuthenticated ? {} : "skip",
	);
}
export function useCurrentUser() {
	const session = useSessionState();
	const user = useAppUser();
	return {
		user: session.isAuthenticated ? user : null,
		isLoading:
			session.isLoading || (session.isAuthenticated && user === undefined),
		isAuthenticated: session.isAuthenticated && Boolean(user),
		tier: user?.tier ?? ("anonymous" as "anonymous" | "free" | "pro"),
	};
}
export function getUserTier(
	user: Doc<"users"> | null | undefined,
): "anonymous" | "free" | "pro" {
	return user?.tier ?? "anonymous";
}
export function isPro(user: Doc<"users"> | null | undefined) {
	return user?.tier === "pro";
}
export function isAdmin(user: Doc<"users"> | null | undefined) {
	return user?.isAdmin === true;
}
