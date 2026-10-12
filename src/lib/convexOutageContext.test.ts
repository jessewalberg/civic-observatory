import { describe, expect, it } from "vitest";
import {
	clearConvexOutageMark,
	isConvexOutageMarked,
	markConvexOutage,
} from "./convexOutageContext";

describe("Convex outage marks", () => {
	it("does not mark another request for the same URL", () => {
		const failedRequest = new Request("https://example.com/meeting/a");
		const healthyRequest = new Request("https://example.com/meeting/a");

		markConvexOutage(failedRequest);
		try {
			expect(isConvexOutageMarked(failedRequest)).toBe(true);
			expect(isConvexOutageMarked(healthyRequest)).toBe(false);
		} finally {
			clearConvexOutageMark(failedRequest);
		}
		expect(isConvexOutageMarked(failedRequest)).toBe(false);
	});
});
