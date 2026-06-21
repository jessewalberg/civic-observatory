import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import schema from "../../schema";
import { modules } from "../../test.setup";

const setup = () => convexTest(schema, modules);

beforeEach(() => {
	vi.stubEnv("CLOUDFLARE_API_TOKEN", "cf_test_token");
	vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "cf_account_123");
});

afterEach(() => {
	vi.unstubAllEnvs();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

function okEmailResponse(messageId = "<email_123@example.com>") {
	return new Response(
		JSON.stringify({
			success: true,
			errors: [],
			messages: [],
			result: {
				message_id: messageId,
				delivered: [],
				queued: ["reader@example.test"],
				permanent_bounces: [],
			},
		}),
		{
			status: 200,
			headers: { "Content-Type": "application/json" },
		},
	);
}

function failedEmailResponse(message = "Sender domain not verified") {
	return new Response(
		JSON.stringify({
			success: false,
			errors: [{ code: 1000, message }],
			result: null,
		}),
		{
			status: 400,
			headers: { "Content-Type": "application/json" },
		},
	);
}

function serverErrorEmailResponse(
	message = "email.sending.error.internal_server",
) {
	return new Response(
		JSON.stringify({
			success: false,
			errors: [{ code: 10002, message }],
			result: null,
		}),
		{
			status: 500,
			headers: { "Content-Type": "application/json" },
		},
	);
}

function failedEnvelopeEmailResponse(message = "Sender domain not verified") {
	return new Response(
		JSON.stringify({
			success: false,
			errors: [{ code: 1000, message }],
			result: null,
		}),
		{
			status: 200,
			headers: { "Content-Type": "application/json" },
		},
	);
}

function acceptedWithoutMessageIdResponse() {
	return new Response(
		JSON.stringify({
			success: true,
			errors: [],
			messages: [],
			result: {
				delivered: [],
				queued: ["reader@example.test"],
				permanent_bounces: [],
			},
		}),
		{
			status: 200,
			headers: { "Content-Type": "application/json" },
		},
	);
}

function malformedSuccessResponse() {
	return new Response(
		JSON.stringify({
			success: true,
			errors: [],
			messages: [],
			result: {
				delivered: [],
				queued: [],
				permanent_bounces: [],
			},
		}),
		{
			status: 200,
			headers: { "Content-Type": "application/json" },
		},
	);
}

function permanentBounceResponse() {
	return new Response(
		JSON.stringify({
			success: true,
			errors: [],
			messages: [],
			result: {
				message_id: "<email_bounce_123@example.com>",
				delivered: [],
				queued: [],
				permanent_bounces: ["reader@example.test"],
			},
		}),
		{
			status: 200,
			headers: { "Content-Type": "application/json" },
		},
	);
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
		userId: userId as Id<"users">,
	};
}

describe("Cloudflare email delivery", () => {
	it("posts transactional email payloads to Cloudflare Email Sending", async () => {
		const t = setup();
		const fetchMock = vi.fn(async () =>
			okEmailResponse("<email_boundary_123@example.com>"),
		);
		vi.stubGlobal("fetch", fetchMock);

		await expect(
			t.action(internal.functions.email.actions.sendEmail, {
				to: "reader@example.test",
				subject: "New summary",
				html: "<p>Summary ready</p>",
				replyTo: "support@civicobservatory.com",
				deliveryKey: "alert/test-alert-id",
			}),
		).resolves.toEqual({
			success: true,
			id: "<email_boundary_123@example.com>",
		});

		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [url, init] = fetchMock.mock.calls[0] as unknown as [
			string,
			RequestInit & { headers: Record<string, string> },
		];
		expect(url).toBe(
			"https://api.cloudflare.com/client/v4/accounts/cf_account_123/email/sending/send",
		);
		expect(init.method).toBe("POST");
		expect(init.headers.Authorization).toBe("Bearer cf_test_token");
		const body = JSON.parse(init.body as string);
		expect(body).toMatchObject({
			from: {
				address: "alerts@civicobservatory.com",
				name: "Civic Observatory",
			},
			to: "reader@example.test",
			subject: "New summary",
			html: "<p>Summary ready</p>",
			text: "Summary ready",
			reply_to: "support@civicobservatory.com",
			headers: {
				"X-Civic-Delivery-Key": "alert/test-alert-id",
			},
		});
	});

	it("uses queued recipient confirmation when Cloudflare omits a message id", async () => {
		const t = setup();
		const fetchMock = vi.fn(async () => acceptedWithoutMessageIdResponse());
		vi.stubGlobal("fetch", fetchMock);

		await expect(
			t.action(internal.functions.email.actions.sendEmail, {
				to: "reader@example.test",
				subject: "New summary",
				html: "<p>Summary ready</p>",
			}),
		).resolves.toEqual({ success: true, id: "reader@example.test" });
	});

	it("fails visibly when Cloudflare returns success without an accepted recipient", async () => {
		const t = setup();
		const { alertId } = await seedPendingAlert(t);
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => malformedSuccessResponse()),
		);

		await expect(
			t.action(internal.functions.email.actions.sendImmediateAlert, {
				alertId,
			}),
		).resolves.toEqual({
			success: false,
			error: "Cloudflare Email API response missing accepted recipient",
		});

		const alert = await t.run(async (ctx) => ctx.db.get(alertId));
		expect(alert).toMatchObject({
			status: "failed",
			deliveryError: "Cloudflare Email API response missing accepted recipient",
		});
	});

	it("marks an immediate candidate failed when Cloudflare reports a permanent bounce", async () => {
		const t = setup();
		const { alertId } = await seedPendingAlert(t);
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => permanentBounceResponse()),
		);

		await expect(
			t.action(internal.functions.email.actions.sendImmediateAlert, {
				alertId,
			}),
		).resolves.toEqual({
			success: false,
			error: "Cloudflare Email API reported permanent bounce",
		});

		const alert = await t.run(async (ctx) => ctx.db.get(alertId));
		expect(alert).toMatchObject({
			status: "failed",
			deliveryError: "Cloudflare Email API reported permanent bounce",
		});
	});

	it("marks an immediate pending candidate sent and sends source-backed links", async () => {
		const t = setup();
		const { alertId, userId } = await seedPendingAlert(t);
		const fetchMock = vi.fn(async () =>
			okEmailResponse("<email_immediate_123@example.com>"),
		);
		vi.stubGlobal("fetch", fetchMock);

		await expect(
			t.action(internal.functions.email.actions.sendImmediateAlert, {
				alertId,
			}),
		).resolves.toEqual({
			success: true,
			id: "<email_immediate_123@example.com>",
		});

		const alert = await t.run(async (ctx) => ctx.db.get(alertId));
		expect(alert).toMatchObject({
			status: "sent",
			sentAt: expect.any(Number),
			providerMessageId: "<email_immediate_123@example.com>",
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
		expect(body.to).toBe("reader@example.test");
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
		expect(body.headers["X-Civic-Delivery-Key"]).toBe(`alert/${alertId}`);
	});

	it("falls back to the summary source when the meeting source is blank", async () => {
		const t = setup();
		const { alertId, meetingId } = await seedPendingAlert(t);
		await t.run(async (ctx) => {
			await ctx.db.patch(meetingId, { sourceUrl: "" });
		});
		const fetchMock = vi.fn(async () =>
			okEmailResponse("<email_source_123@example.com>"),
		);
		vi.stubGlobal("fetch", fetchMock);

		await expect(
			t.action(internal.functions.email.actions.sendImmediateAlert, {
				alertId,
			}),
		).resolves.toEqual({
			success: true,
			id: "<email_source_123@example.com>",
		});

		const [, init] = fetchMock.mock.calls[0] as unknown as [
			string,
			RequestInit,
		];
		const body = JSON.parse(init.body as string);
		expect(body.html).toContain("https://source.example/agenda.pdf");
	});

	it("marks an immediate candidate failed when Cloudflare rejects the send", async () => {
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
			error: "Cloudflare Email API error: 400 Sender domain not verified",
		});

		const alert = await t.run(async (ctx) => ctx.db.get(alertId));
		expect(alert).toMatchObject({
			status: "failed",
			deliveryError:
				"Cloudflare Email API error: 400 Sender domain not verified",
			deliveryFailureKind: "permanent",
		});
	});

	it("marks an immediate candidate failed when Cloudflare returns a failure envelope", async () => {
		const t = setup();
		const { alertId } = await seedPendingAlert(t);
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => failedEnvelopeEmailResponse()),
		);

		await expect(
			t.action(internal.functions.email.actions.sendImmediateAlert, {
				alertId,
			}),
		).resolves.toMatchObject({
			success: false,
			error: "Cloudflare Email API error: Sender domain not verified",
		});

		const alert = await t.run(async (ctx) => ctx.db.get(alertId));
		expect(alert).toMatchObject({
			status: "failed",
			deliveryError: "Cloudflare Email API error: Sender domain not verified",
			deliveryFailureKind: "permanent",
		});
	});

	it("fails visibly when Cloudflare credentials are not configured", async () => {
		vi.stubEnv("CLOUDFLARE_API_TOKEN", "");
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
			error: "Cloudflare email service not configured",
			retryable: true,
		});
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("fails visibly when Cloudflare account id is not configured", async () => {
		vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "");
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
			error: "Cloudflare email service not configured",
			retryable: true,
		});
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("classifies transient Cloudflare outages as retryable", async () => {
		const t = setup();
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => serverErrorEmailResponse()),
		);

		await expect(
			t.action(internal.functions.email.actions.sendEmail, {
				to: "reader@example.test",
				subject: "New summary",
				html: "<p>Summary ready</p>",
			}),
		).resolves.toEqual({
			success: false,
			error:
				"Cloudflare Email API error: 500 email.sending.error.internal_server",
			retryable: true,
		});
	});

	it("requeues an immediate candidate when Cloudflare credentials are missing", async () => {
		vi.stubEnv("CLOUDFLARE_API_TOKEN", "");
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
			error: "Cloudflare email service not configured",
			retryable: true,
		});

		expect(fetchMock).not.toHaveBeenCalled();
		const alert = await t.run(async (ctx) => ctx.db.get(alertId));
		expect(alert).toMatchObject({
			status: "pending",
			deliveryError: "Cloudflare email service not configured",
			deliveryFailureKind: "retryable",
			deliveryKey: `alert/${alertId}`,
			deliveryAttemptCount: 1,
			lastDeliveryAttemptAt: expect.any(Number),
			nextDeliveryAttemptAt: expect.any(Number),
			scheduledFor: expect.any(Number),
		});
		expect(alert?.scheduledFor).toBeGreaterThan(Date.now());
	});

	it("does not reserve the same delivery key twice", async () => {
		const t = setup();
		const { alertId } = await seedPendingAlert(t);
		const deliveryKey = `alert/${alertId}`;

		await expect(
			t.mutation(internal.functions.alerts.mutations.markQueued, {
				alertId,
				deliveryKey,
			}),
		).resolves.toMatchObject({ reserved: true, attemptCount: 1 });

		await expect(
			t.mutation(internal.functions.alerts.mutations.markQueued, {
				alertId,
				deliveryKey,
			}),
		).resolves.toMatchObject({ reserved: false, attemptCount: 1 });

		const alert = await t.run(async (ctx) => ctx.db.get(alertId));
		expect(alert).toMatchObject({
			status: "queued",
			deliveryKey,
			deliveryAttemptCount: 1,
		});
	});

	it("does not reserve a digest batch when one alert disappeared", async () => {
		const t = setup();
		const first = await seedPendingAlert(t, "daily");
		const second = await seedPendingAlert(t, "daily");
		await t.run(async (ctx) => {
			await ctx.db.delete(first.alertId);
		});

		await expect(
			t.mutation(internal.functions.alerts.mutations.markBatchQueued, {
				alertIds: [first.alertId, second.alertId],
				deliveryKey: "digest/daily/test/disappeared",
			}),
		).resolves.toMatchObject({
			reserved: false,
			alreadySent: false,
			missing: true,
		});

		const alert = await t.run(async (ctx) => ctx.db.get(second.alertId));
		expect(alert).toMatchObject({
			status: "pending",
		});
		expect(alert?.deliveryAttemptCount).toBeUndefined();
	});

	it("fails retryable immediate candidates once the retry budget is exhausted", async () => {
		vi.stubEnv("CLOUDFLARE_API_TOKEN", "");
		const t = setup();
		const { alertId } = await seedPendingAlert(t);
		await t.run(async (ctx) => {
			await ctx.db.patch(alertId, { deliveryAttemptCount: 2 });
		});
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);

		await expect(
			t.action(internal.functions.email.actions.sendImmediateAlert, {
				alertId,
			}),
		).resolves.toEqual({
			success: false,
			error: "Cloudflare email service not configured",
			retryable: true,
		});

		expect(fetchMock).not.toHaveBeenCalled();
		const alert = await t.run(async (ctx) => ctx.db.get(alertId));
		expect(alert).toMatchObject({
			status: "failed",
			deliveryError:
				"Retry attempts exhausted after 3 attempts: Cloudflare email service not configured",
			deliveryFailureKind: "permanent",
			deliveryAttemptCount: 3,
		});
	});

	it("recovers stale queued immediate reservations before processing", async () => {
		const t = setup();
		const { alertId } = await seedPendingAlert(t);
		await t.run(async (ctx) => {
			await ctx.db.patch(alertId, {
				status: "queued",
				deliveryKey: `alert/${alertId}`,
				deliveryAttemptCount: 1,
				lastDeliveryAttemptAt: Date.now() - 31 * 60 * 1000,
			});
		});
		const fetchMock = vi.fn(async () =>
			okEmailResponse("<email_recovered_123@example.com>"),
		);
		vi.stubGlobal("fetch", fetchMock);

		await expect(
			t.action(internal.functions.email.actions.processImmediateAlerts, {}),
		).resolves.toEqual({
			processed: 1,
			sent: 1,
			failed: 0,
			retrying: 0,
		});

		expect(fetchMock).toHaveBeenCalledTimes(1);
		const alert = await t.run(async (ctx) => ctx.db.get(alertId));
		expect(alert).toMatchObject({
			status: "sent",
			deliveryAttemptCount: 2,
			providerMessageId: "<email_recovered_123@example.com>",
		});
	});

	it("sends a daily digest and marks all grouped candidates sent", async () => {
		const t = setup();
		const { alertId } = await seedPendingAlert(t, "daily");
		const fetchMock = vi.fn(async () =>
			okEmailResponse("<email_digest_123@example.com>"),
		);
		vi.stubGlobal("fetch", fetchMock);

		await expect(
			t.action(internal.functions.email.actions.sendDailyDigest, {}),
		).resolves.toEqual({ sent: 1, failed: 0, retrying: 0, errors: [] });

		const alert = await t.run(async (ctx) => ctx.db.get(alertId));
		expect(alert).toMatchObject({
			status: "sent",
			sentAt: expect.any(Number),
			providerMessageId: "<email_digest_123@example.com>",
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
		expect(body.headers["X-Civic-Delivery-Key"]).toContain("digest/daily/");
	});

	it("marks daily digest candidates failed when Cloudflare rejects the send", async () => {
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
			retrying: 0,
			errors: [
				"User reader@example.test: Cloudflare Email API error: 400 Sender domain not verified",
			],
		});

		const alert = await t.run(async (ctx) => ctx.db.get(alertId));
		expect(alert).toMatchObject({
			status: "failed",
			deliveryError:
				"Cloudflare Email API error: 400 Sender domain not verified",
			deliveryFailureKind: "permanent",
		});
	});

	it("requeues daily digest candidates when Cloudflare credentials are missing", async () => {
		vi.stubEnv("CLOUDFLARE_API_TOKEN", "");
		const t = setup();
		const { alertId } = await seedPendingAlert(t, "daily");
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);

		await expect(
			t.action(internal.functions.email.actions.sendDailyDigest, {}),
		).resolves.toEqual({
			sent: 0,
			failed: 0,
			retrying: 1,
			errors: [
				"User reader@example.test: Cloudflare email service not configured",
			],
		});

		expect(fetchMock).not.toHaveBeenCalled();
		const alert = await t.run(async (ctx) => ctx.db.get(alertId));
		expect(alert).toMatchObject({
			status: "pending",
			deliveryError: "Cloudflare email service not configured",
			deliveryFailureKind: "retryable",
			deliveryAttemptCount: 1,
			lastDeliveryAttemptAt: expect.any(Number),
			nextDeliveryAttemptAt: expect.any(Number),
			scheduledFor: expect.any(Number),
		});
		expect(alert?.deliveryKey).toContain("digest/daily/");
		expect(alert?.scheduledFor).toBeGreaterThan(Date.now());
	});

	it("requeues daily digest candidates when Cloudflare has a retryable outage", async () => {
		const t = setup();
		const { alertId } = await seedPendingAlert(t, "daily");
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => serverErrorEmailResponse()),
		);

		await expect(
			t.action(internal.functions.email.actions.sendDailyDigest, {}),
		).resolves.toEqual({
			sent: 0,
			failed: 0,
			retrying: 1,
			errors: [
				"User reader@example.test: Cloudflare Email API error: 500 email.sending.error.internal_server",
			],
		});

		const alert = await t.run(async (ctx) => ctx.db.get(alertId));
		expect(alert).toMatchObject({
			status: "pending",
			deliveryError:
				"Cloudflare Email API error: 500 email.sending.error.internal_server",
			deliveryFailureKind: "retryable",
			deliveryAttemptCount: 1,
		});
		expect(alert?.scheduledFor).toBeGreaterThan(Date.now());
	});

	it("sends a weekly digest and marks grouped candidates sent", async () => {
		const t = setup();
		const { alertId } = await seedPendingAlert(t, "weekly");
		const fetchMock = vi.fn(async () =>
			okEmailResponse("<email_weekly_123@example.com>"),
		);
		vi.stubGlobal("fetch", fetchMock);

		await expect(
			t.action(internal.functions.email.actions.sendWeeklyDigest, {}),
		).resolves.toEqual({ sent: 1, failed: 0, retrying: 0, errors: [] });

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
		expect(body.headers["X-Civic-Delivery-Key"]).toContain("digest/weekly/");
	});
});
