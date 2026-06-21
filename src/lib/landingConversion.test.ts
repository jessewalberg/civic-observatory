import { describe, expect, it } from "vitest";
import {
	buildCoverageRequestHref,
	getLandingSetupCta,
	isSetupAuthPath,
	SIGN_UP_SETUP_PATH,
	SUBSCRIPTION_SETUP_PATH,
} from "./landingConversion";

describe("landing conversion paths", () => {
	it("routes signed-out users to setup-aware sign-up", () => {
		expect(getLandingSetupCta(false)).toMatchObject({
			href: SIGN_UP_SETUP_PATH,
			label: "Set up alerts",
		});
		expect(getLandingSetupCta(undefined).href).toBe(SIGN_UP_SETUP_PATH);
	});

	it("routes signed-in users directly to subscription setup", () => {
		expect(getLandingSetupCta(true)).toMatchObject({
			href: SUBSCRIPTION_SETUP_PATH,
			label: "Set up alerts",
		});
	});

	it("recognizes only the setup auth entry paths", () => {
		expect(isSetupAuthPath("/sign-up/setup")).toBe(true);
		expect(isSetupAuthPath("/sign-in/setup")).toBe(true);
		expect(isSetupAuthPath("/sign-up")).toBe(false);
		expect(isSetupAuthPath("/sign-up/anything-else")).toBe(false);
	});

	it("builds a coverage request mailto for unsupported searches", () => {
		const href = buildCoverageRequestHref({
			query: "Coventry",
			state: "Connecticut",
		});

		expect(href).toContain("mailto:support@civicobservatory.com");
		expect(decodeURIComponent(href)).toContain("Coverage request");
		expect(decodeURIComponent(href)).toContain("Coventry");
		expect(decodeURIComponent(href)).toContain("Connecticut");
	});
});
