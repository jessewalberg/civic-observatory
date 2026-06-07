import { ClerkProvider, useAuth } from "@clerk/tanstack-react-start";
import { ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { useState } from "react";

import { getConvexUrl } from "./ConvexClientProvider";
import { getClerkPublishableKey } from "./clerkEnv";
import { UserBootstrap } from "./UserBootstrap";

interface AppConvexProviderProps {
	children: React.ReactNode;
}

/**
 * App-wide Clerk + Convex provider. Clerk is the sole auth path (WorkOS removed
 * in the Phase 3–5 migration). Convex receives Clerk JWTs through the `convex`
 * JWT template via ConvexProviderWithClerk + Clerk's useAuth. UserBootstrap
 * provisions the Convex `users` row on first sign-in.
 */
export function AppConvexProvider({ children }: AppConvexProviderProps) {
	const [client] = useState(() => new ConvexReactClient(getConvexUrl()));

	return (
		<ClerkProvider publishableKey={getClerkPublishableKey()}>
			<ConvexProviderWithClerk client={client} useAuth={useAuth}>
				<UserBootstrap />
				{children}
			</ConvexProviderWithClerk>
		</ClerkProvider>
	);
}
