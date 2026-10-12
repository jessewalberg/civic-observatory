type ConvexOutageGlobal = typeof globalThis & {
	__civicConvexOutageRequests?: WeakSet<Request>;
};

const globalOutage = globalThis as ConvexOutageGlobal;

function outageRequests(): WeakSet<Request> {
	if (!globalOutage.__civicConvexOutageRequests) {
		globalOutage.__civicConvexOutageRequests = new WeakSet<Request>();
	}
	return globalOutage.__civicConvexOutageRequests;
}

export function markConvexOutage(request: Request): void {
	outageRequests().add(request);
}

export function isConvexOutageMarked(request: Request): boolean {
	return outageRequests().has(request);
}

export function clearConvexOutageMark(request: Request): void {
	outageRequests().delete(request);
}
