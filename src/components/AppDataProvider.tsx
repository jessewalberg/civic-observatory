import {
	QueryClient,
	QueryClientProvider,
	useQueryClient,
} from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { apiClient } from "@/lib/apiClient";
import { useSessionState } from "@/lib/session";
import { api } from "../../server/api";
export function AppDataProvider({ children }: { children: React.ReactNode }) {
	const [client] = useState(
		() =>
			new QueryClient({
				defaultOptions: {
					queries: { retry: false },
					mutations: { retry: false },
				},
			}),
	);
	return (
		<QueryClientProvider client={client}>
			<AccountBootstrap />
			{children}
		</QueryClientProvider>
	);
}
function AccountBootstrap() {
	const { user } = useSessionState();
	const userId = user?.id;
	const client = useQueryClient();
	const initialized = useRef<string | null>(null);
	const [failure, setFailure] = useState<Error | null>(null);
	useEffect(() => {
		client.clear();
		if (!userId || initialized.current === userId) return;
		let cancelled = false;
		void apiClient
			.request(api.functions.users.mutations.ensureFromIdentity, {})
			.then(() => {
				if (!cancelled) {
					initialized.current = userId;
					void client.invalidateQueries();
				}
			})
			.catch(() => {
				if (!cancelled)
					setFailure(
						new Error(
							"Your account could not be initialized. Reload to try again.",
						),
					);
			});
		return () => {
			cancelled = true;
		};
	}, [userId, client]);
	if (failure) throw failure;
	return null;
}
