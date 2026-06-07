import { clerkMiddleware } from "@clerk/tanstack-react-start/server";
import { createStart } from "@tanstack/react-start";

// Clerk publishable/secret keys are read from the Worker env at SSR time. The
// publishable key may arrive as VITE_CLERK_PUBLISHABLE_KEY (bundle convention)
// or CLERK_PUBLISHABLE_KEY (worker secret); accept either.
const clerkPublishableKey =
	process.env.CLERK_PUBLISHABLE_KEY ?? process.env.VITE_CLERK_PUBLISHABLE_KEY;

export const startInstance = createStart(() => {
	return {
		requestMiddleware: [
			clerkMiddleware({
				publishableKey: clerkPublishableKey,
				secretKey: process.env.CLERK_SECRET_KEY,
				signInUrl: "/sign-in",
				signUpUrl: "/sign-up",
			}),
		],
	};
});
