import { describe, expect, it } from "vitest";
import { Route as MunicipalityRoute } from "../routes/explore/$municipalityId";
import { Route as HomeRoute } from "../routes/index";
import { Route as MeetingRoute } from "../routes/meeting/$meetingId";
import { Route as PricingRoute } from "../routes/pricing";

type HeadScript = {
	type?: string;
	children?: string;
};

function jsonLdScripts(
	route: unknown,
	ctx: { loaderData?: unknown } = {},
): unknown[] {
	const options = (route as { options?: { head?: unknown } }).options;
	if (typeof options?.head !== "function") {
		return [];
	}

	const head = options.head as (ctx: unknown) => { scripts?: HeadScript[] };
	return (head(ctx).scripts ?? [])
		.filter((script) => script.type === "application/ld+json")
		.map((script) => JSON.parse(script.children ?? "{}") as unknown);
}

function firstJsonLd(
	route: unknown,
	ctx: { loaderData?: unknown } = {},
): Record<string, unknown> {
	const [script] = jsonLdScripts(route, ctx);
	if (!script || typeof script !== "object") {
		throw new Error("Expected JSON-LD script");
	}
	return script as Record<string, unknown>;
}

describe("structured data model", () => {
	it("models the homepage as an organization, website, and software application graph", () => {
		const jsonLd = firstJsonLd(HomeRoute);
		const graph = jsonLd["@graph"] as Array<Record<string, unknown>>;

		expect(graph.map((node) => node["@type"])).toEqual([
			"Organization",
			"WebSite",
			"SoftwareApplication",
		]);
		expect(graph[2]).toMatchObject({
			name: "Civic Observatory",
			applicationCategory: "GovernmentApplication",
			operatingSystem: "Web",
		});
	});

	it("models municipality pages as government organizations without population-as-employee markup", () => {
		const jsonLd = firstJsonLd(MunicipalityRoute, {
			loaderData: {
				municipality: {
					_id: "municipality_123",
					slug: "austin-tx",
					name: "Austin",
					state: "Texas",
					county: "Travis County",
					population: 974_447,
					websiteUrl: "https://www.austintexas.gov",
				},
			},
		});

		expect(jsonLd).toMatchObject({
			"@type": "GovernmentOrganization",
			name: "Austin",
			areaServed: {
				"@type": "AdministrativeArea",
				name: "Austin, Texas",
			},
		});
		expect(jsonLd).not.toHaveProperty("numberOfEmployees");
	});

	it("models meeting summary pages as reports about civic meeting events", () => {
		const jsonLd = firstJsonLd(MeetingRoute, {
			loaderData: {
				meeting: {
					_id: "meeting_123",
					slug: "austin-tx-2026-01-15-city-council-regular-meeting",
					_creationTime: Date.UTC(2026, 0, 16),
					title: "City Council Regular Meeting",
					meetingType: "city_council",
					meetingDate: Date.UTC(2026, 0, 15),
					sourceUrl: "https://example.test/agenda.pdf",
					summary: {
						executiveSummary: "Council discussed zoning updates.",
						topics: ["zoning"],
						keyDecisions: [
							{
								title: "Approved zoning update",
								description: "Council approved the first reading.",
								topics: ["zoning"],
							},
						],
					},
					municipality: {
						_id: "municipality_123",
						slug: "austin-tx",
						name: "Austin",
						state: "Texas",
					},
				},
			},
		});

		expect(jsonLd).toMatchObject({
			"@type": "Report",
			headline: "City Council Regular Meeting",
			about: {
				"@type": "Event",
				name: "City Council Regular Meeting",
				organizer: {
					"@type": "GovernmentOrganization",
					name: "Austin",
				},
			},
			publisher: {
				"@type": "Organization",
				name: "Civic Observatory",
			},
		});
		expect(jsonLd).not.toMatchObject({ "@type": "GovernmentService" });
	});

	it("uses summary provenance as the meeting citation when available", () => {
		const jsonLd = firstJsonLd(MeetingRoute, {
			loaderData: {
				meeting: {
					_id: "meeting_123",
					slug: "coventry-ct-2026-06-15-town-council-meeting",
					_creationTime: Date.UTC(2026, 5, 16),
					title: "Town Council Meeting and Public Hearing",
					meetingType: "city_council",
					meetingDate: Date.UTC(2026, 5, 15),
					summary: {
						executiveSummary: "Council reviewed budget and grant items.",
						topics: ["budget", "safety"],
						keyDecisions: [],
						sourceUrl:
							"https://www.coventry-ct.gov/AgendaCenter/ViewFile/Agenda/_06152026-4545?packet=true",
					},
					municipality: {
						_id: "municipality_123",
						slug: "coventry-ct",
						name: "Coventry",
						state: "Connecticut",
					},
				},
			},
		});

		expect(jsonLd).toMatchObject({
			citation:
				"https://www.coventry-ct.gov/AgendaCenter/ViewFile/Agenda/_06152026-4545?packet=true",
		});
	});

	it("models pricing as a webpage for software application offers", () => {
		const jsonLd = firstJsonLd(PricingRoute);

		expect(jsonLd).toMatchObject({
			"@type": "WebPage",
			name: "Pricing",
			mainEntity: {
				"@type": "SoftwareApplication",
				name: "Civic Observatory",
				offers: [
					{ "@type": "Offer", name: "Free", price: "0" },
					{ "@type": "Offer", name: "Pro", price: "15" },
				],
			},
		});
	});
});
