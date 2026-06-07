/**
 * SEO utilities for Civic Observatory
 */

export const SITE_NAME = "Civic Observatory";
export const SITE_URL = "https://civicobservatory.com";
export const DEFAULT_DESCRIPTION =
	"AI-powered summaries of local government meetings. Stay informed about city councils, school boards, and planning commissions.";

/**
 * Generate meta tags for a page
 */
export function generateMeta({
	title,
	description = DEFAULT_DESCRIPTION,
	type = "website",
	image,
	noIndex = false,
}: {
	title: string;
	description?: string;
	type?: "website" | "article";
	image?: string;
	noIndex?: boolean;
}) {
	const fullTitle = title.includes(SITE_NAME)
		? title
		: `${title} | ${SITE_NAME}`;

	const meta = [
		{ title: fullTitle },
		{ name: "description", content: description },
		{ property: "og:title", content: fullTitle },
		{ property: "og:description", content: description },
		{ property: "og:type", content: type },
		{ property: "og:site_name", content: SITE_NAME },
		{
			name: "twitter:card",
			content: image ? "summary_large_image" : "summary",
		},
		{ name: "twitter:title", content: fullTitle },
		{ name: "twitter:description", content: description },
	];

	if (image) {
		meta.push(
			{ property: "og:image", content: image },
			{ name: "twitter:image", content: image },
		);
	}

	if (noIndex) {
		meta.push({ name: "robots", content: "noindex, nofollow" });
	}

	return meta;
}

/**
 * Generate JSON-LD for a meeting summary
 */
export function generateMeetingJsonLd({
	title,
	description,
	datePublished,
	municipality,
	meetingType,
	topics,
	decisions,
}: {
	title: string;
	description: string;
	datePublished: string;
	municipality: { name: string; state: string };
	meetingType: string;
	topics?: string[];
	decisions?: { title: string; description: string }[];
}) {
	return {
		"@context": "https://schema.org",
		"@type": "GovernmentService",
		name: title,
		description,
		serviceType: meetingType,
		provider: {
			"@type": "GovernmentOrganization",
			name: municipality.name,
			address: {
				"@type": "PostalAddress",
				addressRegion: municipality.state,
			},
		},
		datePublished,
		...(topics &&
			topics.length > 0 && {
				keywords: topics.join(", "),
			}),
		...(decisions &&
			decisions.length > 0 && {
				mainEntity: decisions.map((decision) => ({
					"@type": "Action",
					name: decision.title,
					description: decision.description,
				})),
			}),
	};
}

/**
 * Generate JSON-LD for a municipality
 */
export function generateMunicipalityJsonLd({
	name,
	state,
	county,
	population,
	websiteUrl,
}: {
	name: string;
	state: string;
	county?: string;
	population?: number;
	websiteUrl?: string;
}) {
	return {
		"@context": "https://schema.org",
		"@type": "GovernmentOrganization",
		name,
		address: {
			"@type": "PostalAddress",
			addressLocality: name,
			addressRegion: county ? `${county}, ${state}` : state,
			addressCountry: "US",
		},
		...(websiteUrl && { url: websiteUrl }),
		...(population && {
			numberOfEmployees: {
				"@type": "QuantitativeValue",
				name: "Population",
				value: population,
			},
		}),
	};
}

/**
 * Generate JSON-LD for the organization (used on homepage)
 */
export function generateOrganizationJsonLd() {
	return {
		"@context": "https://schema.org",
		"@type": "Organization",
		name: SITE_NAME,
		description: DEFAULT_DESCRIPTION,
		url: SITE_URL,
		logo: `${SITE_URL}/icon-512.png`,
		sameAs: [],
		contactPoint: {
			"@type": "ContactPoint",
			contactType: "customer support",
			email: "support@civicobservatory.com",
		},
	};
}

/**
 * Generate breadcrumb JSON-LD
 */
export function generateBreadcrumbJsonLd(
	items: { name: string; url: string }[],
) {
	return {
		"@context": "https://schema.org",
		"@type": "BreadcrumbList",
		itemListElement: items.map((item, index) => ({
			"@type": "ListItem",
			position: index + 1,
			name: item.name,
			item: item.url,
		})),
	};
}
