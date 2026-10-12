export const CONVEX_SERVICE_UNAVAILABLE = "CONVEX_SERVICE_UNAVAILABLE";
export const CONVEX_OUTAGE_RESPONSE_HEADER = "x-civic-data-service";
export const CONVEX_OUTAGE_RESPONSE_VALUE = "unavailable";

export class ConvexServiceUnavailableError extends Error {
	readonly code = CONVEX_SERVICE_UNAVAILABLE;

	constructor(message = "Data service unavailable") {
		super(message);
		this.name = "ConvexServiceUnavailableError";
	}
}

export function isConvexServiceUnavailable(error: unknown): boolean {
	return (
		error instanceof ConvexServiceUnavailableError ||
		(error !== null &&
			typeof error === "object" &&
			"code" in error &&
			(error as { code?: string }).code === CONVEX_SERVICE_UNAVAILABLE)
	);
}
