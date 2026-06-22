// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./SignedInHeaderControls", () => ({
	SignedInHeaderControls: () => <div data-testid="signed-in-controls" />,
}));

vi.mock("@tanstack/react-router", () => ({
	Link: ({ children, to }: { children: React.ReactNode; to?: string }) => (
		<a href={to ?? "/"}>{children}</a>
	),
}));

import { Header } from "./Header";

describe("Header", () => {
	afterEach(() => {
		cleanup();
	});

	it("links to the sign-in page by default without reading Clerk state", () => {
		render(<Header />);
		expect(
			screen.getByRole("link", { name: "Sign in" }).getAttribute("href"),
		).toBe("/sign-in");
		expect(screen.queryByTestId("signed-in-controls")).toBeNull();
	});

	it("shows signed-in controls when the authenticated shell requests them", async () => {
		render(<Header showSignedInControls />);
		expect(await screen.findByTestId("signed-in-controls")).toBeDefined();
		expect(screen.queryByRole("link", { name: "Sign in" })).toBeNull();
	});
});
