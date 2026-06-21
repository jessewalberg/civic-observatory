import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import schema from "../../schema";
import { modules } from "../../test.setup";

const setup = () => convexTest(schema, modules);
const ISSUER = "https://clerk.example.com";

async function seedUser(
	t: ReturnType<typeof convexTest>,
	o: {
		clerkUserId: string;
		email: string;
	},
) {
	const now = Date.now();
	return await t.run(async (ctx) =>
		ctx.db.insert("users", {
			clerkUserId: o.clerkUserId,
			email: o.email,
			tier: "free",
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
			matchedTopics: ["budget"],
			status: "sent",
			sentAt: now,
			readAt,
			createdAt: now,
		}),
	);
}

describe("minimal dashboard alert generation", () => {
	it("creates one unread feed item for an active municipality subscription", async () => {
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
			meetingId,
			summaryId,
			matchedTopics: ["budget", "other"],
			status: "sent",
		});
		expect(alerts[0].sentAt).toEqual(expect.any(Number));
		expect(alerts[0].scheduledFor).toBeUndefined();

		const asUser = t.withIdentity({
			subject: "user_coventry",
			issuer: ISSUER,
			email: "reader@example.test",
		});
		const feed = await asUser.query(api.functions.alerts.queries.getFeed, {
			limit: 10,
		});
		expect(feed).toHaveLength(1);
		expect(feed[0]).toMatchObject({
			_id: alerts[0]._id,
			isNew: true,
			matchedTopics: ["budget", "other"],
			meeting: { title: "Town Council Meeting: June 1, 2026" },
			municipality: { name: "Coventry", state: "Connecticut" },
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
