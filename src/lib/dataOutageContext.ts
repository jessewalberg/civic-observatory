type DataOutageGlobal = typeof globalThis & {
	__civicDataOutageRequests?: WeakSet<Request>;
};
const globalOutage = globalThis as DataOutageGlobal;
function outageRequests(): WeakSet<Request> {
	if (!globalOutage.__civicDataOutageRequests) {
		globalOutage.__civicDataOutageRequests = new WeakSet<Request>();
	}
	return globalOutage.__civicDataOutageRequests;
}
export function markDataOutage(request: Request): void {
	outageRequests().add(request);
}
export function isDataOutageMarked(request: Request): boolean {
	return outageRequests().has(request);
}
export function clearDataOutageMark(request: Request): void {
	outageRequests().delete(request);
}
