import { describe, expect, it } from "vitest";
import { Route as MunicipalityRoute } from "../routes/explore/$municipalityId";
import { Route as ExploreRoute } from "../routes/explore/index";
import { Route as HomeRoute } from "../routes/index";
import { Route as MeetingRoute } from "../routes/meeting/$meetingId";
import { Route as PricingRoute } from "../routes/pricing";

type HeadLink = Record<string, string>;
type HeadResult = {
	links?: HeadLink[];
};

function getHead(
	route: unknown,
	ctx: { loaderData?: unknown } = {},
): HeadResult {
	const options = (route as { options?: { head?: unknown } }).options;
	if (typeof options?.head !== "function") {
		return {};
	}

	const head = options.head as (ctx: unknown) => HeadResult;
	return head(ctx);
}

function canonicalLinks(
	route: unknown,
	ctx: { loaderData?: unknown } = {},
): HeadLink[] {
	return (getHead(route, ctx).links ?? []).filter(
		(link) => link.rel === "canonical",
	);
}

function expectCanonical(
	route: unknown,
	href: string,
	ctx: { loaderData?: unknown } = {},
) {
	expect(canonicalLinks(route, ctx)).toEqual([{ rel: "canonical", href }]);
}

describe("public route canonicals", () => {
	it("adds canonical links to static public routes", () => {
		expectCanonical(HomeRoute, "https://civicobservatory.com/");
		expectCanonical(ExploreRoute, "https://civicobservatory.com/explore");
		expectCanonical(PricingRoute, "https://civicobservatory.com/pricing");
	});

	it("adds canonical links to municipality detail pages", () => {
		expectCanonical(
			MunicipalityRoute,
			"https://civicobservatory.com/explore/austin-tx",
			{
				loaderData: {
					municipality: {
						_id: "municipality_123",
						slug: "austin-tx",
						name: "Austin",
						state: "TX",
					},
				},
			},
		);
	});

	it("adds canonical links to meeting detail pages", () => {
		expectCanonical(
			MeetingRoute,
			"https://civicobservatory.com/meeting/austin-tx-2026-01-15-city-council-regular-meeting",
			{
				loaderData: {
					meeting: {
						_id: "meeting_123",
						slug: "austin-tx-2026-01-15-city-council-regular-meeting",
						title: "City Council Regular Meeting",
						meetingType: "city_council",
						meetingDate: Date.UTC(2026, 0, 15),
						summary: {
							executiveSummary: "Council discussed zoning updates.",
							topics: ["zoning"],
							keyDecisions: [],
						},
						municipality: {
							name: "Austin",
							state: "TX",
						},
					},
				},
			},
		);
	});
});
