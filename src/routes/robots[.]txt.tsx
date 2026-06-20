import { createFileRoute } from "@tanstack/react-router";
import { createRobotsResponse } from "@/lib/seoDiscovery";

export const Route = createFileRoute("/robots.txt")({
	server: {
		handlers: {
			GET: async ({ request }) => createRobotsResponse(request),
		},
	},
});
