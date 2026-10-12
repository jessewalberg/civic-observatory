export const CONVEX_OUTAGE_RESPONSE_HEADER = "x-civic-data-service";
export const CONVEX_OUTAGE_RESPONSE_VALUE = "unavailable";

export class ConvexServiceUnavailableError extends Error {
	constructor(message = "Data service unavailable") {
		super(message);
		this.name = "ConvexServiceUnavailableError";
	}
}
