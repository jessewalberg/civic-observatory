"use node";

import { v } from "convex/values";
import { internal } from "../../_generated/api";
import { internalAction } from "../../_generated/server";
import { extractText } from "unpdf";
import { htmlToText, normalizeUrl } from "../../scrapers/utils";
import { ocrPdf } from "./ocrPdf";

// Id type used in inline type annotations

const MAX_CONTENT_LENGTH = 45000;
const MIN_EXTRACTED_CONTENT_LENGTH = 100;

// ═══════════════════════════════════════════════════════════════
// SUMMARIZE MEETING - Main action to process a meeting
// ═══════════════════════════════════════════════════════════════
export const summarizeMeeting = internalAction({
	args: {
		meetingId: v.id("meetings"),
	},
	handler: async (ctx, args): Promise<{ success: boolean; error?: string }> => {
		const startTime = Date.now();

		try {
			// 1. Update status to processing
			await ctx.runMutation(
				internal.functions.ai.mutations.updateMeetingStatus,
				{
					meetingId: args.meetingId,
					status: "processing",
				},
			);

			// 2. Get meeting with municipality
			let meeting = await ctx.runQuery(
				internal.functions.ai.queries.getMeetingForProcessing,
				{
					meetingId: args.meetingId,
				},
			);

			if (!meeting) {
				throw new Error("Meeting not found");
			}

			// 2a. If no rawContent but has document, try to extract
			if (!meeting.rawContent && meeting.documentStorageId) {
				const extractResult = await ctx.runAction(
					internal.functions.ai.extractPdf.extractPdf,
					{ meetingId: args.meetingId },
				);

				if (!extractResult.success) {
					throw new Error(
						extractResult.error ?? "Failed to extract document content",
					);
				}

				// Re-fetch meeting with updated content
				meeting = await ctx.runQuery(
					internal.functions.ai.queries.getMeetingForProcessing,
					{
						meetingId: args.meetingId,
					},
				);

				if (!meeting) {
					throw new Error("Meeting not found after extraction");
				}
			}

			// 2b. If still no content, try hydrating from the stored source URL.
			if (!meeting.rawContent && meeting.sourceUrl) {
				const hydratedContent = await hydrateContentFromSourceUrl({
					sourceUrl: meeting.sourceUrl,
					meetingsPageUrl: meeting.municipality?.meetingsPageUrl,
				});

				if (hydratedContent) {
					await ctx.runMutation(
						internal.functions.ai.mutations.updateMeetingContent,
						{
							meetingId: args.meetingId,
							rawContent: hydratedContent,
						},
					);

					meeting = await ctx.runQuery(
						internal.functions.ai.queries.getMeetingForProcessing,
						{
							meetingId: args.meetingId,
						},
					);

					if (!meeting) {
						throw new Error(
							"Meeting not found after source URL hydration",
						);
					}
				}
			}

			if (!meeting || !meeting.rawContent) {
				throw new Error("Meeting has no content to summarize");
			}

			// 3. Build the prompt
			const prompt = buildPrompt({
				title: meeting.title,
				municipalityName: meeting.municipality?.name ?? "Unknown Municipality",
				state: meeting.municipality?.state ?? "Unknown State",
				meetingType: meeting.meetingType,
				date: new Date(meeting.meetingDate).toLocaleDateString("en-US", {
					weekday: "long",
					year: "numeric",
					month: "long",
					day: "numeric",
				}),
				meetingDateMs: meeting.meetingDate,
				content: meeting.rawContent,
			});

			// 4. Call OpenRouter API
			const apiKey = process.env.OPENROUTER_API_KEY;
			if (!apiKey) {
				throw new Error("OPENROUTER_API_KEY is not configured");
			}

			const response = await callOpenRouterAPI(apiKey, prompt);

			// 5. Parse and validate the response
			const summary = parseAndValidateSummary(response);

			// 6. Create the summary record
			const processingTimeMs = Date.now() - startTime;

			await ctx.runMutation(internal.functions.ai.mutations.createSummary, {
				meetingId: args.meetingId,
				summary: {
					...summary,
					modelUsed: "anthropic/claude-sonnet-4",
					promptVersion: "1.0",
					processingTimeMs,
				},
			});

			// 7. Update meeting status to summarized
			await ctx.runMutation(
				internal.functions.ai.mutations.updateMeetingStatus,
				{
					meetingId: args.meetingId,
					status: "summarized",
				},
			);

			// 8. Get the summary ID and trigger alert generation
			const savedSummary = await ctx.runQuery(
				internal.functions.ai.queries.getSummaryByMeeting,
				{
					meetingId: args.meetingId,
				},
			);

			if (savedSummary) {
				await ctx.runMutation(
					internal.functions.alerts.mutations.generateAlerts,
					{
						summaryId: savedSummary._id,
						meetingId: args.meetingId,
					},
				);
			}

			return { success: true };
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : "Unknown error";

			// Update meeting status to failed
			try {
				await ctx.runMutation(
					internal.functions.ai.mutations.updateMeetingStatus,
					{
						meetingId: args.meetingId,
						status: "failed",
						error: errorMessage,
					},
				);
			} catch {
				// Ignore error in error handler
			}

			console.error(
				`Failed to summarize meeting ${args.meetingId}:`,
				errorMessage,
			);
			return { success: false, error: errorMessage };
		}
	},
});

// ═══════════════════════════════════════════════════════════════
// PROCESS PENDING MEETINGS - Batch process pending meetings
// ═══════════════════════════════════════════════════════════════
export const processPendingMeetings = internalAction({
	args: {
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const limit = args.limit ?? 10;

		// Get pending meetings
		const pendingMeetings = await ctx.runQuery(
			internal.functions.ai.queries.getPendingMeetings,
			{ limit },
		);

		const results = {
			processed: 0,
			succeeded: 0,
			failed: 0,
			errors: [] as string[],
		};

		for (const meeting of pendingMeetings) {
			results.processed++;

			const result = await ctx.runAction(
				internal.functions.ai.summarize.summarizeMeeting,
				{
					meetingId: meeting._id,
				},
			);

			if (result.success) {
				results.succeeded++;
			} else {
				results.failed++;
				if (result.error) {
					results.errors.push(`${meeting._id}: ${result.error}`);
				}
			}
		}

		return results;
	},
});

// ═══════════════════════════════════════════════════════════════
// RETRY FAILED MEETING - Retry a specific failed meeting
// ═══════════════════════════════════════════════════════════════
export const retryFailedMeeting = internalAction({
	args: {
		meetingId: v.id("meetings"),
	},
	handler: async (ctx, args): Promise<{ success: boolean; error?: string }> => {
		// Reset meeting to pending first
		await ctx.runMutation(internal.functions.ai.mutations.updateMeetingStatus, {
			meetingId: args.meetingId,
			status: "pending",
		});

		// Then process it
		const result = await ctx.runAction(
			internal.functions.ai.summarize.summarizeMeeting,
			{
				meetingId: args.meetingId,
			},
		);
		return result;
	},
});

// ═══════════════════════════════════════════════════════════════
// PROCESS NEWLY-PAST MEETINGS - Summarize meetings whose date has now passed
// ═══════════════════════════════════════════════════════════════
export const processNewlyPastMeetings = internalAction({
	args: {
		limit: v.optional(v.number()),
	},
	handler: async (
		ctx,
		args,
	): Promise<{
		found: number;
		processed: number;
		succeeded: number;
		failed: number;
	}> => {
		const limit = args.limit ?? 20;
		const now = Date.now();

		// Get pending meetings whose date has passed
		const pendingMeetings = await ctx.runQuery(
			internal.functions.ai.queries.getPendingMeetings,
			{ limit: limit * 2 },
		);

		// Filter to only past meetings
		const pastPending = pendingMeetings.filter(
			(m: { meetingDate: number }) => m.meetingDate <= now,
		);

		const toProcess = pastPending.slice(0, limit);

		const results = {
			found: pastPending.length as number,
			processed: 0,
			succeeded: 0,
			failed: 0,
		};

		for (const meeting of toProcess) {
			results.processed++;
			const result = await ctx.runAction(
				internal.functions.ai.summarize.summarizeMeeting,
				{ meetingId: meeting._id },
			);
			if (result.success) {
				results.succeeded++;
			} else {
				results.failed++;
			}
		}

		return results;
	},
});

// ═══════════════════════════════════════════════════════════════
// Helper: Build the prompt
// ═══════════════════════════════════════════════════════════════
interface PromptParams {
	title: string;
	municipalityName: string;
	state: string;
	meetingType: string;
	date: string;
	meetingDateMs: number;
	content: string;
}

function buildPrompt(params: PromptParams): { system: string; user: string } {
	const meetingTypeLabels: Record<string, string> = {
		city_council: "City Council",
		school_board: "School Board",
		planning_commission: "Planning Commission",
		zoning_board: "Zoning Board",
		budget_committee: "Budget Committee",
		other: "Other",
	};

	const isFutureMeeting = params.meetingDateMs > Date.now();
	const docType = isFutureMeeting
		? "AGENDA (meeting has not yet occurred)"
		: "MINUTES/POST-MEETING DOCUMENT";

	const system = `You are an expert analyst of local government proceedings. Analyze meeting documents and produce structured JSON summaries that help citizens understand what happened.

Be: Accurate, neutral, accessible, actionable.
Output: Valid JSON only.`;

	const user = `Analyze this municipal meeting ${isFutureMeeting ? "agenda" : "document"} and return a JSON summary.

MEETING: ${params.title}
MUNICIPALITY: ${params.municipalityName}, ${params.state}
TYPE: ${meetingTypeLabels[params.meetingType] ?? params.meetingType}
DATE: ${params.date}
DOCUMENT TYPE: ${docType}

DOCUMENT:
${params.content.slice(0, MAX_CONTENT_LENGTH)}

---

Return ONLY valid JSON:

{
  "executiveSummary": "2-3 sentences of key outcomes",
  "keyDecisions": [
    {
      "title": "Decision title",
      "description": "What was decided",
      "voteResult": {"yes": 5, "no": 2, "abstain": 0, "passed": true},
      "topics": ["budget", "housing"],
      "importance": "high|medium|low"
    }
  ],
  "discussionTopics": [
    {
      "topic": "Topic name",
      "summary": "What was discussed",
      "category": "budget|zoning|infrastructure|safety|education|environment|housing|transportation|other"
    }
  ],
  "publicComments": {
    "count": 5,
    "summary": "What residents said",
    "themes": ["theme1", "theme2"],
    "sentiment": "positive|negative|mixed|neutral"
  },
  "upcomingItems": [
    {"title": "Future item", "expectedDate": "date if known"}
  ],
  "topics": ["budget", "safety"],
  "sentiment": "routine|contentious|celebratory|urgent"
}

RULES:
- Only include voteResult if explicit counts mentioned
- publicComments can be null if none
- Be concise but informative
- "topics" and "category" MUST only use these values: budget, zoning, infrastructure, safety, education, environment, housing, transportation, other`;

	return { system, user };
}

async function hydrateContentFromSourceUrl(args: {
	sourceUrl?: string;
	meetingsPageUrl?: string;
}): Promise<string | null> {
	if (!args.sourceUrl) return null;

	// Skip obvious listing pages. Those pages are not meeting-specific content.
	if (
		args.meetingsPageUrl &&
		normalizeUrl(args.sourceUrl) === normalizeUrl(args.meetingsPageUrl) &&
		!isLikelyDocumentUrl(args.sourceUrl)
	) {
		return null;
	}

	const response = await fetch(args.sourceUrl, {
		headers: {
			"User-Agent":
				"Mozilla/5.0 (compatible; CivicPulse/1.0; +https://civicpulse.app)",
			Accept:
				"text/html,application/xhtml+xml,application/xml;q=0.9,application/pdf,*/*;q=0.8",
		},
	});

	if (!response.ok) {
		throw new Error(
			`Failed to load source URL for summarization (${response.status})`,
		);
	}

	const contentType = response.headers.get("content-type") ?? "";
	const maybePdfFromUrl = isPdfResource(args.sourceUrl, contentType);
	const arrayBuffer = await response.arrayBuffer();
	const bytes = new Uint8Array(arrayBuffer);
	const isPdf = isPdfContent(bytes, contentType, maybePdfFromUrl);

	if (isPdf) {
		const extracted = await extractTextFromPdf(arrayBuffer);
		return finalizeExtractedContent(extracted);
	}

	const html = new TextDecoder("utf-8").decode(bytes);
	return finalizeExtractedContent(htmlToText(html));
}

function isLikelyDocumentUrl(url: string): boolean {
	return (
		/\.pdf(\?|#|$)/i.test(url) ||
		/\/ViewFile/i.test(url) ||
		/\/View\.ashx/i.test(url)
	);
}

function isPdfResource(url: string, contentType: string): boolean {
	return (
		contentType.toLowerCase().includes("application/pdf") ||
		url.toLowerCase().includes(".pdf") ||
		url.includes("ViewFile") ||
		url.includes("View.ashx")
	);
}

function isPdfContent(
	bytes: Uint8Array,
	contentType: string,
	maybePdfFromUrl: boolean,
): boolean {
	const hasPdfContentType = contentType
		.toLowerCase()
		.includes("application/pdf");
	const hasPdfMagicBytes =
		bytes.length >= 4 &&
		bytes[0] === 0x25 &&
		bytes[1] === 0x50 &&
		bytes[2] === 0x44 &&
		bytes[3] === 0x46; // %PDF

	// URL hints are useful, but only trust them when bytes also look like PDF.
	return (
		hasPdfContentType ||
		hasPdfMagicBytes ||
		(maybePdfFromUrl && hasPdfMagicBytes)
	);
}

async function extractTextFromPdf(arrayBuffer: ArrayBuffer): Promise<string> {
	// Copy the buffer because unpdf/pdfjs may detach the ArrayBuffer
	// (transferring it to a worker), leaving the original empty.
	const original = new Uint8Array(arrayBuffer);
	const copy = new Uint8Array(original);
	const { text } = await extractText(copy, { mergePages: true });

	// If direct extraction returned enough text, use it
	if (text.trim().length >= MIN_EXTRACTED_CONTENT_LENGTH) {
		return text;
	}

	// Fall back to OCR for scanned/image-only PDFs
	console.log(
		`[extractTextFromPdf] Direct: ${text.trim().length} chars → OCR fallback (${original.length}b)`,
	);
	return ocrPdf(original);
}

function finalizeExtractedContent(content: string): string | null {
	const trimmed = content.trim();
	if (trimmed.length < MIN_EXTRACTED_CONTENT_LENGTH) {
		return null;
	}

	if (trimmed.length > MAX_CONTENT_LENGTH) {
		return `${trimmed.slice(0, MAX_CONTENT_LENGTH)}\n\n[Content truncated due to length...]`;
	}

	return trimmed;
}

// ═══════════════════════════════════════════════════════════════
// Helper: Call OpenRouter API
// ═══════════════════════════════════════════════════════════════
async function callOpenRouterAPI(
	apiKey: string,
	prompt: { system: string; user: string },
): Promise<string> {
	const response = await fetch(
		"https://openrouter.ai/api/v1/chat/completions",
		{
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${apiKey}`,
				"HTTP-Referer": "https://civicpulse.io",
				"X-Title": "Civic Pulse",
			},
			body: JSON.stringify({
				model: "anthropic/claude-sonnet-4",
				max_tokens: 4096,
				messages: [
					{
						role: "system",
						content: prompt.system,
					},
					{
						role: "user",
						content: prompt.user,
					},
				],
			}),
		},
	);

	if (!response.ok) {
		const errorText = await response.text();
		throw new Error(`OpenRouter API error (${response.status}): ${errorText}`);
	}

	const data = await response.json();

	if (!data.choices || !data.choices[0] || !data.choices[0].message?.content) {
		throw new Error("Invalid response from OpenRouter API");
	}

	return data.choices[0].message.content;
}

// ═══════════════════════════════════════════════════════════════
// Helper: Parse and validate summary response
// ═══════════════════════════════════════════════════════════════
interface ParsedSummary {
	executiveSummary: string;
	keyDecisions: Array<{
		title: string;
		description: string;
		voteResult?: {
			yes: number;
			no: number;
			abstain: number;
			passed: boolean;
		};
		topics: string[];
		importance?: "high" | "medium" | "low";
	}>;
	discussionTopics: Array<{
		topic: string;
		summary: string;
		category: string;
	}>;
	publicComments?: {
		count: number;
		summary: string;
		themes: string[];
		sentiment?: "positive" | "negative" | "mixed" | "neutral";
	};
	upcomingItems: Array<{
		title: string;
		expectedDate?: string;
	}>;
	topics: string[];
	sentiment?: "routine" | "contentious" | "celebratory" | "urgent";
}

const VALID_TOPICS = new Set([
	"budget",
	"zoning",
	"infrastructure",
	"safety",
	"education",
	"environment",
	"housing",
	"transportation",
	"other",
]);

// Map common AI-generated category names to our valid topics
const TOPIC_ALIASES: Record<string, string> = {
	public_safety: "safety",
	utilities: "infrastructure",
	parks: "environment",
	economic_dev: "budget",
	healthcare: "safety",
	elections: "other",
	finance: "budget",
	planning: "zoning",
	development: "zoning",
	transit: "transportation",
	traffic: "transportation",
	water: "infrastructure",
	sewer: "infrastructure",
	police: "safety",
	fire: "safety",
	schools: "education",
	recreation: "environment",
};

function normalizeTopic(topic: string): string {
	const lower = topic.toLowerCase().trim();
	if (VALID_TOPICS.has(lower)) return lower;
	if (TOPIC_ALIASES[lower]) return TOPIC_ALIASES[lower];
	return "other";
}

function parseAndValidateSummary(response: string): ParsedSummary {
	// Extract JSON from response (handle markdown code blocks)
	let jsonStr = response.trim();

	// Remove markdown code blocks if present
	if (jsonStr.startsWith("```json")) {
		jsonStr = jsonStr.slice(7);
	} else if (jsonStr.startsWith("```")) {
		jsonStr = jsonStr.slice(3);
	}

	if (jsonStr.endsWith("```")) {
		jsonStr = jsonStr.slice(0, -3);
	}

	jsonStr = jsonStr.trim();

	// Parse JSON
	let parsed: unknown;
	try {
		parsed = JSON.parse(jsonStr);
	} catch (e) {
		throw new Error(`Failed to parse JSON response: ${e}`);
	}

	// Type guard and validation
	if (typeof parsed !== "object" || parsed === null) {
		throw new Error("Response is not an object");
	}

	const obj = parsed as Record<string, unknown>;

	// Validate required fields
	if (typeof obj.executiveSummary !== "string" || !obj.executiveSummary) {
		throw new Error("Missing or invalid executiveSummary");
	}

	if (!Array.isArray(obj.keyDecisions)) {
		throw new Error("Missing or invalid keyDecisions");
	}

	if (!Array.isArray(obj.discussionTopics)) {
		throw new Error("Missing or invalid discussionTopics");
	}

	if (!Array.isArray(obj.upcomingItems)) {
		throw new Error("Missing or invalid upcomingItems");
	}

	if (!Array.isArray(obj.topics)) {
		throw new Error("Missing or invalid topics");
	}

	// Validate and clean keyDecisions
	const keyDecisions = obj.keyDecisions.map((decision: unknown) => {
		if (typeof decision !== "object" || decision === null) {
			throw new Error("Invalid key decision");
		}

		const d = decision as Record<string, unknown>;

		const result: ParsedSummary["keyDecisions"][0] = {
			title: String(d.title ?? "Untitled Decision"),
			description: String(d.description ?? ""),
			topics: Array.isArray(d.topics) ? d.topics.map((t: unknown) => normalizeTopic(String(t))) : [],
		};

		if (d.voteResult && typeof d.voteResult === "object") {
			const vr = d.voteResult as Record<string, unknown>;
			result.voteResult = {
				yes: Number(vr.yes ?? 0),
				no: Number(vr.no ?? 0),
				abstain: Number(vr.abstain ?? 0),
				passed: Boolean(vr.passed),
			};
		}

		if (
			d.importance &&
			["high", "medium", "low"].includes(String(d.importance))
		) {
			result.importance = String(d.importance) as "high" | "medium" | "low";
		}

		return result;
	});

	// Validate and clean discussionTopics
	const discussionTopics = obj.discussionTopics.map((topic: unknown) => {
		if (typeof topic !== "object" || topic === null) {
			throw new Error("Invalid discussion topic");
		}

		const t = topic as Record<string, unknown>;

		return {
			topic: String(t.topic ?? "Untitled Topic"),
			summary: String(t.summary ?? ""),
			category: normalizeTopic(String(t.category ?? "other")),
		};
	});

	// Validate and clean publicComments
	let publicComments: ParsedSummary["publicComments"];
	if (obj.publicComments && typeof obj.publicComments === "object") {
		const pc = obj.publicComments as Record<string, unknown>;
		const publicCommentsResult: NonNullable<ParsedSummary["publicComments"]> = {
			count: Number(pc.count ?? 0),
			summary: String(pc.summary ?? ""),
			themes: Array.isArray(pc.themes) ? pc.themes.map(String) : [],
		};
		if (
			pc.sentiment &&
			["positive", "negative", "mixed", "neutral"].includes(
				String(pc.sentiment),
			)
		) {
			publicCommentsResult.sentiment = String(pc.sentiment) as
				| "positive"
				| "negative"
				| "mixed"
				| "neutral";
		}
		publicComments = publicCommentsResult;
	}

	// Validate and clean upcomingItems
	const upcomingItems = obj.upcomingItems.map((item: unknown) => {
		if (typeof item !== "object" || item === null) {
			throw new Error("Invalid upcoming item");
		}

		const i = item as Record<string, unknown>;

		const result: ParsedSummary["upcomingItems"][0] = {
			title: String(i.title ?? "Untitled Item"),
		};

		if (i.expectedDate) {
			result.expectedDate = String(i.expectedDate);
		}

		return result;
	});

	// Validate sentiment
	let sentiment: ParsedSummary["sentiment"];
	if (
		obj.sentiment &&
		["routine", "contentious", "celebratory", "urgent"].includes(
			String(obj.sentiment),
		)
	) {
		sentiment = String(obj.sentiment) as ParsedSummary["sentiment"];
	}

	return {
		executiveSummary: obj.executiveSummary as string,
		keyDecisions,
		discussionTopics,
		publicComments,
		upcomingItems,
		topics: [...new Set((obj.topics as unknown[]).map((t) => normalizeTopic(String(t))))],
		sentiment,
	};
}
