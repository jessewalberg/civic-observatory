import { createRouter } from "@tanstack/react-router";
import { createIsomorphicFn } from "@tanstack/react-start";
import { ErrorPage } from "@/components/plain-page";
import { currentNonce } from "@/server/security";
import { routeTree } from "./routeTree.gen";

// The request's nonce, so the page's policy admits the inline scripts the
// router writes (src/server/security.ts). In the browser the router reads the
// page's own `csp-nonce` meta tag instead.
const nonce = createIsomorphicFn()
	.server(() => currentNonce())
	.client(() => undefined);

// Every link is an ordinary link, so the router loads nothing after the page
// itself, and a jump inside the page reloads nothing.
export const getRouter = () =>
	createRouter({
		routeTree,
		defaultPreload: false,
		defaultStaleTime: Number.POSITIVE_INFINITY,
		defaultErrorComponent: ErrorPage,
		ssr: { nonce: nonce() },
	});
