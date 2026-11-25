import { createFileRoute } from "@tanstack/react-router";
import { Effect } from "effect";
import { ORIGIN } from "@/lib/site";
import { readAddresses } from "@/server/docket";
import { attempt } from "@/server/errors";
import { serve } from "@/server/observability";

// The pages that answer 200, without lists past the first. Slugs and ids are
// lower-case letters, digits and hyphens (scripts/load-docket.ts refuses any
// other), so none needs XML escaping.
const xml = (paths: string[]) => `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${paths.map((path) => `  <url><loc>${ORIGIN}${path}</loc></url>`).join("\n")}
</urlset>
`;

export const Route = createFileRoute("/sitemap.xml")({
	server: {
		handlers: {
			GET: ({ request }) =>
				serve(request, "sitemap", () =>
					attempt(readAddresses).pipe(
						Effect.map(
							({ towns, items }) =>
								new Response(
									xml([
										"/",
										"/method",
										"/privacy",
										"/terms",
										...towns.map((slug) => `/town/${slug}`),
										...items.map((id) => `/item/${id}`),
									]),
									{
										headers: {
											"Content-Type": "application/xml; charset=utf-8",
										},
									},
								),
						),
					),
				),
		},
	},
});
