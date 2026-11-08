import { z } from "zod";
import { sql } from "../../database";
import { entityId } from "../../id";
import { getCurrentUser } from "../../lib/auth";
import { SUBSCRIPTION_LIMITS } from "../../lib/constants/limits";
import { defineWrite } from "../../procedure";
import { isCoveragePublic } from "../municipalities/coveragePublication";
// ═══════════════════════════════════════════════════════════════
// CREATE - Create a new subscription with limit check
// ═══════════════════════════════════════════════════════════════
export const create = defineWrite({
	args: {
		municipalityId: entityId("municipalities"),
		topicFilters: z.array(z.string()).optional(),
		meetingTypes: z.array(z.string()).optional(),
		keywordsInclude: z.array(z.string()).optional(),
		keywordsExclude: z.array(z.string()).optional(),
		alertFrequency: z.union([
			z.literal("immediate"),
			z.literal("daily"),
			z.literal("weekly"),
		]),
		emailEnabled: z.boolean().optional(),
		agendaAlertsEnabled: z.boolean().optional(),
	},
	handler: async (ctx, args) => {
		const user = await getCurrentUser(ctx);
		if (!user) {
			throw new Error("User not found. Please sign in first.");
		}
		// Get subscription limit for user's tier
		const tier = user.tier || "free";
		const limit = SUBSCRIPTION_LIMITS[tier]?.subscriptions ?? 0;
		// Count existing subscriptions
		const existingSubscriptions = await ctx.data
			.select("subscriptions")
			.orderBy(["userId", "_creationTime", "_id"])
			.where("userId", "=", user._id)
			.all();
		// Check limit
		if (limit !== Infinity && existingSubscriptions.length >= limit) {
			throw new Error(
				`Subscription limit reached. ${tier === "free" ? "Upgrade to Pro for unlimited subscriptions." : ""}`,
			);
		}
		// Check if already subscribed to this municipality
		const existingForMunicipality = existingSubscriptions.find(
			(sub) => sub.municipalityId === args.municipalityId,
		);
		if (existingForMunicipality) {
			throw new Error("Already subscribed to this municipality");
		}
		// Verify municipality exists
		const municipality = await ctx.data.find(args.municipalityId);
		if (!municipality) {
			throw new Error("Municipality not found");
		}
		if (!isCoveragePublic(municipality)) {
			throw new Error(
				"This municipality is not accepting subscriptions until coverage is published.",
			);
		}
		// Check if user can use immediate alerts (Pro only)
		if (args.alertFrequency === "immediate" && tier !== "pro") {
			throw new Error(
				"Immediate alerts are only available for Pro users. Choose daily or weekly frequency.",
			);
		}
		// Create subscription
		const subscriptionId = await ctx.data.add("subscriptions", {
			userId: user._id,
			municipalityId: args.municipalityId,
			topicFilters: args.topicFilters,
			meetingTypes: args.meetingTypes,
			keywordsInclude: args.keywordsInclude,
			keywordsExclude: args.keywordsExclude,
			alertFrequency: args.alertFrequency,
			emailEnabled: args.emailEnabled ?? true,
			agendaAlertsEnabled: args.agendaAlertsEnabled ?? false,
			isActive: true,
			createdAt: Date.now(),
			updatedAt: Date.now(),
		});
		return subscriptionId;
	},
});
// ═══════════════════════════════════════════════════════════════
// UPDATE - Update subscription filters and frequency
// ═══════════════════════════════════════════════════════════════
export const update = defineWrite({
	args: {
		subscriptionId: entityId("subscriptions"),
		topicFilters: z.array(z.string()).optional(),
		meetingTypes: z.array(z.string()).optional(),
		keywordsInclude: z.array(z.string()).optional(),
		keywordsExclude: z.array(z.string()).optional(),
		alertFrequency: z
			.union([z.literal("immediate"), z.literal("daily"), z.literal("weekly")])
			.optional(),
		emailEnabled: z.boolean().optional(),
		agendaAlertsEnabled: z.boolean().optional(),
		isActive: z.boolean().optional(),
	},
	handler: async (ctx, args) => {
		const user = await getCurrentUser(ctx);
		if (!user) {
			throw new Error("User not found. Please sign in first.");
		}
		// Get subscription
		const subscription = await ctx.data.find(args.subscriptionId);
		if (!subscription) {
			throw new Error("Subscription not found");
		}
		// Verify ownership
		if (subscription.userId !== user._id) {
			throw new Error("Not authorized to update this subscription");
		}
		if (args.alertFrequency === "immediate" && user.tier !== "pro") {
			throw new Error("Immediate alerts are only available for Pro users");
		}
		// Build updates
		const updates: Record<string, unknown> = {
			updatedAt: Date.now(),
		};
		if (args.topicFilters !== undefined) {
			updates.topicFilters = args.topicFilters;
		}
		if (args.meetingTypes !== undefined) {
			updates.meetingTypes = args.meetingTypes;
		}
		if (args.keywordsInclude !== undefined) {
			updates.keywordsInclude = args.keywordsInclude;
		}
		if (args.keywordsExclude !== undefined) {
			updates.keywordsExclude = args.keywordsExclude;
		}
		if (args.alertFrequency !== undefined) {
			updates.alertFrequency = args.alertFrequency;
		}
		if (args.emailEnabled !== undefined) {
			updates.emailEnabled = args.emailEnabled;
		}
		if (args.agendaAlertsEnabled !== undefined) {
			updates.agendaAlertsEnabled = args.agendaAlertsEnabled;
		}
		if (args.isActive !== undefined) {
			updates.isActive = args.isActive;
		}
		await ctx.data.update(args.subscriptionId, updates);
		return { success: true };
	},
});
// ═══════════════════════════════════════════════════════════════
// DELETE - Delete subscription and cancel pending alerts
// ═══════════════════════════════════════════════════════════════
export const remove = defineWrite({
	args: {
		subscriptionId: entityId("subscriptions"),
	},
	handler: async (ctx, args) => {
		const user = await getCurrentUser(ctx);
		if (!user) {
			throw new Error("User not found. Please sign in first.");
		}
		// Get subscription
		const subscription = await ctx.data.find(args.subscriptionId);
		if (!subscription) {
			throw new Error("Subscription not found");
		}
		// Verify ownership
		if (subscription.userId !== user._id) {
			throw new Error("Not authorized to delete this subscription");
		}
		// Cancel any pending alerts for this subscription
		const pendingAlerts = await ctx.data
			.select("alerts")
			.where(
				sql.and(
					sql.eq(sql.column("subscriptionId"), args.subscriptionId),
					sql.or(
						sql.eq(sql.column("status"), "pending"),
						sql.eq(sql.column("status"), "queued"),
					),
				),
			)
			.all();
		// Mark pending alerts as skipped
		for (const alert of pendingAlerts) {
			await ctx.data.update(alert._id, {
				status: "skipped",
			});
		}
		// Delete the subscription
		await ctx.data.remove(args.subscriptionId);
		return { success: true, cancelledAlerts: pendingAlerts.length };
	},
});
// ═══════════════════════════════════════════════════════════════
// TOGGLE ACTIVE - Quick toggle for subscription active status
// ═══════════════════════════════════════════════════════════════
export const toggleActive = defineWrite({
	args: {
		subscriptionId: entityId("subscriptions"),
	},
	handler: async (ctx, args) => {
		const user = await getCurrentUser(ctx);
		if (!user) {
			throw new Error("User not found. Please sign in first.");
		}
		const subscription = await ctx.data.find(args.subscriptionId);
		if (!subscription) {
			throw new Error("Subscription not found");
		}
		if (subscription.userId !== user._id) {
			throw new Error("Not authorized to update this subscription");
		}
		await ctx.data.update(args.subscriptionId, {
			isActive: !subscription.isActive,
			updatedAt: Date.now(),
		});
		return { isActive: !subscription.isActive };
	},
});
// ═══════════════════════════════════════════════════════════════
// UPDATE FREQUENCY - Quick update for alert frequency
// ═══════════════════════════════════════════════════════════════
export const updateFrequency = defineWrite({
	args: {
		subscriptionId: entityId("subscriptions"),
		alertFrequency: z.union([
			z.literal("immediate"),
			z.literal("daily"),
			z.literal("weekly"),
		]),
	},
	handler: async (ctx, args) => {
		const user = await getCurrentUser(ctx);
		if (!user) {
			throw new Error("User not found. Please sign in first.");
		}
		const subscription = await ctx.data.find(args.subscriptionId);
		if (!subscription) {
			throw new Error("Subscription not found");
		}
		if (subscription.userId !== user._id) {
			throw new Error("Not authorized to update this subscription");
		}
		// Check if user can use immediate alerts (Pro only)
		if (args.alertFrequency === "immediate" && user.tier !== "pro") {
			throw new Error("Immediate alerts are only available for Pro users");
		}
		await ctx.data.update(args.subscriptionId, {
			alertFrequency: args.alertFrequency,
			updatedAt: Date.now(),
		});
		return { success: true };
	},
});
