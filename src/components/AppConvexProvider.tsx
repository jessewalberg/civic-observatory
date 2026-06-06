import type { User } from "@workos-inc/node";
import { ClerkProvider, useAuth } from "@clerk/tanstack-react-start";
import { ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { useState } from "react";

import {
	ConvexClientProvider,
	WorkOSUserContext,
	getConvexUrl,
} from "./ConvexClientProvider";
import { clerkEnabled, getClerkPublishableKey } from "./clerkEnv";

interface AppConvexProviderProps {
	children: React.ReactNode;
	user: User | null;
}

/**
 * Phase-1 gated provider (WorkOS→Clerk migration plan §3): when
 * VITE_CLERK_PUBLISHABLE_KEY is configured, mount ClerkProvider +
 * ConvexProviderWithClerk (Convex receives Clerk JWTs via the `convex` JWT
 * template); otherwise render the legacy WorkOS path EXACTLY as before.
 *
 * The WorkOS user context is provided in BOTH modes: transition phases 2–4
 * still have components reading useWorkOSUser()/client-supplied ids until the
 * Phase-2 ctx.auth bridge and Phase-4 component swap land.
 *
 * The gate is environment-stable (env doesn't change within a session), so the
 * two render paths never flip at runtime.
 */
export function AppConvexProvider({ children, user }: AppConvexProviderProps) {
	if (!clerkEnabled()) {
		return <ConvexClientProvider user={user}>{children}</ConvexClientProvider>;
	}
	return <ClerkConvexPath user={user}>{children}</ClerkConvexPath>;
}

function ClerkConvexPath({ children, user }: AppConvexProviderProps) {
	const [client] = useState(() => new ConvexReactClient(getConvexUrl()));

	return (
		<ClerkProvider publishableKey={getClerkPublishableKey()}>
			<ConvexProviderWithClerk client={client} useAuth={useAuth}>
				<WorkOSUserContext.Provider value={user}>
					{children}
				</WorkOSUserContext.Provider>
			</ConvexProviderWithClerk>
		</ClerkProvider>
	);
}
