import { v } from "convex/values";
import { internalMutation, mutation } from "../../_generated/server";
import { getCurrentUser } from "../../lib/auth";
import { isCoveragePublic } from "../municipalities/coveragePublication";
import {
	evaluateSubscriptionSummaryMatch,
	type SubscriptionMatchSkipReason,
} from "../subscriptions/matching";

// ═══════════════════════════════════════════════════════════════
// GENERATE ALERTS - Create pending alert candidates for matching subscriptions
// Called after a summary is created
// ═══════════════════════════════════════════════════════════════
export const generateAlerts = internalMutation({
	args: {
		summaryId: v.id("summaries"),
		meetingId: v.id("meetings"),
	},
	handler: async (ctx, args) => {
		const [meeting, summary] = await Promise.all([
			ctx.db.get(args.meetingId),
			ctx.db.get(args.summaryId),
		]);

		if (!meeting || !summary) {
			return {
				created: 0,
				skipped: 0,
				skippedByReason: {},
				errors: [!meeting ? "Meeting not found" : "Summary not found"],
			};
		}

		const subscriptions = await ctx.db
			.query("subscriptions")
			.withIndex("by_municipality", (q) =>
				q.eq("municipalityId", meeting.municipalityId),
			)
			.collect();
		const municipality = await ctx.db.get(meeting.municipalityId);

		const now = Date.now();
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
					ctx.db.get(subscription.userId),
					ctx.db
						.query("alerts")
						.withIndex("by_subscription_summary", (q) =>
							q
								.eq("subscriptionId", subscription._id)
								.eq("summaryId", args.summaryId),
						)
						.first(),
				]);

				const match = evaluateSubscriptionSummaryMatch({
					subscription,
					user,
					meeting,
					summary,
					hasExistingAlert: Boolean(existing),
				});
				if (!match.matches) {
					recordSkip(match.reason);
					continue;
				}

				await ctx.db.insert("alerts", {
					userId: subscription.userId,
					subscriptionId: subscription._id,
					meetingId: args.meetingId,
					summaryId: args.summaryId,
					municipalityId: meeting.municipalityId,
					matchedTopics: match.matchedTopics,
					matchedKeywords: match.matchedKeywords,
					status: "pending",
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

// ═══════════════════════════════════════════════════════════════
// MARK SENT - Mark an alert as sent
// ═══════════════════════════════════════════════════════════════
export const markSent = internalMutation({
	args: {
		alertId: v.id("alerts"),
		deliveryKey: v.optional(v.string()),
		providerMessageId: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const alert = await ctx.db.get(args.alertId);
		if (!alert) {
			throw new Error("Alert not found");
		}

		await ctx.db.patch(args.alertId, {
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
export const markFailed = internalMutation({
	args: {
		alertId: v.id("alerts"),
		error: v.string(),
		failureKind: v.optional(
			v.union(v.literal("retryable"), v.literal("permanent")),
		),
	},
	handler: async (ctx, args) => {
		const alert = await ctx.db.get(args.alertId);
		if (!alert) {
			throw new Error("Alert not found");
		}

		await ctx.db.patch(args.alertId, {
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
export const markRetryableFailure = internalMutation({
	args: {
		alertId: v.id("alerts"),
		error: v.string(),
		retryAt: v.number(),
	},
	handler: async (ctx, args) => {
		const alert = await ctx.db.get(args.alertId);
		if (!alert) {
			throw new Error("Alert not found");
		}

		await ctx.db.patch(args.alertId, {
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
export const markQueued = internalMutation({
	args: {
		alertId: v.id("alerts"),
		deliveryKey: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const alert = await ctx.db.get(args.alertId);
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
		await ctx.db.patch(args.alertId, {
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
export const markSkipped = internalMutation({
	args: {
		alertId: v.id("alerts"),
		reason: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const alert = await ctx.db.get(args.alertId);
		if (!alert) {
			throw new Error("Alert not found");
		}

		await ctx.db.patch(args.alertId, {
			status: "skipped",
			deliveryError: args.reason,
		});
	},
});

// ═══════════════════════════════════════════════════════════════
// MARK BATCH SENT - Mark multiple alerts as sent (for digests)
// ═══════════════════════════════════════════════════════════════
export const markBatchSent = internalMutation({
	args: {
		alertIds: v.array(v.id("alerts")),
		deliveryKey: v.optional(v.string()),
		providerMessageId: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const now = Date.now();

		for (const alertId of args.alertIds) {
			const alert = await ctx.db.get(alertId);
			if (!alert) continue;

			await ctx.db.patch(alertId, {
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
export const markBatchQueued = internalMutation({
	args: {
		alertIds: v.array(v.id("alerts")),
		deliveryKey: v.string(),
	},
	handler: async (ctx, args) => {
		const alerts = [];
		let missing = false;
		for (const alertId of args.alertIds) {
			const alert = await ctx.db.get(alertId);
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
			await ctx.db.patch(alert._id, {
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
export const markBatchRetryableFailure = internalMutation({
	args: {
		alertIds: v.array(v.id("alerts")),
		error: v.string(),
		retryAt: v.number(),
	},
	handler: async (ctx, args) => {
		for (const alertId of args.alertIds) {
			const alert = await ctx.db.get(alertId);
			if (!alert) continue;

			await ctx.db.patch(alertId, {
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
export const recoverStaleQueuedAlerts = internalMutation({
	args: {
		staleBefore: v.number(),
		maxAttempts: v.number(),
	},
	handler: async (ctx, args) => {
		const queuedAlerts = await ctx.db
			.query("alerts")
			.withIndex("by_status", (q) => q.eq("status", "queued"))
			.collect();

		let requeued = 0;
		let failed = 0;
		for (const alert of queuedAlerts) {
			const lastAttemptAt = alert.lastDeliveryAttemptAt ?? alert.createdAt;
			if (lastAttemptAt > args.staleBefore) continue;

			const attemptCount = alert.deliveryAttemptCount ?? 0;
			if (attemptCount >= args.maxAttempts) {
				await ctx.db.patch(alert._id, {
					status: "failed",
					deliveryError: `Retry attempts exhausted after ${attemptCount} attempts: Delivery reservation expired before completion`,
					deliveryFailureKind: "permanent",
					nextDeliveryAttemptAt: undefined,
					scheduledFor: undefined,
				});
				failed++;
				continue;
			}

			await ctx.db.patch(alert._id, {
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
export const deleteOldAlerts = internalMutation({
	args: {
		olderThanDays: v.number(),
	},
	handler: async (ctx, args) => {
		const cutoff = Date.now() - args.olderThanDays * 24 * 60 * 60 * 1000;

		// Get old sent/failed alerts
		const oldAlerts = await ctx.db
			.query("alerts")
			.filter((q) =>
				q.and(
					q.lt(q.field("createdAt"), cutoff),
					q.or(
						q.eq(q.field("status"), "sent"),
						q.eq(q.field("status"), "failed"),
						q.eq(q.field("status"), "skipped"),
					),
				),
			)
			.take(1000);

		let deleted = 0;
		for (const alert of oldAlerts) {
			await ctx.db.delete(alert._id);
			deleted++;
		}

		return { deleted };
	},
});

// ═══════════════════════════════════════════════════════════════
// MARK AS READ - Mark an alert as read (public mutation)
// ═══════════════════════════════════════════════════════════════
export const markAsRead = mutation({
	args: {
		alertId: v.id("alerts"),
	},
	handler: async (ctx, args) => {
		const user = await getCurrentUser(ctx);
		if (!user) {
			throw new Error("User not found. Please sign in first.");
		}

		const alert = await ctx.db.get(args.alertId);
		if (!alert || alert.userId !== user._id) {
			throw new Error("Unauthorized");
		}

		// Only mark if not already read
		if (!alert.readAt) {
			await ctx.db.patch(args.alertId, {
				readAt: Date.now(),
			});
		}
	},
});

// ═══════════════════════════════════════════════════════════════
// MARK ALL AS READ - Mark all alerts as read for a user
// ═══════════════════════════════════════════════════════════════
export const markAllAsRead = mutation({
	args: {},
	handler: async (ctx) => {
		const user = await getCurrentUser(ctx);
		if (!user) {
			throw new Error("User not found. Please sign in first.");
		}

		const now = Date.now();

		// Get all unread sent alerts
		const alerts = await ctx.db
			.query("alerts")
			.withIndex("by_user", (q) => q.eq("userId", user._id))
			.collect();

		const unreadAlerts = alerts.filter((a) => a.status === "sent" && !a.readAt);

		// Mark each as read
		for (const alert of unreadAlerts) {
			await ctx.db.patch(alert._id, {
				readAt: now,
			});
		}

		return { updated: unreadAlerts.length };
	},
});
