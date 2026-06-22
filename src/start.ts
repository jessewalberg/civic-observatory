import { clerkMiddleware } from "@clerk/tanstack-react-start/server";
import { createMiddleware, createStart } from "@tanstack/react-start";
import {
	hasClerkSessionCookie,
	requiresClerkRequestMiddleware,
} from "./lib/authRoutes";

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
		requestMiddleware: [scopedClerkMiddleware],
	};
});
