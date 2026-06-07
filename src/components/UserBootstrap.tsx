import { useUser } from "@clerk/tanstack-react-start";
import { useConvexAuth, useMutation } from "convex/react";
import { useEffect, useRef } from "react";
import { api } from "../../convex/_generated/api";

/**
 * Ensures the signed-in Clerk user has a Convex `users` row before any
 * identity-derived query/mutation needs it (dashboard feed, usage, admin
 * bootstrap). Replaces the deleted WorkOS `/api/auth/callback` upsert.
 *
 * Gated on `useConvexAuth().isAuthenticated` so it fires only after the Convex
 * WebSocket auth handshake (firing during the brief post-sign-in window would
 * throw "Not authenticated" in the mutation). Keyed on the Clerk user id and
 * marked complete ONLY after the mutation resolves, so: a different user in the
 * same tab gets bootstrapped, and a transient failure is retried on the next
 * auth-state change rather than permanently suppressed.
 */
export function UserBootstrap() {
	const { isAuthenticated } = useConvexAuth();
	const { user } = useUser();
	const userId = user?.id;
	const ensureFromIdentity = useMutation(
		api.functions.users.mutations.ensureFromIdentity,
	);
	const bootstrappedFor = useRef<string | null>(null);
	const inFlightFor = useRef<string | null>(null);

	useEffect(() => {
		if (!isAuthenticated || !userId) return;
		if (bootstrappedFor.current === userId) return;
		if (inFlightFor.current === userId) return;

		inFlightFor.current = userId;
		ensureFromIdentity({})
			.then(() => {
				bootstrappedFor.current = userId;
			})
			.catch(() => {
				// Leave bootstrappedFor unset so a later auth-state change retries.
			})
			.finally(() => {
				if (inFlightFor.current === userId) inFlightFor.current = null;
			});
	}, [isAuthenticated, userId, ensureFromIdentity]);

	return null;
}
