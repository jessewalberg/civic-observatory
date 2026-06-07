import { afterEach, describe, expect, it, vi } from "vitest";

import { getClerkPublishableKey } from "./clerkEnv";

describe("clerkEnv", () => {
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("returns undefined when no key is configured anywhere", () => {
		vi.stubEnv("VITE_CLERK_PUBLISHABLE_KEY", "");
		expect(getClerkPublishableKey()).toBeUndefined();
	});

	it("reads the publishable key from the environment", () => {
		vi.stubEnv("VITE_CLERK_PUBLISHABLE_KEY", "pk_test_fake123");
		expect(getClerkPublishableKey()).toBe("pk_test_fake123");
	});

	it("treats whitespace-only values as absent", () => {
		vi.stubEnv("VITE_CLERK_PUBLISHABLE_KEY", "   ");
		expect(getClerkPublishableKey()).toBeUndefined();
	});
});
