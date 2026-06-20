import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api";
import { meetingPath, municipalityPath } from "./publicUrls";

export interface SitemapMunicipality {
	_id: string;
	_creationTime: number;
	slug?: string;
	name: string;
}

export interface SitemapMeeting {
	_id: string;
	_creationTime: number;
	slug?: string;
	meetingDate: number;
	status: string;
}

export interface SitemapDataSource {
	getSitemapRecords(): Promise<{
		municipalities: SitemapMunicipality[];
		meetings: SitemapMeeting[];
	}>;
}

interface SitemapUrl {
	loc: string;
	changefreq: "daily" | "weekly";
	priority: string;
	lastmod: string;
}

export function createRobotsResponse(request: Request): Response {
	return new Response(generateRobotsTxt(getBaseUrl(request)), {
		headers: {
			"Content-Type": "text/plain; charset=utf-8",
			"Cache-Control": "public, max-age=86400",
		},
	});
}

export async function createSitemapResponse(
	request: Request,
	source = createConvexSitemapSource(process.env.VITE_CONVEX_URL),
): Promise<Response> {
	const baseUrl = getBaseUrl(request);
	let municipalities: SitemapMunicipality[] = [];
	let meetings: SitemapMeeting[] = [];
	let sitemapSource = "static-fallback";

	if (source) {
		try {
			const records = await source.getSitemapRecords();
			municipalities = records.municipalities;
			meetings = records.meetings;
			sitemapSource =
				municipalities.length > 0 ||
				meetings.some((meeting) => meeting.status === "summarized")
					? "dynamic"
					: "dynamic-empty";
		} catch (error) {
			console.error("Sitemap generation error:", error);
		}
	}

	return new Response(generateSitemapXml(baseUrl, municipalities, meetings), {
		headers: {
			"Content-Type": "application/xml; charset=utf-8",
			"Cache-Control": "public, max-age=3600, s-maxage=3600",
			"X-Sitemap-Source": sitemapSource,
		},
	});
}

export function createDiscoveryRedirectResponse(
	request: Request,
	canonicalPath: "/robots.txt" | "/sitemap.xml",
): Response {
	const url = new URL(request.url);
	url.pathname = canonicalPath;
	url.search = "";
	url.hash = "";
	return new Response(null, {
		status: 301,
		headers: {
			Location: url.toString(),
		},
	});
}

export function generateRobotsTxt(baseUrl: string): string {
	return `# Civic Observatory robots.txt
# https://civicobservatory.com

User-agent: *
Allow: /
Allow: /explore/
Allow: /meeting/
Allow: /pricing

# Private and authenticated routes
Disallow: /dashboard/
Disallow: /admin/
Disallow: /api/auth/
Disallow: /api/webhooks/

# Crawl-delay for politeness
Crawl-delay: 1

Sitemap: ${baseUrl}/sitemap.xml
`;
}

export function generateSitemapXml(
	baseUrl: string,
	municipalities: SitemapMunicipality[],
	meetings: SitemapMeeting[],
): string {
	const today = new Date().toISOString().split("T")[0];
	const staticUrls: SitemapUrl[] = [
		{ loc: "/", changefreq: "daily", priority: "1.0", lastmod: today },
		{ loc: "/explore", changefreq: "daily", priority: "0.9", lastmod: today },
		{ loc: "/pricing", changefreq: "weekly", priority: "0.8", lastmod: today },
	];

	const municipalityUrls: SitemapUrl[] = municipalities.map((municipality) => ({
		loc: municipalityPath(municipality),
		changefreq: "daily",
		priority: "0.8",
		lastmod: toDateOnly(municipality._creationTime),
	}));

	const meetingUrls: SitemapUrl[] = meetings
		.filter((meeting) => meeting.status === "summarized")
		.map((meeting) => ({
			loc: meetingPath(meeting),
			changefreq: "weekly",
			priority: "0.7",
			lastmod: toDateOnly(meeting.meetingDate),
		}));

	const urlElements = [...staticUrls, ...municipalityUrls, ...meetingUrls]
		.map(
			(url) => `  <url>
    <loc>${escapeXml(toAbsoluteUrl(baseUrl, url.loc))}</loc>
    <lastmod>${url.lastmod}</lastmod>
    <changefreq>${url.changefreq}</changefreq>
    <priority>${url.priority}</priority>
  </url>`,
		)
		.join("\n");

	return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlElements}
</urlset>`;
}

export function createConvexSitemapSource(
	convexUrl: string | undefined,
): SitemapDataSource | null {
	if (!convexUrl) {
		return null;
	}

	return {
		async getSitemapRecords() {
			const convex = new ConvexHttpClient(convexUrl);
			const [municipalities, meetings] = await Promise.all([
				convex.query(api.functions.municipalities.queries.list, {
					activeOnly: true,
				}),
				convex.query(api.functions.meetings.queries.getRecent, {
					limit: 500,
				}),
			]);

			return {
				municipalities,
				meetings,
			};
		},
	};
}

function getBaseUrl(request: Request): string {
	const url = new URL(request.url);
	return `${url.protocol}//${url.host}`;
}

function toAbsoluteUrl(baseUrl: string, path: string): string {
	return `${baseUrl}${path}`;
}

function toDateOnly(timestamp: number): string {
	return new Date(timestamp).toISOString().split("T")[0];
}

function escapeXml(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&apos;");
}
