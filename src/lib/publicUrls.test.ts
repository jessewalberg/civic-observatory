import { describe, expect, it } from "vitest";
import { meetingPath, municipalityPath } from "./publicUrls";

describe("public URL builders", () => {
	it("prefers municipality slugs and falls back to IDs", () => {
		expect(
			municipalityPath({ _id: "municipality_123", slug: "austin-tx" }),
		).toBe("/explore/austin-tx");
		expect(municipalityPath({ _id: "municipality_123" })).toBe(
			"/explore/municipality_123",
		);
	});

	it("prefers meeting slugs and falls back to IDs", () => {
		expect(
			meetingPath({
				_id: "meeting_123",
				slug: "austin-tx-2026-01-15-city-council-regular-meeting",
			}),
		).toBe("/meeting/austin-tx-2026-01-15-city-council-regular-meeting");
		expect(meetingPath({ _id: "meeting_123" })).toBe("/meeting/meeting_123");
	});
});
