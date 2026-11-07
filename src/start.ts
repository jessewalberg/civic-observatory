import { createMiddleware, createStart } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import {
	clearDataOutageMark,
	isDataOutageMarked,
} from "./lib/dataOutageContext";
import {
	DATA_OUTAGE_RESPONSE_HEADER,
	DATA_OUTAGE_RESPONSE_VALUE,
} from "./lib/dataServiceUnavailable";

const dataStatus = createMiddleware({ type: "request" }).server(
	async ({ next, request }) => {
		let active = request;
		try {
			const result = await next();
			try {
				active = getRequest();
			} catch {
				/* Request context can finish before response finalization. */
			}
			if (result.response instanceof Response && isDataOutageMarked(active)) {
				const headers = new Headers(result.response.headers);
				headers.set(DATA_OUTAGE_RESPONSE_HEADER, DATA_OUTAGE_RESPONSE_VALUE);
				result.response = new Response(result.response.body, {
					status: 503,
					headers,
				});
			}
			return result;
		} finally {
			clearDataOutageMark(request);
			clearDataOutageMark(active);
		}
	},
);
export const startInstance = createStart(() => ({
	requestMiddleware: [dataStatus],
}));
