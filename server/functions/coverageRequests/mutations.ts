import { z } from "zod";
import { internal } from "../../api";
import { STATE_NAMES } from "../../data/index";
import { entityId } from "../../id";
import { getCurrentUser, requireAdmin } from "../../lib/auth";
import { createMunicipalitySlug } from "../../lib/seoSlugs";
import type { Doc, Id } from "../../model";
import {
	defineWrite,
	privateWrite,
	type ServiceContext,
} from "../../procedure";

const VALID_STATES = new Set(STATE_NAMES);
const MAX_TOPIC_INTERESTS = 10;
const NOTIFIABLE_STATUSES = [
	"requested",
	"discovered",
	"probed",
	"active",
] as const;
const statusValidator = z.union([
	z.literal("requested"),
	z.literal("discovered"),
	z.literal("probed"),
	z.literal("active"),
	z.literal("rejected"),
]);
const priorityValidator = z.union([
	z.literal("low"),
	z.literal("medium"),
	z.literal("high"),
]);
const platformValidator = z.union([
	z.literal("granicus"),
	z.literal("civicplus"),
	z.literal("generic"),
	z.literal("manual"),
]);
export const create = defineWrite({
	args: {
		municipalityName: z.string(),
		state: z.string(),
		websiteUrl: z.string().optional(),
		meetingsPageUrl: z.string().optional(),
		requesterEmail: z.string().optional(),
		topicInterests: z.array(z.string()).optional(),
		notes: z.string().optional(),
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
		return await ctx.data.add("coverageRequests", {
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
export const updateStatus = defineWrite({
	args: {
		requestId: entityId("coverageRequests"),
		status: statusValidator,
		priority: priorityValidator.optional(),
		statusReason: z.string().optional(),
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
		await ctx.data.update(args.requestId, {
			status: args.status,
			...(args.priority ? { priority: args.priority } : {}),
			...(args.statusReason !== undefined
				? { statusReason: normalizeOptionalText(args.statusReason) }
				: {}),
			...notificationPatch,
			updatedAt: now,
		});
		if (args.status === "active" && request.notificationStatus !== "sent") {
			await ctx.jobs.enqueue(
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
export const seedMunicipality = defineWrite({
	args: {
		requestId: entityId("coverageRequests"),
		platform: platformValidator.optional(),
	},
	handler: async (ctx, args) => {
		await requireAdmin(ctx, "Admin access required");
		const request = await getCoverageRequestOrThrow(ctx, args.requestId);
		if (request.seededMunicipalityId) {
			return request.seededMunicipalityId;
		}
		const now = Date.now();
		const platform = args.platform ?? "generic";
		const municipalityName = request.municipalityName;
		const state = request.state;
		const municipalityId = await ctx.data.add("municipalities", {
			name: municipalityName,
			state,
			slug: await createUniqueMunicipalitySlug(
				ctx,
				createMunicipalitySlug({
					name: municipalityName,
					state,
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
		await linkMatchingRequestsToMunicipality(ctx, {
			municipalityId,
			name: municipalityName,
			state,
			now,
		});
		return municipalityId;
	},
});
export const activateForMunicipality = privateWrite({
	args: {
		municipalityId: entityId("municipalities"),
	},
	handler: async (ctx, args) => {
		const municipality = await ctx.data.find(args.municipalityId);
		if (!municipality) {
			return { activated: 0 };
		}
		const requests = await getRequestsForMunicipalityActivation(
			ctx,
			municipality,
		);
		const now = Date.now();
		let activated = 0;
		for (const request of requests) {
			if (
				request.status === "rejected" ||
				request.notificationStatus === "sent"
			) {
				continue;
			}
			await ctx.data.update(request._id, {
				status: "active",
				seededMunicipalityId:
					request.seededMunicipalityId ?? args.municipalityId,
				notificationStatus: "queued",
				notificationError: undefined,
				updatedAt: now,
			});
			await ctx.jobs.enqueue(
				0,
				internal.functions.coverageRequests.actions.notifyActive,
				{ requestId: request._id },
			);
			activated++;
		}
		return { activated };
	},
});
export const markNotificationResult = privateWrite({
	args: {
		requestId: entityId("coverageRequests"),
		status: z.union([
			z.literal("sent"),
			z.literal("failed"),
			z.literal("skipped"),
		]),
		error: z.string().optional(),
		providerMessageId: z.string().optional(),
	},
	handler: async (ctx, args) => {
		const now = Date.now();
		await ctx.data.update(args.requestId, {
			notificationStatus: args.status,
			notificationError: args.error,
			providerMessageId: args.providerMessageId,
			...(args.status === "sent" ? { notifiedAt: now } : {}),
			updatedAt: now,
		});
	},
});
async function getCoverageRequestOrThrow(
	ctx: ServiceContext,
	requestId: Id<"coverageRequests">,
) {
	const request = await ctx.data.find(requestId);
	if (!request) {
		throw new Error("Coverage request not found");
	}
	return request;
}
async function createUniqueMunicipalitySlug(
	ctx: ServiceContext,
	baseSlug: string,
): Promise<string> {
	let candidate = baseSlug;
	let suffix = 2;
	while (true) {
		const existing = await ctx.data
			.select("municipalities")
			.orderBy(["slug", "_creationTime", "_id"])
			.where("slug", "=", candidate)
			.one();
		if (!existing) {
			return candidate;
		}
		candidate = `${baseSlug}-${suffix}`;
		suffix++;
	}
}
async function linkMatchingRequestsToMunicipality(
	ctx: ServiceContext,
	args: {
		municipalityId: Id<"municipalities">;
		name: string;
		state: string;
		now: number;
	},
) {
	const requests = await getMatchingRequestsByNameState(
		ctx,
		args.name,
		args.state,
	);
	await Promise.all(
		requests.map((request) =>
			ctx.data.update(request._id, {
				status: request.status === "requested" ? "discovered" : request.status,
				seededMunicipalityId:
					request.seededMunicipalityId ?? args.municipalityId,
				updatedAt: args.now,
			}),
		),
	);
}
async function getRequestsForMunicipalityActivation(
	ctx: ServiceContext,
	municipality: Doc<"municipalities">,
): Promise<Doc<"coverageRequests">[]> {
	const [seededRequests, matchingRequests] = await Promise.all([
		ctx.data
			.select("coverageRequests")
			.orderBy(["seededMunicipalityId", "_creationTime", "_id"])
			.where("seededMunicipalityId", "=", municipality._id)
			.all(),
		getMatchingRequestsByNameState(ctx, municipality.name, municipality.state),
	]);
	const byId = new Map<Id<"coverageRequests">, Doc<"coverageRequests">>();
	for (const request of [...seededRequests, ...matchingRequests]) {
		byId.set(request._id, request);
	}
	return [...byId.values()];
}
async function getMatchingRequestsByNameState(
	ctx: ServiceContext,
	name: string,
	state: string,
): Promise<Doc<"coverageRequests">[]> {
	const normalizedName = normalizeComparableText(name);
	const requestsByStatus = await Promise.all(
		NOTIFIABLE_STATUSES.map((status) =>
			ctx.data
				.select("coverageRequests")
				.orderBy(["state", "status", "_creationTime", "_id"])
				.where("state", "=", state)
				.where("status", "=", status)
				.all(),
		),
	);
	return requestsByStatus
		.flat()
		.filter(
			(request) =>
				normalizeComparableText(request.municipalityName) === normalizedName,
		);
}
function validateState(state: string) {
	if (!VALID_STATES.has(state)) {
		throw new Error(
			`Invalid state "${state}". Must be a full state name (e.g. "Connecticut", not "CT").`,
		);
	}
}
function normalizeComparableText(value: string): string {
	return value.trim().toLowerCase().replace(/\s+/g, " ");
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
