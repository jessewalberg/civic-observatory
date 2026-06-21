import { describe, expect, it } from "vitest";
import {
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
			href: "/dashboard/activate",
			label: "Set up alerts",
		});
		expect(SUBSCRIPTION_SETUP_PATH).toBe("/dashboard/activate");
	});

	it("recognizes only the setup auth entry paths", () => {
		expect(isSetupAuthPath("/sign-up/setup")).toBe(true);
		expect(isSetupAuthPath("/sign-in/setup")).toBe(true);
		expect(isSetupAuthPath("/sign-up")).toBe(false);
		expect(isSetupAuthPath("/sign-up/anything-else")).toBe(false);
	});
});
