import { v } from "convex/values";
import { internalQuery } from "../../_generated/server";

// ═══════════════════════════════════════════════════════════════
// GET MEETING FOR PROCESSING - Get meeting with municipality data
// ═══════════════════════════════════════════════════════════════
export const getMeetingForProcessing = internalQuery({
	args: {
		meetingId: v.id("meetings"),
	},
	handler: async (ctx, args) => {
		const meeting = await ctx.db.get(args.meetingId);
		if (!meeting) return null;

		const municipality = await ctx.db.get(meeting.municipalityId);

		return {
			...meeting,
			municipality,
		};
	},
});

// ═══════════════════════════════════════════════════════════════
// GET PENDING MEETINGS - Get meetings ready for processing
// ═══════════════════════════════════════════════════════════════
export const getPendingMeetings = internalQuery({
	args: {
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const limit = args.limit ?? 10;

		const meetings = await ctx.db
			.query("meetings")
			.withIndex("by_status", (q) => q.eq("status", "pending"))
			.order("asc")
			.take(limit);

		// Include meetings with rawContent OR documentStorageId (PDF to extract)
		return meetings.filter(
			(m) => (m.rawContent && m.rawContent.length > 0) || m.documentStorageId,
		);
	},
});

// ═══════════════════════════════════════════════════════════════
// GET SUMMARY BY MEETING - Get the latest summary for a meeting
// ═══════════════════════════════════════════════════════════════
export const getSummaryByMeeting = internalQuery({
	args: {
		meetingId: v.id("meetings"),
	},
	handler: async (ctx, args) => {
		return await ctx.db
			.query("summaries")
			.withIndex("by_meeting", (q) => q.eq("meetingId", args.meetingId))
			.first();
	},
});

// ═══════════════════════════════════════════════════════════════
// GET PROCESSING STATS - Stats on meeting processing
// ═══════════════════════════════════════════════════════════════
export const getProcessingStats = internalQuery({
	args: {},
	handler: async (ctx) => {
		const allMeetings = await ctx.db.query("meetings").collect();

		const stats = {
			total: allMeetings.length,
			pending: 0,
			processing: 0,
			summarized: 0,
			failed: 0,
			skipped: 0,
		};

		for (const meeting of allMeetings) {
			stats[meeting.status]++;
		}

		return stats;
	},
});
