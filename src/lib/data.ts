import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Endpoint } from "../../server/contract";
import { apiClient } from "./apiClient";
import { useSessionState } from "./session";
export function useRead<A, R>(
	endpoint: Endpoint<A, R>,
	args: A | "skip" = {} as A,
): R | undefined {
	const { user } = useSessionState();
	const query = useQuery({
		queryKey: [user?.id ?? "anonymous", endpoint.path, args],
		queryFn: () => apiClient.request(endpoint, args as A),
		enabled: args !== "skip",
		staleTime: 5000,
		refetchInterval: 15000,
		throwOnError: true,
	});
	return args === "skip" ? undefined : query.data;
}
export function useCommand<A, R>(
	endpoint: Endpoint<A, R>,
): (args: A) => Promise<R> {
	const client = useQueryClient();
	const mutation = useMutation({
		mutationFn: (args: A) => apiClient.request(endpoint, args),
		onSuccess: () => client.invalidateQueries(),
	});
	return mutation.mutateAsync;
}
