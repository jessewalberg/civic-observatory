import { v } from "convex/values";
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import {
	internalMutation,
	type MutationCtx,
	mutation,
} from "../../_generated/server";
import { STATE_NAMES } from "../../data/index";
import { getCurrentUser, requireAdmin } from "../../lib/auth";
import { createMunicipalitySlug } from "../../lib/seoSlugs";

const VALID_STATES = new Set(STATE_NAMES);
const MAX_TOPIC_INTERESTS = 10;

const statusValidator = v.union(
	v.literal("requested"),
	v.literal("discovered"),
	v.literal("probed"),
	v.literal("active"),
	v.literal("rejected"),
);

const priorityValidator = v.union(
	v.literal("low"),
	v.literal("medium"),
	v.literal("high"),
);

const platformValidator = v.union(
	v.literal("granicus"),
	v.literal("civicplus"),
	v.literal("generic"),
	v.literal("manual"),
);

export const create = mutation({
	args: {
		municipalityName: v.string(),
		state: v.string(),
		websiteUrl: v.optional(v.string()),
		meetingsPageUrl: v.optional(v.string()),
		requesterEmail: v.optional(v.string()),
		topicInterests: v.optional(v.array(v.string())),
		notes: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const user = await getCurrentUser(ctx);
		const municipalityName = requiredText(
			args.municipalityName,
			"Municipality name is required",
		);
		const state = requiredText(args.state, "State is required");
		validateState(state);

		const requesterEmail = user?.email
			? user.email
			: requiredEmail(args.requesterEmail);
		const now = Date.now();

		return await ctx.db.insert("coverageRequests", {
			municipalityName,
			state,
			websiteUrl: normalizeUrl(args.websiteUrl),
			meetingsPageUrl: normalizeUrl(args.meetingsPageUrl),
			requesterEmail,
			requesterUserId: user?._id,
			topicInterests: normalizeTopicInterests(args.topicInterests),
			notes: normalizeOptionalText(args.notes),
			status: "requested",
			priority: "medium",
			createdAt: now,
			updatedAt: now,
		});
	},
});

export const updateStatus = mutation({
	args: {
		requestId: v.id("coverageRequests"),
		status: statusValidator,
		priority: v.optional(priorityValidator),
		statusReason: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		await requireAdmin(ctx, "Admin access required");
		const request = await getCoverageRequestOrThrow(ctx, args.requestId);
		const now = Date.now();
		const notificationPatch =
			args.status === "active" && request.notificationStatus !== "sent"
				? {
						notificationStatus: "queued" as const,
						notificationError: undefined,
					}
				: {};

		await ctx.db.patch(args.requestId, {
			status: args.status,
			...(args.priority ? { priority: args.priority } : {}),
			...(args.statusReason !== undefined
				? { statusReason: normalizeOptionalText(args.statusReason) }
				: {}),
			...notificationPatch,
			updatedAt: now,
		});

		if (args.status === "active" && request.notificationStatus !== "sent") {
			await ctx.scheduler.runAfter(
				0,
				internal.functions.coverageRequests.actions.notifyActive,
				{ requestId: args.requestId },
			);
		}

		return {
			status: args.status,
			priority: args.priority ?? request.priority,
		};
	},
});

export const seedMunicipality = mutation({
	args: {
		requestId: v.id("coverageRequests"),
		platform: v.optional(platformValidator),
	},
	handler: async (ctx, args) => {
		await requireAdmin(ctx, "Admin access required");
		const request = await getCoverageRequestOrThrow(ctx, args.requestId);
		if (request.seededMunicipalityId) {
			return request.seededMunicipalityId;
		}

		const now = Date.now();
		const platform = args.platform ?? "generic";
		const municipalityId = await ctx.db.insert("municipalities", {
			name: request.municipalityName,
			state: request.state,
			slug: await createUniqueMunicipalitySlug(
				ctx,
				createMunicipalitySlug({
					name: request.municipalityName,
					state: request.state,
				}),
			),
			websiteUrl: request.websiteUrl,
			meetingsPageUrl: request.meetingsPageUrl,
			platform,
			scrapeConfig:
				platform === "manual"
					? undefined
					: {
							frequencyHours: 24,
						},
			coverageStatus: "unpublished",
			isActive: false,
			isVerified: false,
			createdAt: now,
			updatedAt: now,
		});

		await ctx.db.patch(args.requestId, {
			status: request.status === "requested" ? "discovered" : request.status,
			seededMunicipalityId: municipalityId,
			updatedAt: now,
		});

		return municipalityId;
	},
});

export const activateForMunicipality = internalMutation({
	args: {
		municipalityId: v.id("municipalities"),
	},
	handler: async (ctx, args) => {
		const requests = await ctx.db
			.query("coverageRequests")
			.withIndex("by_seeded_municipality", (q) =>
				q.eq("seededMunicipalityId", args.municipalityId),
			)
			.collect();
		const now = Date.now();
		let activated = 0;

		for (const request of requests) {
			if (
				request.status === "rejected" ||
				request.notificationStatus === "sent"
			) {
				continue;
			}

			await ctx.db.patch(request._id, {
				status: "active",
				notificationStatus: "queued",
				notificationError: undefined,
				updatedAt: now,
			});
			await ctx.scheduler.runAfter(
				0,
				internal.functions.coverageRequests.actions.notifyActive,
				{ requestId: request._id },
			);
			activated++;
		}

		return { activated };
	},
});

export const markNotificationResult = internalMutation({
	args: {
		requestId: v.id("coverageRequests"),
		status: v.union(
			v.literal("sent"),
			v.literal("failed"),
			v.literal("skipped"),
		),
		error: v.optional(v.string()),
		providerMessageId: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const now = Date.now();
		await ctx.db.patch(args.requestId, {
			notificationStatus: args.status,
			notificationError: args.error,
			providerMessageId: args.providerMessageId,
			...(args.status === "sent" ? { notifiedAt: now } : {}),
			updatedAt: now,
		});
	},
});

async function getCoverageRequestOrThrow(
	ctx: MutationCtx,
	requestId: Id<"coverageRequests">,
) {
	const request = await ctx.db.get(requestId);
	if (!request) {
		throw new Error("Coverage request not found");
	}
	return request;
}

async function createUniqueMunicipalitySlug(
	ctx: MutationCtx,
	baseSlug: string,
): Promise<string> {
	let candidate = baseSlug;
	let suffix = 2;

	while (true) {
		const existing = await ctx.db
			.query("municipalities")
			.withIndex("by_slug", (q) => q.eq("slug", candidate))
			.first();

		if (!existing) {
			return candidate;
		}

		candidate = `${baseSlug}-${suffix}`;
		suffix++;
	}
}

function validateState(state: string) {
	if (!VALID_STATES.has(state)) {
		throw new Error(
			`Invalid state "${state}". Must be a full state name (e.g. "Connecticut", not "CT").`,
		);
	}
}

function requiredText(value: string, message: string): string {
	const normalized = normalizeOptionalText(value);
	if (!normalized) {
		throw new Error(message);
	}
	return normalized;
}

function requiredEmail(value: string | undefined): string {
	const email = normalizeOptionalText(value);
	if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
		throw new Error("A valid email address is required");
	}
	return email;
}

function normalizeTopicInterests(values: string[] | undefined): string[] {
	const seen = new Set<string>();
	const topics: string[] = [];
	for (const value of values ?? []) {
		const topic = normalizeOptionalText(value);
		if (!topic || seen.has(topic)) continue;
		seen.add(topic);
		topics.push(topic);
		if (topics.length >= MAX_TOPIC_INTERESTS) break;
	}
	return topics;
}

function normalizeUrl(value: string | undefined): string | undefined {
	const text = normalizeOptionalText(value);
	if (!text) return undefined;
	try {
		const url = new URL(text);
		if (!["http:", "https:"].includes(url.protocol)) {
			throw new Error("Unsupported URL protocol");
		}
		return text;
	} catch {
		throw new Error("Please enter a valid http or https URL");
	}
}

function normalizeOptionalText(value: string | undefined): string | undefined {
	const trimmed = value?.trim();
	return trimmed ? trimmed : undefined;
}
