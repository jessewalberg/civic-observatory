import { describe, expect, it } from "vitest";
import { createMeetingSlug, createMunicipalitySlug, slugify } from "./seoSlugs";

describe("SEO slug helpers", () => {
	it("normalizes names into URL-safe segments", () => {
		expect(slugify("St. John's & North Austin")).toBe(
			"st-johns-and-north-austin",
		);
	});

	it("creates municipality slugs with state abbreviations", () => {
		expect(createMunicipalitySlug({ name: "Austin", state: "Texas" })).toBe(
			"austin-tx",
		);
		expect(createMunicipalitySlug({ name: "Hartford", state: "CT" })).toBe(
			"hartford-ct",
		);
	});

	it("creates meeting slugs with municipality and date context", () => {
		expect(
			createMeetingSlug({
				municipalitySlug: "austin-tx",
				title: "City Council Regular Meeting",
				meetingDate: Date.UTC(2026, 0, 15),
			}),
		).toBe("austin-tx-2026-01-15-city-council-regular-meeting");
	});
});
