import { z } from "zod";
import { sql } from "../../database";
import { entityId } from "../../id";
import { getCurrentUser } from "../../lib/auth";
import type { Doc } from "../../model";
import { defineWrite, privateWrite } from "../../procedure";
import { isCoveragePublic } from "../municipalities/coveragePublication";
import {
	evaluateSubscriptionSummaryMatch,
	type SubscriptionAlertKind,
	type SubscriptionMatchSkipReason,
} from "../subscriptions/matching";
// ═══════════════════════════════════════════════════════════════
// GENERATE ALERTS - Create pending alert candidates for matching subscriptions
// Called after a summary is created
// ═══════════════════════════════════════════════════════════════
export const generateAlerts = privateWrite({
	args: {
		summaryId: entityId("summaries"),
		meetingId: entityId("meetings"),
	},
	handler: async (ctx, args) => {
		const [meeting, summary] = await Promise.all([
			ctx.data.find(args.meetingId),
			ctx.data.find(args.summaryId),
		]);
		if (!meeting || !summary) {
			return {
				created: 0,
				skipped: 0,
				skippedByReason: {},
				errors: [!meeting ? "Meeting not found" : "Summary not found"],
			};
		}
		const subscriptions = await ctx.data
			.select("subscriptions")
			.orderBy(["municipalityId", "_creationTime", "_id"])
			.where("municipalityId", "=", meeting.municipalityId)
			.all();
		const municipality = await ctx.data.find(meeting.municipalityId);
		const now = Date.now();
		const alertKind = alertKindForSummary(summary);
		const results = {
			created: 0,
			skipped: 0,
			skippedByReason: {} as Partial<
				Record<SubscriptionMatchSkipReason, number>
			>,
			errors: [] as string[],
		};
		const recordSkip = (reason: SubscriptionMatchSkipReason) => {
			results.skipped++;
			results.skippedByReason[reason] =
				(results.skippedByReason[reason] ?? 0) + 1;
		};
		if (!municipality || !isCoveragePublic(municipality)) {
			for (const subscription of subscriptions) {
				if (subscription.isActive) {
					recordSkip("coverage_status");
				}
			}
			return results;
		}
		for (const subscription of subscriptions) {
			try {
				const [user, existing] = await Promise.all([
					ctx.data.find(subscription.userId),
					ctx.data
						.select("alerts")
						.orderBy(["subscriptionId", "summaryId", "_creationTime", "_id"])
						.where("subscriptionId", "=", subscription._id)
						.where("summaryId", "=", args.summaryId)
						.one(),
				]);
				const existingAgendaPreview =
					alertKind === "agenda_preview"
						? await ctx.data
								.select("alerts")
								.orderBy([
									"subscriptionId",
									"meetingId",
									"kind",
									"_creationTime",
									"_id",
								])
								.where("subscriptionId", "=", subscription._id)
								.where("meetingId", "=", args.meetingId)
								.where("kind", "=", alertKind)
								.one()
						: null;
				const match = evaluateSubscriptionSummaryMatch({
					subscription,
					user,
					meeting,
					summary,
					alertKind,
					hasExistingAlert: Boolean(existing || existingAgendaPreview),
				});
				if (!match.matches) {
					recordSkip(match.reason);
					continue;
				}
				await ctx.data.add("alerts", {
					userId: subscription.userId,
					subscriptionId: subscription._id,
					meetingId: args.meetingId,
					summaryId: args.summaryId,
					municipalityId: meeting.municipalityId,
					matchedTopics: match.matchedTopics,
					matchedKeywords: match.matchedKeywords,
					status: "pending",
					kind: alertKind,
					createdAt: now,
				});
				results.created++;
			} catch (error) {
				const errorMessage =
					error instanceof Error ? error.message : "Unknown error";
				results.errors.push(
					`Subscription ${subscription._id}: ${errorMessage}`,
				);
			}
		}
		return results;
	},
});
function alertKindForSummary(summary: Doc<"summaries">): SubscriptionAlertKind {
	return summary.kind === "agenda_preview" ? "agenda_preview" : "summary";
}
// ═══════════════════════════════════════════════════════════════
// MARK SENT - Mark an alert as sent
// ═══════════════════════════════════════════════════════════════
export const markSent = privateWrite({
	args: {
		alertId: entityId("alerts"),
		deliveryKey: z.string().optional(),
		providerMessageId: z.string().optional(),
	},
	handler: async (ctx, args) => {
		const alert = await ctx.data.find(args.alertId);
		if (!alert) {
			throw new Error("Alert not found");
		}
		await ctx.data.update(args.alertId, {
			status: "sent",
			sentAt: Date.now(),
			deliveryKey: args.deliveryKey ?? alert.deliveryKey,
			providerMessageId: args.providerMessageId,
			deliveryError: undefined,
			deliveryFailureKind: undefined,
			nextDeliveryAttemptAt: undefined,
			scheduledFor: undefined,
		});
	},
});
// ═══════════════════════════════════════════════════════════════
// MARK FAILED - Mark an alert as failed
// ═══════════════════════════════════════════════════════════════
export const markFailed = privateWrite({
	args: {
		alertId: entityId("alerts"),
		error: z.string(),
		failureKind: z
			.union([z.literal("retryable"), z.literal("permanent")])
			.optional(),
	},
	handler: async (ctx, args) => {
		const alert = await ctx.data.find(args.alertId);
		if (!alert) {
			throw new Error("Alert not found");
		}
		await ctx.data.update(args.alertId, {
			status: "failed",
			deliveryError: args.error,
			deliveryFailureKind: args.failureKind ?? "permanent",
			nextDeliveryAttemptAt: undefined,
			scheduledFor: undefined,
		});
	},
});
// ═══════════════════════════════════════════════════════════════
// MARK RETRYABLE FAILURE - Keep an alert pending for a later retry
// ═══════════════════════════════════════════════════════════════
export const markRetryableFailure = privateWrite({
	args: {
		alertId: entityId("alerts"),
		error: z.string(),
		retryAt: z.number(),
	},
	handler: async (ctx, args) => {
		const alert = await ctx.data.find(args.alertId);
		if (!alert) {
			throw new Error("Alert not found");
		}
		await ctx.data.update(args.alertId, {
			status: "pending",
			scheduledFor: args.retryAt,
			nextDeliveryAttemptAt: args.retryAt,
			deliveryError: args.error,
			deliveryFailureKind: "retryable",
		});
	},
});
// ═══════════════════════════════════════════════════════════════
// MARK QUEUED - Mark an alert as queued for sending
// ═══════════════════════════════════════════════════════════════
export const markQueued = privateWrite({
	args: {
		alertId: entityId("alerts"),
		deliveryKey: z.string().optional(),
	},
	handler: async (ctx, args) => {
		const alert = await ctx.data.find(args.alertId);
		if (!alert) {
			throw new Error("Alert not found");
		}
		if (alert.status === "sent") {
			return {
				reserved: false,
				alreadySent: true,
				attemptCount: alert.deliveryAttemptCount ?? 0,
				providerMessageId: alert.providerMessageId,
			};
		}
		if (alert.status !== "pending") {
			return {
				reserved: false,
				alreadySent: false,
				attemptCount: alert.deliveryAttemptCount ?? 0,
			};
		}
		const attemptCount = (alert.deliveryAttemptCount ?? 0) + 1;
		await ctx.data.update(args.alertId, {
			status: "queued",
			deliveryKey: args.deliveryKey ?? alert.deliveryKey,
			deliveryAttemptCount: attemptCount,
			lastDeliveryAttemptAt: Date.now(),
			nextDeliveryAttemptAt: undefined,
		});
		return { reserved: true, alreadySent: false, attemptCount };
	},
});
// ═══════════════════════════════════════════════════════════════
// MARK SKIPPED - Mark an alert as skipped
// ═══════════════════════════════════════════════════════════════
export const markSkipped = privateWrite({
	args: {
		alertId: entityId("alerts"),
		reason: z.string().optional(),
	},
	handler: async (ctx, args) => {
		const alert = await ctx.data.find(args.alertId);
		if (!alert) {
			throw new Error("Alert not found");
		}
		await ctx.data.update(args.alertId, {
			status: "skipped",
			deliveryError: args.reason,
		});
	},
});
// ═══════════════════════════════════════════════════════════════
// MARK BATCH SENT - Mark multiple alerts as sent (for digests)
// ═══════════════════════════════════════════════════════════════
export const markBatchSent = privateWrite({
	args: {
		alertIds: z.array(entityId("alerts")),
		deliveryKey: z.string().optional(),
		providerMessageId: z.string().optional(),
	},
	handler: async (ctx, args) => {
		const now = Date.now();
		for (const alertId of args.alertIds) {
			const alert = await ctx.data.find(alertId);
			if (!alert) continue;
			await ctx.data.update(alertId, {
				status: "sent",
				sentAt: now,
				deliveryKey: args.deliveryKey ?? alert.deliveryKey,
				providerMessageId: args.providerMessageId,
				deliveryError: undefined,
				deliveryFailureKind: undefined,
				nextDeliveryAttemptAt: undefined,
				scheduledFor: undefined,
			});
		}
		return { updated: args.alertIds.length };
	},
});
// ═══════════════════════════════════════════════════════════════
// MARK BATCH QUEUED - Atomically reserve multiple alerts for a digest send
// ═══════════════════════════════════════════════════════════════
export const markBatchQueued = privateWrite({
	args: {
		alertIds: z.array(entityId("alerts")),
		deliveryKey: z.string(),
	},
	handler: async (ctx, args) => {
		const alerts = [];
		let missing = false;
		for (const alertId of args.alertIds) {
			const alert = await ctx.data.find(alertId);
			if (!alert) {
				missing = true;
				continue;
			}
			alerts.push(alert);
		}
		const maxExistingAttemptCount = Math.max(
			0,
			...alerts.map((alert) => alert.deliveryAttemptCount ?? 0),
		);
		if (missing) {
			return {
				reserved: false,
				alreadySent: false,
				missing: true,
				attemptCount: maxExistingAttemptCount,
			};
		}
		const alreadySent = alerts.every((alert) => alert.status === "sent");
		if (alreadySent) {
			return {
				reserved: false,
				alreadySent: true,
				missing: false,
				attemptCount: maxExistingAttemptCount,
			};
		}
		if (alerts.some((alert) => alert.status !== "pending")) {
			return {
				reserved: false,
				alreadySent: false,
				missing: false,
				attemptCount: maxExistingAttemptCount,
			};
		}
		let maxAttemptCount = 0;
		const now = Date.now();
		for (const alert of alerts) {
			const attemptCount = (alert.deliveryAttemptCount ?? 0) + 1;
			maxAttemptCount = Math.max(maxAttemptCount, attemptCount);
			await ctx.data.update(alert._id, {
				status: "queued",
				deliveryKey: args.deliveryKey,
				deliveryAttemptCount: attemptCount,
				lastDeliveryAttemptAt: now,
				nextDeliveryAttemptAt: undefined,
			});
		}
		return {
			reserved: true,
			alreadySent: false,
			missing: false,
			attemptCount: maxAttemptCount,
		};
	},
});
// ═══════════════════════════════════════════════════════════════
// MARK BATCH RETRYABLE FAILURE - Keep digest alerts pending for retry
// ═══════════════════════════════════════════════════════════════
export const markBatchRetryableFailure = privateWrite({
	args: {
		alertIds: z.array(entityId("alerts")),
		error: z.string(),
		retryAt: z.number(),
	},
	handler: async (ctx, args) => {
		for (const alertId of args.alertIds) {
			const alert = await ctx.data.find(alertId);
			if (!alert) continue;
			await ctx.data.update(alertId, {
				status: "pending",
				scheduledFor: args.retryAt,
				nextDeliveryAttemptAt: args.retryAt,
				deliveryError: args.error,
				deliveryFailureKind: "retryable",
			});
		}
		return { updated: args.alertIds.length };
	},
});
// ═══════════════════════════════════════════════════════════════
// RECOVER STALE QUEUED ALERTS - Requeue reservations that never completed
// ═══════════════════════════════════════════════════════════════
export const recoverStaleQueuedAlerts = privateWrite({
	args: {
		staleBefore: z.number(),
		maxAttempts: z.number(),
	},
	handler: async (ctx, args) => {
		const queuedAlerts = await ctx.data
			.select("alerts")
			.orderBy(["status", "_creationTime", "_id"])
			.where("status", "=", "queued")
			.all();
		let requeued = 0;
		let failed = 0;
		for (const alert of queuedAlerts) {
			const lastAttemptAt = alert.lastDeliveryAttemptAt ?? alert.createdAt;
			if (lastAttemptAt > args.staleBefore) continue;
			const attemptCount = alert.deliveryAttemptCount ?? 0;
			if (attemptCount >= args.maxAttempts) {
				await ctx.data.update(alert._id, {
					status: "failed",
					deliveryError: `Retry attempts exhausted after ${attemptCount} attempts: Delivery reservation expired before completion`,
					deliveryFailureKind: "permanent",
					nextDeliveryAttemptAt: undefined,
					scheduledFor: undefined,
				});
				failed++;
				continue;
			}
			await ctx.data.update(alert._id, {
				status: "pending",
				scheduledFor: undefined,
				nextDeliveryAttemptAt: undefined,
				deliveryError: "Delivery reservation expired before completion",
				deliveryFailureKind: "retryable",
			});
			requeued++;
		}
		return { requeued, failed };
	},
});
// ═══════════════════════════════════════════════════════════════
// DELETE OLD ALERTS - Clean up old sent/failed alerts
// ═══════════════════════════════════════════════════════════════
export const deleteOldAlerts = privateWrite({
	args: {
		olderThanDays: z.number(),
	},
	handler: async (ctx, args) => {
		const cutoff = Date.now() - args.olderThanDays * 24 * 60 * 60 * 1000;
		// Get old sent/failed alerts
		const oldAlerts = await ctx.data
			.select("alerts")
			.where(
				sql.and(
					sql.lt(sql.column("createdAt"), cutoff),
					sql.or(
						sql.eq(sql.column("status"), "sent"),
						sql.eq(sql.column("status"), "failed"),
						sql.eq(sql.column("status"), "skipped"),
					),
				),
			)
			.limit(1000);
		let deleted = 0;
		for (const alert of oldAlerts) {
			await ctx.data.remove(alert._id);
			deleted++;
		}
		return { deleted };
	},
});
// ═══════════════════════════════════════════════════════════════
// MARK AS READ - Mark an alert as read (public mutation)
// ═══════════════════════════════════════════════════════════════
export const markAsRead = defineWrite({
	args: {
		alertId: entityId("alerts"),
	},
	handler: async (ctx, args) => {
		const user = await getCurrentUser(ctx);
		if (!user) {
			throw new Error("User not found. Please sign in first.");
		}
		const alert = await ctx.data.find(args.alertId);
		if (!alert || alert.userId !== user._id) {
			throw new Error("Unauthorized");
		}
		// Only mark if not already read
		if (!alert.readAt) {
			await ctx.data.update(args.alertId, {
				readAt: Date.now(),
			});
		}
	},
});
// ═══════════════════════════════════════════════════════════════
// MARK ALL AS READ - Mark all alerts as read for a user
// ═══════════════════════════════════════════════════════════════
export const markAllAsRead = defineWrite({
	args: {},
	handler: async (ctx) => {
		const user = await getCurrentUser(ctx);
		if (!user) {
			throw new Error("User not found. Please sign in first.");
		}
		const now = Date.now();
		// Get all unread sent alerts
		const alerts = await ctx.data
			.select("alerts")
			.orderBy(["userId", "_creationTime", "_id"])
			.where("userId", "=", user._id)
			.all();
		const unreadAlerts = alerts.filter((a) => a.status === "sent" && !a.readAt);
		// Mark each as read
		for (const alert of unreadAlerts) {
			await ctx.data.update(alert._id, {
				readAt: now,
			});
		}
		return { updated: unreadAlerts.length };
	},
});
