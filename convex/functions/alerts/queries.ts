import { v } from "convex/values";
import type { Doc } from "../../_generated/dataModel";
import { internalQuery, type QueryCtx, query } from "../../_generated/server";
import { getCurrentUser } from "../../lib/auth";
import { isCoveragePublic } from "../municipalities/coveragePublication";

const STALE_QUEUED_THRESHOLD_MS = 30 * 60 * 1000;
const DELIVERY_HEALTH_SCAN_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const DEFAULT_DELIVERY_HEALTH_SCAN_LIMIT = 5000;
const MAX_DELIVERY_HEALTH_SCAN_LIMIT = 5000;
const DEFAULT_OUTSTANDING_DELIVERY_SCAN_LIMIT = 1000;
const MAX_OUTSTANDING_DELIVERY_SCAN_LIMIT = 5000;
const OUTSTANDING_DELIVERY_STATUSES = ["pending", "queued", "failed"] as const;

// ═══════════════════════════════════════════════════════════════
// GET BY ID - Get a single alert with full details
// ═══════════════════════════════════════════════════════════════
export const getById = query({
	args: {
		alertId: v.id("alerts"),
	},
	handler: async (ctx, args) => {
		const user = await getCurrentUser(ctx);
		if (!user) return null;

		const alert = await ctx.db.get(args.alertId);
		if (!alert) return null;
		if (alert.userId !== user._id) return null;

		// Get related data
		const [meeting, summary, subscription] = await Promise.all([
			ctx.db.get(alert.meetingId),
			ctx.db.get(alert.summaryId),
			ctx.db.get(alert.subscriptionId),
		]);

		let municipality = null;
		if (meeting) {
			municipality = await ctx.db.get(meeting.municipalityId);
		}

		return {
			...alert,
			meeting: meeting
				? {
						_id: meeting._id,
						title: meeting.title,
						meetingType: meeting.meetingType,
						meetingDate: meeting.meetingDate,
					}
				: null,
			summary: summary
				? {
						_id: summary._id,
						executiveSummary: summary.executiveSummary,
						topics: summary.topics,
					}
				: null,
			subscription: subscription
				? {
						_id: subscription._id,
						alertFrequency: subscription.alertFrequency,
					}
				: null,
			municipality: municipality
				? {
						_id: municipality._id,
						name: municipality.name,
						state: municipality.state,
					}
				: null,
		};
	},
});

// ═══════════════════════════════════════════════════════════════
// LIST BY USER - Get all alerts for a user
// ═══════════════════════════════════════════════════════════════
export const listByUser = query({
	args: {
		limit: v.optional(v.number()),
		status: v.optional(
			v.union(
				v.literal("pending"),
				v.literal("queued"),
				v.literal("sent"),
				v.literal("failed"),
				v.literal("skipped"),
			),
		),
	},
	handler: async (ctx, args) => {
		const user = await getCurrentUser(ctx);
		if (!user) return [];

		const limit = args.limit ?? 50;

		const alertsQuery = ctx.db
			.query("alerts")
			.withIndex("by_user", (q) => q.eq("userId", user._id))
			.order("desc");

		const alerts = await alertsQuery.take(limit);

		// Filter by status if provided
		const filteredAlerts = args.status
			? alerts.filter((a) => a.status === args.status)
			: alerts;

		// Get related data for each alert
		const alertsWithDetails = await Promise.all(
			filteredAlerts.map(async (alert) => {
				const meeting = await ctx.db.get(alert.meetingId);
				let municipality = null;
				if (meeting) {
					municipality = await ctx.db.get(meeting.municipalityId);
				}

				return {
					...alert,
					meeting: meeting
						? {
								_id: meeting._id,
								title: meeting.title,
								meetingType: meeting.meetingType,
								meetingDate: meeting.meetingDate,
							}
						: null,
					municipality: municipality
						? {
								_id: municipality._id,
								name: municipality.name,
								state: municipality.state,
							}
						: null,
				};
			}),
		);

		return alertsWithDetails;
	},
});

// ═══════════════════════════════════════════════════════════════
// COUNT BY USER - Get alert counts for a user
// ═══════════════════════════════════════════════════════════════
export const countByUser = query({
	args: {},
	handler: async (ctx) => {
		const user = await getCurrentUser(ctx);
		if (!user) {
			return {
				total: 0,
				pending: 0,
				sent: 0,
				failed: 0,
				unread: 0,
			};
		}

		const alerts = await ctx.db
			.query("alerts")
			.withIndex("by_user", (q) => q.eq("userId", user._id))
			.collect();

		return {
			total: alerts.length,
			pending: alerts.filter((a) => a.status === "pending").length,
			sent: alerts.filter((a) => a.status === "sent").length,
			failed: alerts.filter((a) => a.status === "failed").length,
			unread: alerts.filter((a) => a.status === "sent" && !a.readAt).length,
		};
	},
});

// ═══════════════════════════════════════════════════════════════
// GET UNREAD COUNT - Get count of unread sent alerts for header badge
// ═══════════════════════════════════════════════════════════════
export const getUnreadCount = query({
	args: {},
	handler: async (ctx) => {
		const user = await getCurrentUser(ctx);
		if (!user) return 0;

		const alerts = await ctx.db
			.query("alerts")
			.withIndex("by_user", (q) => q.eq("userId", user._id))
			.collect();

		// Count sent alerts that haven't been read
		return alerts.filter((a) => a.status === "sent" && !a.readAt).length;
	},
});

// ═══════════════════════════════════════════════════════════════
// GET FEED - Get alerts for dashboard feed with full details
// ═══════════════════════════════════════════════════════════════
export const getFeed = query({
	args: {
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const user = await getCurrentUser(ctx);
		if (!user) return [];

		const limit = args.limit ?? 20;

		// Get sent alerts ordered by most recent
		const alerts = await ctx.db
			.query("alerts")
			.withIndex("by_user", (q) => q.eq("userId", user._id))
			.order("desc")
			.take(limit * 2); // Take more to filter

		// Filter to sent alerts only
		const sentAlerts = alerts
			.filter((a) => a.status === "sent")
			.slice(0, limit);

		// Get related data for each alert
		const feedItems = await Promise.all(
			sentAlerts.map(async (alert) => {
				const [meeting, summary] = await Promise.all([
					ctx.db.get(alert.meetingId),
					ctx.db.get(alert.summaryId),
				]);

				let municipality = null;
				if (meeting) {
					municipality = await ctx.db.get(meeting.municipalityId);
				}

				return {
					_id: alert._id,
					createdAt: alert.createdAt,
					sentAt: alert.sentAt,
					readAt: alert.readAt,
					matchedTopics: alert.matchedTopics,
					isNew: !alert.readAt,
					meeting: meeting
						? {
								_id: meeting._id,
								title: meeting.title,
								meetingType: meeting.meetingType,
								meetingDate: meeting.meetingDate,
							}
						: null,
					summary: summary
						? {
								_id: summary._id,
								executiveSummary: summary.executiveSummary,
								topics: summary.topics,
							}
						: null,
					municipality: municipality
						? {
								_id: municipality._id,
								name: municipality.name,
								state: municipality.state,
							}
						: null,
				};
			}),
		);

		return feedItems;
	},
});

// ═══════════════════════════════════════════════════════════════
// GET DELIVERY HEALTH - Admin-only alert delivery state overview
// ═══════════════════════════════════════════════════════════════
export const getDeliveryHealth = query({
	args: {
		filter: v.optional(
			v.union(
				v.literal("all"),
				v.literal("failed"),
				v.literal("retrying"),
				v.literal("stale_queued"),
				v.literal("queued"),
				v.literal("pending"),
			),
		),
		limit: v.optional(v.number()),
		scanLimit: v.optional(v.number()),
		outstandingScanLimit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const caller = await getCurrentUser(ctx);
		if (!caller?.isAdmin) {
			return null;
		}

		const now = Date.now();
		const scanWindowStartedAt = now - DELIVERY_HEALTH_SCAN_WINDOW_MS;
		const scanLimit = clampInteger(
			args.scanLimit ?? DEFAULT_DELIVERY_HEALTH_SCAN_LIMIT,
			1,
			MAX_DELIVERY_HEALTH_SCAN_LIMIT,
		);
		const outstandingScanLimit = clampInteger(
			args.outstandingScanLimit ?? DEFAULT_OUTSTANDING_DELIVERY_SCAN_LIMIT,
			1,
			MAX_OUTSTANDING_DELIVERY_SCAN_LIMIT,
		);
		const scannedAlerts = await ctx.db
			.query("alerts")
			.withIndex("by_created_at", (q) =>
				q.gte("createdAt", scanWindowStartedAt),
			)
			.order("desc")
			.take(scanLimit + 1);
		const recentAlerts = scannedAlerts.slice(0, scanLimit);
		const outstandingScan = await scanOutstandingDeliveryAlerts(
			ctx,
			outstandingScanLimit,
		);
		const alerts = mergeUniqueAlerts([
			recentAlerts,
			...OUTSTANDING_DELIVERY_STATUSES.map(
				(status) => outstandingScan.alertsByStatus[status],
			),
		]);
		const counts = countDeliveryHealthAlerts(alerts, now);

		const filter = args.filter ?? "all";
		const limit = Math.min(Math.max(args.limit ?? 50, 1), 200);
		const filteredAlerts = alerts
			.filter((alert) => matchesDeliveryHealthFilter(alert, filter, now))
			.sort((a, b) => deliverySortTime(b) - deliverySortTime(a))
			.slice(0, limit);

		const alertRows = await Promise.all(
			filteredAlerts.map(async (alert) => {
				const [user, meeting, subscription] = await Promise.all([
					ctx.db.get(alert.userId),
					ctx.db.get(alert.meetingId),
					ctx.db.get(alert.subscriptionId),
				]);
				const municipalityId = meeting?.municipalityId ?? alert.municipalityId;
				const municipality = municipalityId
					? await ctx.db.get(municipalityId)
					: null;
				const staleQueued = isStaleQueued(alert, now);
				const exhausted = isExhausted(alert);
				const retrying = isRetrying(alert);

				return {
					_id: alert._id,
					status: alert.status,
					createdAt: alert.createdAt,
					scheduledFor: alert.scheduledFor,
					sentAt: alert.sentAt,
					deliveryError: alert.deliveryError,
					deliveryKey: alert.deliveryKey,
					deliveryAttemptCount: alert.deliveryAttemptCount ?? 0,
					lastDeliveryAttemptAt: alert.lastDeliveryAttemptAt,
					nextDeliveryAttemptAt: alert.nextDeliveryAttemptAt,
					deliveryFailureKind: alert.deliveryFailureKind,
					providerMessageId: alert.providerMessageId,
					isStaleQueued: staleQueued,
					isRetrying: retrying,
					isExhausted: exhausted,
					userEmail: user?.email ?? "Unknown user",
					userName: user?.name,
					meetingTitle: meeting?.title ?? "Unknown meeting",
					meetingDate: meeting?.meetingDate,
					municipalityName: municipality?.name ?? "Unknown municipality",
					municipalityState: municipality?.state ?? "",
					alertFrequency: subscription?.alertFrequency ?? null,
				};
			}),
		);

		return {
			generatedAt: now,
			staleQueuedThresholdMs: STALE_QUEUED_THRESHOLD_MS,
			scanWindowMs: DELIVERY_HEALTH_SCAN_WINDOW_MS,
			scanWindowStartedAt,
			scanLimit,
			scannedAlertCount: alerts.length,
			recentScannedAlertCount: recentAlerts.length,
			isScanCapped:
				scannedAlerts.length > scanLimit ||
				outstandingScan.cappedStatuses.length > 0,
			isRecentScanCapped: scannedAlerts.length > scanLimit,
			outstandingScanLimit,
			outstandingScannedCounts: outstandingScan.scannedCounts,
			outstandingCappedStatuses: outstandingScan.cappedStatuses,
			counts,
			alerts: alertRows,
		};
	},
});

// ═══════════════════════════════════════════════════════════════
// GET PENDING BY FREQUENCY - Get pending alerts for a frequency (internal)
// Used by cron jobs to send digests
// ═══════════════════════════════════════════════════════════════
export const getPendingByFrequency = internalQuery({
	args: {
		frequency: v.union(
			v.literal("immediate"),
			v.literal("daily"),
			v.literal("weekly"),
		),
	},
	handler: async (ctx, args) => {
		const now = Date.now();

		// Get all pending/queued alerts where scheduledFor is in the past
		const alerts = await ctx.db
			.query("alerts")
			.withIndex("by_scheduled", (q) => q.eq("status", "pending"))
			.collect();

		// Filter by frequency and schedule time
		const readyAlerts = [];

		for (const alert of alerts) {
			// Skip if not scheduled yet or scheduled for the future
			if (alert.scheduledFor && alert.scheduledFor > now) {
				continue;
			}

			// Get the subscription to check frequency
			const subscription = await ctx.db.get(alert.subscriptionId);
			if (!subscription) continue;

			if (subscription.alertFrequency !== args.frequency) continue;
			if (!subscription.emailEnabled) continue;

			// Get user for email
			const user = await ctx.db.get(alert.userId);
			if (!user) continue;

			// Get meeting and municipality info
			const meeting = await ctx.db.get(alert.meetingId);
			if (!meeting) continue;

			const municipality = await ctx.db.get(meeting.municipalityId);
			if (!municipality || !isCoveragePublic(municipality)) continue;

			// Get summary
			const summary = await ctx.db.get(alert.summaryId);

			readyAlerts.push({
				alert,
				user: {
					_id: user._id,
					email: user.email,
					name: user.name,
				},
				meeting: {
					_id: meeting._id,
					slug: meeting.slug,
					title: meeting.title,
					meetingType: meeting.meetingType,
					meetingDate: meeting.meetingDate,
					sourceUrl: meeting.sourceUrl,
				},
				municipality: {
					_id: municipality._id,
					slug: municipality.slug,
					name: municipality.name,
					state: municipality.state,
				},
				summary: summary
					? {
							_id: summary._id,
							executiveSummary: summary.executiveSummary,
							topics: summary.topics,
							keyDecisions: summary.keyDecisions,
							sourceUrl: summary.sourceUrl,
						}
					: null,
			});
		}

		return readyAlerts;
	},
});

// ═══════════════════════════════════════════════════════════════
// GET PENDING FOR USER DIGEST - Group pending alerts by user for digest (internal)
// ═══════════════════════════════════════════════════════════════
export const getPendingForUserDigest = internalQuery({
	args: {
		frequency: v.union(v.literal("daily"), v.literal("weekly")),
	},
	handler: async (ctx, args) => {
		const now = Date.now();

		// Get all pending alerts
		const alerts = await ctx.db
			.query("alerts")
			.withIndex("by_status", (q) => q.eq("status", "pending"))
			.collect();

		// Group by user, filtering by frequency
		const userAlerts = new Map<
			string,
			{
				user: { _id: string; email: string; name?: string };
				alerts: Array<{
					alert: (typeof alerts)[0];
					meeting: {
						_id: string;
						slug?: string;
						title: string;
						meetingType: string;
						meetingDate: number;
						sourceUrl?: string;
					};
					municipality: { name: string; state: string; slug?: string } | null;
					summary: {
						executiveSummary: string;
						topics: string[];
						sourceUrl?: string;
					} | null;
				}>;
			}
		>();

		for (const alert of alerts) {
			// Skip if scheduled for the future
			if (alert.scheduledFor && alert.scheduledFor > now) {
				continue;
			}

			const subscription = await ctx.db.get(alert.subscriptionId);
			if (!subscription) continue;
			if (subscription.alertFrequency !== args.frequency) continue;
			if (!subscription.emailEnabled) continue;

			const user = await ctx.db.get(alert.userId);
			if (!user) continue;

			const meeting = await ctx.db.get(alert.meetingId);
			if (!meeting) continue;

			const municipality = await ctx.db.get(meeting.municipalityId);
			if (!municipality || !isCoveragePublic(municipality)) continue;

			const summary = await ctx.db.get(alert.summaryId);

			const userId = user._id.toString();

			if (!userAlerts.has(userId)) {
				userAlerts.set(userId, {
					user: { _id: user._id, email: user.email, name: user.name },
					alerts: [],
				});
			}

			userAlerts.get(userId)?.alerts.push({
				alert,
				meeting: {
					_id: meeting._id,
					slug: meeting.slug,
					title: meeting.title,
					meetingType: meeting.meetingType,
					meetingDate: meeting.meetingDate,
					sourceUrl: meeting.sourceUrl,
				},
				municipality: {
					name: municipality.name,
					state: municipality.state,
					slug: municipality.slug,
				},
				summary: summary
					? {
							executiveSummary: summary.executiveSummary,
							topics: summary.topics,
							sourceUrl: summary.sourceUrl,
						}
					: null,
			});
		}

		return Array.from(userAlerts.values());
	},
});

// ═══════════════════════════════════════════════════════════════
// CHECK DUPLICATE - Check if alert already exists for subscription/summary
// ═══════════════════════════════════════════════════════════════
export const checkDuplicate = internalQuery({
	args: {
		subscriptionId: v.id("subscriptions"),
		summaryId: v.id("summaries"),
	},
	handler: async (ctx, args) => {
		const existing = await ctx.db
			.query("alerts")
			.withIndex("by_user")
			.filter((q) =>
				q.and(
					q.eq(q.field("subscriptionId"), args.subscriptionId),
					q.eq(q.field("summaryId"), args.summaryId),
				),
			)
			.first();

		return existing !== null;
	},
});

type AlertDoc = Doc<"alerts">;
type OutstandingDeliveryStatus = (typeof OUTSTANDING_DELIVERY_STATUSES)[number];

async function scanOutstandingDeliveryAlerts(
	ctx: QueryCtx,
	limit: number,
): Promise<{
	alertsByStatus: Record<OutstandingDeliveryStatus, AlertDoc[]>;
	scannedCounts: Record<OutstandingDeliveryStatus, number>;
	cappedStatuses: OutstandingDeliveryStatus[];
}> {
	const alertsByStatus = {
		pending: [] as AlertDoc[],
		queued: [] as AlertDoc[],
		failed: [] as AlertDoc[],
	};
	const scannedCounts = {
		pending: 0,
		queued: 0,
		failed: 0,
	};
	const cappedStatuses: OutstandingDeliveryStatus[] = [];

	for (const status of OUTSTANDING_DELIVERY_STATUSES) {
		const scannedAlerts = await ctx.db
			.query("alerts")
			.withIndex("by_status_created_at", (q) => q.eq("status", status))
			.order("asc")
			.take(limit + 1);

		const alerts = scannedAlerts.slice(0, limit);
		alertsByStatus[status] = alerts;
		scannedCounts[status] = alerts.length;
		if (scannedAlerts.length > limit) {
			cappedStatuses.push(status);
		}
	}

	return {
		alertsByStatus,
		scannedCounts,
		cappedStatuses,
	};
}

function mergeUniqueAlerts(alertGroups: AlertDoc[][]): AlertDoc[] {
	const alertsById = new Map<string, AlertDoc>();

	for (const alertGroup of alertGroups) {
		for (const alert of alertGroup) {
			alertsById.set(alert._id, alert);
		}
	}

	return Array.from(alertsById.values());
}

function countDeliveryHealthAlerts(alerts: AlertDoc[], now: number) {
	const counts = {
		total: 0,
		pending: 0,
		queued: 0,
		staleQueued: 0,
		sent: 0,
		failed: 0,
		skipped: 0,
		retryable: 0,
		permanent: 0,
		exhausted: 0,
	};

	for (const alert of alerts) {
		counts.total += 1;
		counts[alert.status] += 1;
		if (isStaleQueued(alert, now)) counts.staleQueued += 1;
		if (alert.deliveryFailureKind === "retryable") counts.retryable += 1;
		if (alert.deliveryFailureKind === "permanent") counts.permanent += 1;
		if (isExhausted(alert)) counts.exhausted += 1;
	}

	return counts;
}

function clampInteger(value: number, min: number, max: number): number {
	if (!Number.isFinite(value)) return min;
	return Math.min(Math.max(Math.floor(value), min), max);
}

function isStaleQueued(alert: AlertDoc, now: number): boolean {
	if (alert.status !== "queued") return false;

	const lastAttemptAt = alert.lastDeliveryAttemptAt ?? alert.createdAt;
	return lastAttemptAt < now - STALE_QUEUED_THRESHOLD_MS;
}

function isRetrying(alert: AlertDoc): boolean {
	return (
		alert.status === "pending" && alert.deliveryFailureKind === "retryable"
	);
}

function isExhausted(alert: AlertDoc): boolean {
	return (
		alert.status === "failed" &&
		typeof alert.deliveryError === "string" &&
		alert.deliveryError.includes("Retry attempts exhausted")
	);
}

function matchesDeliveryHealthFilter(
	alert: AlertDoc,
	filter: "all" | "failed" | "retrying" | "stale_queued" | "queued" | "pending",
	now: number,
): boolean {
	if (filter === "all") return true;
	if (filter === "failed") return alert.status === "failed";
	if (filter === "retrying") return isRetrying(alert);
	if (filter === "stale_queued") return isStaleQueued(alert, now);
	if (filter === "queued") return alert.status === "queued";
	return alert.status === "pending";
}

function deliverySortTime(alert: AlertDoc): number {
	return (
		alert.lastDeliveryAttemptAt ??
		alert.nextDeliveryAttemptAt ??
		alert.sentAt ??
		alert.scheduledFor ??
		alert.createdAt
	);
}
