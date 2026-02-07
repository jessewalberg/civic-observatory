import { createFileRoute } from "@tanstack/react-router";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../convex/_generated/api";

export const Route = createFileRoute("/api/sitemap")({
	server: {
		handlers: {
			GET: async ({ request }) => {
				const url = new URL(request.url);
				const baseUrl = `${url.protocol}//${url.host}`;

				const convexUrl = process.env.VITE_CONVEX_URL;
				if (!convexUrl) {
					return new Response(generateSitemap(baseUrl, [], []), {
						headers: { "Content-Type": "application/xml" },
					});
				}

				try {
					const convex = new ConvexHttpClient(convexUrl);

					// Fetch all municipalities and meetings in parallel
					const [municipalities, recentMeetings] = await Promise.all([
						convex.query(api.functions.municipalities.queries.list, {
							activeOnly: true,
						}),
						convex.query(api.functions.meetings.queries.getRecent, {
							limit: 500,
						}),
					]);

					const sitemap = generateSitemap(
						baseUrl,
						municipalities,
						recentMeetings,
					);

					return new Response(sitemap, {
						headers: {
							"Content-Type": "application/xml",
							"Cache-Control": "public, max-age=3600, s-maxage=3600",
						},
					});
				} catch (error) {
					console.error("Sitemap generation error:", error);
					return new Response(generateSitemap(baseUrl, [], []), {
						headers: { "Content-Type": "application/xml" },
					});
				}
			},
		},
	},
});

interface Municipality {
	_id: string;
	_creationTime: number;
	name: string;
}

interface Meeting {
	_id: string;
	_creationTime: number;
	meetingDate: number;
	status: string;
}

function generateSitemap(
	baseUrl: string,
	municipalities: Municipality[],
	meetings: Meeting[],
): string {
	const today = new Date().toISOString().split("T")[0];

	const staticUrls = [
		{ loc: "/", changefreq: "daily", priority: "1.0", lastmod: today },
		{ loc: "/explore", changefreq: "daily", priority: "0.9", lastmod: today },
		{ loc: "/pricing", changefreq: "weekly", priority: "0.8", lastmod: today },
	];

	const municipalityUrls = municipalities.map((m) => ({
		loc: `/explore/${m._id}`,
		changefreq: "daily" as const,
		priority: "0.8",
		lastmod: new Date(m._creationTime).toISOString().split("T")[0],
	}));

	const meetingUrls = meetings
		.filter((m) => m.status === "summarized")
		.map((m) => ({
			loc: `/meeting/${m._id}`,
			changefreq: "weekly" as const,
			priority: "0.7",
			lastmod: new Date(m.meetingDate).toISOString().split("T")[0],
		}));

	const allUrls = [...staticUrls, ...municipalityUrls, ...meetingUrls];

	const urlElements = allUrls
		.map(
			(url) => `  <url>
    <loc>${baseUrl}${url.loc}</loc>
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
