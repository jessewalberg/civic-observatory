import { query } from "../../_generated/server";
import { v } from "convex/values";

// ═══════════════════════════════════════════════════════════════
// LIST - All municipalities with optional state filter
// ═══════════════════════════════════════════════════════════════
export const list = query({
  args: {
    state: v.optional(v.string()),
    activeOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    let municipalities;

    // Filter by state if provided
    if (args.state) {
      municipalities = await ctx.db
        .query("municipalities")
        .withIndex("by_state", (q) => q.eq("state", args.state!))
        .collect();
    } else {
      municipalities = await ctx.db.query("municipalities").collect();
    }

    // Filter by active status if requested
    if (args.activeOnly) {
      municipalities = municipalities.filter((m) => m.isActive);
    }

    // Sort by name
    return municipalities.sort((a, b) => a.name.localeCompare(b.name));
  },
});

// ═══════════════════════════════════════════════════════════════
// GET - Single municipality by ID
// ═══════════════════════════════════════════════════════════════
export const get = query({
  args: {
    id: v.id("municipalities"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

// ═══════════════════════════════════════════════════════════════
// GET WITH MEETINGS - Municipality with recent meetings
// ═══════════════════════════════════════════════════════════════
export const getWithMeetings = query({
  args: {
    id: v.id("municipalities"),
    meetingLimit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const municipality = await ctx.db.get(args.id);
    if (!municipality) return null;

    const limit = args.meetingLimit ?? 10;

    // Get recent meetings for this municipality
    const meetings = await ctx.db
      .query("meetings")
      .withIndex("by_municipality_date", (q) =>
        q.eq("municipalityId", args.id)
      )
      .order("desc")
      .take(limit);

    // Get summaries for these meetings
    const meetingsWithSummaries = await Promise.all(
      meetings.map(async (meeting) => {
        const summary = await ctx.db
          .query("summaries")
          .withIndex("by_meeting", (q) => q.eq("meetingId", meeting._id))
          .first();
        return { ...meeting, summary };
      })
    );

    return {
      ...municipality,
      meetings: meetingsWithSummaries,
    };
  },
});

// ═══════════════════════════════════════════════════════════════
// SEARCH - Full-text search by name
// ═══════════════════════════════════════════════════════════════
export const search = query({
  args: {
    query: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    if (!args.query.trim()) {
      return [];
    }

    const limit = args.limit ?? 10;

    const results = await ctx.db
      .query("municipalities")
      .withSearchIndex("search_name", (q) => q.search("name", args.query))
      .take(limit);

    return results;
  },
});

// ═══════════════════════════════════════════════════════════════
// LIST BY STATE - Grouped by state for browse UI
// ═══════════════════════════════════════════════════════════════
export const listByState = query({
  args: {
    activeOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    let municipalities = await ctx.db.query("municipalities").collect();

    // Filter by active status if requested
    if (args.activeOnly) {
      municipalities = municipalities.filter((m) => m.isActive);
    }

    // Group by state
    const byState: Record<
      string,
      Array<{
        _id: typeof municipalities[0]["_id"];
        name: string;
        county: string | undefined;
        population: number | undefined;
        isVerified: boolean;
      }>
    > = {};

    for (const muni of municipalities) {
      if (!byState[muni.state]) {
        byState[muni.state] = [];
      }
      byState[muni.state].push({
        _id: muni._id,
        name: muni.name,
        county: muni.county,
        population: muni.population,
        isVerified: muni.isVerified,
      });
    }

    // Sort municipalities within each state
    for (const state of Object.keys(byState)) {
      byState[state].sort((a, b) => a.name.localeCompare(b.name));
    }

    // Convert to sorted array of states
    return Object.entries(byState)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([state, municipalities]) => ({
        state,
        municipalities,
        count: municipalities.length,
      }));
  },
});

// ═══════════════════════════════════════════════════════════════
// LIST DUE FOR SCRAPE - For cron job scheduler
// ═══════════════════════════════════════════════════════════════
export const listDueForScrape = query({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    // Get all active municipalities that are not manual-only
    const municipalities = await ctx.db
      .query("municipalities")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .collect();

    // Filter to those due for scraping
    return municipalities.filter((muni) => {
      // Skip manual-only municipalities
      if (muni.platform === "manual") return false;

      // If never scraped, it's due
      if (!muni.lastScrapedAt) return true;

      // Check if enough time has passed since last scrape
      const frequencyMs = (muni.scrapeConfig?.frequencyHours ?? 24) * 60 * 60 * 1000;
      return now - muni.lastScrapedAt >= frequencyMs;
    });
  },
});

// ═══════════════════════════════════════════════════════════════
// GET STATS - Statistics for a municipality
// ═══════════════════════════════════════════════════════════════
export const getStats = query({
  args: {
    id: v.id("municipalities"),
  },
  handler: async (ctx, args) => {
    const municipality = await ctx.db.get(args.id);
    if (!municipality) return null;

    // Count meetings
    const meetings = await ctx.db
      .query("meetings")
      .withIndex("by_municipality", (q) => q.eq("municipalityId", args.id))
      .collect();

    // Count by status
    const byStatus = {
      pending: 0,
      processing: 0,
      summarized: 0,
      failed: 0,
      skipped: 0,
    };

    for (const meeting of meetings) {
      byStatus[meeting.status]++;
    }

    // Get date range
    const dates = meetings.map((m) => m.meetingDate).sort((a, b) => a - b);

    return {
      totalMeetings: meetings.length,
      byStatus,
      oldestMeeting: dates[0] ?? null,
      newestMeeting: dates[dates.length - 1] ?? null,
      lastScrapedAt: municipality.lastScrapedAt ?? null,
      lastScrapeStatus: municipality.lastScrapeStatus ?? null,
    };
  },
});
