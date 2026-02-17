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

// ═══════════════════════════════════════════════════════════════
// ADMIN INVESTIGATE MUNICIPALITY - Coverage + requeue diagnostics
// ═══════════════════════════════════════════════════════════════
export const adminInvestigateMunicipality = query({
	args: {
		requestingWorkosUserId: v.string(),
		municipalityId: v.id("municipalities"),
		sampleLimit: v.optional(v.number()),
		staleProcessingMinutes: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const staleMinutes = Math.max(
			1,
			Math.min(args.staleProcessingMinutes ?? 10, 24 * 60),
		);
		const staleProcessingCutoffMs = Date.now() - staleMinutes * 60 * 1000;

		const caller = await ctx.db
			.query("users")
			.withIndex("by_workos_id", (q) =>
				q.eq("workosUserId", args.requestingWorkosUserId),
			)
			.first();

		if (!caller?.isAdmin) {
			return null;
		}

		const municipality = await ctx.db.get(args.municipalityId);
		if (!municipality) {
			return null;
		}

		const sampleLimit = Math.max(1, Math.min(args.sampleLimit ?? 30, 200));
		const latestScrapeJob = await ctx.db
			.query("scrapeJobs")
			.withIndex("by_municipality", (q) =>
				q.eq("municipalityId", args.municipalityId),
			)
			.order("desc")
			.first();
		const meetings = await ctx.db
			.query("meetings")
			.withIndex("by_municipality_date", (q) =>
				q.eq("municipalityId", args.municipalityId),
			)
			.order("desc")
			.collect();

		const enriched = await Promise.all(
			meetings.map(async (meeting) => {
				const summary = await ctx.db
					.query("summaries")
					.withIndex("by_meeting", (q) => q.eq("meetingId", meeting._id))
					.first();

				const hasSummary = Boolean(summary);
				const hasRawContent = Boolean(
					meeting.rawContent && meeting.rawContent.trim().length > 0,
				);
				const sourceUrl = meeting.sourceUrl ?? "";
				const meetingsPageUrl = municipality.meetingsPageUrl;
				const sourceEqualsMeetingsPage =
					Boolean(sourceUrl) && meetingsPageUrl
						? normalizeUrl(sourceUrl) === normalizeUrl(meetingsPageUrl)
						: false;
				const documentLikeSource = isLikelyDocumentUrl(sourceUrl);
				const isStaleProcessing =
					meeting.status === "processing" &&
					(meeting.updatedAt ?? meeting.createdAt) < staleProcessingCutoffMs;

				const isRequeueCandidate =
					!hasSummary &&
					(meeting.status === "failed" ||
						meeting.status === "skipped" ||
						isStaleProcessing) &&
					Boolean(sourceUrl) &&
					(documentLikeSource || !sourceEqualsMeetingsPage);

				return {
					meeting,
					hasSummary,
					hasRawContent,
					sourceEqualsMeetingsPage,
					documentLikeSource,
					isStaleProcessing,
					isRequeueCandidate,
				};
			}),
		);

		const statusCounts = {
			pending: 0,
			processing: 0,
			summarized: 0,
			failed: 0,
			skipped: 0,
			staleProcessing: 0,
			activeProcessing: 0,
		};

		for (const item of enriched) {
			statusCounts[item.meeting.status]++;
			if (item.isStaleProcessing) {
				statusCounts.staleProcessing++;
			}
		}
		statusCounts.activeProcessing =
			statusCounts.processing - statusCounts.staleProcessing;

		const noSummary = enriched.filter((item) => !item.hasSummary);
		const failed = enriched.filter((item) => item.meeting.status === "failed");
		const skipped = enriched.filter(
			(item) => item.meeting.status === "skipped",
		);
		const requeueCandidates = enriched.filter(
			(item) => item.isRequeueCandidate,
		);
		const staleProcessing = enriched.filter((item) => item.isStaleProcessing);
		const sourceEqualsMeetingsPage = enriched.filter(
			(item) => item.sourceEqualsMeetingsPage,
		);
		const docLikeSource = enriched.filter((item) => item.documentLikeSource);
		const withRawContent = enriched.filter((item) => item.hasRawContent);
		const withSummary = enriched.filter((item) => item.hasSummary);

		const sample = (items: typeof enriched) =>
			items.slice(0, sampleLimit).map((item) => ({
				id: item.meeting._id,
				title: item.meeting.title,
				status: item.meeting.status,
				meetingDate: item.meeting.meetingDate,
				sourceUrl: item.meeting.sourceUrl ?? null,
				processingError: item.meeting.processingError ?? null,
				hasSummary: item.hasSummary,
				hasRawContent: item.hasRawContent,
				isStaleProcessing: item.isStaleProcessing,
				diagnosis: diagnoseMeeting({
					sourceUrl: item.meeting.sourceUrl ?? null,
					meetingsPageUrl: municipality.meetingsPageUrl ?? null,
					processingError: item.meeting.processingError ?? null,
					hasRawContent: item.hasRawContent,
					hasSummary: item.hasSummary,
					status: item.meeting.status,
					sourceEqualsMeetingsPage: item.sourceEqualsMeetingsPage,
					documentLikeSource: item.documentLikeSource,
				}),
			}));

		const scrapeStatusFromJob = latestScrapeJob
			? mapJobStatusToScrapeStatus(latestScrapeJob.status)
			: null;
		const latestScrapeAt =
			latestScrapeJob?.completedAt ??
			latestScrapeJob?.startedAt ??
			latestScrapeJob?.createdAt ??
			municipality.lastScrapedAt ??
			null;
		const scrapeStatus =
			scrapeStatusFromJob ?? municipality.lastScrapeStatus ?? null;
		const scrapeStatusSource = latestScrapeJob ? "job" : "municipality";

		const healthStatus =
			withSummary.length === 0 && meetings.length > 0
				? "no_summaries"
				: statusCounts.staleProcessing > 0
					? "stale_processing"
					: statusCounts.failed > 0
						? "failing"
						: "healthy";

		return {
			municipality: {
				id: municipality._id,
				name: municipality.name,
				state: municipality.state,
				platform: municipality.platform,
				meetingsPageUrl: municipality.meetingsPageUrl ?? null,
				lastScrapedAt: latestScrapeAt,
				lastScrapeStatus: scrapeStatus,
				lastScrapeStatusSource: scrapeStatusSource,
				lastScrapeError: municipality.lastScrapeError ?? null,
				latestScrapeJob: latestScrapeJob
					? {
							id: latestScrapeJob._id,
							status: latestScrapeJob.status,
							startedAt: latestScrapeJob.startedAt ?? null,
							completedAt: latestScrapeJob.completedAt ?? null,
							meetingsFound: latestScrapeJob.meetingsFound ?? 0,
							meetingsCreated: latestScrapeJob.meetingsCreated ?? 0,
							meetingsFailed: latestScrapeJob.meetingsFailed ?? 0,
						}
					: null,
			},
			totals: {
				meetings: meetings.length,
				summaries: withSummary.length,
				withRawContent: withRawContent.length,
				documentLikeSource: docLikeSource.length,
				sourceEqualsMeetingsPage: sourceEqualsMeetingsPage.length,
				requeueCandidates: requeueCandidates.length,
			},
			statuses: statusCounts,
			health: {
				status: healthStatus,
				staleMinutes,
			},
			coverage: {
				summaryPct: percent(withSummary.length, meetings.length),
				rawContentPct: percent(withRawContent.length, meetings.length),
				documentLikeSourcePct: percent(docLikeSource.length, meetings.length),
				noSummaryPct: percent(noSummary.length, meetings.length),
			},
			samples: {
				requeueCandidates: sample(requeueCandidates),
				noSummary: sample(noSummary),
				failed: sample(failed),
				skipped: sample(skipped),
				staleProcessing: sample(staleProcessing),
				sourceEqualsMeetingsPage: sample(sourceEqualsMeetingsPage),
			},
		};
	},
});

function mapJobStatusToScrapeStatus(
	status: "pending" | "running" | "completed" | "failed" | "partial",
) {
	if (status === "completed") return "success";
	if (status === "failed") return "failed";
	if (status === "partial") return "partial";
	return null;
}

function percent(part: number, total: number): number {
	if (total === 0) return 0;
	return Math.round((part / total) * 1000) / 10;
}

function normalizeUrl(url: string): string {
	try {
		const parsed = new URL(url);
		const path = parsed.pathname.replace(/\/+$/, "") || "/";
		return `${parsed.protocol}//${parsed.host.toLowerCase()}${path}${parsed.search}`;
	} catch {
		return url.toLowerCase().trim();
	}
}

function isLikelyDocumentUrl(url: string): boolean {
	return (
		/\.pdf(\?|#|$)/i.test(url) ||
		/\/ViewFile/i.test(url) ||
		/\/View\.ashx/i.test(url)
	);
}

// ═══════════════════════════════════════════════════════════════
// DIAGNOSIS - Classify why a meeting failed and what to build next
// ═══════════════════════════════════════════════════════════════

// Severity describes what's needed to fix — not whether it's possible.
//   requeue      → just retry, should work now
//   investigate  → human needs to check the URL to determine next step
//   needs_feature → we know what capability to build (OCR, headless, etc.)

interface Diagnosis {
	code: string;
	label: string;
	severity: "requeue" | "investigate" | "needs_feature";
	featureNeeded: string | null;
	description: string;
	investigationSteps: string[];
	investigationUrls: Array<{ label: string; url: string }>;
}

function diagnoseMeeting(args: {
	sourceUrl: string | null;
	meetingsPageUrl: string | null;
	processingError: string | null;
	hasRawContent: boolean;
	hasSummary: boolean;
	status: string;
	sourceEqualsMeetingsPage: boolean;
	documentLikeSource: boolean;
}): Diagnosis | null {
	// Already summarized — no diagnosis needed
	if (args.hasSummary && args.status === "summarized") return null;

	// Still pending/processing — not a failure yet
	if (args.status === "pending" || args.status === "processing") return null;

	const err = args.processingError ?? "";

	// No source URL at all
	if (!args.sourceUrl) {
		return {
			code: "no_source",
			label: "No Source",
			severity: "needs_feature",
			featureNeeded: "URL Discovery",
			description:
				"Meeting was created without a source URL or document. We need to find the specific meeting link on the municipality's website.",
			investigationSteps: [
				"Open the meetings page and search for this meeting by title/date.",
				"Once found, copy the meeting-specific URL (detail page or PDF link).",
				"Update the sourceUrl in the database, then requeue.",
			],
			investigationUrls: args.meetingsPageUrl
				? [{ label: "Meetings page", url: args.meetingsPageUrl }]
				: [],
		};
	}

	// Source URL = listings page
	if (args.sourceEqualsMeetingsPage) {
		return {
			code: "listing_page",
			label: "Needs Deep Scrape",
			severity: "needs_feature",
			featureNeeded: "Deep Link Extraction",
			description:
				"Source URL points to the listings page, not a specific meeting. The scraper found the title/date but couldn't extract a detail link. We need to improve link extraction for this site's layout.",
			investigationSteps: [
				"Open the meetings page below and identify how individual meeting links work.",
				"Check: Are links visible in the HTML source? Or do they require JavaScript (click-to-expand, AJAX load)?",
				"If links are in the HTML, the scraper selectors need updating for this site's DOM structure.",
				"If content is loaded via JS, this site needs the headless browser scraper.",
			],
			investigationUrls: [
				{ label: "Meetings page", url: args.sourceUrl },
			],
		};
	}

	// Password-protected PDF
	if (err.includes("password")) {
		return {
			code: "password_protected",
			label: "Needs Password",
			severity: "needs_feature",
			featureNeeded: "PDF Password Handling",
			description:
				"The PDF is password-protected. Some municipalities use a publicly posted or default password. We need to add password support to the PDF extractor.",
			investigationSteps: [
				"Open the PDF below and confirm it requires a password.",
				"Search the municipality website for a posted password (often in an FAQ or meetings instructions page).",
				"If a password is found, we can add it to the municipality's scrape config.",
				"Check if there's an unprotected alternative (HTML minutes, separate Word doc).",
			],
			investigationUrls: [{ label: "PDF document", url: args.sourceUrl }],
		};
	}

	// Image-only PDF
	if (err.includes("image-only") || err.includes("insufficient text")) {
		return {
			code: "image_pdf",
			label: "Needs OCR",
			severity: "needs_feature",
			featureNeeded: "OCR Pipeline",
			description:
				"The PDF is scanned/image-only with no selectable text. Adding an OCR step (e.g., Tesseract or a cloud OCR service) to the pipeline would handle these.",
			investigationSteps: [
				"Open the PDF below to confirm it's a scanned image (text not selectable).",
				"Check if the municipality also publishes text-based minutes (HTML page, Word doc) as an alternative source.",
				"If this pattern is common for this municipality, flag it for the OCR feature build.",
			],
			investigationUrls: [{ label: "PDF document", url: args.sourceUrl }],
		};
	}

	// Fetch failure
	if (
		err.includes("Failed to load source URL") ||
		err.includes("Failed to download") ||
		err.includes("fetch") ||
		err.includes("ECONNREFUSED") ||
		err.includes("ENOTFOUND")
	) {
		const statusMatch = err.match(/\((\d{3})\)/);
		const statusCode = statusMatch ? Number(statusMatch[1]) : 0;
		const statusHint = statusCode ? ` (HTTP ${statusCode})` : "";

		// 403/401 specifically suggest bot blocking or auth
		if (statusCode === 403 || statusCode === 401) {
			return {
				code: "fetch_blocked",
				label: "Blocked",
				severity: "needs_feature",
				featureNeeded: "Request Bypass / Auth",
				description: `Source URL returned ${statusCode}. The site is blocking automated requests or requires authentication. We need to add request rotation, browser-like headers, or session handling.`,
				investigationSteps: [
					"Open the URL below in a browser to confirm it loads for humans.",
					"Check if it requires a login or CAPTCHA.",
					"If it loads fine, the site likely blocks server-side User-Agents — try with browser-like headers or a headless browser.",
				],
				investigationUrls: [{ label: "Source URL", url: args.sourceUrl }],
			};
		}

		return {
			code: "fetch_failed",
			label: `Fetch Failed${statusHint}`,
			severity: "investigate",
			featureNeeded: null,
			description: `Could not download content from the source URL${statusHint}. The page may be down, moved, or temporarily unavailable.`,
			investigationSteps: [
				"Open the URL below in a browser to check if it loads.",
				"If it returns 404, the URL may be stale — check if the municipality moved their content.",
				"If it's temporarily down, requeue later.",
				"If the site loads fine, it may be blocking server requests — check response headers.",
			],
			investigationUrls: [{ label: "Source URL", url: args.sourceUrl }],
		};
	}

	// PDF source that hasn't been extracted yet
	if (args.documentLikeSource && !args.hasRawContent) {
		return {
			code: "pdf_pending",
			label: "PDF - Requeue",
			severity: "requeue",
			featureNeeded: null,
			description:
				"Source is a PDF document. Previous extraction likely failed due to the old pdf-parse library bug. Should succeed now with the new unpdf extractor.",
			investigationSteps: [
				"Click Requeue to retry with the fixed PDF extractor.",
				"If it fails again, open the PDF to check if it's valid and has selectable text.",
			],
			investigationUrls: [{ label: "PDF document", url: args.sourceUrl }],
		};
	}

	// HTML source with no/thin content
	if (!args.documentLikeSource && !args.hasRawContent) {
		return {
			code: "html_thin",
			label: "Thin Content",
			severity: "investigate",
			featureNeeded: null,
			description:
				"Source URL returned HTML but the extracted text was under 100 characters. The page may use JavaScript rendering, be behind a login, or have content in a non-standard layout.",
			investigationSteps: [
				"Open the URL below in a browser and check if meeting content is visible.",
				"Right-click → View Page Source. Is the content in the raw HTML, or does it load via JavaScript?",
				"If content is visible but not in page source: needs headless browser scraper.",
				"If content is in the HTML source: the extraction selectors need tuning for this site's layout.",
				"If the page is mostly empty or navigation: the URL may not be the right meeting detail page.",
			],
			investigationUrls: [{ label: "Source URL", url: args.sourceUrl }],
		};
	}

	// Has content but still failed (AI/parsing error)
	if (args.hasRawContent && !args.hasSummary) {
		return {
			code: "ai_failure",
			label: "AI Error",
			severity: "requeue",
			featureNeeded: null,
			description:
				"Content was extracted successfully but AI summarization failed. Usually transient (API timeout, rate limit, malformed response).",
			investigationSteps: [
				"Click Requeue to retry AI summarization.",
				"If it fails repeatedly, check the Convex logs for the specific API error.",
				"If the content is very short or not English, the AI prompt may need adjustment.",
			],
			investigationUrls: [{ label: "Source URL", url: args.sourceUrl }],
		};
	}

	// Fallback
	return {
		code: "unknown",
		label: "Unknown",
		severity: "investigate",
		featureNeeded: null,
		description: err || "No error details available. Check Convex logs for this meeting ID.",
		investigationSteps: [
			"Check the Convex dashboard logs for this meeting ID.",
			"Open the source URL below to inspect what the page returns.",
			"Once you identify the pattern, we can add a specific handler for it.",
		],
		investigationUrls: args.sourceUrl
			? [{ label: "Source URL", url: args.sourceUrl }]
			: [],
	};
}
