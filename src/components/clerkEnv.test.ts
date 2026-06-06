import { afterEach, describe, expect, it, vi } from "vitest";

import { clerkEnabled, getClerkPublishableKey } from "./clerkEnv";

// Phase 1 gate (docs/plans/2026-06-02-civic-pulse-workos-to-clerk.md): Clerk
// mounts ONLY when a publishable key is present, so shipping this code with no
// key configured changes nothing in production.
describe("clerkEnv", () => {
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("is disabled when no key is configured anywhere", () => {
		vi.stubEnv("VITE_CLERK_PUBLISHABLE_KEY", "");
		expect(getClerkPublishableKey()).toBeUndefined();
		expect(clerkEnabled()).toBe(false);
	});

	it("reads the key from the environment and enables Clerk", () => {
		vi.stubEnv("VITE_CLERK_PUBLISHABLE_KEY", "pk_test_fake123");
		expect(getClerkPublishableKey()).toBe("pk_test_fake123");
		expect(clerkEnabled()).toBe(true);
	});

	it("treats whitespace-only values as absent", () => {
		vi.stubEnv("VITE_CLERK_PUBLISHABLE_KEY", "   ");
		expect(getClerkPublishableKey()).toBeUndefined();
		expect(clerkEnabled()).toBe(false);
	});
});
