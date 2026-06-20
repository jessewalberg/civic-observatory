import { createFileRoute } from "@tanstack/react-router";
import { createDiscoveryRedirectResponse } from "@/lib/seoDiscovery";

export const Route = createFileRoute("/api/robots")({
	server: {
		handlers: {
			GET: async ({ request }) =>
				createDiscoveryRedirectResponse(request, "/robots.txt"),
		},
	},
});
