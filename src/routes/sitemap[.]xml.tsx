import { createFileRoute } from "@tanstack/react-router";
import { createSitemapResponse } from "@/lib/seoDiscovery";

export const Route = createFileRoute("/sitemap.xml")({
	server: {
		handlers: {
			GET: async ({ request }) => createSitemapResponse(request),
		},
	},
});
