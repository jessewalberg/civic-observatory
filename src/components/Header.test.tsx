// @vitest-environment jsdom
// Phase 4: Header gates on Clerk's useUser().isSignedIn (same package as the
// provider) and renders a lightweight sign-in link vs UserButton. We mock Clerk
// to a controllable signed-in flag.
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { signedInState } = vi.hoisted(() => ({
	signedInState: { value: false },
}));

vi.mock("@clerk/tanstack-react-start", () => ({
	useUser: () => ({ isLoaded: true, isSignedIn: signedInState.value }),
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
	Link: ({ children, to }: { children: React.ReactNode; to?: string }) => (
		<a href={to ?? "/"}>{children}</a>
	),
}));

import { Header } from "./Header";

describe("Header (Phase 4 Clerk)", () => {
	afterEach(() => {
		cleanup();
		signedInState.value = false;
	});

	it("links to the sign-in page when signed out", () => {
		signedInState.value = false;
		render(<Header />);
		expect(
			screen.getByRole("link", { name: "Sign in" }).getAttribute("href"),
		).toBe("/sign-in");
		expect(screen.queryByTestId("clerk-signin")).toBeNull();
		expect(screen.queryByTestId("clerk-userbutton")).toBeNull();
	});

	it("shows the Clerk UserButton when signed in", () => {
		signedInState.value = true;
		render(<Header />);
		expect(screen.getByTestId("clerk-userbutton")).toBeDefined();
		expect(screen.queryByTestId("clerk-signin")).toBeNull();
	});
});
