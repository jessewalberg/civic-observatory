import { isNotFound, isRedirect } from "@tanstack/react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Route as RootRoute } from "../routes/__root";
import { Route as AdminAlertsRoute } from "../routes/admin/alerts";
import { Route as AdminCoverageRoute } from "../routes/admin/coverage";
import { Route as AdminIndexRoute } from "../routes/admin/index";
import { Route as AdminInvestigationsRoute } from "../routes/admin/investigations";
import { Route as AdminMunicipalitiesRoute } from "../routes/admin/municipalities";
import { Route as AdminScrapersRoute } from "../routes/admin/scrapers";
import { Route as AdminUsersRoute } from "../routes/admin/users";
import { Route as DashboardRoute } from "../routes/dashboard/index";
import { Route as DashboardSubscriptionsRoute } from "../routes/dashboard/subscriptions";
import { Route as DashboardUploadRoute } from "../routes/dashboard/upload";
import { Route as MunicipalityRoute } from "../routes/explore/$municipalityId";
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

	it("marks admin routes as noindex", () => {
		for (const route of [
			AdminIndexRoute,
			AdminCoverageRoute,
			AdminMunicipalitiesRoute,
			AdminUsersRoute,
			AdminScrapersRoute,
			AdminAlertsRoute,
			AdminInvestigationsRoute,
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

	it("redirects legacy municipality ID URLs to slug URLs", async () => {
		vi.stubEnv("VITE_CONVEX_URL", "https://convex.example.test");
		convexQuery.mockResolvedValue({
			_id: "municipality_123",
			slug: "austin-tx",
			name: "Austin",
			state: "TX",
		});
		const loader = MunicipalityRoute.options.loader as unknown as (ctx: {
			params: { municipalityId: string };
		}) => Promise<unknown>;

		const result = await loader({
			params: { municipalityId: "municipality_123" },
		}).catch((error: unknown) => error);

		expect(isRedirect(result)).toBe(true);
		expect(result).toMatchObject({
			status: 301,
			options: {
				to: "/explore/$municipalityId",
				params: { municipalityId: "austin-tx" },
				replace: true,
			},
		});
	});

	it("redirects legacy meeting ID URLs to slug URLs", async () => {
		vi.stubEnv("VITE_CONVEX_URL", "https://convex.example.test");
		convexQuery.mockResolvedValue({
			_id: "meeting_123",
			slug: "austin-tx-2026-01-15-city-council-regular-meeting",
			title: "City Council Regular Meeting",
			meetingType: "city_council",
			meetingDate: Date.UTC(2026, 0, 15),
			status: "summarized",
			summary: null,
			municipality: {
				_id: "municipality_123",
				slug: "austin-tx",
				name: "Austin",
				state: "TX",
			},
		});
		const loader = MeetingRoute.options.loader as unknown as (ctx: {
			params: { meetingId: string };
		}) => Promise<unknown>;

		const result = await loader({
			params: { meetingId: "meeting_123" },
		}).catch((error: unknown) => error);

		expect(isRedirect(result)).toBe(true);
		expect(result).toMatchObject({
			status: 301,
			options: {
				to: "/meeting/$meetingId",
				params: {
					meetingId: "austin-tx-2026-01-15-city-council-regular-meeting",
				},
				replace: true,
			},
		});
	});
});
