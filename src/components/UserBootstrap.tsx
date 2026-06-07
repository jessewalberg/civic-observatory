import { useConvexAuth, useMutation } from "convex/react";
import { useEffect, useRef } from "react";
import { api } from "../../convex/_generated/api";

/**
 * Ensures the signed-in Clerk user has a Convex `users` row before any
 * identity-derived query/mutation needs it (dashboard feed, usage, admin
 * bootstrap). Gated on `useConvexAuth().isAuthenticated` so it fires only
 * after the Convex WebSocket auth handshake completes — firing during the
 * brief post-sign-in window would throw "Not authenticated" in the mutation.
 *
 * Replaces the deleted WorkOS `/api/auth/callback` upsert.
 */
export function UserBootstrap() {
	const { isAuthenticated } = useConvexAuth();
	const ensureFromIdentity = useMutation(
		api.functions.users.mutations.ensureFromIdentity,
	);
	const ran = useRef(false);

	useEffect(() => {
		if (!isAuthenticated) return;
		if (ran.current) return;
		ran.current = true;
		void ensureFromIdentity({});
	}, [isAuthenticated, ensureFromIdentity]);

	return null;
}
