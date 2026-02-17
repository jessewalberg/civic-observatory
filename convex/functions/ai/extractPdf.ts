"use node";

import { v } from "convex/values";
import { extractText } from "unpdf";
import { internal } from "../../_generated/api";
import { internalAction } from "../../_generated/server";
import { ocrPdf } from "./ocrPdf";

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
				{ meetingId: args.meetingId },
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
				return {
					success: false,
					error: `Failed to download document: ${response.status}`,
				};
			}

			const arrayBuffer = await response.arrayBuffer();
			const buffer = new Uint8Array(arrayBuffer);

			// 3. Extract text based on file type
			const isPdf =
				buffer[0] === 0x25 &&
				buffer[1] === 0x50 &&
				buffer[2] === 0x44 &&
				buffer[3] === 0x46;

			let extractedText: string;

			if (isPdf) {
				extractedText = await extractPdfText(buffer);
			} else {
				extractedText = new TextDecoder().decode(buffer);
			}

			// 4. Validate extraction
			const trimmedText = extractedText.trim();

			if (trimmedText.length < MIN_TEXT_LENGTH) {
				await ctx.runMutation(
					internal.functions.ai.mutations.updateMeetingStatus,
					{
						meetingId: args.meetingId,
						status: "failed",
						error:
							"Document appears to be image-only or has insufficient text content",
					},
				);
				return {
					success: false,
					error: "Insufficient text extracted (document may be image-only)",
				};
			}

			// 5. Truncate if too long
			const finalContent =
				trimmedText.length > MAX_CONTENT_LENGTH
					? `${trimmedText.slice(0, MAX_CONTENT_LENGTH)}\n\n[Content truncated due to length...]`
					: trimmedText;

			// 6. Update meeting with extracted content
			await ctx.runMutation(
				internal.functions.ai.mutations.updateMeetingContent,
				{
					meetingId: args.meetingId,
					rawContent: finalContent,
				},
			);

			return { success: true };
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : "Unknown extraction error";
			console.error(
				`PDF extraction failed for meeting ${args.meetingId}:`,
				errorMessage,
			);
			return { success: false, error: errorMessage };
		}
	},
});

// ═══════════════════════════════════════════════════════════════
// Helper: Extract text from PDF, with OCR fallback for scanned docs
// ═══════════════════════════════════════════════════════════════
async function extractPdfText(buffer: Uint8Array): Promise<string> {
	// Copy because extractText may detach the underlying ArrayBuffer
	const original = new Uint8Array(buffer);
	const copy = new Uint8Array(original);
	const { text } = await extractText(copy, { mergePages: true });

	if (text.trim().length >= MIN_TEXT_LENGTH) {
		return text;
	}

	// Scanned PDF — fall back to Vision OCR
	console.log(
		`Direct extraction: ${text.trim().length} chars → OCR fallback (${original.length}b)`,
	);
	return ocrPdf(original);
}
