import { v } from "convex/values";
import { internalQuery, query } from "../../_generated/server";

// ═══════════════════════════════════════════════════════════════
// GET BY ID - Get a single alert with full details
// ═══════════════════════════════════════════════════════════════
export const getById = query({
	args: {
		alertId: v.id("alerts"),
	},
	handler: async (ctx, args) => {
		const alert = await ctx.db.get(args.alertId);
		if (!alert) return null;

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
		userId: v.id("users"),
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
		const limit = args.limit ?? 50;

		const alertsQuery = ctx.db
			.query("alerts")
			.withIndex("by_user", (q) => q.eq("userId", args.userId))
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
	args: {
		userId: v.id("users"),
	},
	handler: async (ctx, args) => {
		const alerts = await ctx.db
			.query("alerts")
			.withIndex("by_user", (q) => q.eq("userId", args.userId))
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
	args: {
		userId: v.id("users"),
	},
	handler: async (ctx, args) => {
		const alerts = await ctx.db
			.query("alerts")
			.withIndex("by_user", (q) => q.eq("userId", args.userId))
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
		userId: v.id("users"),
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const limit = args.limit ?? 20;

		// Get sent alerts ordered by most recent
		const alerts = await ctx.db
			.query("alerts")
			.withIndex("by_user", (q) => q.eq("userId", args.userId))
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
					title: meeting.title,
					meetingType: meeting.meetingType,
					meetingDate: meeting.meetingDate,
				},
				municipality: municipality
					? {
							_id: municipality._id,
							name: municipality.name,
							state: municipality.state,
						}
					: null,
				summary: summary
					? {
							_id: summary._id,
							executiveSummary: summary.executiveSummary,
							topics: summary.topics,
							keyDecisions: summary.keyDecisions,
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
					meeting: { title: string; meetingType: string; meetingDate: number };
					municipality: { name: string; state: string } | null;
					summary: { executiveSummary: string; topics: string[] } | null;
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
					title: meeting.title,
					meetingType: meeting.meetingType,
					meetingDate: meeting.meetingDate,
				},
				municipality: municipality
					? { name: municipality.name, state: municipality.state }
					: null,
				summary: summary
					? {
							executiveSummary: summary.executiveSummary,
							topics: summary.topics,
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
