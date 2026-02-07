import { v } from "convex/values";
import { query } from "../../_generated/server";

// Meeting type validator
const meetingTypeValidator = v.union(
	v.literal("city_council"),
	v.literal("school_board"),
	v.literal("planning_commission"),
	v.literal("zoning_board"),
	v.literal("budget_committee"),
	v.literal("other"),
);

// ═══════════════════════════════════════════════════════════════
// LIST BY MUNICIPALITY - With filters and pagination
// ═══════════════════════════════════════════════════════════════
export const listByMunicipality = query({
	args: {
		municipalityId: v.id("municipalities"),
		meetingType: v.optional(meetingTypeValidator),
		status: v.optional(
			v.union(
				v.literal("pending"),
				v.literal("processing"),
				v.literal("summarized"),
				v.literal("failed"),
				v.literal("skipped"),
			),
		),
		startDate: v.optional(v.number()),
		endDate: v.optional(v.number()),
		limit: v.optional(v.number()),
		cursor: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const limit = args.limit ?? 10;

		// Get meetings for this municipality, ordered by date descending
		let meetings = await ctx.db
			.query("meetings")
			.withIndex("by_municipality_date", (q) =>
				q.eq("municipalityId", args.municipalityId),
			)
			.order("desc")
			.collect();

		// Apply filters
		if (args.meetingType) {
			meetings = meetings.filter((m) => m.meetingType === args.meetingType);
		}

		if (args.status) {
			meetings = meetings.filter((m) => m.status === args.status);
		}

		if (args.startDate) {
			const startDate = args.startDate;
			meetings = meetings.filter((m) => m.meetingDate >= startDate);
		}

		if (args.endDate) {
			const endDate = args.endDate;
			meetings = meetings.filter((m) => m.meetingDate <= endDate);
		}

		// Handle cursor-based pagination
		let startIndex = 0;
		if (args.cursor) {
			const cursorIndex = meetings.findIndex((m) => m._id === args.cursor);
			if (cursorIndex !== -1) {
				startIndex = cursorIndex + 1;
			}
		}

		// Get page of meetings
		const pageMeetings = meetings.slice(startIndex, startIndex + limit);
		const hasMore = startIndex + limit < meetings.length;
		const nextCursor = hasMore
			? pageMeetings[pageMeetings.length - 1]?._id
			: null;

		// Get summaries for these meetings
		const meetingsWithSummaries = await Promise.all(
			pageMeetings.map(async (meeting) => {
				const summary = await ctx.db
					.query("summaries")
					.withIndex("by_meeting", (q) => q.eq("meetingId", meeting._id))
					.first();
				return { ...meeting, summary };
			}),
		);

		return {
			meetings: meetingsWithSummaries,
			nextCursor,
			hasMore,
			totalCount: meetings.length,
		};
	},
});

// ═══════════════════════════════════════════════════════════════
// GET - Single meeting by ID
// ═══════════════════════════════════════════════════════════════
export const get = query({
	args: {
		id: v.id("meetings"),
	},
	handler: async (ctx, args) => {
		return await ctx.db.get(args.id);
	},
});

// ═══════════════════════════════════════════════════════════════
// GET WITH SUMMARY - Meeting with its summary
// ═══════════════════════════════════════════════════════════════
export const getWithSummary = query({
	args: {
		id: v.id("meetings"),
	},
	handler: async (ctx, args) => {
		const meeting = await ctx.db.get(args.id);
		if (!meeting) return null;

		const summary = await ctx.db
			.query("summaries")
			.withIndex("by_meeting", (q) => q.eq("meetingId", args.id))
			.first();

		const municipality = await ctx.db.get(meeting.municipalityId);

		return {
			...meeting,
			summary,
			municipality,
		};
	},
});

// ═══════════════════════════════════════════════════════════════
// GET RECENT - Recent meetings across all municipalities
// ═══════════════════════════════════════════════════════════════
export const getRecent = query({
	args: {
		limit: v.optional(v.number()),
		summarizedOnly: v.optional(v.boolean()),
	},
	handler: async (ctx, args) => {
		const limit = args.limit ?? 10;

		let meetings = await ctx.db
			.query("meetings")
			.withIndex("by_date")
			.order("desc")
			.collect();

		// Filter to summarized only if requested
		if (args.summarizedOnly) {
			meetings = meetings.filter((m) => m.status === "summarized");
		}

		// Take limit
		meetings = meetings.slice(0, limit);

		// Get summaries and municipalities
		const meetingsWithDetails = await Promise.all(
			meetings.map(async (meeting) => {
				const [summary, municipality] = await Promise.all([
					ctx.db
						.query("summaries")
						.withIndex("by_meeting", (q) => q.eq("meetingId", meeting._id))
						.first(),
					ctx.db.get(meeting.municipalityId),
				]);
				return { ...meeting, summary, municipality };
			}),
		);

		return meetingsWithDetails;
	},
});

// ═══════════════════════════════════════════════════════════════
// COUNT BY MUNICIPALITY - Get meeting count for a municipality
// ═══════════════════════════════════════════════════════════════
export const countByMunicipality = query({
	args: {
		municipalityId: v.id("municipalities"),
	},
	handler: async (ctx, args) => {
		const meetings = await ctx.db
			.query("meetings")
			.withIndex("by_municipality", (q) =>
				q.eq("municipalityId", args.municipalityId),
			)
			.collect();

		return meetings.length;
	},
});

// ═══════════════════════════════════════════════════════════════
// GET MEETING TYPES - Distinct meeting types for a municipality
// ═══════════════════════════════════════════════════════════════
export const getMeetingTypes = query({
	args: {
		municipalityId: v.id("municipalities"),
	},
	handler: async (ctx, args) => {
		const meetings = await ctx.db
			.query("meetings")
			.withIndex("by_municipality", (q) =>
				q.eq("municipalityId", args.municipalityId),
			)
			.collect();

		const types = new Set(meetings.map((m) => m.meetingType));
		return Array.from(types);
	},
});

// ═══════════════════════════════════════════════════════════════
// FIND BY SOURCE URL - Check for duplicate scraped content
// ═══════════════════════════════════════════════════════════════
export const findBySourceUrl = query({
	args: {
		sourceUrl: v.string(),
		municipalityId: v.optional(v.id("municipalities")),
	},
	handler: async (ctx, args) => {
		// Get all meetings and filter by sourceUrl
		// Note: Could add an index on sourceUrl if this query is slow
		let meetings = await ctx.db.query("meetings").collect();

		meetings = meetings.filter((m) => m.sourceUrl === args.sourceUrl);

		if (args.municipalityId) {
			meetings = meetings.filter(
				(m) => m.municipalityId === args.municipalityId,
			);
		}

		return meetings[0] ?? null;
	},
});

// ═══════════════════════════════════════════════════════════════
// FIND BY CONTENT HASH - Check for duplicate content
// ═══════════════════════════════════════════════════════════════
export const findByContentHash = query({
	args: {
		contentHash: v.string(),
		municipalityId: v.optional(v.id("municipalities")),
	},
	handler: async (ctx, args) => {
		// Use the content hash index
		const meetings = await ctx.db
			.query("meetings")
			.withIndex("by_content_hash", (q) =>
				q.eq("contentHash", args.contentHash),
			)
			.collect();

		if (args.municipalityId) {
			const filtered = meetings.filter(
				(m) => m.municipalityId === args.municipalityId,
			);
			return filtered[0] ?? null;
		}

		return meetings[0] ?? null;
	},
});

// ═══════════════════════════════════════════════════════════════
// LIST PENDING - Meetings awaiting processing
// ═══════════════════════════════════════════════════════════════
export const listPending = query({
	args: {
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const limit = args.limit ?? 50;

		const meetings = await ctx.db
			.query("meetings")
			.withIndex("by_status", (q) => q.eq("status", "pending"))
			.order("asc")
			.take(limit);

		return meetings;
	},
});
