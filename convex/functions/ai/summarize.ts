import { action, internalAction } from "../../_generated/server";
import { internal } from "../../_generated/api";
import { v } from "convex/values";
import type { Id } from "../../_generated/dataModel";

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
      await ctx.runMutation(internal.functions.ai.mutations.updateMeetingStatus, {
        meetingId: args.meetingId,
        status: "processing",
      });

      // 2. Get meeting with municipality
      let meeting = await ctx.runQuery(internal.functions.ai.queries.getMeetingForProcessing, {
        meetingId: args.meetingId,
      });

      if (!meeting) {
        throw new Error("Meeting not found");
      }

      // 2a. If no rawContent but has document, try to extract
      if (!meeting.rawContent && meeting.documentStorageId) {
        const extractResult = await ctx.runAction(
          internal.functions.ai.extractPdf.extractPdf,
          { meetingId: args.meetingId }
        );

        if (!extractResult.success) {
          throw new Error(extractResult.error ?? "Failed to extract document content");
        }

        // Re-fetch meeting with updated content
        meeting = await ctx.runQuery(internal.functions.ai.queries.getMeetingForProcessing, {
          meetingId: args.meetingId,
        });

        if (!meeting) {
          throw new Error("Meeting not found after extraction");
        }
      }

      if (!meeting.rawContent) {
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
        content: meeting.rawContent,
      });

      // 4. Call Claude API
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        throw new Error("ANTHROPIC_API_KEY is not configured");
      }

      const response = await callClaudeAPI(apiKey, prompt);

      // 5. Parse and validate the response
      const summary = parseAndValidateSummary(response);

      // 6. Create the summary record
      const processingTimeMs = Date.now() - startTime;

      await ctx.runMutation(internal.functions.ai.mutations.createSummary, {
        meetingId: args.meetingId,
        summary: {
          ...summary,
          modelUsed: "claude-sonnet-4-20250514",
          promptVersion: "1.0",
          processingTimeMs,
        },
      });

      // 7. Update meeting status to summarized
      await ctx.runMutation(internal.functions.ai.mutations.updateMeetingStatus, {
        meetingId: args.meetingId,
        status: "summarized",
      });

      // 8. Trigger alert generation (if implemented)
      // await ctx.scheduler.runAfter(0, internal.alerts.generateAlerts, { meetingId: args.meetingId });

      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";

      // Update meeting status to failed
      try {
        await ctx.runMutation(internal.functions.ai.mutations.updateMeetingStatus, {
          meetingId: args.meetingId,
          status: "failed",
          error: errorMessage,
        });
      } catch {
        // Ignore error in error handler
      }

      console.error(`Failed to summarize meeting ${args.meetingId}:`, errorMessage);
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
      { limit }
    );

    const results = {
      processed: 0,
      succeeded: 0,
      failed: 0,
      errors: [] as string[],
    };

    for (const meeting of pendingMeetings) {
      results.processed++;

      const result = await ctx.runAction(internal.functions.ai.summarize.summarizeMeeting, {
        meetingId: meeting._id,
      });

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
    const result = await ctx.runAction(internal.functions.ai.summarize.summarizeMeeting, {
      meetingId: args.meetingId,
    });
    return result;
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

  const system = `You are an expert analyst of local government proceedings. Analyze meeting documents and produce structured JSON summaries that help citizens understand what happened.

Be: Accurate, neutral, accessible, actionable.
Output: Valid JSON only.`;

  const user = `Analyze this municipal meeting and return a JSON summary.

MEETING: ${params.title}
MUNICIPALITY: ${params.municipalityName}, ${params.state}
TYPE: ${meetingTypeLabels[params.meetingType] ?? params.meetingType}
DATE: ${params.date}

DOCUMENT:
${params.content.slice(0, 45000)}

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
      "category": "housing|public_safety|education|environment|transportation|budget|utilities|parks|zoning|economic_dev|infrastructure|healthcare|elections|other"
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
  "topics": ["all", "unique", "tags"],
  "sentiment": "routine|contentious|celebratory|urgent"
}

RULES:
- Only include voteResult if explicit counts mentioned
- publicComments can be null if none
- Be concise but informative`;

  return { system, user };
}

// ═══════════════════════════════════════════════════════════════
// Helper: Call Claude API
// ═══════════════════════════════════════════════════════════════
async function callClaudeAPI(
  apiKey: string,
  prompt: { system: string; user: string }
): Promise<string> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: prompt.system,
      messages: [
        {
          role: "user",
          content: prompt.user,
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Claude API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();

  if (!data.content || !data.content[0] || data.content[0].type !== "text") {
    throw new Error("Invalid response from Claude API");
  }

  return data.content[0].text;
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
      topics: Array.isArray(d.topics) ? d.topics.map(String) : [],
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

    if (d.importance && ["high", "medium", "low"].includes(String(d.importance))) {
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
      category: String(t.category ?? "other"),
    };
  });

  // Validate and clean publicComments
  let publicComments: ParsedSummary["publicComments"] = undefined;
  if (obj.publicComments && typeof obj.publicComments === "object") {
    const pc = obj.publicComments as Record<string, unknown>;
    const publicCommentsResult: NonNullable<ParsedSummary["publicComments"]> = {
      count: Number(pc.count ?? 0),
      summary: String(pc.summary ?? ""),
      themes: Array.isArray(pc.themes) ? pc.themes.map(String) : [],
    };
    if (
      pc.sentiment &&
      ["positive", "negative", "mixed", "neutral"].includes(String(pc.sentiment))
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
  let sentiment: ParsedSummary["sentiment"] = undefined;
  if (
    obj.sentiment &&
    ["routine", "contentious", "celebratory", "urgent"].includes(String(obj.sentiment))
  ) {
    sentiment = String(obj.sentiment) as ParsedSummary["sentiment"];
  }

  return {
    executiveSummary: obj.executiveSummary as string,
    keyDecisions,
    discussionTopics,
    publicComments,
    upcomingItems,
    topics: (obj.topics as unknown[]).map(String),
    sentiment,
  };
}
