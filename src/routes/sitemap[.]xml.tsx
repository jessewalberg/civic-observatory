import { createFileRoute } from "@tanstack/react-router";
import {
	createConvexSitemapSource,
	createSitemapResponse,
} from "@/lib/seoDiscovery";

export const Route = createFileRoute("/sitemap.xml")({
	server: {
		handlers: {
			GET: async ({ request }) =>
				createSitemapResponse(
					request,
					createConvexSitemapSource(import.meta.env.VITE_CONVEX_URL),
				),
		},
	},
});
