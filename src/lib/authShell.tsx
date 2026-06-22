import { createContext, useContext } from "react";
import type { AppProviderMode } from "./authRoutes";

const AuthShellContext = createContext<AppProviderMode>("public");

export function AuthShellProvider({
	children,
	mode,
}: {
	children: React.ReactNode;
	mode: AppProviderMode;
}) {
	return (
		<AuthShellContext.Provider value={mode}>
			{children}
		</AuthShellContext.Provider>
	);
}

export function useAuthenticatedShell(): boolean {
	return useContext(AuthShellContext) === "authenticated";
}
