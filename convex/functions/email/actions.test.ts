import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import schema from "../../schema";
import { modules } from "../../test.setup";

const setup = () => convexTest(schema, modules);

beforeEach(() => {
	vi.stubEnv("RESEND_API_KEY", "re_test_key");
});

afterEach(() => {
	vi.unstubAllEnvs();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

function okEmailResponse(id = "email_123") {
	return new Response(JSON.stringify({ id }), {
		status: 200,
		headers: { "Content-Type": "application/json" },
	});
}

function failedEmailResponse(message = "domain not verified") {
	return new Response(JSON.stringify({ message }), {
		status: 422,
		headers: { "Content-Type": "application/json" },
	});
}

async function seedPendingAlert(
	t: ReturnType<typeof convexTest>,
	alertFrequency: "immediate" | "daily" | "weekly" = "immediate",
) {
	const now = Date.UTC(2026, 5, 20, 15, 30);
	const userId = await t.run(async (ctx) =>
		ctx.db.insert("users", {
			clerkUserId: "user_alert_delivery",
			email: "reader@example.test",
			name: "Coventry Reader",
			tier: "pro",
			createdAt: now,
			lastLoginAt: now,
		}),
	);
	const municipalityId = await t.run(async (ctx) =>
		ctx.db.insert("municipalities", {
			name: "Coventry",
			state: "Connecticut",
			slug: "coventry-ct",
			platform: "manual",
			isActive: true,
			isVerified: true,
			createdAt: now,
			updatedAt: now,
		}),
	);
	const meetingId = await t.run(async (ctx) =>
		ctx.db.insert("meetings", {
			municipalityId,
			title: "Town Council Bond Hearing",
			slug: "town-council-bond-hearing",
			meetingType: "city_council",
			meetingDate: now,
			sourceType: "manual_entry",
			sourceUrl: "https://source.example/agenda.pdf",
			rawContent: "Council discussed park bond spending.",
			status: "summarized",
			createdAt: now,
			updatedAt: now,
		}),
	);
	const summaryId = await t.run(async (ctx) =>
		ctx.db.insert("summaries", {
			meetingId,
			version: 1,
			executiveSummary: "Council reviewed a park bond and related spending.",
			keyDecisions: [
				{
					title: "Bond advanced",
					description: "Council advanced the park bond request.",
					topics: ["budget"],
				},
			],
			discussionTopics: [],
			upcomingItems: [],
			topics: ["budget", "parks"],
			modelUsed: "test",
			promptVersion: "test",
			processingTimeMs: 1,
			municipalityId,
			meetingDate: now,
			sourceUrl: "https://source.example/agenda.pdf",
			sourceType: "manual_entry",
			sourceContentHash: "delivery-test",
			status: "summarized",
			createdAt: now,
		}),
	);
	const subscriptionId = await t.run(async (ctx) =>
		ctx.db.insert("subscriptions", {
			userId,
			municipalityId,
			alertFrequency,
			emailEnabled: true,
			isActive: true,
			createdAt: now,
			updatedAt: now,
		}),
	);
	const alertId = await t.run(async (ctx) =>
		ctx.db.insert("alerts", {
			userId,
			subscriptionId,
			meetingId,
			summaryId,
			municipalityId,
			matchedTopics: ["budget"],
			matchedKeywords: ["bond"],
			status: "pending",
			createdAt: now,
		}),
	);

	return {
		alertId: alertId as Id<"alerts">,
		meetingId: meetingId as Id<"meetings">,
		summaryId: summaryId as Id<"summaries">,
		userId: userId as Id<"users">,
	};
}

describe("Resend email delivery", () => {
	it("posts transactional email payloads to Resend with a retry-safe key", async () => {
		const t = setup();
		const fetchMock = vi.fn(async () => okEmailResponse("email_boundary_123"));
		vi.stubGlobal("fetch", fetchMock);

		await expect(
			t.action(internal.functions.email.actions.sendEmail, {
				to: "reader@example.test",
				subject: "New summary",
				html: "<p>Summary ready</p>",
				idempotencyKey: "alert/test-alert-id",
			}),
		).resolves.toEqual({ success: true, id: "email_boundary_123" });

		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [url, init] = fetchMock.mock.calls[0] as unknown as [
			string,
			RequestInit & { headers: Record<string, string> },
		];
		expect(url).toBe("https://api.resend.com/emails");
		expect(init.method).toBe("POST");
		expect(init.headers.Authorization).toBe("Bearer re_test_key");
		expect(init.headers["Idempotency-Key"]).toBe("alert/test-alert-id");
		const body = JSON.parse(init.body as string);
		expect(body).toMatchObject({
			from: "Civic Observatory <alerts@civicobservatory.com>",
			to: ["reader@example.test"],
			subject: "New summary",
			html: "<p>Summary ready</p>",
			text: "Summary ready",
		});
	});

	it("marks an immediate pending candidate sent and sends source-backed links", async () => {
		const t = setup();
		const { alertId, userId } = await seedPendingAlert(t);
		const fetchMock = vi.fn(async () => okEmailResponse("email_immediate_123"));
		vi.stubGlobal("fetch", fetchMock);

		await expect(
			t.action(internal.functions.email.actions.sendImmediateAlert, {
				alertId,
			}),
		).resolves.toEqual({ success: true, id: "email_immediate_123" });

		const alert = await t.run(async (ctx) => ctx.db.get(alertId));
		expect(alert).toMatchObject({
			status: "sent",
			sentAt: expect.any(Number),
		});
		const usage = await t.run(async (ctx) =>
			ctx.db.query("usageRecords").collect(),
		);
		expect(usage).toEqual([
			expect.objectContaining({ userId, action: "alert_sent" }),
		]);

		const [, init] = fetchMock.mock.calls[0] as unknown as [
			string,
			RequestInit,
		];
		const body = JSON.parse(init.body as string);
		expect(body.to).toEqual(["reader@example.test"]);
		expect(body.html).toContain("Coventry, Connecticut");
		expect(body.html).toContain("Council reviewed a park bond");
		expect(body.html).toContain("budget");
		expect(body.html).toContain(
			"https://civicobservatory.com/meeting/town-council-bond-hearing",
		);
		expect(body.html).toContain("https://source.example/agenda.pdf");
		expect(body.html).toContain(
			"https://civicobservatory.com/dashboard/subscriptions",
		);
		expect(body.html).toContain("Unsubscribe");
		expect((init.headers as Record<string, string>)["Idempotency-Key"]).toBe(
			`alert/${alertId}`,
		);
	});

	it("falls back to the summary source when the meeting source is blank", async () => {
		const t = setup();
		const { alertId, meetingId } = await seedPendingAlert(t);
		await t.run(async (ctx) => {
			await ctx.db.patch(meetingId, { sourceUrl: "" });
		});
		const fetchMock = vi.fn(async () => okEmailResponse("email_source_123"));
		vi.stubGlobal("fetch", fetchMock);

		await expect(
			t.action(internal.functions.email.actions.sendImmediateAlert, {
				alertId,
			}),
		).resolves.toEqual({ success: true, id: "email_source_123" });

		const [, init] = fetchMock.mock.calls[0] as unknown as [
			string,
			RequestInit,
		];
		const body = JSON.parse(init.body as string);
		expect(body.html).toContain("https://source.example/agenda.pdf");
	});

	it("marks an immediate candidate failed when Resend rejects the send", async () => {
		const t = setup();
		const { alertId } = await seedPendingAlert(t);
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => failedEmailResponse()),
		);

		await expect(
			t.action(internal.functions.email.actions.sendImmediateAlert, {
				alertId,
			}),
		).resolves.toMatchObject({
			success: false,
			error: "Resend API error: 422 domain not verified",
		});

		const alert = await t.run(async (ctx) => ctx.db.get(alertId));
		expect(alert).toMatchObject({
			status: "failed",
			deliveryError: "Resend API error: 422 domain not verified",
		});
	});

	it("fails visibly when Resend credentials are not configured", async () => {
		vi.stubEnv("RESEND_API_KEY", "");
		const t = setup();
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);

		await expect(
			t.action(internal.functions.email.actions.sendEmail, {
				to: "reader@example.test",
				subject: "New summary",
				html: "<p>Summary ready</p>",
			}),
		).resolves.toEqual({
			success: false,
			error: "Resend email service not configured",
		});
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("marks an immediate candidate failed when Resend credentials are missing", async () => {
		vi.stubEnv("RESEND_API_KEY", "");
		const t = setup();
		const { alertId } = await seedPendingAlert(t);
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);

		await expect(
			t.action(internal.functions.email.actions.sendImmediateAlert, {
				alertId,
			}),
		).resolves.toEqual({
			success: false,
			error: "Resend email service not configured",
		});

		expect(fetchMock).not.toHaveBeenCalled();
		const alert = await t.run(async (ctx) => ctx.db.get(alertId));
		expect(alert).toMatchObject({
			status: "failed",
			deliveryError: "Resend email service not configured",
		});
	});

	it("sends a daily digest and marks all grouped candidates sent", async () => {
		const t = setup();
		const { alertId } = await seedPendingAlert(t, "daily");
		const fetchMock = vi.fn(async () => okEmailResponse("email_digest_123"));
		vi.stubGlobal("fetch", fetchMock);

		await expect(
			t.action(internal.functions.email.actions.sendDailyDigest, {}),
		).resolves.toEqual({ sent: 1, failed: 0, errors: [] });

		const alert = await t.run(async (ctx) => ctx.db.get(alertId));
		expect(alert).toMatchObject({
			status: "sent",
			sentAt: expect.any(Number),
		});

		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [, init] = fetchMock.mock.calls[0] as unknown as [
			string,
			RequestInit,
		];
		const body = JSON.parse(init.body as string);
		expect(body.subject).toContain("Daily Digest");
		expect(body.html).toContain("Town Council Bond Hearing");
		expect(body.html).toContain("https://source.example/agenda.pdf");
		expect(
			(init.headers as Record<string, string>)["Idempotency-Key"],
		).toContain("digest/daily/");
	});

	it("marks daily digest candidates failed when Resend rejects the send", async () => {
		const t = setup();
		const { alertId } = await seedPendingAlert(t, "daily");
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => failedEmailResponse()),
		);

		await expect(
			t.action(internal.functions.email.actions.sendDailyDigest, {}),
		).resolves.toEqual({
			sent: 0,
			failed: 1,
			errors: [
				"User reader@example.test: Resend API error: 422 domain not verified",
			],
		});

		const alert = await t.run(async (ctx) => ctx.db.get(alertId));
		expect(alert).toMatchObject({
			status: "failed",
			deliveryError: "Resend API error: 422 domain not verified",
		});
	});

	it("marks daily digest candidates failed when Resend credentials are missing", async () => {
		vi.stubEnv("RESEND_API_KEY", "");
		const t = setup();
		const { alertId } = await seedPendingAlert(t, "daily");
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);

		await expect(
			t.action(internal.functions.email.actions.sendDailyDigest, {}),
		).resolves.toEqual({
			sent: 0,
			failed: 1,
			errors: ["User reader@example.test: Resend email service not configured"],
		});

		expect(fetchMock).not.toHaveBeenCalled();
		const alert = await t.run(async (ctx) => ctx.db.get(alertId));
		expect(alert).toMatchObject({
			status: "failed",
			deliveryError: "Resend email service not configured",
		});
	});

	it("sends a weekly digest and marks grouped candidates sent", async () => {
		const t = setup();
		const { alertId } = await seedPendingAlert(t, "weekly");
		const fetchMock = vi.fn(async () => okEmailResponse("email_weekly_123"));
		vi.stubGlobal("fetch", fetchMock);

		await expect(
			t.action(internal.functions.email.actions.sendWeeklyDigest, {}),
		).resolves.toEqual({ sent: 1, failed: 0, errors: [] });

		const alert = await t.run(async (ctx) => ctx.db.get(alertId));
		expect(alert).toMatchObject({
			status: "sent",
			sentAt: expect.any(Number),
		});

		const [, init] = fetchMock.mock.calls[0] as unknown as [
			string,
			RequestInit,
		];
		const body = JSON.parse(init.body as string);
		expect(body.subject).toContain("Weekly Digest");
		expect(body.html).toContain("Town Council Bond Hearing");
		expect(
			(init.headers as Record<string, string>)["Idempotency-Key"],
		).toContain("digest/weekly/");
	});
});
