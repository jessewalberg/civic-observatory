import { internalAction } from "../../_generated/server";
import { internal } from "../../_generated/api";
import { v } from "convex/values";

// Maximum content length (roughly 45k chars for ~15k tokens)
const MAX_CONTENT_LENGTH = 45000;

// Minimum text length to consider extraction successful
const MIN_TEXT_LENGTH = 100;

// ═══════════════════════════════════════════════════════════════
// EXTRACT PDF - Extract text from stored PDF document
// ═══════════════════════════════════════════════════════════════
export const extractPdf = internalAction({
  args: {
    meetingId: v.id("meetings"),
  },
  handler: async (ctx, args): Promise<{ success: boolean; error?: string }> => {
    try {
      // 1. Get the meeting with document storage ID
      const meeting = await ctx.runQuery(
        internal.functions.ai.queries.getMeetingForProcessing,
        { meetingId: args.meetingId }
      );

      if (!meeting) {
        return { success: false, error: "Meeting not found" };
      }

      // If rawContent already exists, skip extraction
      if (meeting.rawContent && meeting.rawContent.length >= MIN_TEXT_LENGTH) {
        return { success: true };
      }

      // Check if there's a document to extract from
      if (!meeting.documentStorageId) {
        return { success: false, error: "No document to extract from" };
      }

      // 2. Download the file from Convex storage
      const fileUrl = await ctx.storage.getUrl(meeting.documentStorageId);
      if (!fileUrl) {
        return { success: false, error: "Document not found in storage" };
      }

      const response = await fetch(fileUrl);
      if (!response.ok) {
        return { success: false, error: `Failed to download document: ${response.status}` };
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // 3. Extract text based on file type
      let extractedText: string;

      // Determine file type from content (magic bytes)
      const isPdf = buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46; // %PDF

      if (isPdf) {
        extractedText = await extractFromPdf(buffer);
      } else {
        // Try to read as plain text
        extractedText = buffer.toString("utf-8");
      }

      // 4. Validate extraction
      const trimmedText = extractedText.trim();

      if (trimmedText.length < MIN_TEXT_LENGTH) {
        // Mark as failed - likely an image-only PDF or corrupted
        await ctx.runMutation(internal.functions.ai.mutations.updateMeetingStatus, {
          meetingId: args.meetingId,
          status: "failed",
          error: "Document appears to be image-only or has insufficient text content",
        });
        return {
          success: false,
          error: "Insufficient text extracted (document may be image-only)",
        };
      }

      // 5. Truncate if too long
      const finalContent =
        trimmedText.length > MAX_CONTENT_LENGTH
          ? trimmedText.slice(0, MAX_CONTENT_LENGTH) + "\n\n[Content truncated due to length...]"
          : trimmedText;

      // 6. Update meeting with extracted content
      await ctx.runMutation(internal.functions.ai.mutations.updateMeetingContent, {
        meetingId: args.meetingId,
        rawContent: finalContent,
      });

      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown extraction error";
      console.error(`PDF extraction failed for meeting ${args.meetingId}:`, errorMessage);
      return { success: false, error: errorMessage };
    }
  },
});

// ═══════════════════════════════════════════════════════════════
// Helper: Extract text from PDF buffer
// ═══════════════════════════════════════════════════════════════
async function extractFromPdf(buffer: Buffer): Promise<string> {
  // Dynamic import to avoid bundling issues
  const { PDFParse } = await import("pdf-parse");

  // Convert Buffer to Uint8Array for pdf-parse
  const data = new Uint8Array(buffer);
  const parser = new PDFParse({ data });

  try {
    const textResult = await parser.getText({ first: 100 });
    return textResult.text.trim();
  } catch (error) {
    // Handle specific PDF parsing errors
    if (error instanceof Error) {
      if (error.message.includes("password")) {
        throw new Error("PDF is password protected");
      }
      if (error.message.includes("corrupt") || error.message.includes("invalid")) {
        throw new Error("PDF appears to be corrupted or invalid");
      }
    }
    throw error;
  } finally {
    await parser.destroy();
  }
}
