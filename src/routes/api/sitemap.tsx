import { createFileRoute } from "@tanstack/react-router";
import { createDiscoveryRedirectResponse } from "@/lib/seoDiscovery";

export const Route = createFileRoute("/api/sitemap")({
	server: {
		handlers: {
			GET: async ({ request }) =>
				createDiscoveryRedirectResponse(request, "/sitemap.xml"),
		},
	},
});
