import { ConvexProvider, ConvexReactClient } from "convex/react";
import { lazy, Suspense, useState } from "react";

import { getConvexUrl } from "./ConvexClientProvider";

export {
	requiresAuthenticatedProviders,
	showsAuthenticatedHeaderControls,
} from "@/lib/authRoutes";

interface AppConvexProviderProps {
	mode: AppProviderMode;
	children: React.ReactNode;
}

export type AppProviderMode = "public" | "authenticated";

const AuthenticatedConvexProvider = lazy(() =>
	import("./AuthenticatedConvexProvider").then((module) => ({
		default: module.AuthenticatedConvexProvider,
	})),
);

export function AppConvexProvider({ children, mode }: AppConvexProviderProps) {
	if (mode === "authenticated") {
		return (
			<Suspense fallback={null}>
				<AuthenticatedConvexProvider>{children}</AuthenticatedConvexProvider>
			</Suspense>
		);
	}

	return <PublicConvexProvider>{children}</PublicConvexProvider>;
}

function PublicConvexProvider({ children }: { children: React.ReactNode }) {
	const [client] = useState(() => new ConvexReactClient(getConvexUrl()));

	return <ConvexProvider client={client}>{children}</ConvexProvider>;
}
