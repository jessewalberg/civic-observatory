import { z } from "zod";
import { internal } from "../../api";
import { STATE_NAMES } from "../../data/index";
import { entityId } from "../../id";
import { requireAdmin } from "../../lib/auth";
import { createMunicipalitySlug } from "../../lib/seoSlugs";
import type { Id } from "../../model";
import type { ServiceContext } from "../../procedure";
import { defineWrite, privateWrite } from "../../procedure";
import {
	evaluateCoveragePublishRequest,
	getCoverageStatus,
} from "./coveragePublication";

// Valid US state names for validation
const VALID_STATES = new Set(STATE_NAMES);
function validateState(state: string) {
	if (!VALID_STATES.has(state)) {
		throw new Error(
			`Invalid state "${state}". Must be a full state name (e.g. "Connecticut", not "CT").`,
		);
	}
}
// Platform type for validation
const platformValidator = z.union([
	z.literal("granicus"),
	z.literal("civicplus"),
	z.literal("generic"),
	z.literal("manual"),
]);
// Scrape config validator
const scrapeConfigValidator = z
	.object({
		meetingListSelector: z.string().optional(),
		meetingLinkSelector: z.string().optional(),
		dateSelector: z.string().optional(),
		dateFormat: z.string().optional(),
		contentSelector: z.string().optional(),
		frequencyHours: z.number(),
	})
	.optional();
// Scrape status validator
const scrapeStatusValidator = z.union([
	z.literal("success"),
	z.literal("failed"),
	z.literal("partial"),
]);
const coverageStatusValidator = z.union([
	z.literal("published"),
	z.literal("unpublished"),
	z.literal("paused"),
]);
// ═══════════════════════════════════════════════════════════════
// CREATE - Add a new municipality (admin only)
// ═══════════════════════════════════════════════════════════════
export const create = defineWrite({
	args: {
		name: z.string(),
		state: z.string(),
		county: z.string().optional(),
		population: z.number().optional(),
		timezone: z.string().optional(),
		websiteUrl: z.string().optional(),
		meetingsPageUrl: z.string().optional(),
		platform: platformValidator,
		scrapeConfig: scrapeConfigValidator,
		isActive: z.boolean().optional(),
		isVerified: z.boolean().optional(),
	},
	handler: async (ctx, args) => {
		// Verify admin access
		await requireAdmin(ctx);
		validateState(args.state);
		const now = Date.now();
		const slug = await createUniqueMunicipalitySlug(
			ctx,
			createMunicipalitySlug({ name: args.name, state: args.state }),
		);
		const id = await ctx.data.add("municipalities", {
			name: args.name,
			state: args.state,
			slug,
			county: args.county,
			population: args.population,
			timezone: args.timezone,
			websiteUrl: args.websiteUrl,
			meetingsPageUrl: args.meetingsPageUrl,
			platform: args.platform,
			scrapeConfig: args.scrapeConfig,
			coverageStatus: "unpublished",
			isActive: args.isActive ?? true,
			isVerified: args.isVerified ?? false,
			createdAt: now,
			updatedAt: now,
		});
		return id;
	},
});
// ═══════════════════════════════════════════════════════════════
// UPDATE - Modify municipality details (admin only)
// ═══════════════════════════════════════════════════════════════
export const update = defineWrite({
	args: {
		id: entityId("municipalities"),
		name: z.string().optional(),
		state: z.string().optional(),
		county: z.string().optional(),
		population: z.number().optional(),
		timezone: z.string().optional(),
		websiteUrl: z.string().optional(),
		meetingsPageUrl: z.string().optional(),
		platform: platformValidator.optional(),
		scrapeConfig: scrapeConfigValidator,
		isActive: z.boolean().optional(),
		isVerified: z.boolean().optional(),
	},
	handler: async (ctx, args) => {
		// Verify admin access
		await requireAdmin(ctx);
		const { id, ...updates } = args;
		const existing = await ctx.data.find(id);
		if (!existing) {
			throw new Error("Municipality not found");
		}
		// Validate state if provided
		if (updates.state !== undefined) {
			validateState(updates.state);
		}
		// Build update object with only provided fields
		const updateData: Record<string, unknown> = {
			updatedAt: Date.now(),
		};
		if (updates.name !== undefined) updateData.name = updates.name;
		if (updates.state !== undefined) updateData.state = updates.state;
		if (updates.county !== undefined) updateData.county = updates.county;
		if (updates.population !== undefined)
			updateData.population = updates.population;
		if (updates.timezone !== undefined) updateData.timezone = updates.timezone;
		if (updates.websiteUrl !== undefined)
			updateData.websiteUrl = updates.websiteUrl;
		if (updates.meetingsPageUrl !== undefined)
			updateData.meetingsPageUrl = updates.meetingsPageUrl;
		if (updates.platform !== undefined) updateData.platform = updates.platform;
		if (updates.scrapeConfig !== undefined)
			updateData.scrapeConfig = updates.scrapeConfig;
		if (updates.isActive !== undefined) updateData.isActive = updates.isActive;
		if (updates.isVerified !== undefined)
			updateData.isVerified = updates.isVerified;
		if (!existing.slug) {
			const slugName = updates.name ?? existing.name;
			const slugState = updates.state ?? existing.state;
			updateData.slug = await createUniqueMunicipalitySlug(
				ctx,
				createMunicipalitySlug({ name: slugName, state: slugState }),
				id,
			);
		}
		await ctx.data.update(id, updateData);
		return id;
	},
});
async function createUniqueMunicipalitySlug(
	ctx: ServiceContext,
	baseSlug: string,
	currentId?: Id<"municipalities">,
): Promise<string> {
	let candidate = baseSlug;
	let suffix = 2;
	while (true) {
		const existing = await ctx.data
			.select("municipalities")
			.orderBy(["slug", "_creationTime", "_id"])
			.where("slug", "=", candidate)
			.one();
		if (!existing || existing._id === currentId) {
			return candidate;
		}
		candidate = `${baseSlug}-${suffix}`;
		suffix++;
	}
}
// ═══════════════════════════════════════════════════════════════
// UPDATE SCRAPE STATUS - After a scrape job runs
// ═══════════════════════════════════════════════════════════════
// Backend-only (scrape pipeline): was a public backdoor letting any client mark
export const updateScrapeStatus = privateWrite({
	args: {
		id: entityId("municipalities"),
		status: scrapeStatusValidator,
		error: z.string().optional(),
	},
	handler: async (ctx, args) => {
		const existing = await ctx.data.find(args.id);
		if (!existing) {
			throw new Error("Municipality not found");
		}
		await ctx.data.update(args.id, {
			lastScrapedAt: Date.now(),
			lastScrapeStatus: args.status,
			lastScrapeError: args.error,
			updatedAt: Date.now(),
		});
		return args.id;
	},
});
// ═══════════════════════════════════════════════════════════════
// DELETE - Remove a municipality (admin only)
// ═══════════════════════════════════════════════════════════════
export const remove = defineWrite({
	args: {
		id: entityId("municipalities"),
	},
	handler: async (ctx, args) => {
		// Verify admin access
		await requireAdmin(ctx);
		const existing = await ctx.data.find(args.id);
		if (!existing) {
			throw new Error("Municipality not found");
		}
		// Check if there are any meetings associated
		const meetings = await ctx.data
			.select("meetings")
			.orderBy(["municipalityId", "_creationTime", "_id"])
			.where("municipalityId", "=", args.id)
			.one();
		if (meetings) {
			throw new Error(
				"Cannot delete municipality with existing meetings. Deactivate it instead.",
			);
		}
		await ctx.data.remove(args.id);
		return { deleted: true };
	},
});
// ═══════════════════════════════════════════════════════════════
// TOGGLE ACTIVE - Enable/disable a municipality (admin only)
// ═══════════════════════════════════════════════════════════════
export const toggleActive = defineWrite({
	args: {
		id: entityId("municipalities"),
	},
	handler: async (ctx, args) => {
		// Verify admin access
		await requireAdmin(ctx);
		const existing = await ctx.data.find(args.id);
		if (!existing) {
			throw new Error("Municipality not found");
		}
		await ctx.data.update(args.id, {
			isActive: !existing.isActive,
			updatedAt: Date.now(),
		});
		return { isActive: !existing.isActive };
	},
});
// ═══════════════════════════════════════════════════════════════
// VERIFY - Mark a municipality as verified (admin only)
// ═══════════════════════════════════════════════════════════════
export const verify = defineWrite({
	args: {
		id: entityId("municipalities"),
		verified: z.boolean(),
	},
	handler: async (ctx, args) => {
		// Verify admin access
		await requireAdmin(ctx);
		const existing = await ctx.data.find(args.id);
		if (!existing) {
			throw new Error("Municipality not found");
		}
		await ctx.data.update(args.id, {
			isVerified: args.verified,
			updatedAt: Date.now(),
		});
		return { isVerified: args.verified };
	},
});
// ═══════════════════════════════════════════════════════════════
// SET COVERAGE STATUS - Publish, pause, or unpublish public coverage
// ═══════════════════════════════════════════════════════════════
export const setCoverageStatus = defineWrite({
	args: {
		id: entityId("municipalities"),
		status: coverageStatusValidator,
		reason: z.string().optional(),
		overrideReason: z.string().optional(),
	},
	handler: async (ctx, args) => {
		const caller = await requireAdmin(ctx);
		const existing = await ctx.data.find(args.id);
		if (!existing) {
			throw new Error("Municipality not found");
		}
		const fromStatus = getCoverageStatus(existing);
		const reason = normalizeOptionalText(args.reason);
		const overrideReason = normalizeOptionalText(args.overrideReason);
		const latestValidation =
			args.status === "published"
				? await ctx.data
						.select("scraperValidationRuns")
						.orderBy(["municipalityId", "createdAt", "_creationTime", "_id"])
						.where("municipalityId", "=", args.id)
						.direction("desc")
						.one()
				: null;
		const publicationEvaluation =
			args.status === "published"
				? evaluateCoveragePublishRequest({
						latestValidation,
						overrideReason,
					})
				: ({ allowed: true, mode: "validation" } as const);
		if (!publicationEvaluation.allowed) {
			throw new Error(publicationEvaluation.reason);
		}
		const now = Date.now();
		await ctx.data.update(args.id, {
			coverageStatus: args.status,
			coverageStatusUpdatedAt: now,
			coverageStatusUpdatedByUserId: caller._id,
			coverageStatusReason: reason,
			coverageStatusOverrideReason: overrideReason,
			updatedAt: now,
		});
		await ctx.data.add("coveragePublicationEvents", {
			municipalityId: args.id,
			fromStatus,
			toStatus: args.status,
			reason,
			overrideReason,
			triggeredByUserId: caller._id,
			latestValidationRunId:
				args.status === "published" &&
				publicationEvaluation.mode === "validation"
					? latestValidation?._id
					: undefined,
			createdAt: now,
		});
		if (args.status === "published") {
			await ctx.call(
				internal.functions.coverageRequests.mutations.activateForMunicipality,
				{ municipalityId: args.id },
			);
		}
		return { coverageStatus: args.status };
	},
});
function normalizeOptionalText(value: string | undefined): string | undefined {
	const trimmed = value?.trim();
	return trimmed ? trimmed : undefined;
}
// ═══════════════════════════════════════════════════════════════
// FIX STATE - One-time fix for bad state values (e.g. "CT" → "Connecticut")
// ═══════════════════════════════════════════════════════════════
export const fixState = defineWrite({
	args: {
		id: entityId("municipalities"),
		state: z.string(),
	},
	handler: async (ctx, args) => {
		await requireAdmin(ctx);
		validateState(args.state);
		const existing = await ctx.data.find(args.id);
		if (!existing) {
			throw new Error("Municipality not found");
		}
		await ctx.data.update(args.id, {
			state: args.state,
			updatedAt: Date.now(),
		});
		return args.id;
	},
});
// ═══════════════════════════════════════════════════════════════
// INTERNAL: Save discovery result (used by discovery actions)
// ═══════════════════════════════════════════════════════════════
export const saveDiscoveryResult = privateWrite({
	args: {
		municipalityId: entityId("municipalities"),
		meetingsPageUrl: z.string(),
		platform: z.union([
			z.literal("granicus"),
			z.literal("civicplus"),
			z.literal("generic"),
		]),
	},
	handler: async (ctx, args) => {
		await ctx.data.update(args.municipalityId, {
			meetingsPageUrl: args.meetingsPageUrl,
			platform: args.platform,
			updatedAt: Date.now(),
		});
	},
});
// ═══════════════════════════════════════════════════════════════
// INTERNAL: Save probe result (used by probe actions)
// ═══════════════════════════════════════════════════════════════
export const saveProbeResult = privateWrite({
	args: {
		municipalityId: entityId("municipalities"),
		success: z.boolean(),
		meetingsFound: z.number(),
		activate: z.boolean(),
		error: z.string().optional(),
	},
	handler: async (ctx, args) => {
		const updates: Record<string, unknown> = {
			lastScrapeStatus: args.success ? "success" : "failed",
			lastScrapedAt: Date.now(),
			updatedAt: Date.now(),
		};
		if (!args.success && args.error) {
			updates.lastScrapeError = args.error;
		}
		// Activate municipality if probe found meetings
		if (args.activate && args.success && args.meetingsFound > 0) {
			updates.isActive = true;
		}
		await ctx.data.update(args.municipalityId, updates);
	},
});
