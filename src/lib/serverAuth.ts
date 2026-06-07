import { createServerFn } from "@tanstack/react-start";
import { auth } from "@clerk/tanstack-react-start/server";
import { enforceSignedIn } from "./authGuard";

/**
 * Server-fn used in route `beforeLoad` guards. Reads the Clerk session on the
 * server (via the clerkMiddleware in start.ts) and redirects to /sign-in when
 * absent. The decision itself lives in the pure `enforceSignedIn`.
 */
export const requireAuth = createServerFn({ method: "GET" }).handler(
	async () => {
		const { isAuthenticated } = await auth();
		enforceSignedIn({ isAuthenticated });
	},
);
