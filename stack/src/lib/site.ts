// The site, stated once. No imports: vite.config.ts reads this file too.

export const SITE_NAME = "Civic Observatory";
export const ORIGIN = "https://civicobservatory.com";
export const CONTACT = "hello@civicobservatory.com";
export const COUNTY = "Tolland County, Connecticut";

/** The Worker of each stage (alchemy.run.ts). */
export const WORKERS = {
	preview: "civic-docket-preview",
	production: "civic-docket-production",
} as const;
/** Request records (src/server/observability.ts), of both stages. */
export const RECORDS = "civic_docket_requests";

/** Where server functions are served (vite.config.ts). */
export const FUNCTIONS = "/_fn";
/**
 * TanStack Start's default, which a firewall rule blocks for the whole zone.
 * Nothing of this app is there (src/start.ts).
 */
export const OLD_FUNCTIONS = "/_serverFn";

/** Where the browser that signed up keeps its token. */
export const TOKEN_KEY = "civic-docket-signup";

export const LAST_UPDATED = "November 24, 2026";

export interface Head {
	/** The canonical path, with its query. */
	path: string;
	title: string;
	description: string;
	robots?: "noindex, follow" | "noindex";
}

/** A page's title, description, canonical address and social tags. */
export function pageHead({ path, title, description, robots }: Head) {
	const url = `${ORIGIN}${path}`;
	return {
		meta: [
			{ title },
			{ name: "description", content: description },
			...(robots ? [{ name: "robots", content: robots }] : []),
			{ property: "og:site_name", content: SITE_NAME },
			{ property: "og:type", content: "website" },
			{ property: "og:url", content: url },
			{ property: "og:title", content: title },
			{ property: "og:description", content: description },
		],
		links: [{ rel: "canonical", href: url }],
	};
}

/** A page that is not there any more, or has nothing to say. */
export const plainHead = (title: string) => ({
	meta: [
		{ title: `${title} | ${SITE_NAME}` },
		{ name: "robots", content: "noindex" },
	],
});
