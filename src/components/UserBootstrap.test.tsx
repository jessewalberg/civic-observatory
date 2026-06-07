// @vitest-environment jsdom
// UserBootstrap must (a) not fire when signed out, (b) bootstrap once per
// signed-in user, (c) bootstrap AGAIN when a different user signs in (same
// tab), and (d) not permanently suppress after a transient failure.
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { authState, userState, ensureSpy } = vi.hoisted(() => ({
	authState: { value: false },
	userState: { value: null as { id: string } | null },
	ensureSpy: vi.fn(() => Promise.resolve()),
}));

vi.mock("@clerk/tanstack-react-start", () => ({
	useUser: () => ({
		isLoaded: true,
		isSignedIn: !!userState.value,
		user: userState.value,
	}),
}));
vi.mock("convex/react", () => ({
	useConvexAuth: () => ({ isAuthenticated: authState.value, isLoading: false }),
	useMutation: () => ensureSpy,
}));
vi.mock("../../convex/_generated/api", () => ({
	api: { functions: { users: { mutations: { ensureFromIdentity: {} } } } },
}));

import { UserBootstrap } from "./UserBootstrap";

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("UserBootstrap", () => {
	afterEach(() => {
		cleanup();
		authState.value = false;
		userState.value = null;
		ensureSpy.mockReset();
		ensureSpy.mockReturnValue(Promise.resolve());
	});

	it("does not bootstrap when unauthenticated", async () => {
		render(<UserBootstrap />);
		await flush();
		expect(ensureSpy).not.toHaveBeenCalled();
	});

	it("bootstraps once when a user is authenticated", async () => {
		authState.value = true;
		userState.value = { id: "user_1" };
		const { rerender } = render(<UserBootstrap />);
		await flush();
		rerender(<UserBootstrap />);
		await flush();
		expect(ensureSpy).toHaveBeenCalledTimes(1);
	});

	it("bootstraps again when a different user signs in", async () => {
		authState.value = true;
		userState.value = { id: "user_1" };
		const { rerender } = render(<UserBootstrap />);
		await flush();
		userState.value = { id: "user_2" };
		rerender(<UserBootstrap />);
		await flush();
		expect(ensureSpy).toHaveBeenCalledTimes(2);
	});

	it("retries after a transient failure (does not mark success)", async () => {
		ensureSpy.mockReturnValueOnce(Promise.reject(new Error("transient")));
		authState.value = true;
		userState.value = { id: "user_1" };
		const { rerender } = render(<UserBootstrap />);
		await flush();
		// auth handshake re-confirms (dep flips) → must retry the failed user
		authState.value = false;
		rerender(<UserBootstrap />);
		await flush();
		authState.value = true;
		rerender(<UserBootstrap />);
		await flush();
		expect(ensureSpy.mock.calls.length).toBeGreaterThanOrEqual(2);
	});
});
