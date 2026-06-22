import { ClerkProvider, useAuth } from "@clerk/tanstack-react-start";
import { ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { useState } from "react";

import { getConvexUrl } from "./ConvexClientProvider";
import { getClerkPublishableKey } from "./clerkEnv";
import { UserBootstrap } from "./UserBootstrap";

interface AuthenticatedConvexProviderProps {
	children: React.ReactNode;
}

/**
 * Authenticated Clerk + Convex provider. Public signed-out routes use the plain
 * Convex provider so Clerk UI bundles are not requested on initial load.
 */
export function AuthenticatedConvexProvider({
	children,
}: AuthenticatedConvexProviderProps) {
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
