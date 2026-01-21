import { mutation } from "../../_generated/server";
import { v } from "convex/values";

// Platform type for validation
const platformValidator = v.union(
  v.literal("granicus"),
  v.literal("civicplus"),
  v.literal("generic"),
  v.literal("manual")
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
  })
);

// Scrape status validator
const scrapeStatusValidator = v.union(
  v.literal("success"),
  v.literal("failed"),
  v.literal("partial")
);

// ═══════════════════════════════════════════════════════════════
// CREATE - Add a new municipality
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
    const now = Date.now();

    const id = await ctx.db.insert("municipalities", {
      name: args.name,
      state: args.state,
      county: args.county,
      population: args.population,
      timezone: args.timezone,
      websiteUrl: args.websiteUrl,
      meetingsPageUrl: args.meetingsPageUrl,
      platform: args.platform,
      scrapeConfig: args.scrapeConfig,
      isActive: args.isActive ?? true,
      isVerified: args.isVerified ?? false,
      createdAt: now,
      updatedAt: now,
    });

    return id;
  },
});

// ═══════════════════════════════════════════════════════════════
// UPDATE - Modify municipality details
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
    const { id, ...updates } = args;

    const existing = await ctx.db.get(id);
    if (!existing) {
      throw new Error("Municipality not found");
    }

    // Build update object with only provided fields
    const updateData: Record<string, unknown> = {
      updatedAt: Date.now(),
    };

    if (updates.name !== undefined) updateData.name = updates.name;
    if (updates.state !== undefined) updateData.state = updates.state;
    if (updates.county !== undefined) updateData.county = updates.county;
    if (updates.population !== undefined) updateData.population = updates.population;
    if (updates.timezone !== undefined) updateData.timezone = updates.timezone;
    if (updates.websiteUrl !== undefined) updateData.websiteUrl = updates.websiteUrl;
    if (updates.meetingsPageUrl !== undefined) updateData.meetingsPageUrl = updates.meetingsPageUrl;
    if (updates.platform !== undefined) updateData.platform = updates.platform;
    if (updates.scrapeConfig !== undefined) updateData.scrapeConfig = updates.scrapeConfig;
    if (updates.isActive !== undefined) updateData.isActive = updates.isActive;
    if (updates.isVerified !== undefined) updateData.isVerified = updates.isVerified;

    await ctx.db.patch(id, updateData);

    return id;
  },
});

// ═══════════════════════════════════════════════════════════════
// UPDATE SCRAPE STATUS - After a scrape job runs
// ═══════════════════════════════════════════════════════════════
export const updateScrapeStatus = mutation({
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
        "Cannot delete municipality with existing meetings. Deactivate it instead."
      );
    }

    await ctx.db.delete(args.id);
    return { deleted: true };
  },
});

// ═══════════════════════════════════════════════════════════════
// TOGGLE ACTIVE - Enable/disable a municipality
// ═══════════════════════════════════════════════════════════════
export const toggleActive = mutation({
  args: {
    id: v.id("municipalities"),
  },
  handler: async (ctx, args) => {
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
// VERIFY - Mark a municipality as verified
// ═══════════════════════════════════════════════════════════════
export const verify = mutation({
  args: {
    id: v.id("municipalities"),
    verified: v.boolean(),
  },
  handler: async (ctx, args) => {
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
