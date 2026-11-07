import { createIsomorphicFn } from "@tanstack/react-start";
import superjson, { type SuperJSONResult } from "superjson";
import type { Endpoint } from "../../server/contract";

const transport = createIsomorphicFn()
	.client(async (path: string, args: unknown): Promise<unknown> => {
		const response = await fetch("/api/rpc", {
			method: "POST",
			credentials: "same-origin",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ path, args }),
		});
		const payload = (await response.json()) as {
			result?: SuperJSONResult;
			error?: string;
		};
		if (!response.ok) throw new Error(payload.error ?? "Request failed");
		if (!payload.result) throw new Error("Invalid server response");
		return superjson.deserialize(payload.result);
	})
	.server(async (path: string, args: unknown): Promise<unknown> => {
		const [{ dispatch }, { env }, { getRequest }] = await Promise.all([
			import("../../server/runtime"),
			import("../../server/env"),
			import("@tanstack/react-start/server"),
		]);
		return dispatch(env, getRequest(), path, args);
	});
export class ApiClient {
	request<A, R>(endpoint: Endpoint<A, R>, args: A): Promise<R> {
		return transport(endpoint.path, args) as Promise<R>;
	}
}
export const apiClient = new ApiClient();
