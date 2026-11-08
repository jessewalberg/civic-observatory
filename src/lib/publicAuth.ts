import type { Doc, Id } from "../../server/model";
import { useCurrentUser } from "./auth";
export type PublicAuthState = {
	user: Doc<"users"> | null | undefined;
	userId?: Id<"users">;
	userEmail?: string;
	isAuthenticated: boolean;
	isLoading: boolean;
	tier: "anonymous" | "free" | "pro";
};
export function usePublicAuthState(): PublicAuthState {
	const auth = useCurrentUser();
	return { ...auth, userId: auth.user?._id, userEmail: auth.user?.email };
}
