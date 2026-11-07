import { createAuthClient } from "better-auth/react";
export const authClient = createAuthClient();
export function useSessionState() {
	const { data, isPending } = authClient.useSession();
	return {
		isAuthenticated: Boolean(data?.user),
		isLoading: isPending,
		user: data?.user ?? null,
	};
}
