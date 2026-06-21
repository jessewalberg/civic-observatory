import { v } from "convex/values";
import { internal } from "../../_generated/api";
import type { Doc, Id } from "../../_generated/dataModel";
import { internalAction } from "../../_generated/server";
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
const RESEND_EMAILS_URL = "https://api.resend.com/emails";
const BASE_URL = process.env.SITE_URL ?? "https://civicobservatory.com";

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
// SEND EMAIL - Core sending via Resend's transactional email API.
// ═══════════════════════════════════════════════════════════════
export const sendEmail = internalAction({
	args: {
		to: v.string(),
		subject: v.string(),
		html: v.string(),
		replyTo: v.optional(v.string()),
		idempotencyKey: v.optional(v.string()),
	},
	handler: async (
		_ctx,
		args,
	): Promise<{ success: boolean; error?: string; id?: string }> => {
		const apiKey = process.env.RESEND_API_KEY;

		if (!apiKey) {
			console.error("RESEND_API_KEY not configured");
			return {
				success: false,
				error: "Resend email service not configured",
			};
		}

		try {
			const headers: Record<string, string> = {
				"Content-Type": "application/json",
				Authorization: `Bearer ${apiKey}`,
				"User-Agent": "civic-observatory/1.0",
			};
			if (args.idempotencyKey) {
				headers["Idempotency-Key"] = args.idempotencyKey;
			}

			const response = await fetch(RESEND_EMAILS_URL, {
				method: "POST",
				headers,
				body: JSON.stringify({
					from: `${FROM_NAME} <${FROM_ADDRESS}>`,
					to: [args.to],
					subject: args.subject,
					html: args.html,
					text: htmlToText(args.html),
					...(args.replyTo ? { reply_to: args.replyTo } : {}),
					tags: [
						{
							name: "category",
							value: "alert_delivery",
						},
					],
				}),
			});

			if (!response.ok) {
				const errorMessage = await resendErrorMessage(response);
				console.error(`Resend API error (${response.status}):`, errorMessage);
				return {
					success: false,
					error: `Resend API error: ${response.status} ${errorMessage}`,
				};
			}

			const data = (await response.json()) as {
				id?: string;
			};
			if (!data.id) {
				return {
					success: false,
					error: "Resend API response missing email id",
				};
			}
			return { success: true, id: data.id };
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : "Unknown error";
			console.error("Failed to send email:", errorMessage);
			return { success: false, error: errorMessage };
		}
	},
});

// ═══════════════════════════════════════════════════════════════
// SEND IMMEDIATE ALERT - Send single meeting notification
// ═══════════════════════════════════════════════════════════════
export const sendImmediateAlert = internalAction({
	args: {
		alertId: v.id("alerts"),
	},
	handler: async (
		ctx,
		args,
	): Promise<{ success: boolean; error?: string; id?: string }> => {
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

		if (!summary) {
			await ctx.runMutation(internal.functions.alerts.mutations.markFailed, {
				alertId: args.alertId,
				error: "Summary not found",
			});
			return { success: false, error: "Summary not found" };
		}

		// Mark as queued
		await ctx.runMutation(internal.functions.alerts.mutations.markQueued, {
			alertId: args.alertId,
		});

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
				idempotencyKey: `alert/${alert._id}`,
			},
		);

		if (result.success) {
			await ctx.runMutation(internal.functions.alerts.mutations.markSent, {
				alertId: args.alertId,
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
		} else {
			await ctx.runMutation(internal.functions.alerts.mutations.markFailed, {
				alertId: args.alertId,
				error: result.error ?? "Failed to send email",
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
	handler: async (
		ctx,
	): Promise<{ sent: number; failed: number; errors: string[] }> => {
		const results = { sent: 0, failed: 0, errors: [] as string[] };

		// Get all pending alerts grouped by user
		const userDigests = (await ctx.runQuery(
			internal.functions.alerts.queries.getPendingForUserDigest,
			{ frequency: "daily" },
		)) as UserDigest[];

		for (const digest of userDigests) {
			const { user, alerts: userAlerts } = digest;

			if (userAlerts.length === 0) continue;

			// Mark all alerts as queued
			for (const { alert } of userAlerts) {
				await ctx.runMutation(internal.functions.alerts.mutations.markQueued, {
					alertId: alert._id,
				});
			}

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
			const alertIds = userAlerts.map(({ alert }) => alert._id);

			// Send email
			const result = await ctx.runAction(
				internal.functions.email.actions.sendEmail,
				{
					to: user.email,
					subject,
					html,
					idempotencyKey: digestIdempotencyKey(
						"daily",
						user._id.toString(),
						alertIds.map((id) => id.toString()),
					),
				},
			);

			if (result.success) {
				await ctx.runMutation(
					internal.functions.alerts.mutations.markBatchSent,
					{
						alertIds,
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
			} else {
				for (const alertId of alertIds) {
					await ctx.runMutation(
						internal.functions.alerts.mutations.markFailed,
						{
							alertId,
							error: result.error ?? "Failed to send digest",
						},
					);
				}
				results.failed++;
				results.errors.push(`User ${user.email}: ${result.error}`);
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
	handler: async (
		ctx,
	): Promise<{ sent: number; failed: number; errors: string[] }> => {
		const results = { sent: 0, failed: 0, errors: [] as string[] };

		// Get all pending alerts grouped by user
		const userDigests = (await ctx.runQuery(
			internal.functions.alerts.queries.getPendingForUserDigest,
			{ frequency: "weekly" },
		)) as UserDigest[];

		for (const digest of userDigests) {
			const { user, alerts: userAlerts } = digest;

			if (userAlerts.length === 0) continue;

			// Mark all alerts as queued
			for (const { alert } of userAlerts) {
				await ctx.runMutation(internal.functions.alerts.mutations.markQueued, {
					alertId: alert._id,
				});
			}

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
			const alertIds = userAlerts.map(({ alert }) => alert._id);

			// Send email
			const result = await ctx.runAction(
				internal.functions.email.actions.sendEmail,
				{
					to: user.email,
					subject,
					html,
					idempotencyKey: digestIdempotencyKey(
						"weekly",
						user._id.toString(),
						alertIds.map((id) => id.toString()),
					),
				},
			);

			if (result.success) {
				await ctx.runMutation(
					internal.functions.alerts.mutations.markBatchSent,
					{
						alertIds,
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
			} else {
				for (const alertId of alertIds) {
					await ctx.runMutation(
						internal.functions.alerts.mutations.markFailed,
						{
							alertId,
							error: result.error ?? "Failed to send weekly digest",
						},
					);
				}
				results.failed++;
				results.errors.push(`User ${user.email}: ${result.error}`);
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
	): Promise<{ processed: number; sent: number; failed: number }> => {
		const results = { processed: 0, sent: 0, failed: 0 };

		// Get all pending immediate alerts
		const pendingAlerts = await ctx.runQuery(
			internal.functions.alerts.queries.getPendingByFrequency,
			{ frequency: "immediate" },
		);

		for (const alertInfo of pendingAlerts) {
			results.processed++;

			const result = await ctx.runAction(
				internal.functions.email.actions.sendImmediateAlert,
				{ alertId: alertInfo.alert._id },
			);

			if (result.success) {
				results.sent++;
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

function digestIdempotencyKey(
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

async function resendErrorMessage(response: Response): Promise<string> {
	try {
		const text = await response.text();
		if (!text) return "send failed";

		try {
			const data = JSON.parse(text) as {
				message?: string;
				error?: string | { message?: string };
			};
			if (typeof data.message === "string") return data.message;
			if (typeof data.error === "string") return data.error;
			if (data.error?.message) return data.error.message;
		} catch {
			return text;
		}

		return text;
	} catch {
		return "send failed";
	}
}
