import { v } from "convex/values";
import type { Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import { internalMutation, mutation } from "../../_generated/server";
import { STATE_NAMES } from "../../data/index";
import { requireAdmin as requireAdminBridge } from "../../lib/auth";
import { createMunicipalitySlug } from "../../lib/seoSlugs";
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
const platformValidator = v.union(
	v.literal("granicus"),
	v.literal("civicplus"),
	v.literal("generic"),
	v.literal("manual"),
);

// Scrape config validator
const scrapeConfigValidator = v.optional(
	v.object({
		meetingListSelector: v.optional(v.string()),
		meetingLinkSelector: v.optional(v.string()),
		dateSelector: v.optional(v.string()),
		dateFormat: v.optional(v.string()),
		contentSelector: v.optional(v.string()),
		frequencyHours: v.number(),
	}),
);

// Scrape status validator
const scrapeStatusValidator = v.union(
	v.literal("success"),
	v.literal("failed"),
	v.literal("partial"),
);

const coverageStatusValidator = v.union(
	v.literal("published"),
	v.literal("unpublished"),
	v.literal("paused"),
);

// Identity-first admin check via the shared bridge.
async function requireAdmin(ctx: MutationCtx) {
	return await requireAdminBridge(ctx, "Admin access required");
}

// ═══════════════════════════════════════════════════════════════
// CREATE - Add a new municipality (admin only)
// ═══════════════════════════════════════════════════════════════
export const create = mutation({
	args: {
		name: v.string(),
		state: v.string(),
		county: v.optional(v.string()),
		population: v.optional(v.number()),
		timezone: v.optional(v.string()),
		websiteUrl: v.optional(v.string()),
		meetingsPageUrl: v.optional(v.string()),
		platform: platformValidator,
		scrapeConfig: scrapeConfigValidator,
		isActive: v.optional(v.boolean()),
		isVerified: v.optional(v.boolean()),
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

		const id = await ctx.db.insert("municipalities", {
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
export const update = mutation({
	args: {
		id: v.id("municipalities"),
		name: v.optional(v.string()),
		state: v.optional(v.string()),
		county: v.optional(v.string()),
		population: v.optional(v.number()),
		timezone: v.optional(v.string()),
		websiteUrl: v.optional(v.string()),
		meetingsPageUrl: v.optional(v.string()),
		platform: v.optional(platformValidator),
		scrapeConfig: scrapeConfigValidator,
		isActive: v.optional(v.boolean()),
		isVerified: v.optional(v.boolean()),
	},
	handler: async (ctx, args) => {
		// Verify admin access
		await requireAdmin(ctx);

		const { id, ...updates } = args;

		const existing = await ctx.db.get(id);
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

		await ctx.db.patch(id, updateData);

		return id;
	},
});

async function createUniqueMunicipalitySlug(
	ctx: MutationCtx,
	baseSlug: string,
	currentId?: Id<"municipalities">,
): Promise<string> {
	let candidate = baseSlug;
	let suffix = 2;

	while (true) {
		const existing = await ctx.db
			.query("municipalities")
			.withIndex("by_slug", (q) => q.eq("slug", candidate))
			.first();

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
// any municipality's scrape status. internalMutation now.
export const updateScrapeStatus = internalMutation({
	args: {
		id: v.id("municipalities"),
		status: scrapeStatusValidator,
		error: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const existing = await ctx.db.get(args.id);
		if (!existing) {
			throw new Error("Municipality not found");
		}

		await ctx.db.patch(args.id, {
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
export const remove = mutation({
	args: {
		id: v.id("municipalities"),
	},
	handler: async (ctx, args) => {
		// Verify admin access
		await requireAdmin(ctx);

		const existing = await ctx.db.get(args.id);
		if (!existing) {
			throw new Error("Municipality not found");
		}

		// Check if there are any meetings associated
		const meetings = await ctx.db
			.query("meetings")
			.withIndex("by_municipality", (q) => q.eq("municipalityId", args.id))
			.first();

		if (meetings) {
			throw new Error(
				"Cannot delete municipality with existing meetings. Deactivate it instead.",
			);
		}

		await ctx.db.delete(args.id);
		return { deleted: true };
	},
});

// ═══════════════════════════════════════════════════════════════
// TOGGLE ACTIVE - Enable/disable a municipality (admin only)
// ═══════════════════════════════════════════════════════════════
export const toggleActive = mutation({
	args: {
		id: v.id("municipalities"),
	},
	handler: async (ctx, args) => {
		// Verify admin access
		await requireAdmin(ctx);

		const existing = await ctx.db.get(args.id);
		if (!existing) {
			throw new Error("Municipality not found");
		}

		await ctx.db.patch(args.id, {
			isActive: !existing.isActive,
			updatedAt: Date.now(),
		});

		return { isActive: !existing.isActive };
	},
});

// ═══════════════════════════════════════════════════════════════
// VERIFY - Mark a municipality as verified (admin only)
// ═══════════════════════════════════════════════════════════════
export const verify = mutation({
	args: {
		id: v.id("municipalities"),
		verified: v.boolean(),
	},
	handler: async (ctx, args) => {
		// Verify admin access
		await requireAdmin(ctx);

		const existing = await ctx.db.get(args.id);
		if (!existing) {
			throw new Error("Municipality not found");
		}

		await ctx.db.patch(args.id, {
			isVerified: args.verified,
			updatedAt: Date.now(),
		});

		return { isVerified: args.verified };
	},
});

// ═══════════════════════════════════════════════════════════════
// SET COVERAGE STATUS - Publish, pause, or unpublish public coverage
// ═══════════════════════════════════════════════════════════════
export const setCoverageStatus = mutation({
	args: {
		id: v.id("municipalities"),
		status: coverageStatusValidator,
		reason: v.optional(v.string()),
		overrideReason: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const caller = await requireAdmin(ctx);
		const existing = await ctx.db.get(args.id);
		if (!existing) {
			throw new Error("Municipality not found");
		}

		const fromStatus = getCoverageStatus(existing);
		const reason = normalizeOptionalText(args.reason);
		const overrideReason = normalizeOptionalText(args.overrideReason);
		const latestValidation =
			args.status === "published"
				? await ctx.db
						.query("scraperValidationRuns")
						.withIndex("by_municipality_created", (q) =>
							q.eq("municipalityId", args.id),
						)
						.order("desc")
						.first()
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
		await ctx.db.patch(args.id, {
			coverageStatus: args.status,
			coverageStatusUpdatedAt: now,
			coverageStatusUpdatedByUserId: caller._id,
			coverageStatusReason: reason,
			coverageStatusOverrideReason: overrideReason,
			updatedAt: now,
		});

		await ctx.db.insert("coveragePublicationEvents", {
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
export const fixState = mutation({
	args: {
		id: v.id("municipalities"),
		state: v.string(),
	},
	handler: async (ctx, args) => {
		await requireAdmin(ctx);
		validateState(args.state);

		const existing = await ctx.db.get(args.id);
		if (!existing) {
			throw new Error("Municipality not found");
		}

		await ctx.db.patch(args.id, {
			state: args.state,
			updatedAt: Date.now(),
		});

		return args.id;
	},
});

// ═══════════════════════════════════════════════════════════════
// INTERNAL: Save discovery result (used by discovery actions)
// ═══════════════════════════════════════════════════════════════
export const saveDiscoveryResult = internalMutation({
	args: {
		municipalityId: v.id("municipalities"),
		meetingsPageUrl: v.string(),
		platform: v.union(
			v.literal("granicus"),
			v.literal("civicplus"),
			v.literal("generic"),
		),
	},
	handler: async (ctx, args) => {
		await ctx.db.patch(args.municipalityId, {
			meetingsPageUrl: args.meetingsPageUrl,
			platform: args.platform,
			updatedAt: Date.now(),
		});
	},
});

// ═══════════════════════════════════════════════════════════════
// INTERNAL: Save probe result (used by probe actions)
// ═══════════════════════════════════════════════════════════════
export const saveProbeResult = internalMutation({
	args: {
		municipalityId: v.id("municipalities"),
		success: v.boolean(),
		meetingsFound: v.number(),
		activate: v.boolean(),
		error: v.optional(v.string()),
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

		await ctx.db.patch(args.municipalityId, updates);
	},
});
