// @vitest-environment jsdom
// Phase 4: Header renders Clerk's <SignedIn>/<SignedOut> primitives and stops
// prop-drilling a WorkOS user. We mock Clerk's components to lightweight gates
// driven by a controllable signed-in flag.
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { signedInState } = vi.hoisted(() => ({
	signedInState: { value: false },
}));

vi.mock("@clerk/clerk-react", () => ({
	SignedIn: ({ children }: { children: React.ReactNode }) =>
		signedInState.value ? <>{children}</> : null,
	SignedOut: ({ children }: { children: React.ReactNode }) =>
		signedInState.value ? null : <>{children}</>,
	SignInButton: ({ children }: { children?: React.ReactNode }) => (
		<div data-testid="clerk-signin">{children ?? "Sign in"}</div>
	),
	UserButton: () => <div data-testid="clerk-userbutton" />,
}));

// Admin link + notification badge read Convex; keep them inert here.
vi.mock("convex/react", () => ({
	useQuery: () => undefined,
	useConvexAuth: () => ({ isAuthenticated: false, isLoading: false }),
}));
vi.mock("../../convex/_generated/api", () => ({
	api: {
		functions: {
			users: { queries: { current: {} } },
			alerts: { queries: { getUnreadCount: {} } },
		},
	},
}));
vi.mock("@tanstack/react-router", () => ({
	Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));

import { Header } from "./Header";

describe("Header (Phase 4 Clerk)", () => {
	afterEach(() => {
		cleanup();
		signedInState.value = false;
	});

	it("shows the Clerk sign-in control when signed out", () => {
		signedInState.value = false;
		render(<Header />);
		expect(screen.getByTestId("clerk-signin")).toBeDefined();
		expect(screen.queryByTestId("clerk-userbutton")).toBeNull();
	});

	it("shows the Clerk UserButton when signed in", () => {
		signedInState.value = true;
		render(<Header />);
		expect(screen.getByTestId("clerk-userbutton")).toBeDefined();
		expect(screen.queryByTestId("clerk-signin")).toBeNull();
	});
});
