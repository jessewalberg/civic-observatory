import { describe, expect, it, vi } from "vitest";
import {
	createDiscoveryRedirectResponse,
	createRobotsResponse,
	createSitemapResponse,
	type SitemapDataSource,
} from "./seoDiscovery";

describe("SEO discovery responses", () => {
	it("serves robots.txt with the canonical sitemap.xml URL", async () => {
		const response = createRobotsResponse(
			new Request("https://civicobservatory.com/robots.txt"),
		);

		expect(response.status).toBe(200);
		expect(response.headers.get("Content-Type")).toContain("text/plain");

		const body = await response.text();
		expect(body).toContain("User-agent: *");
		expect(body).toContain("Allow: /explore/");
		expect(body).toContain("Allow: /meeting/");
		expect(body).toContain("Disallow: /dashboard/");
		expect(body).toContain("Disallow: /admin/");
		expect(body).toContain("Sitemap: https://civicobservatory.com/sitemap.xml");
		expect(body).not.toContain("/api/sitemap");
		expect(body.match(/^User-agent:/gm)).toHaveLength(1);
	});

	it("serves sitemap.xml with static URLs, active municipalities, and summarized meetings", async () => {
		const source: SitemapDataSource = {
			getSitemapRecords: vi.fn(async () => ({
				municipalities: [
					{
						_id: "municipality_1",
						_creationTime: Date.UTC(2026, 0, 2),
						name: "Austin",
					},
				],
				meetings: [
					{
						_id: "meeting_summarized",
						_creationTime: Date.UTC(2026, 0, 3),
						meetingDate: Date.UTC(2026, 0, 4),
						status: "summarized",
					},
					{
						_id: "meeting_pending",
						_creationTime: Date.UTC(2026, 0, 5),
						meetingDate: Date.UTC(2026, 0, 6),
						status: "pending",
					},
				],
			})),
		};

		const response = await createSitemapResponse(
			new Request("https://civicobservatory.com/sitemap.xml"),
			source,
		);

		expect(response.status).toBe(200);
		expect(response.headers.get("Content-Type")).toContain("application/xml");
		expect(source.getSitemapRecords).toHaveBeenCalledOnce();

		const body = await response.text();
		expect(body).toContain("<loc>https://civicobservatory.com/</loc>");
		expect(body).toContain(
			"<loc>https://civicobservatory.com/explore/municipality_1</loc>",
		);
		expect(body).toContain(
			"<loc>https://civicobservatory.com/meeting/meeting_summarized</loc>",
		);
		expect(body).not.toContain("meeting_pending");
	});

	it("falls back to a static sitemap if dynamic records fail", async () => {
		const consoleError = vi
			.spyOn(console, "error")
			.mockImplementation(() => undefined);
		const source: SitemapDataSource = {
			getSitemapRecords: vi.fn(async () => {
				throw new Error("Convex unavailable");
			}),
		};

		const response = await createSitemapResponse(
			new Request("https://civicobservatory.com/sitemap.xml"),
			source,
		);

		expect(response.status).toBe(200);
		const body = await response.text();
		expect(body).toContain("<loc>https://civicobservatory.com/</loc>");
		expect(body).toContain("<loc>https://civicobservatory.com/explore</loc>");
		expect(body).toContain("<loc>https://civicobservatory.com/pricing</loc>");
		expect(body).not.toContain("/meeting/");
		expect(consoleError).toHaveBeenCalledWith(
			"Sitemap generation error:",
			expect.any(Error),
		);

		consoleError.mockRestore();
	});

	it("redirects legacy API discovery endpoints to canonical paths", () => {
		const response = createDiscoveryRedirectResponse(
			new Request("https://civicobservatory.com/api/sitemap?cache=false"),
			"/sitemap.xml",
		);

		expect(response.status).toBe(301);
		expect(response.headers.get("Location")).toBe(
			"https://civicobservatory.com/sitemap.xml",
		);
		expect(() => response.headers.set("x-test", "ok")).not.toThrow();
	});
});
