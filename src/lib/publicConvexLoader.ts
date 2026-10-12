import { isNotFound, isRedirect } from "@tanstack/react-router";
import { createIsomorphicFn } from "@tanstack/react-start";
import {
	getRequest,
	setResponseHeader,
	setResponseStatus,
} from "@tanstack/react-start/server";
import { markConvexOutage } from "./convexOutageContext";
import {
	CONVEX_OUTAGE_RESPONSE_HEADER,
	CONVEX_OUTAGE_RESPONSE_VALUE,
	ConvexServiceUnavailableError,
} from "./convexServiceUnavailable";

const throwConvexServiceUnavailable = createIsomorphicFn()
	.client((): never => {
		throw new ConvexServiceUnavailableError();
	})
	.server((): never => {
		markConvexOutage(getRequest());
		setResponseHeader(
			CONVEX_OUTAGE_RESPONSE_HEADER,
			CONVEX_OUTAGE_RESPONSE_VALUE,
		);
		setResponseStatus(503, "Service Unavailable");
		throw new ConvexServiceUnavailableError();
	});

export function requireConvexUrl(): string {
	const convexUrl = import.meta.env.VITE_CONVEX_URL;
	if (!convexUrl) {
		throwConvexServiceUnavailable();
	}
	return convexUrl;
}

export function rethrowLoaderResponse(error: unknown): void {
	if (error instanceof Response) {
		throw error;
	}
}

export function failConvexLoader(error: unknown): never {
	rethrowLoaderResponse(error);
	if (isNotFound(error) || isRedirect(error)) {
		throw error;
	}
	return throwConvexServiceUnavailable();
}
