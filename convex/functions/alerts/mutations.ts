import { v } from "convex/values";
import { internalMutation, mutation } from "../../_generated/server";
import { evaluateSubscriptionSummaryMatch } from "../subscriptions/matching";

// ═══════════════════════════════════════════════════════════════
// GENERATE ALERTS - Create in-app feed alerts for municipality subscriptions
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
				errors: [!meeting ? "Meeting not found" : "Summary not found"],
			};
		}

		const subscriptions = await ctx.db
			.query("subscriptions")
			.withIndex("by_municipality", (q) =>
				q.eq("municipalityId", meeting.municipalityId),
			)
			.collect();

		const now = Date.now();
		const results = {
			created: 0,
			skipped: 0,
			errors: [] as string[],
		};

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
					results.skipped++;
					continue;
				}

				await ctx.db.insert("alerts", {
					userId: subscription.userId,
					subscriptionId: subscription._id,
					meetingId: args.meetingId,
					summaryId: args.summaryId,
					matchedTopics: match.matchedTopics,
					matchedKeywords: match.matchedKeywords,
					status: "sent",
					sentAt: now,
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
	},
	handler: async (ctx, args) => {
		const alert = await ctx.db.get(args.alertId);
		if (!alert) {
			throw new Error("Alert not found");
		}

		await ctx.db.patch(args.alertId, {
			status: "sent",
			sentAt: Date.now(),
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
	},
	handler: async (ctx, args) => {
		const alert = await ctx.db.get(args.alertId);
		if (!alert) {
			throw new Error("Alert not found");
		}

		await ctx.db.patch(args.alertId, {
			status: "failed",
			deliveryError: args.error,
		});
	},
});

// ═══════════════════════════════════════════════════════════════
// MARK QUEUED - Mark an alert as queued for sending
// ═══════════════════════════════════════════════════════════════
export const markQueued = internalMutation({
	args: {
		alertId: v.id("alerts"),
	},
	handler: async (ctx, args) => {
		const alert = await ctx.db.get(args.alertId);
		if (!alert) {
			throw new Error("Alert not found");
		}

		await ctx.db.patch(args.alertId, {
			status: "queued",
		});
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
	},
	handler: async (ctx, args) => {
		const now = Date.now();

		for (const alertId of args.alertIds) {
			const alert = await ctx.db.get(alertId);
			if (!alert) continue;

			await ctx.db.patch(alertId, {
				status: "sent",
				sentAt: now,
			});
		}

		return { updated: args.alertIds.length };
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
		userId: v.id("users"),
	},
	handler: async (ctx, args) => {
		const alert = await ctx.db.get(args.alertId);
		if (!alert) {
			throw new Error("Alert not found");
		}

		// Verify ownership
		if (alert.userId !== args.userId) {
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
	args: {
		userId: v.id("users"),
	},
	handler: async (ctx, args) => {
		const now = Date.now();

		// Get all unread sent alerts
		const alerts = await ctx.db
			.query("alerts")
			.withIndex("by_user", (q) => q.eq("userId", args.userId))
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
