import { describe, expect, it } from "vitest";
import {
	evaluateCoveragePublishRequest,
	getCoverageStatus,
	isCoveragePublic,
} from "./coveragePublication";

describe("municipality coverage publication", () => {
	it("uses explicit coverage status before legacy active and verified flags", () => {
		expect(
			getCoverageStatus({
				coverageStatus: "paused",
				isActive: true,
				isVerified: true,
			}),
		).toBe("paused");
		expect(getCoverageStatus({ isActive: true, isVerified: true })).toBe(
			"published",
		);
		expect(getCoverageStatus({ isActive: true, isVerified: false })).toBe(
			"unpublished",
		);
	});

	it("only exposes published coverage publicly", () => {
		expect(isCoveragePublic({ coverageStatus: "published" })).toBe(true);
		expect(isCoveragePublic({ coverageStatus: "unpublished" })).toBe(false);
		expect(isCoveragePublic({ coverageStatus: "paused" })).toBe(false);
	});

	it("allows publication with a successful validation that found meetings", () => {
		expect(
			evaluateCoveragePublishRequest({
				latestValidation: {
					status: "passed",
					stats: { meetingsFound: 2 },
				},
			}),
		).toEqual({ allowed: true, mode: "validation" });
	});

	it("requires an override reason when validation is missing or insufficient", () => {
		expect(
			evaluateCoveragePublishRequest({
				latestValidation: null,
				overrideReason: "",
			}),
		).toMatchObject({ allowed: false });
		expect(
			evaluateCoveragePublishRequest({
				latestValidation: {
					status: "failed",
					stats: { meetingsFound: 0 },
				},
				overrideReason: "Manual minutes are already uploaded.",
			}),
		).toEqual({ allowed: true, mode: "override" });
	});
});
