import { isNotFound, isRedirect } from "@tanstack/react-router";
import { createIsomorphicFn } from "@tanstack/react-start";
import {
	getRequest,
	setResponseHeader,
	setResponseStatus,
} from "@tanstack/react-start/server";
import { markDataOutage } from "./dataOutageContext";
import {
	DATA_OUTAGE_RESPONSE_HEADER,
	DATA_OUTAGE_RESPONSE_VALUE,
	DataServiceUnavailableError,
} from "./dataServiceUnavailable";

const throwDataServiceUnavailable = createIsomorphicFn()
	.client((): never => {
		throw new DataServiceUnavailableError();
	})
	.server((): never => {
		markDataOutage(getRequest());
		setResponseHeader(DATA_OUTAGE_RESPONSE_HEADER, DATA_OUTAGE_RESPONSE_VALUE);
		setResponseStatus(503, "Service Unavailable");
		throw new DataServiceUnavailableError();
	});
export function rethrowLoaderResponse(error: unknown): void {
	if (error instanceof Response) {
		throw error;
	}
}
export function failDataLoader(error: unknown): never {
	rethrowLoaderResponse(error);
	if (isNotFound(error) || isRedirect(error)) {
		throw error;
	}
	return throwDataServiceUnavailable();
}
