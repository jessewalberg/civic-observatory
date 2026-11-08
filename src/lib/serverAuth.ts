import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { createAuth } from "../../server/auth";
import { env } from "../../server/env";
import { enforceSignedIn } from "./authGuard";
export const requireAuth = createServerFn({ method: "GET" }).handler(
	async () => {
		const session = await createAuth(env).api.getSession({
			headers: getRequest().headers,
		});
		enforceSignedIn({ isAuthenticated: Boolean(session) });
	},
);
