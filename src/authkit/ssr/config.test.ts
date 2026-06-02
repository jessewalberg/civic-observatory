import { describe, expect, it } from "vitest";

import { configure, getAllConfig, getConfig } from "./config";
import type { AuthKitConfig } from "./interfaces";

// Full set of explicit options so the builder never falls back to ambient
// env vars — keeps these tests hermetic (no secrets, no process.env reliance).
const valid: Partial<AuthKitConfig> = {
	clientId: "client_test",
	apiKey: "sk_test_example",
	redirectUri: "https://example.com/callback",
	cookiePassword: "x".repeat(32),
};

describe("authkit config builder", () => {
	it("applies defaults for cookieName, cookieMaxAge, apiHostname, https", () => {
		configure(valid);
		const c = getAllConfig();
		expect(c.cookieName).toBe("wos-session");
		expect(c.cookieMaxAge).toBe(60 * 60 * 24 * 400);
		expect(c.apiHostname).toBe("api.workos.com");
		expect(c.https).toBe(true);
	});

	it("prefers explicit options over the defaults", () => {
		configure({ ...valid, cookieName: "custom-session", https: false });
		expect(getConfig("cookieName")).toBe("custom-session");
		expect(getConfig("https")).toBe(false);
	});

	it("rejects a cookiePassword shorter than 32 characters", () => {
		expect(() => configure({ ...valid, cookiePassword: "too-short" })).toThrow(
			/at least 32 characters/,
		);
	});

	it("throws when a required value (clientId) is empty", () => {
		configure({ ...valid, clientId: "" });
		expect(() => getConfig("clientId")).toThrow(
			/Missing required configuration: clientId/,
		);
	});
});
