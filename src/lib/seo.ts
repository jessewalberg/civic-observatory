/**
 * SEO utilities for Civic Observatory
 */

export const SITE_NAME = "Civic Observatory";
export const SITE_URL = "https://civicobservatory.com";
export const NOINDEX_ROBOTS = "noindex, nofollow";
export const DEFAULT_SOCIAL_IMAGE = `${SITE_URL}/social-preview.png`;
export const DEFAULT_DESCRIPTION =
	"AI-powered summaries of local government meetings. Stay informed about city councils, school boards, and planning commissions.";

export function canonicalUrl(path: string): string {
	return new URL(path, SITE_URL).toString();
}

export function canonicalLink(path: string) {
	return { rel: "canonical", href: canonicalUrl(path) };
}

const ORGANIZATION_ID = `${SITE_URL}/#organization`;
const WEBSITE_ID = `${SITE_URL}/#website`;
const SOFTWARE_ID = `${SITE_URL}/#software`;

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
		meta.push({ name: "robots", content: NOINDEX_ROBOTS });
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
	meetingDate,
	municipality,
	meetingType,
	url,
	sourceUrl,
	topics,
}: {
	title: string;
	description: string;
	datePublished: string;
	meetingDate: string;
	municipality: { name: string; state: string };
	meetingType: string;
	url: string;
	sourceUrl?: string;
	topics?: string[];
}) {
	return {
		"@context": "https://schema.org",
		"@type": "Report",
		headline: title,
		name: title,
		description: description,
		datePublished,
		url,
		mainEntityOfPage: url,
		articleSection: meetingType,
		publisher: organizationReference(),
		about: {
			"@type": "Event",
			name: title,
			startDate: meetingDate,
			organizer: {
				"@type": "GovernmentOrganization",
				name: municipality.name,
				address: {
					"@type": "PostalAddress",
					addressRegion: municipality.state,
					addressCountry: "US",
				},
			},
		},
		...(topics &&
			topics.length > 0 && {
				keywords: topics.join(", "),
			}),
		...(sourceUrl && { citation: sourceUrl }),
	};
}

/**
 * Generate JSON-LD for a municipality
 */
export function generateMunicipalityJsonLd({
	name,
	state,
	websiteUrl,
	description,
}: {
	name: string;
	state: string;
	websiteUrl?: string;
	description?: string;
}) {
	return {
		"@context": "https://schema.org",
		"@type": "GovernmentOrganization",
		name,
		...(description && { description }),
		address: {
			"@type": "PostalAddress",
			addressLocality: name,
			addressRegion: state,
			addressCountry: "US",
		},
		areaServed: {
			"@type": "AdministrativeArea",
			name: `${name}, ${state}`,
		},
		...(websiteUrl && { url: websiteUrl }),
	};
}

/**
 * Generate JSON-LD for the organization (used on homepage)
 */
export function generateOrganizationJsonLd() {
	return {
		"@context": "https://schema.org",
		"@type": "Organization",
		"@id": ORGANIZATION_ID,
		name: SITE_NAME,
		description: DEFAULT_DESCRIPTION,
		url: SITE_URL,
		logo: `${SITE_URL}/icon-512.png`,
	};
}

export function generateHomeJsonLd() {
	return {
		"@context": "https://schema.org",
		"@graph": [
			generateOrganizationJsonLd(),
			{
				"@type": "WebSite",
				"@id": WEBSITE_ID,
				name: SITE_NAME,
				url: SITE_URL,
				publisher: organizationReference(),
			},
			softwareApplicationJsonLd({
				description: DEFAULT_DESCRIPTION,
				url: SITE_URL,
			}),
		],
	};
}

export function generatePricingJsonLd({
	description,
}: {
	description: string;
}) {
	return {
		"@context": "https://schema.org",
		"@type": "WebPage",
		name: "Pricing",
		description,
		url: canonicalUrl("/pricing"),
		mainEntity: softwareApplicationJsonLd({
			description,
			url: canonicalUrl("/pricing"),
		}),
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

function softwareApplicationJsonLd({
	description,
	url,
}: {
	description: string;
	url: string;
}) {
	return {
		"@type": "SoftwareApplication",
		"@id": SOFTWARE_ID,
		name: SITE_NAME,
		description,
		url,
		applicationCategory: "GovernmentApplication",
		operatingSystem: "Web",
		publisher: organizationReference(),
		offers: [
			{
				"@type": "Offer",
				name: "Free",
				price: "0",
				priceCurrency: "USD",
				availability: "https://schema.org/InStock",
				url: canonicalUrl("/pricing"),
				description: "50 summary views per day, 3 uploads per month",
			},
			{
				"@type": "Offer",
				name: "Pro",
				price: "15",
				priceCurrency: "USD",
				availability: "https://schema.org/InStock",
				url: canonicalUrl("/pricing"),
				description:
					"Unlimited summaries, 20 uploads, immediate alerts, API access",
			},
		],
	};
}

function organizationReference() {
	return {
		"@type": "Organization",
		"@id": ORGANIZATION_ID,
		name: SITE_NAME,
		url: SITE_URL,
		logo: `${SITE_URL}/icon-512.png`,
	};
}
