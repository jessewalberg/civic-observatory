type ConvexOutageGlobal = typeof globalThis & {
	__civicConvexOutageUrls?: Set<string>;
	__civicConvexOutageAt?: number;
};

const globalOutage = globalThis as ConvexOutageGlobal;

function requestOutageKey(request: Request): string {
	return `${request.method} ${request.url}`;
}

function outageUrls(): Set<string> {
	if (!globalOutage.__civicConvexOutageUrls) {
		globalOutage.__civicConvexOutageUrls = new Set<string>();
	}
	return globalOutage.__civicConvexOutageUrls;
}

export function markConvexOutage(request?: Request): void {
	globalOutage.__civicConvexOutageAt = Date.now();
	if (request) {
		outageUrls().add(requestOutageKey(request));
	}
}

export function isConvexOutageMarked(request?: Request): boolean {
	if (request && outageUrls().has(requestOutageKey(request))) {
		return true;
	}
	const markedAt = globalOutage.__civicConvexOutageAt ?? 0;
	return markedAt > 0 && Date.now() - markedAt < 2_000;
}

export function clearConvexOutageMark(request?: Request): void {
	if (request) {
		outageUrls().delete(requestOutageKey(request));
	}
	globalOutage.__civicConvexOutageAt = 0;
}
