import server from "@tanstack/react-start/server-entry";
import { createAuth } from "../server/auth";
import { documentResponse } from "../server/documents";
import type { Bindings } from "../server/env";
import { runScheduled } from "../server/jobs";
import { rpcResponse } from "../server/runtime";
export default {
	async fetch(request: Request, env: Bindings, ctx: ExecutionContext) {
		const pathname = new URL(request.url).pathname;
		if (pathname.startsWith("/api/auth/"))
			return createAuth(env).handler(request);
		if (pathname === "/api/rpc") return rpcResponse(env, request);
		if (pathname === "/api/documents") return documentResponse(env, request);
		void ctx;
		return server.fetch(request);
	},
	async scheduled(
		controller: ScheduledController,
		env: Bindings,
		ctx: ExecutionContext,
	) {
		ctx.waitUntil(runScheduled(env, controller.cron, controller.scheduledTime));
	},
};
