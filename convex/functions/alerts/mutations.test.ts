import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import schema from "../../schema";
import { modules } from "../../test.setup";

const setup = () => convexTest(schema, modules);
const ISSUER = "https://clerk.example.com";
let deliverySeed = 0;

async function seedUser(
	t: ReturnType<typeof convexTest>,
	o: {
		clerkUserId: string;
		email: string;
		tier?: "free" | "pro";
		isAdmin?: boolean;
	},
) {
	const now = Date.now();
	return await t.run(async (ctx) =>
		ctx.db.insert("users", {
			clerkUserId: o.clerkUserId,
			email: o.email,
			tier: o.tier ?? "free",
			isAdmin: o.isAdmin,
			createdAt: now,
			lastLoginAt: now,
		}),
	);
}

async function seedAlert(
	t: ReturnType<typeof convexTest>,
	userId: Id<"users">,
	readAt?: number,
) {
	const now = Date.now();
	const municipalityId = await t.run(async (ctx) =>
		ctx.db.insert("municipalities", {
			name: "Coventry",
			state: "Connecticut",
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
			title: "Town Council Meeting",
			meetingType: "city_council",
			meetingDate: now,
			sourceType: "manual_entry",
			sourceUrl: "https://example.test/agenda.pdf",
			rawContent: "Agenda packet content.",
			status: "summarized",
			createdAt: now,
			updatedAt: now,
		}),
	);
	const summaryId = await t.run(async (ctx) =>
		ctx.db.insert("summaries", {
			meetingId,
			version: 1,
			executiveSummary: "Council reviewed local updates.",
			keyDecisions: [],
			discussionTopics: [],
			upcomingItems: [],
			topics: ["budget"],
			modelUsed: "test",
			promptVersion: "test",
			processingTimeMs: 1,
			municipalityId,
			meetingDate: now,
			sourceUrl: "https://example.test/agenda.pdf",
			sourceType: "manual_entry",
			sourceContentHash: "alert-read-test",
			status: "summarized",
			createdAt: now,
		}),
	);
	const subscriptionId = await t.run(async (ctx) =>
		ctx.db.insert("subscriptions", {
			userId,
			municipalityId,
			alertFrequency: "daily",
			emailEnabled: true,
			isActive: true,
			createdAt: now,
			updatedAt: now,
		}),
	);

	return await t.run(async (ctx) =>
		ctx.db.insert("alerts", {
			userId,
			subscriptionId,
			meetingId,
			summaryId,
			municipalityId,
			matchedTopics: ["budget"],
			status: "sent",
			sentAt: now,
			readAt,
			createdAt: now,
		}),
	);
}

async function seedDeliveryAlert(
	t: ReturnType<typeof convexTest>,
	o: {
		status: "pending" | "queued" | "sent" | "failed" | "skipped";
		deliveryFailureKind?: "retryable" | "permanent";
		deliveryAttemptCount?: number;
		lastDeliveryAttemptAt?: number;
		nextDeliveryAttemptAt?: number;
		deliveryError?: string;
		deliveryKey?: string;
		providerMessageId?: string;
		scheduledFor?: number;
		sentAt?: number;
		createdAt?: number;
		userEmail?: string;
		meetingTitle?: string;
	},
) {
	const now = Date.now();
	deliverySeed += 1;
	const seedSuffix = deliverySeed.toString().padStart(3, "0");
	const userId = await seedUser(t, {
		clerkUserId: `user_delivery_${seedSuffix}`,
		email: o.userEmail ?? "delivery-reader@example.test",
		tier: "pro",
	});
	const municipalityId = await t.run(async (ctx) =>
		ctx.db.insert("municipalities", {
			name: "Coventry",
			state: "Connecticut",
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
			title: o.meetingTitle ?? "Delivery Health Meeting",
			meetingType: "city_council",
			meetingDate: now,
			sourceType: "manual_entry",
			rawContent: "Agenda packet content.",
			status: "summarized",
			createdAt: now,
			updatedAt: now,
		}),
	);
	const summaryId = await t.run(async (ctx) =>
		ctx.db.insert("summaries", {
			meetingId,
			version: 1,
			executiveSummary: "Council reviewed local updates.",
			keyDecisions: [],
			discussionTopics: [],
			upcomingItems: [],
			topics: ["budget"],
			modelUsed: "test",
			promptVersion: "test",
			processingTimeMs: 1,
			municipalityId,
			meetingDate: now,
			sourceType: "manual_entry",
			sourceContentHash: `delivery-health-${seedSuffix}`,
			status: "summarized",
			createdAt: now,
		}),
	);
	const subscriptionId = await t.run(async (ctx) =>
		ctx.db.insert("subscriptions", {
			userId: userId as Id<"users">,
			municipalityId,
			alertFrequency: "daily",
			emailEnabled: true,
			isActive: true,
			createdAt: now,
			updatedAt: now,
		}),
	);

	return await t.run(async (ctx) =>
		ctx.db.insert("alerts", {
			userId: userId as Id<"users">,
			subscriptionId,
			meetingId,
			summaryId,
			municipalityId,
			matchedTopics: ["budget"],
			status: o.status,
			deliveryFailureKind: o.deliveryFailureKind,
			deliveryAttemptCount: o.deliveryAttemptCount,
			lastDeliveryAttemptAt: o.lastDeliveryAttemptAt,
			nextDeliveryAttemptAt: o.nextDeliveryAttemptAt,
			deliveryError: o.deliveryError,
			deliveryKey: o.deliveryKey,
			providerMessageId: o.providerMessageId,
			scheduledFor: o.scheduledFor,
			sentAt: o.sentAt,
			createdAt: o.createdAt ?? now,
		}),
	);
}

describe("alert candidate generation", () => {
	it("creates one pending candidate for an active municipality subscription", async () => {
		const t = setup();
		const now = Date.now();
		const userId = await t.run(async (ctx) =>
			ctx.db.insert("users", {
				clerkUserId: "user_coventry",
				email: "reader@example.test",
				name: "Coventry Reader",
				tier: "free",
				createdAt: now,
				lastLoginAt: now,
			}),
		);
		const municipalityId = await t.run(async (ctx) =>
			ctx.db.insert("municipalities", {
				name: "Coventry",
				state: "Connecticut",
				county: "Tolland",
				population: 12435,
				timezone: "America/New_York",
				websiteUrl: "https://www.coventry-ct.gov",
				meetingsPageUrl: "https://www.coventry-ct.gov/AgendaCenter",
				platform: "civicplus",
				isActive: true,
				isVerified: true,
				createdAt: now,
				updatedAt: now,
			}),
		);
		const meetingId = await t.run(async (ctx) =>
			ctx.db.insert("meetings", {
				municipalityId: municipalityId as Id<"municipalities">,
				title: "Town Council Meeting: June 1, 2026",
				meetingType: "city_council",
				meetingDate: new Date("2026-06-01T23:00:00.000Z").getTime(),
				sourceUrl:
					"https://www.coventry-ct.gov/AgendaCenter/ViewFile/Agenda/_06012026-4529?packet=true",
				sourceType: "scraped",
				rawContent: "Agenda packet content.",
				contentHash: "coventry-06012026-4529",
				status: "summarized",
				createdAt: now,
				updatedAt: now,
			}),
		);
		const summaryId = await t.run(async (ctx) =>
			ctx.db.insert("summaries", {
				meetingId: meetingId as Id<"meetings">,
				version: 1,
				executiveSummary:
					"Council reviewed appointments, finance reports, and correspondence.",
				keyDecisions: [],
				discussionTopics: [
					{
						topic: "Finance Committee report",
						summary: "Council reviewed Finance Committee reports.",
						category: "budget",
					},
				],
				upcomingItems: [],
				topics: ["budget", "other"],
				modelUsed: "test",
				promptVersion: "test",
				processingTimeMs: 10,
				municipalityId: municipalityId as Id<"municipalities">,
				meetingDate: new Date("2026-06-01T23:00:00.000Z").getTime(),
				sourceUrl:
					"https://www.coventry-ct.gov/AgendaCenter/ViewFile/Agenda/_06012026-4529?packet=true",
				sourceType: "scraped",
				sourceContentHash: "coventry-06012026-4529",
				status: "summarized",
				createdAt: now,
			}),
		);
		const subscriptionId = await t.run(async (ctx) =>
			ctx.db.insert("subscriptions", {
				userId: userId as Id<"users">,
				municipalityId: municipalityId as Id<"municipalities">,
				alertFrequency: "weekly",
				emailEnabled: false,
				isActive: true,
				createdAt: now,
				updatedAt: now,
			}),
		);

		await expect(
			t.mutation(internal.functions.alerts.mutations.generateAlerts, {
				meetingId: meetingId as Id<"meetings">,
				summaryId: summaryId as Id<"summaries">,
			}),
		).resolves.toMatchObject({ created: 1, skipped: 0, errors: [] });

		await expect(
			t.mutation(internal.functions.alerts.mutations.generateAlerts, {
				meetingId: meetingId as Id<"meetings">,
				summaryId: summaryId as Id<"summaries">,
			}),
		).resolves.toMatchObject({ created: 0, skipped: 1, errors: [] });

		const alerts = await t.run(async (ctx) => ctx.db.query("alerts").collect());
		expect(alerts).toHaveLength(1);
		expect(alerts[0]).toMatchObject({
			userId,
			subscriptionId,
			municipalityId,
			meetingId,
			summaryId,
			matchedTopics: ["budget", "other"],
			status: "pending",
		});
		expect(alerts[0].sentAt).toBeUndefined();
		expect(alerts[0].scheduledFor).toBeUndefined();

		const asUser = t.withIdentity({
			subject: "user_coventry",
			issuer: ISSUER,
			email: "reader@example.test",
		});
		const feed = await asUser.query(api.functions.alerts.queries.getFeed, {
			limit: 10,
		});
		expect(feed).toEqual([]);

		await t.mutation(internal.functions.alerts.mutations.markSent, {
			alertId: alerts[0]._id,
		});

		const sentFeed = await asUser.query(api.functions.alerts.queries.getFeed, {
			limit: 10,
		});
		expect(sentFeed).toHaveLength(1);
		expect(sentFeed[0]).toMatchObject({
			_id: alerts[0]._id,
			isNew: true,
			matchedTopics: ["budget", "other"],
			meeting: { title: "Town Council Meeting: June 1, 2026" },
			municipality: { name: "Coventry", state: "Connecticut" },
		});
	});

	it("records skip reason counts for no-match, inactive, duplicate, and tier-gated candidates", async () => {
		const t = setup();
		const now = Date.now();
		const municipalityId = await t.run(async (ctx) =>
			ctx.db.insert("municipalities", {
				name: "Coventry",
				state: "Connecticut",
				platform: "manual",
				isActive: true,
				isVerified: true,
				createdAt: now,
				updatedAt: now,
			}),
		);
		const freeUserId = await seedUser(t, {
			clerkUserId: "user_free_immediate",
			email: "free@example.test",
		});
		const proUserId = await seedUser(t, {
			clerkUserId: "user_pro_daily",
			email: "pro@example.test",
			tier: "pro",
		});
		const meetingId = await t.run(async (ctx) =>
			ctx.db.insert("meetings", {
				municipalityId,
				title: "Town Council Bond Hearing",
				meetingType: "city_council",
				meetingDate: Date.UTC(2026, 5, 18),
				sourceType: "manual_entry",
				sourceUrl: "https://example.test/agenda.pdf",
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
				executiveSummary: "Council reviewed a park bond.",
				keyDecisions: [],
				discussionTopics: [],
				upcomingItems: [],
				topics: ["budget"],
				modelUsed: "test",
				promptVersion: "test",
				processingTimeMs: 1,
				municipalityId,
				meetingDate: Date.UTC(2026, 5, 18),
				sourceUrl: "https://example.test/agenda.pdf",
				sourceType: "manual_entry",
				sourceContentHash: "candidate-skip-test",
				status: "summarized",
				createdAt: now,
			}),
		);

		await t.run(async (ctx) =>
			Promise.all([
				ctx.db.insert("subscriptions", {
					userId: proUserId as Id<"users">,
					municipalityId: municipalityId as Id<"municipalities">,
					alertFrequency: "daily",
					emailEnabled: true,
					isActive: true,
					createdAt: now,
					updatedAt: now,
				}),
				ctx.db.insert("subscriptions", {
					userId: proUserId as Id<"users">,
					municipalityId: municipalityId as Id<"municipalities">,
					topicFilters: ["Zoning"],
					alertFrequency: "daily",
					emailEnabled: true,
					isActive: true,
					createdAt: now,
					updatedAt: now,
				}),
				ctx.db.insert("subscriptions", {
					userId: proUserId as Id<"users">,
					municipalityId: municipalityId as Id<"municipalities">,
					alertFrequency: "daily",
					emailEnabled: true,
					isActive: false,
					createdAt: now,
					updatedAt: now,
				}),
				ctx.db.insert("subscriptions", {
					userId: freeUserId as Id<"users">,
					municipalityId: municipalityId as Id<"municipalities">,
					alertFrequency: "immediate",
					emailEnabled: true,
					isActive: true,
					createdAt: now,
					updatedAt: now,
				}),
			]),
		);

		await expect(
			t.mutation(internal.functions.alerts.mutations.generateAlerts, {
				meetingId: meetingId as Id<"meetings">,
				summaryId: summaryId as Id<"summaries">,
			}),
		).resolves.toMatchObject({
			created: 1,
			skipped: 3,
			skippedByReason: {
				inactive: 1,
				topic: 1,
				tier: 1,
			},
			errors: [],
		});

		await expect(
			t.mutation(internal.functions.alerts.mutations.generateAlerts, {
				meetingId: meetingId as Id<"meetings">,
				summaryId: summaryId as Id<"summaries">,
			}),
		).resolves.toMatchObject({
			created: 0,
			skipped: 4,
			skippedByReason: {
				duplicate: 1,
				inactive: 1,
				topic: 1,
				tier: 1,
			},
			errors: [],
		});

		const alerts = await t.run(async (ctx) => ctx.db.query("alerts").collect());
		expect(alerts).toHaveLength(1);
		expect(alerts[0]).toMatchObject({
			userId: proUserId,
			municipalityId,
			status: "pending",
		});
	});
});

describe("alert read ownership", () => {
	it("marks only the authenticated owner's alert as read", async () => {
		const t = setup();
		const ownerId = await seedUser(t, {
			clerkUserId: "user_alert_owner",
			email: "owner@example.test",
		});
		const alertId = await seedAlert(t, ownerId as Id<"users">);
		const asOwner = t.withIdentity({
			subject: "user_alert_owner",
			issuer: ISSUER,
			email: "owner@example.test",
		});

		await expect(
			asOwner.mutation(api.functions.alerts.mutations.markAsRead, {
				alertId: alertId as Id<"alerts">,
			}),
		).resolves.toBeNull();

		const alert = await t.run(async (ctx) =>
			ctx.db.get(alertId as Id<"alerts">),
		);
		expect(alert?.readAt).toEqual(expect.any(Number));
	});

	it("denies cross-user alert read mutation even when the alert id is valid", async () => {
		const t = setup();
		const ownerId = await seedUser(t, {
			clerkUserId: "user_alert_owner",
			email: "owner@example.test",
		});
		await seedUser(t, {
			clerkUserId: "user_alert_attacker",
			email: "attacker@example.test",
		});
		const alertId = await seedAlert(t, ownerId as Id<"users">);
		const asAttacker = t.withIdentity({
			subject: "user_alert_attacker",
			issuer: ISSUER,
			email: "attacker@example.test",
		});

		await expect(
			asAttacker.mutation(api.functions.alerts.mutations.markAsRead, {
				alertId: alertId as Id<"alerts">,
			}),
		).rejects.toThrow(/Unauthorized/);

		const alert = await t.run(async (ctx) =>
			ctx.db.get(alertId as Id<"alerts">),
		);
		expect(alert?.readAt).toBeUndefined();
	});

	it("does not reveal whether a requested alert id exists", async () => {
		const t = setup();
		const ownerId = await seedUser(t, {
			clerkUserId: "user_alert_owner",
			email: "owner@example.test",
		});
		const alertId = await seedAlert(t, ownerId as Id<"users">);
		await t.run(async (ctx) => ctx.db.delete(alertId as Id<"alerts">));
		const asOwner = t.withIdentity({
			subject: "user_alert_owner",
			issuer: ISSUER,
			email: "owner@example.test",
		});

		await expect(
			asOwner.mutation(api.functions.alerts.mutations.markAsRead, {
				alertId: alertId as Id<"alerts">,
			}),
		).rejects.toThrow(/Unauthorized/);
	});

	it("requires authentication for alert read mutations", async () => {
		const t = setup();
		const ownerId = await seedUser(t, {
			clerkUserId: "user_alert_owner",
			email: "owner@example.test",
		});
		const alertId = await seedAlert(t, ownerId as Id<"users">);

		await expect(
			t.mutation(api.functions.alerts.mutations.markAsRead, {
				alertId: alertId as Id<"alerts">,
			}),
		).rejects.toThrow(/User not found/);
	});

	it("marks only the authenticated user's unread sent alerts as read", async () => {
		const t = setup();
		const ownerId = await seedUser(t, {
			clerkUserId: "user_alert_owner",
			email: "owner@example.test",
		});
		const otherId = await seedUser(t, {
			clerkUserId: "user_alert_other",
			email: "other@example.test",
		});
		const ownerUnreadId = await seedAlert(t, ownerId as Id<"users">);
		const ownerAlreadyReadId = await seedAlert(
			t,
			ownerId as Id<"users">,
			Date.now(),
		);
		const otherUnreadId = await seedAlert(t, otherId as Id<"users">);
		const asOwner = t.withIdentity({
			subject: "user_alert_owner",
			issuer: ISSUER,
			email: "owner@example.test",
		});

		await expect(
			asOwner.mutation(api.functions.alerts.mutations.markAllAsRead, {}),
		).resolves.toEqual({ updated: 1 });

		const [ownerUnread, ownerAlreadyRead, otherUnread] = await t.run(
			async (ctx) =>
				await Promise.all([
					ctx.db.get(ownerUnreadId as Id<"alerts">),
					ctx.db.get(ownerAlreadyReadId as Id<"alerts">),
					ctx.db.get(otherUnreadId as Id<"alerts">),
				]),
		);
		expect(ownerUnread?.readAt).toEqual(expect.any(Number));
		expect(ownerAlreadyRead?.readAt).toEqual(expect.any(Number));
		expect(otherUnread?.readAt).toBeUndefined();
	});

	it("requires authentication for marking all alerts as read", async () => {
		const t = setup();

		await expect(
			t.mutation(api.functions.alerts.mutations.markAllAsRead, {}),
		).rejects.toThrow(/User not found/);
	});
});

describe("alert read query ownership", () => {
	it("scopes public alert read queries to the authenticated user", async () => {
		const t = setup();
		const ownerId = await seedUser(t, {
			clerkUserId: "user_alert_owner",
			email: "owner@example.test",
		});
		const otherId = await seedUser(t, {
			clerkUserId: "user_alert_other",
			email: "other@example.test",
		});
		const ownerUnreadId = await seedAlert(t, ownerId as Id<"users">);
		const ownerReadId = await seedAlert(t, ownerId as Id<"users">, Date.now());
		const otherUnreadId = await seedAlert(t, otherId as Id<"users">);
		const asOwner = t.withIdentity({
			subject: "user_alert_owner",
			issuer: ISSUER,
			email: "owner@example.test",
		});

		await expect(
			asOwner.query(api.functions.alerts.queries.getById, {
				alertId: ownerUnreadId as Id<"alerts">,
			}),
		).resolves.toMatchObject({ _id: ownerUnreadId });
		await expect(
			asOwner.query(api.functions.alerts.queries.getById, {
				alertId: otherUnreadId as Id<"alerts">,
			}),
		).resolves.toBeNull();

		const feed = await asOwner.query(api.functions.alerts.queries.getFeed, {
			limit: 10,
		});
		expect(feed.map((alert) => alert._id).sort()).toEqual(
			[ownerUnreadId, ownerReadId].sort(),
		);

		const list = await asOwner.query(api.functions.alerts.queries.listByUser, {
			limit: 10,
		});
		expect(list.map((alert) => alert._id).sort()).toEqual(
			[ownerUnreadId, ownerReadId].sort(),
		);

		await expect(
			asOwner.query(api.functions.alerts.queries.countByUser, {}),
		).resolves.toMatchObject({
			total: 2,
			sent: 2,
			unread: 1,
		});
		await expect(
			asOwner.query(api.functions.alerts.queries.getUnreadCount, {}),
		).resolves.toBe(1);
	});

	it("returns empty alert query results for unauthenticated callers", async () => {
		const t = setup();
		const ownerId = await seedUser(t, {
			clerkUserId: "user_alert_owner",
			email: "owner@example.test",
		});
		const alertId = await seedAlert(t, ownerId as Id<"users">);

		await expect(
			t.query(api.functions.alerts.queries.getById, {
				alertId: alertId as Id<"alerts">,
			}),
		).resolves.toBeNull();
		await expect(
			t.query(api.functions.alerts.queries.getFeed, { limit: 10 }),
		).resolves.toEqual([]);
		await expect(
			t.query(api.functions.alerts.queries.listByUser, { limit: 10 }),
		).resolves.toEqual([]);
		await expect(
			t.query(api.functions.alerts.queries.countByUser, {}),
		).resolves.toEqual({
			total: 0,
			pending: 0,
			sent: 0,
			failed: 0,
			unread: 0,
		});
		await expect(
			t.query(api.functions.alerts.queries.getUnreadCount, {}),
		).resolves.toBe(0);
	});
});

describe("admin alert delivery health", () => {
	it("returns null for non-admin callers", async () => {
		const t = setup();
		await seedUser(t, {
			clerkUserId: "user_delivery_viewer",
			email: "viewer@example.test",
		});
		await seedDeliveryAlert(t, {
			status: "failed",
			deliveryFailureKind: "permanent",
			deliveryError: "Sender domain not verified",
		});
		const asViewer = t.withIdentity({
			subject: "user_delivery_viewer",
			issuer: ISSUER,
			email: "viewer@example.test",
		});

		await expect(
			asViewer.query(api.functions.alerts.queries.getDeliveryHealth, {}),
		).resolves.toBeNull();
	});

	it("summarizes delivery state and recent alert context for admins", async () => {
		const t = setup();
		const now = Date.now();
		await seedUser(t, {
			clerkUserId: "user_delivery_admin",
			email: "admin@example.test",
			isAdmin: true,
		});
		const staleQueuedId = await seedDeliveryAlert(t, {
			status: "queued",
			deliveryKey: "alert/stale",
			deliveryAttemptCount: 1,
			lastDeliveryAttemptAt: now - 31 * 60 * 1000,
			userEmail: "stale@example.test",
			meetingTitle: "Stale Queue Hearing",
			createdAt: now - 5,
		});
		await seedDeliveryAlert(t, {
			status: "queued",
			deliveryKey: "alert/fresh",
			deliveryAttemptCount: 1,
			lastDeliveryAttemptAt: now - 5 * 60 * 1000,
		});
		await seedDeliveryAlert(t, {
			status: "pending",
			deliveryFailureKind: "retryable",
			deliveryAttemptCount: 2,
			nextDeliveryAttemptAt: now + 10 * 60 * 1000,
			scheduledFor: now + 10 * 60 * 1000,
			deliveryError: "Cloudflare email service not configured",
		});
		await seedDeliveryAlert(t, {
			status: "pending",
		});
		await seedDeliveryAlert(t, {
			status: "sent",
			sentAt: now - 1000,
			providerMessageId: "<email_sent@example.test>",
		});
		await seedDeliveryAlert(t, {
			status: "failed",
			deliveryFailureKind: "permanent",
			deliveryError: "Sender domain not verified",
		});
		await seedDeliveryAlert(t, {
			status: "failed",
			deliveryFailureKind: "permanent",
			deliveryAttemptCount: 3,
			deliveryError:
				"Retry attempts exhausted after 3 attempts: Cloudflare email service not configured",
		});

		const asAdmin = t.withIdentity({
			subject: "user_delivery_admin",
			issuer: ISSUER,
			email: "admin@example.test",
		});

		const health = await asAdmin.query(
			api.functions.alerts.queries.getDeliveryHealth,
			{ limit: 10 },
		);

		expect(health).toMatchObject({
			counts: {
				total: 7,
				pending: 2,
				queued: 2,
				staleQueued: 1,
				sent: 1,
				failed: 2,
				skipped: 0,
				retryable: 1,
				permanent: 2,
				exhausted: 1,
			},
			staleQueuedThresholdMs: 30 * 60 * 1000,
		});
		expect(health?.alerts).toHaveLength(7);
		expect(
			health?.alerts.find((alert) => alert._id === staleQueuedId),
		).toMatchObject({
			status: "queued",
			userEmail: "stale@example.test",
			meetingTitle: "Stale Queue Hearing",
			municipalityName: "Coventry",
			deliveryKey: "alert/stale",
			deliveryAttemptCount: 1,
			isStaleQueued: true,
			isRetrying: false,
			isExhausted: false,
		});
	});

	it("bounds delivery health scans to a recent inspection window", async () => {
		const t = setup();
		const now = Date.now();
		await seedUser(t, {
			clerkUserId: "user_delivery_window_admin",
			email: "admin@example.test",
			isAdmin: true,
		});
		await seedDeliveryAlert(t, {
			status: "sent",
			sentAt: now - 31 * 24 * 60 * 60 * 1000,
			createdAt: now - 31 * 24 * 60 * 60 * 1000,
		});
		const recentFailedId = await seedDeliveryAlert(t, {
			status: "failed",
			deliveryFailureKind: "permanent",
			deliveryError: "Sender domain not verified",
			createdAt: now - 60 * 1000,
		});
		const asAdmin = t.withIdentity({
			subject: "user_delivery_window_admin",
			issuer: ISSUER,
			email: "admin@example.test",
		});

		const health = await asAdmin.query(
			api.functions.alerts.queries.getDeliveryHealth,
			{ limit: 10 },
		);

		expect(health).toMatchObject({
			scanWindowMs: 30 * 24 * 60 * 60 * 1000,
			scanLimit: 5000,
			scannedAlertCount: 1,
			isScanCapped: false,
			counts: {
				total: 1,
				sent: 0,
				failed: 1,
			},
			alerts: [expect.objectContaining({ _id: recentFailedId })],
		});
		expect(health?.scanWindowStartedAt).toBeLessThanOrEqual(now);
	});

	it("keeps old outstanding delivery anomalies visible outside the recent window", async () => {
		const t = setup();
		const now = Date.now();
		const oldTimestamp = now - 60 * 24 * 60 * 60 * 1000;
		await seedUser(t, {
			clerkUserId: "user_delivery_outstanding_admin",
			email: "admin@example.test",
			isAdmin: true,
		});
		await seedDeliveryAlert(t, {
			status: "sent",
			sentAt: oldTimestamp,
			createdAt: oldTimestamp,
		});
		const oldQueuedId = await seedDeliveryAlert(t, {
			status: "queued",
			deliveryKey: "alert/old-stale",
			deliveryAttemptCount: 2,
			lastDeliveryAttemptAt: oldTimestamp,
			createdAt: oldTimestamp,
			meetingTitle: "Old Stale Queue Hearing",
		});
		const asAdmin = t.withIdentity({
			subject: "user_delivery_outstanding_admin",
			issuer: ISSUER,
			email: "admin@example.test",
		});

		const health = await asAdmin.query(
			api.functions.alerts.queries.getDeliveryHealth,
			{ limit: 10 },
		);

		expect(health).toMatchObject({
			outstandingScanLimit: 1000,
			outstandingScannedCounts: {
				pending: 0,
				queued: 1,
				failed: 0,
			},
			outstandingCappedStatuses: [],
			counts: {
				total: 1,
				queued: 1,
				staleQueued: 1,
				sent: 0,
			},
		});
		expect(health?.alerts).toEqual([
			expect.objectContaining({
				_id: oldQueuedId,
				status: "queued",
				meetingTitle: "Old Stale Queue Hearing",
				deliveryKey: "alert/old-stale",
				isStaleQueued: true,
			}),
		]);
	});

	it("reports when the delivery health scan reaches its cap", async () => {
		const t = setup();
		await seedUser(t, {
			clerkUserId: "user_delivery_cap_admin",
			email: "admin@example.test",
			isAdmin: true,
		});
		await seedDeliveryAlert(t, { status: "pending" });
		await seedDeliveryAlert(t, { status: "queued" });
		const asAdmin = t.withIdentity({
			subject: "user_delivery_cap_admin",
			issuer: ISSUER,
			email: "admin@example.test",
		});

		const health = await asAdmin.query(
			api.functions.alerts.queries.getDeliveryHealth,
			{ limit: 10, scanLimit: 1 },
		);

		expect(health).toMatchObject({
			scanLimit: 1,
			recentScannedAlertCount: 1,
			scannedAlertCount: 2,
			isScanCapped: true,
			isRecentScanCapped: true,
			counts: {
				total: 2,
			},
		});
		expect(health?.alerts).toHaveLength(2);
	});

	it("filters failed, retrying, and stale queued delivery rows", async () => {
		const t = setup();
		const now = Date.now();
		await seedUser(t, {
			clerkUserId: "user_delivery_filter_admin",
			email: "admin@example.test",
			isAdmin: true,
		});
		const failedId = await seedDeliveryAlert(t, {
			status: "failed",
			deliveryFailureKind: "permanent",
			deliveryError: "Sender domain not verified",
		});
		const retryingId = await seedDeliveryAlert(t, {
			status: "pending",
			deliveryFailureKind: "retryable",
			nextDeliveryAttemptAt: now + 10 * 60 * 1000,
		});
		const staleQueuedId = await seedDeliveryAlert(t, {
			status: "queued",
			lastDeliveryAttemptAt: now - 31 * 60 * 1000,
		});
		await seedDeliveryAlert(t, { status: "sent" });
		const asAdmin = t.withIdentity({
			subject: "user_delivery_filter_admin",
			issuer: ISSUER,
			email: "admin@example.test",
		});

		await expect(
			asAdmin.query(api.functions.alerts.queries.getDeliveryHealth, {
				filter: "failed",
			}),
		).resolves.toMatchObject({
			alerts: [expect.objectContaining({ _id: failedId })],
		});
		await expect(
			asAdmin.query(api.functions.alerts.queries.getDeliveryHealth, {
				filter: "retrying",
			}),
		).resolves.toMatchObject({
			alerts: [expect.objectContaining({ _id: retryingId })],
		});
		await expect(
			asAdmin.query(api.functions.alerts.queries.getDeliveryHealth, {
				filter: "stale_queued",
			}),
		).resolves.toMatchObject({
			alerts: [expect.objectContaining({ _id: staleQueuedId })],
		});
	});
});
