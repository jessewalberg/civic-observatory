import { v } from "convex/values";
import { internal } from "../../_generated/api";
import type { Doc, Id } from "../../_generated/dataModel";
import { type ActionCtx, internalAction } from "../../_generated/server";
import {
	dailyDigestTemplate,
	type EmailParams,
	immediateAlertTemplate,
	type MeetingData,
	weeklyDigestTemplate,
} from "./templates";

// ═══════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════
const FROM_ADDRESS = "alerts@civicobservatory.com";
const FROM_NAME = "Civic Observatory";
const CLOUDFLARE_API_BASE = "https://api.cloudflare.com/client/v4";
const BASE_URL = process.env.SITE_URL ?? "https://civicobservatory.com";
const DELIVERY_RETRY_DELAY_MS = 15 * 60 * 1000;
const DELIVERY_RESERVATION_TIMEOUT_MS = 30 * 60 * 1000;
const MAX_DELIVERY_ATTEMPTS = 3;

type SendEmailResult = {
	success: boolean;
	error?: string;
	id?: string;
	retryable?: boolean;
};

type DigestResults = {
	sent: number;
	failed: number;
	retrying: number;
	errors: string[];
};

type DeliveryReservation = {
	reserved: boolean;
	alreadySent: boolean;
	missing?: boolean;
	attemptCount: number;
	providerMessageId?: string;
};

type PendingAlert = {
	alert: Doc<"alerts">;
	user: {
		_id: Id<"users">;
		email: string;
		name?: string;
	};
	meeting: Pick<
		Doc<"meetings">,
		"_id" | "slug" | "title" | "meetingType" | "meetingDate" | "sourceUrl"
	>;
	municipality: Pick<
		Doc<"municipalities">,
		"_id" | "slug" | "name" | "state"
	> | null;
	summary: Pick<
		Doc<"summaries">,
		"_id" | "executiveSummary" | "topics" | "keyDecisions" | "sourceUrl"
	> | null;
};

type DigestAlert = {
	alert: Doc<"alerts">;
	meeting: Pick<
		Doc<"meetings">,
		"_id" | "slug" | "title" | "meetingType" | "meetingDate" | "sourceUrl"
	>;
	municipality: Pick<Doc<"municipalities">, "slug" | "name" | "state"> | null;
	summary: Pick<
		Doc<"summaries">,
		"executiveSummary" | "topics" | "sourceUrl"
	> | null;
};

type UserDigest = {
	user: {
		_id: Id<"users">;
		email: string;
		name?: string;
	};
	alerts: DigestAlert[];
};

/** Minimal HTML→text fallback so transactional email has a text part
 * (improves deliverability; spam filters prefer both HTML and text). */
export function htmlToText(html: string): string {
	return html
		.replace(/<style[\s\S]*?<\/style>/gi, "")
		.replace(/<script[\s\S]*?<\/script>/gi, "")
		.replace(/<\/(p|div|tr|h[1-6]|li)>/gi, "\n")
		.replace(/<br\s*\/?>/gi, "\n")
		.replace(/<[^>]+>/g, "")
		.replace(/&nbsp;/g, " ")
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}

// ═══════════════════════════════════════════════════════════════
// SEND EMAIL - Core sending via Cloudflare Email Sending's REST API.
// ═══════════════════════════════════════════════════════════════
export const sendEmail = internalAction({
	args: {
		to: v.string(),
		subject: v.string(),
		html: v.string(),
		replyTo: v.optional(v.string()),
		deliveryKey: v.optional(v.string()),
	},
	handler: async (_ctx, args): Promise<SendEmailResult> => {
		const apiToken = process.env.CLOUDFLARE_API_TOKEN;
		const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;

		if (!apiToken || !accountId) {
			console.error(
				"CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID not configured",
			);
			return {
				success: false,
				error: "Cloudflare email service not configured",
				retryable: true,
			};
		}

		try {
			const headers: Record<string, string> = {
				"Content-Type": "application/json",
				Authorization: `Bearer ${apiToken}`,
				"User-Agent": "civic-observatory/1.0",
			};

			const emailHeaders: Record<string, string> = {};
			if (args.deliveryKey) {
				emailHeaders["X-Civic-Delivery-Key"] = args.deliveryKey;
			}

			const response = await fetch(
				`${CLOUDFLARE_API_BASE}/accounts/${accountId}/email/sending/send`,
				{
					method: "POST",
					headers,
					body: JSON.stringify({
						from: {
							address: FROM_ADDRESS,
							name: FROM_NAME,
						},
						to: args.to,
						subject: args.subject,
						html: args.html,
						text: htmlToText(args.html),
						...(args.replyTo ? { reply_to: args.replyTo } : {}),
						...(Object.keys(emailHeaders).length > 0
							? { headers: emailHeaders }
							: {}),
					}),
				},
			);

			if (!response.ok) {
				const errorMessage = await cloudflareErrorMessage(response);
				console.error(
					`Cloudflare Email API error (${response.status}):`,
					errorMessage,
				);
				const retryable = isRetryableCloudflareStatus(response.status);
				return {
					success: false,
					error: `Cloudflare Email API error: ${response.status} ${errorMessage}`,
					...(retryable ? { retryable } : {}),
				};
			}

			const data = (await response.json()) as CloudflareEmailResponse;
			if (data.success === false) {
				const errorMessage = cloudflareErrors(data) || "send failed";
				console.error("Cloudflare Email send failed:", errorMessage);
				return {
					success: false,
					error: `Cloudflare Email API error: ${errorMessage}`,
				};
			}

			if (cloudflarePermanentBounce(data, args.to)) {
				return {
					success: false,
					error: "Cloudflare Email API reported permanent bounce",
				};
			}

			const acceptedId = cloudflareAcceptedId(data);
			if (!acceptedId) {
				return {
					success: false,
					error: "Cloudflare Email API response missing accepted recipient",
				};
			}

			return { success: true, id: acceptedId };
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : "Unknown error";
			console.error("Failed to send email:", errorMessage);
			return { success: false, error: errorMessage, retryable: true };
		}
	},
});

// ═══════════════════════════════════════════════════════════════
// SEND IMMEDIATE ALERT - Send single meeting notification
// ═══════════════════════════════════════════════════════════════
export const sendImmediateAlert = internalAction({
	args: {
		alertId: v.id("alerts"),
		recoverStaleQueued: v.optional(v.boolean()),
	},
	handler: async (ctx, args): Promise<SendEmailResult> => {
		if (args.recoverStaleQueued !== false) {
			await recoverStaleDeliveryReservations(ctx);
		}

		// Get alert with all related data
		const alertData = (await ctx.runQuery(
			internal.functions.alerts.queries.getPendingByFrequency,
			{ frequency: "immediate" },
		)) as PendingAlert[];

		// Find our specific alert
		const alertInfo = alertData.find((a) => a.alert._id === args.alertId);

		if (!alertInfo) {
			return { success: false, error: "Alert not found or not ready" };
		}

		const { alert, user, meeting, municipality, summary } = alertInfo;
		const deliveryKey = `alert/${alert._id}`;

		if (!summary) {
			await ctx.runMutation(internal.functions.alerts.mutations.markFailed, {
				alertId: args.alertId,
				error: "Summary not found",
			});
			return { success: false, error: "Summary not found" };
		}

		// Mark as queued
		const queued = (await ctx.runMutation(
			internal.functions.alerts.mutations.markQueued,
			{
				alertId: args.alertId,
				deliveryKey,
			},
		)) as DeliveryReservation;

		if (!queued.reserved) {
			if (queued.alreadySent) {
				return { success: true, id: queued.providerMessageId };
			}

			return {
				success: false,
				error: "Alert delivery already reserved",
				retryable: true,
			};
		}

		// Build meeting data for template
		const meetingData: MeetingData = {
			title: meeting.title,
			meetingType: meeting.meetingType,
			meetingDate: meeting.meetingDate,
			sourceUrl: emailSourceUrl(meeting.sourceUrl, summary.sourceUrl),
			municipalityName: municipality?.name ?? "Unknown Municipality",
			municipalityState: municipality?.state ?? "",
			executiveSummary: summary.executiveSummary,
			topics: summary.topics,
			matchedTopics: alert.matchedTopics,
			keyDecisions: summary.keyDecisions.slice(0, 3),
			meetingUrl: meetingUrl(meeting),
		};

		const emailParams: EmailParams = {
			userName: user.name,
			unsubscribeUrl: `${BASE_URL}/api/unsubscribe?subscription=${alert.subscriptionId}`,
			manageSubscriptionsUrl: `${BASE_URL}/dashboard/subscriptions`,
			baseUrl: BASE_URL,
		};

		// Generate email
		const { subject, html } = immediateAlertTemplate(meetingData, emailParams);

		// Send email
		const result = await ctx.runAction(
			internal.functions.email.actions.sendEmail,
			{
				to: user.email,
				subject,
				html,
				deliveryKey,
			},
		);

		if (result.success) {
			await ctx.runMutation(internal.functions.alerts.mutations.markSent, {
				alertId: args.alertId,
				deliveryKey,
				providerMessageId: result.id,
			});

			// Track usage
			await ctx.runMutation(
				internal.functions.usage.mutations.recordUsageInternal,
				{
					userId: alert.userId,
					action: "alert_sent",
					windowType: "month",
				},
			);
		} else if (shouldRetryDelivery(result, queued.attemptCount)) {
			await ctx.runMutation(
				internal.functions.alerts.mutations.markRetryableFailure,
				{
					alertId: args.alertId,
					error: deliveryError(result, "Failed to send email"),
					retryAt: nextRetryAt(),
				},
			);
		} else {
			const error = terminalDeliveryError(
				result,
				"Failed to send email",
				queued.attemptCount,
			);
			await ctx.runMutation(internal.functions.alerts.mutations.markFailed, {
				alertId: args.alertId,
				error,
				failureKind: "permanent",
			});
		}

		return result;
	},
});

// ═══════════════════════════════════════════════════════════════
// SEND DAILY DIGEST - Send grouped daily email
// ═══════════════════════════════════════════════════════════════
export const sendDailyDigest = internalAction({
	args: {},
	handler: async (ctx): Promise<DigestResults> => {
		await recoverStaleDeliveryReservations(ctx);

		const results: DigestResults = {
			sent: 0,
			failed: 0,
			retrying: 0,
			errors: [],
		};

		// Get all pending alerts grouped by user
		const userDigests = (await ctx.runQuery(
			internal.functions.alerts.queries.getPendingForUserDigest,
			{ frequency: "daily" },
		)) as UserDigest[];

		for (const digest of userDigests) {
			const { user, alerts: userAlerts } = digest;

			if (userAlerts.length === 0) continue;

			const alertIds = userAlerts.map(({ alert }) => alert._id);
			const deliveryKey = digestDeliveryKey(
				"daily",
				user._id.toString(),
				alertIds.map((id) => id.toString()),
			);

			// Mark all alerts as queued
			const queued = (await ctx.runMutation(
				internal.functions.alerts.mutations.markBatchQueued,
				{
					alertIds,
					deliveryKey,
				},
			)) as DeliveryReservation;

			if (!queued.reserved) {
				if (queued.alreadySent) {
					results.sent++;
					continue;
				}

				results.retrying++;
				results.errors.push(
					`User ${user.email}: ${
						queued.missing
							? "Alert delivery reservation unavailable"
							: "Alert delivery already reserved"
					}`,
				);
				continue;
			}
			const maxAttemptCount = queued.attemptCount;

			// Build meeting data for all alerts
			const meetings: MeetingData[] = userAlerts.map(
				({ alert, meeting, municipality, summary }) => ({
					title: meeting.title,
					meetingType: meeting.meetingType,
					meetingDate: meeting.meetingDate,
					sourceUrl: emailSourceUrl(meeting.sourceUrl, summary?.sourceUrl),
					municipalityName: municipality?.name ?? "Unknown Municipality",
					municipalityState: municipality?.state ?? "",
					executiveSummary: summary?.executiveSummary ?? "",
					topics: summary?.topics ?? [],
					matchedTopics: alert.matchedTopics,
					keyDecisions: [],
					meetingUrl: meetingUrl(meeting, alert.meetingId),
				}),
			);

			const emailParams: EmailParams = {
				userName: user.name,
				unsubscribeUrl: `${BASE_URL}/dashboard/subscriptions`,
				manageSubscriptionsUrl: `${BASE_URL}/dashboard/subscriptions`,
				baseUrl: BASE_URL,
			};

			// Generate digest email
			const { subject, html } = dailyDigestTemplate(meetings, emailParams);

			// Send email
			const result = await ctx.runAction(
				internal.functions.email.actions.sendEmail,
				{
					to: user.email,
					subject,
					html,
					deliveryKey,
				},
			);

			if (result.success) {
				await ctx.runMutation(
					internal.functions.alerts.mutations.markBatchSent,
					{
						alertIds,
						deliveryKey,
						providerMessageId: result.id,
					},
				);

				// Track usage for each alert in the digest
				for (const { alert } of userAlerts) {
					await ctx.runMutation(
						internal.functions.usage.mutations.recordUsageInternal,
						{
							userId: alert.userId,
							action: "alert_sent",
							windowType: "month",
						},
					);
				}

				results.sent++;
			} else if (shouldRetryDelivery(result, maxAttemptCount)) {
				const error = deliveryError(result, "Failed to send digest");
				await ctx.runMutation(
					internal.functions.alerts.mutations.markBatchRetryableFailure,
					{
						alertIds,
						error,
						retryAt: nextRetryAt(),
					},
				);
				results.retrying++;
				results.errors.push(`User ${user.email}: ${error}`);
			} else {
				const error = terminalDeliveryError(
					result,
					"Failed to send digest",
					maxAttemptCount,
				);
				for (const alertId of alertIds) {
					await ctx.runMutation(
						internal.functions.alerts.mutations.markFailed,
						{
							alertId,
							error,
							failureKind: "permanent",
						},
					);
				}
				results.failed++;
				results.errors.push(
					`User ${user.email}: ${deliveryError(result, "Failed to send digest")}`,
				);
			}
		}

		return results;
	},
});

// ═══════════════════════════════════════════════════════════════
// SEND WEEKLY DIGEST - Send weekly summary email
// ═══════════════════════════════════════════════════════════════
export const sendWeeklyDigest = internalAction({
	args: {},
	handler: async (ctx): Promise<DigestResults> => {
		await recoverStaleDeliveryReservations(ctx);

		const results: DigestResults = {
			sent: 0,
			failed: 0,
			retrying: 0,
			errors: [],
		};

		// Get all pending alerts grouped by user
		const userDigests = (await ctx.runQuery(
			internal.functions.alerts.queries.getPendingForUserDigest,
			{ frequency: "weekly" },
		)) as UserDigest[];

		for (const digest of userDigests) {
			const { user, alerts: userAlerts } = digest;

			if (userAlerts.length === 0) continue;

			const alertIds = userAlerts.map(({ alert }) => alert._id);
			const deliveryKey = digestDeliveryKey(
				"weekly",
				user._id.toString(),
				alertIds.map((id) => id.toString()),
			);

			// Mark all alerts as queued
			const queued = (await ctx.runMutation(
				internal.functions.alerts.mutations.markBatchQueued,
				{
					alertIds,
					deliveryKey,
				},
			)) as DeliveryReservation;

			if (!queued.reserved) {
				if (queued.alreadySent) {
					results.sent++;
					continue;
				}

				results.retrying++;
				results.errors.push(
					`User ${user.email}: ${
						queued.missing
							? "Alert delivery reservation unavailable"
							: "Alert delivery already reserved"
					}`,
				);
				continue;
			}
			const maxAttemptCount = queued.attemptCount;

			// Build meeting data for all alerts
			const meetings: MeetingData[] = userAlerts.map(
				({ alert, meeting, municipality, summary }) => ({
					title: meeting.title,
					meetingType: meeting.meetingType,
					meetingDate: meeting.meetingDate,
					sourceUrl: emailSourceUrl(meeting.sourceUrl, summary?.sourceUrl),
					municipalityName: municipality?.name ?? "Unknown Municipality",
					municipalityState: municipality?.state ?? "",
					executiveSummary: summary?.executiveSummary ?? "",
					topics: summary?.topics ?? [],
					matchedTopics: alert.matchedTopics,
					keyDecisions: [],
					meetingUrl: meetingUrl(meeting, alert.meetingId),
				}),
			);

			// Count unique municipalities
			const uniqueMunicipalities = new Set(
				meetings.map((m) => `${m.municipalityName}, ${m.municipalityState}`),
			);

			const emailParams: EmailParams & {
				weekStats: { totalMeetings: number; municipalities: number };
			} = {
				userName: user.name,
				unsubscribeUrl: `${BASE_URL}/dashboard/subscriptions`,
				manageSubscriptionsUrl: `${BASE_URL}/dashboard/subscriptions`,
				baseUrl: BASE_URL,
				weekStats: {
					totalMeetings: meetings.length,
					municipalities: uniqueMunicipalities.size,
				},
			};

			// Generate weekly digest email
			const { subject, html } = weeklyDigestTemplate(meetings, emailParams);

			// Send email
			const result = await ctx.runAction(
				internal.functions.email.actions.sendEmail,
				{
					to: user.email,
					subject,
					html,
					deliveryKey,
				},
			);

			if (result.success) {
				await ctx.runMutation(
					internal.functions.alerts.mutations.markBatchSent,
					{
						alertIds,
						deliveryKey,
						providerMessageId: result.id,
					},
				);

				// Track usage for each alert in the digest
				for (const { alert } of userAlerts) {
					await ctx.runMutation(
						internal.functions.usage.mutations.recordUsageInternal,
						{
							userId: alert.userId,
							action: "alert_sent",
							windowType: "month",
						},
					);
				}

				results.sent++;
			} else if (shouldRetryDelivery(result, maxAttemptCount)) {
				const error = deliveryError(result, "Failed to send weekly digest");
				await ctx.runMutation(
					internal.functions.alerts.mutations.markBatchRetryableFailure,
					{
						alertIds,
						error,
						retryAt: nextRetryAt(),
					},
				);
				results.retrying++;
				results.errors.push(`User ${user.email}: ${error}`);
			} else {
				const error = terminalDeliveryError(
					result,
					"Failed to send weekly digest",
					maxAttemptCount,
				);
				for (const alertId of alertIds) {
					await ctx.runMutation(
						internal.functions.alerts.mutations.markFailed,
						{
							alertId,
							error,
							failureKind: "permanent",
						},
					);
				}
				results.failed++;
				results.errors.push(
					`User ${user.email}: ${deliveryError(result, "Failed to send weekly digest")}`,
				);
			}
		}

		return results;
	},
});

// ═══════════════════════════════════════════════════════════════
// PROCESS IMMEDIATE ALERTS - Process all pending immediate alerts
// Called by cron job every 5 minutes
// ═══════════════════════════════════════════════════════════════
export const processImmediateAlerts = internalAction({
	args: {},
	handler: async (
		ctx,
	): Promise<{
		processed: number;
		sent: number;
		failed: number;
		retrying: number;
	}> => {
		await recoverStaleDeliveryReservations(ctx);

		const results = { processed: 0, sent: 0, failed: 0, retrying: 0 };

		// Get all pending immediate alerts
		const pendingAlerts = await ctx.runQuery(
			internal.functions.alerts.queries.getPendingByFrequency,
			{ frequency: "immediate" },
		);

		for (const alertInfo of pendingAlerts) {
			results.processed++;

			const result = await ctx.runAction(
				internal.functions.email.actions.sendImmediateAlert,
				{ alertId: alertInfo.alert._id, recoverStaleQueued: false },
			);

			if (result.success) {
				results.sent++;
			} else if (result.retryable) {
				results.retrying++;
			} else {
				results.failed++;
			}
		}

		return results;
	},
});

function meetingUrl(
	meeting: { _id?: string; slug?: string },
	fallbackId?: string,
): string {
	return `${BASE_URL}/meeting/${meeting.slug ?? meeting._id ?? fallbackId}`;
}

function emailSourceUrl(
	meetingSourceUrl: string | undefined,
	summarySourceUrl: string | undefined,
): string | undefined {
	const meetingSource = meetingSourceUrl?.trim();
	if (meetingSource) return meetingSource;

	const summarySource = summarySourceUrl?.trim();
	return summarySource || undefined;
}

function shouldRetryDelivery(
	result: SendEmailResult,
	attemptCount: number,
): boolean {
	return result.retryable === true && attemptCount < MAX_DELIVERY_ATTEMPTS;
}

function nextRetryAt(): number {
	return Date.now() + DELIVERY_RETRY_DELAY_MS;
}

function deliveryError(result: SendEmailResult, fallback: string): string {
	return result.error ?? fallback;
}

function terminalDeliveryError(
	result: SendEmailResult,
	fallback: string,
	attemptCount: number,
): string {
	const error = deliveryError(result, fallback);
	if (!result.retryable) return error;

	return `Retry attempts exhausted after ${attemptCount} attempts: ${error}`;
}

async function recoverStaleDeliveryReservations(ctx: ActionCtx): Promise<void> {
	await ctx.runMutation(
		internal.functions.alerts.mutations.recoverStaleQueuedAlerts,
		{
			staleBefore: Date.now() - DELIVERY_RESERVATION_TIMEOUT_MS,
			maxAttempts: MAX_DELIVERY_ATTEMPTS,
		},
	);
}

function digestDeliveryKey(
	frequency: "daily" | "weekly",
	userId: string,
	alertIds: string[],
): string {
	return `digest/${frequency}/${userId}/${hashString([...alertIds].sort().join("|"))}`;
}

function hashString(value: string): string {
	let hash = 2166136261;
	for (let i = 0; i < value.length; i++) {
		hash ^= value.charCodeAt(i);
		hash = Math.imul(hash, 16777619);
	}
	return (hash >>> 0).toString(36);
}

type CloudflareEmailResponse = {
	success?: boolean;
	errors?: Array<{ code?: number; message?: string }>;
	message_id?: string;
	delivered?: string[];
	queued?: string[];
	permanent_bounces?: string[];
	result?: {
		message_id?: string;
		delivered?: string[];
		queued?: string[];
		permanent_bounces?: string[];
	} | null;
};

async function cloudflareErrorMessage(response: Response): Promise<string> {
	try {
		const text = await response.text();
		if (!text) return "send failed";

		try {
			const data = JSON.parse(text) as CloudflareEmailResponse & {
				message?: string;
			};
			const errorMessage = cloudflareErrors(data);
			if (errorMessage) return errorMessage;
			if (typeof data.message === "string") return data.message;
		} catch {
			return text;
		}

		return text;
	} catch {
		return "send failed";
	}
}

function cloudflareErrors(data: CloudflareEmailResponse): string {
	return (
		data.errors
			?.map((error) => error.message)
			.filter((message): message is string => Boolean(message))
			.join("; ") ?? ""
	);
}

function cloudflareAcceptedId(
	data: CloudflareEmailResponse,
): string | undefined {
	return (
		data.result?.message_id ??
		data.message_id ??
		data.result?.queued?.[0] ??
		data.queued?.[0] ??
		data.result?.delivered?.[0] ??
		data.delivered?.[0]
	);
}

function cloudflarePermanentBounce(
	data: CloudflareEmailResponse,
	recipient: string,
): boolean {
	const bounces = [
		...(data.result?.permanent_bounces ?? []),
		...(data.permanent_bounces ?? []),
	];
	if (!bounces.includes(recipient)) return false;

	const acceptedRecipients = [
		...(data.result?.queued ?? []),
		...(data.queued ?? []),
		...(data.result?.delivered ?? []),
		...(data.delivered ?? []),
	];
	return !acceptedRecipients.includes(recipient);
}

function isRetryableCloudflareStatus(status: number): boolean {
	return status === 429 || status >= 500;
}
