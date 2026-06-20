import { isNotFound } from "@tanstack/react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Route as RootRoute } from "../routes/__root";
import { Route as DashboardRoute } from "../routes/dashboard/index";
import { Route as DashboardSubscriptionsRoute } from "../routes/dashboard/subscriptions";
import { Route as DashboardUploadRoute } from "../routes/dashboard/upload";
import { Route as MeetingRoute } from "../routes/meeting/$meetingId";
import { Route as SignInRoute } from "../routes/sign-in";
import { Route as SignInSplatRoute } from "../routes/sign-in.$";
import { Route as SignUpRoute } from "../routes/sign-up";
import { Route as SignUpSplatRoute } from "../routes/sign-up.$";

const { convexQuery } = vi.hoisted(() => ({
	convexQuery: vi.fn(),
}));

vi.mock("convex/browser", () => ({
	ConvexHttpClient: vi.fn(() => ({
		query: convexQuery,
	})),
}));

type HeadMeta = Record<string, string>;

function getMeta(
	route: unknown,
	ctx: { loaderData?: unknown } = {},
): HeadMeta[] {
	const options = (route as { options?: { head?: unknown } }).options;
	if (typeof options?.head !== "function") {
		return [];
	}

	const head = options.head as (ctx: unknown) => { meta?: HeadMeta[] };
	return head(ctx).meta ?? [];
}

function metaContent(meta: HeadMeta[], name: string): string | undefined {
	return meta.find((tag) => tag.name === name)?.content;
}

describe("route SEO indexability", () => {
	afterEach(() => {
		vi.unstubAllEnvs();
		convexQuery.mockReset();
	});

	it("does not emit global index/follow robots directives from the root route", () => {
		const meta = getMeta(RootRoute);

		expect(metaContent(meta, "robots")).toBeUndefined();
		expect(metaContent(meta, "googlebot")).toBeUndefined();
	});

	it("marks auth routes as noindex", () => {
		for (const route of [
			SignInRoute,
			SignInSplatRoute,
			SignUpRoute,
			SignUpSplatRoute,
		]) {
			expect(metaContent(getMeta(route), "robots")).toBe("noindex, nofollow");
		}
	});

	it("marks protected dashboard routes as noindex", () => {
		for (const route of [
			DashboardRoute,
			DashboardSubscriptionsRoute,
			DashboardUploadRoute,
		]) {
			expect(metaContent(getMeta(route), "robots")).toBe("noindex, nofollow");
		}
	});

	it("marks missing meeting metadata as noindex", () => {
		const meta = getMeta(MeetingRoute, { loaderData: { meeting: null } });

		expect(meta.find((tag) => tag.title)?.title).toBe(
			"Meeting Not Found | Civic Observatory",
		);
		expect(metaContent(meta, "robots")).toBe("noindex, nofollow");
	});

	it("throws TanStack notFound when a meeting record is missing", async () => {
		vi.stubEnv("VITE_CONVEX_URL", "https://convex.example.test");
		convexQuery.mockResolvedValue(null);
		const loader = MeetingRoute.options.loader as unknown as (ctx: {
			params: { meetingId: string };
		}) => Promise<unknown>;

		await expect(
			loader({
				params: { meetingId: "missing_meeting" },
			}),
		).rejects.toSatisfy(isNotFound);
	});
});
