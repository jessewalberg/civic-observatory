import { ConvexProvider, ConvexReactClient } from "convex/react";
import { lazy, Suspense, useState } from "react";
import type { AppProviderMode } from "@/lib/authRoutes";
import { AuthShellProvider } from "@/lib/authShell";
import { getConvexUrl } from "./ConvexClientProvider";

export {
	getAppProviderMode,
	requiresAuthenticatedProviders,
	showsAuthenticatedHeaderControls,
} from "@/lib/authRoutes";

interface AppConvexProviderProps {
	mode: AppProviderMode;
	children: React.ReactNode;
}

const AuthenticatedConvexProvider = lazy(() =>
	import("./AuthenticatedConvexProvider").then((module) => ({
		default: module.AuthenticatedConvexProvider,
	})),
);

export function AppConvexProvider({ children, mode }: AppConvexProviderProps) {
	if (mode === "authenticated") {
		return (
			<AuthShellProvider mode={mode}>
				<Suspense fallback={null}>
					<AuthenticatedConvexProvider>{children}</AuthenticatedConvexProvider>
				</Suspense>
			</AuthShellProvider>
		);
	}

	return (
		<AuthShellProvider mode={mode}>
			<PublicConvexProvider>{children}</PublicConvexProvider>
		</AuthShellProvider>
	);
}

function PublicConvexProvider({ children }: { children: React.ReactNode }) {
	const [client] = useState(() => new ConvexReactClient(getConvexUrl()));

	return <ConvexProvider client={client}>{children}</ConvexProvider>;
}
