import { z } from "zod";
import { entityId } from "../../id";
import { privateRead } from "../../procedure";
// ═══════════════════════════════════════════════════════════════
// GET MEETING FOR PROCESSING - Get meeting with municipality data
// ═══════════════════════════════════════════════════════════════
export const getMeetingForProcessing = privateRead({
	args: {
		meetingId: entityId("meetings"),
	},
	handler: async (ctx, args) => {
		const meeting = await ctx.data.find(args.meetingId);
		if (!meeting) return null;
		const municipality = await ctx.data.find(meeting.municipalityId);
		return {
			...meeting,
			municipality,
		};
	},
});
// ═══════════════════════════════════════════════════════════════
// GET PENDING MEETINGS - Get meetings ready for processing
// ═══════════════════════════════════════════════════════════════
export const getPendingMeetings = privateRead({
	args: {
		limit: z.number().optional(),
	},
	handler: async (ctx, args) => {
		const limit = args.limit ?? 10;
		const now = Date.now();
		const meetings = await ctx.data
			.select("meetings")
			.orderBy(["status", "_creationTime", "_id"])
			.where("status", "=", "pending")
			.direction("asc")
			.all();
		// Include meetings with rawContent, uploaded documents, OR source URLs
		// that summarizeMeeting can hydrate on demand.
		return meetings
			.filter(
				(m) =>
					m.meetingDate <= now &&
					((m.rawContent && m.rawContent.length > 0) ||
						m.documentId ||
						(m.sourceUrl && m.sourceUrl.trim().length > 0)),
			)
			.slice(0, limit);
	},
});
// ═══════════════════════════════════════════════════════════════
// GET SUMMARY BY MEETING - Get the latest summary for a meeting
// ═══════════════════════════════════════════════════════════════
export const getSummaryByMeeting = privateRead({
	args: {
		meetingId: entityId("meetings"),
	},
	handler: async (ctx, args) => {
		return await ctx.data
			.select("summaries")
			.orderBy(["meetingId", "_creationTime", "_id"])
			.where("meetingId", "=", args.meetingId)
			.one();
	},
});
// ═══════════════════════════════════════════════════════════════
// GET PROCESSING STATS - Stats on meeting processing
// ═══════════════════════════════════════════════════════════════
export const getProcessingStats = privateRead({
	args: {},
	handler: async (ctx) => {
		const allMeetings = await ctx.data.select("meetings").all();
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
