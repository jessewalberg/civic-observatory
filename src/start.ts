import { clerkMiddleware } from "@clerk/tanstack-react-start/server";
import { createMiddleware, createStart } from "@tanstack/react-start";
import {
	getRequest,
	getResponseHeader,
	getResponseStatus,
} from "@tanstack/react-start/server";
import {
	hasClerkSessionCookie,
	requiresClerkRequestMiddleware,
} from "./lib/authRoutes";
import {
	clearConvexOutageMark,
	isConvexOutageMarked,
} from "./lib/convexOutageContext";
import {
	CONVEX_OUTAGE_RESPONSE_HEADER,
	CONVEX_OUTAGE_RESPONSE_VALUE,
} from "./lib/convexServiceUnavailable";

/** TanStack SSR maps loader failures to HTTP 500; honor Convex outage markers from loaders. */
const syncResponseStatusMiddleware = createMiddleware({
	type: "request",
}).server(async ({ next, request }) => {
	const ctx = await next();
	let outageRequest = request;
	try {
		outageRequest = getRequest();
	} catch {
		// Fall back to middleware request when SSR context is unavailable.
	}

	const response = ctx.response;
	if (!(response instanceof Response)) {
		return ctx;
	}

	let markedStatus503 = false;
	let markedOutageHeader = false;
	try {
		markedStatus503 = getResponseStatus() === 503;
		markedOutageHeader =
			getResponseHeader(CONVEX_OUTAGE_RESPONSE_HEADER) ===
			CONVEX_OUTAGE_RESPONSE_VALUE;
	} catch {
		// Response may be finalized after SSR context is cleared.
	}

	const headerOnResponse =
		response.headers.get(CONVEX_OUTAGE_RESPONSE_HEADER) ===
		CONVEX_OUTAGE_RESPONSE_VALUE;

	const isConvexOutage =
		isConvexOutageMarked(outageRequest) ||
		markedStatus503 ||
		markedOutageHeader ||
		headerOnResponse;

	if (!isConvexOutage || response.status === 503) {
		return ctx;
	}

	const headers = new Headers(response.headers);
	headers.set(CONVEX_OUTAGE_RESPONSE_HEADER, CONVEX_OUTAGE_RESPONSE_VALUE);
	ctx.response = new Response(response.body, {
		status: 503,
		statusText: "Service Unavailable",
		headers,
	});
	clearConvexOutageMark(outageRequest);
	return ctx;
});

// Clerk publishable/secret keys are read from the Worker env at SSR time. The
// publishable key may arrive as VITE_CLERK_PUBLISHABLE_KEY (bundle convention)
// or CLERK_PUBLISHABLE_KEY (worker secret); accept either.
const clerkPublishableKey =
	process.env.CLERK_PUBLISHABLE_KEY ?? process.env.VITE_CLERK_PUBLISHABLE_KEY;

const clerkRequestMiddleware = clerkMiddleware({
	publishableKey: clerkPublishableKey,
	secretKey: process.env.CLERK_SECRET_KEY,
	signInUrl: "/sign-in",
	signUpUrl: "/sign-up",
});

const scopedClerkMiddleware = createMiddleware({ type: "request" }).server(
	(options) => {
		const hasClerkSession = hasClerkSessionCookie(
			options.request.headers.get("cookie"),
		);

		if (
			!requiresClerkRequestMiddleware(
				options.pathname,
				options.handlerType,
				hasClerkSession,
			)
		) {
			return options.next();
		}

		return clerkRequestMiddleware.options.server?.(options) ?? options.next();
	},
);

export const startInstance = createStart(() => {
	return {
		requestMiddleware: [syncResponseStatusMiddleware, scopedClerkMiddleware],
	};
});
