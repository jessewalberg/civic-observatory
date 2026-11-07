export const DATA_OUTAGE_RESPONSE_HEADER = "x-civic-data-service";
export const DATA_OUTAGE_RESPONSE_VALUE = "unavailable";
export class DataServiceUnavailableError extends Error {
	constructor(message = "Data service unavailable") {
		super(message);
		this.name = "DataServiceUnavailableError";
	}
}
