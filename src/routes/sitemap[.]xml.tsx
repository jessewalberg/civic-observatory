import { createFileRoute } from "@tanstack/react-router";
import { createSitemapResponse, createSitemapSource } from "@/lib/seoDiscovery";
export const Route = createFileRoute("/sitemap.xml")({
	server: {
		handlers: {
			GET: async ({ request }) =>
				createSitemapResponse(request, createSitemapSource()),
		},
	},
});
