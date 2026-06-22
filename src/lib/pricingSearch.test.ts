import { describe, expect, it } from "vitest";
import { Route as PricingRoute } from "../routes/pricing";

type PricingSearch = {
	success?: true;
	canceled?: true;
};

function validatePricingSearch(search: Record<string, unknown>): PricingSearch {
	const validateSearch = PricingRoute.options.validateSearch as (
		search: Record<string, unknown>,
	) => PricingSearch;

	return validateSearch(search);
}

describe("pricing search params", () => {
	it("keeps the canonical pricing URL free of false query params", () => {
		expect(validatePricingSearch({})).toEqual({});
		expect(
			validatePricingSearch({ success: "false", canceled: "false" }),
		).toEqual({});
	});

	it("keeps explicit checkout result banners addressable", () => {
		expect(validatePricingSearch({ success: "true" })).toEqual({
			success: true,
		});
		expect(validatePricingSearch({ canceled: "true" })).toEqual({
			canceled: true,
		});
	});
});
