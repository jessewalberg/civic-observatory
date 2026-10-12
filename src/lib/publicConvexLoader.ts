export function requireConvexUrl(): string {
	const convexUrl = import.meta.env.VITE_CONVEX_URL;
	if (!convexUrl) {
		throw convexUnavailableResponse();
	}
	return convexUrl;
}

export function convexUnavailableResponse(): Response {
	return new Response("Data service unavailable", { status: 503 });
}

export function rethrowLoaderResponse(error: unknown): void {
	if (error instanceof Response) {
		throw error;
	}
}

import { isNotFound, isRedirect } from "@tanstack/react-router";

export function failConvexLoader(error: unknown): never {
	rethrowLoaderResponse(error);
	if (isNotFound(error) || isRedirect(error)) {
		throw error;
	}
	throw convexUnavailableResponse();
}
