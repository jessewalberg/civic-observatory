// What remote-proxy.ts uploads as an edge preview: Wrangler's own proxy Worker for a
// remote binding, with a deadline of its own. A preview that somebody left behind, and a
// request that arrives late, can do nothing once it has passed.
// @ts-expect-error Wrangler ships it without types.
import proxy from "../node_modules/wrangler/wrangler-dist/ProxyServerWorker.js";

interface Session {
	/** Milliseconds since 1970, as text. */
	UNTIL?: string;
}

export default {
	async fetch(request: Request, env: Session): Promise<Response> {
		if (!(Date.now() <= Number(env.UNTIL)))
			return new Response("The session is over.", { status: 410 });
		return proxy.fetch(request, env);
	},
};
