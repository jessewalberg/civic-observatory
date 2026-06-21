export type SourceType = "scraped" | "uploaded" | "manual_entry";
type MeetingStatus =
	| "pending"
	| "processing"
	| "summarized"
	| "failed"
	| "skipped";
type SummaryStatus = "summarized" | "failed" | "skipped";

export type MeetingSourceTrustState =
	| "source-backed"
	| "source-linked"
	| "missing-source"
	| "failed";

export interface MeetingSourceMetadataInput {
	sourceUrl?: string | null;
	sourceType?: SourceType | null;
	contentHash?: string | null;
	processingError?: string | null;
	summary?: {
		sourceUrl?: string | null;
		sourceType?: SourceType | null;
		sourceContentHash?: string | null;
		error?: string | null;
	} | null;
}

export interface MeetingSourceTrustInput extends MeetingSourceMetadataInput {
	status: MeetingStatus;
	summary?:
		| (MeetingSourceMetadataInput["summary"] & {
				status?: SummaryStatus | null;
		  })
		| null;
}

export interface MeetingSourceMetadata {
	sourceUrl: string | null;
	sourceType: SourceType | null;
	contentHash: string | null;
	error: string | null;
}

export interface MeetingSourceTrust {
	state: MeetingSourceTrustState;
	label: string;
	description: string;
	sourceUrl: string | null;
	sourceTypeLabel: string | null;
	hasContentHash: boolean;
	error: string | null;
}

export function getMeetingSourceMetadata(
	meeting: MeetingSourceMetadataInput,
): MeetingSourceMetadata {
	return {
		sourceUrl: meeting.summary?.sourceUrl ?? meeting.sourceUrl ?? null,
		sourceType: meeting.summary?.sourceType ?? meeting.sourceType ?? null,
		contentHash:
			meeting.summary?.sourceContentHash ?? meeting.contentHash ?? null,
		error: meeting.summary?.error ?? meeting.processingError ?? null,
	};
}

export function getMeetingSourceTrust(
	meeting: MeetingSourceTrustInput,
): MeetingSourceTrust {
	const { sourceUrl, sourceType, contentHash, error } =
		getMeetingSourceMetadata(meeting);
	const hasUsableSummary =
		meeting.status === "summarized" &&
		Boolean(meeting.summary) &&
		meeting.summary?.status !== "failed" &&
		meeting.summary?.status !== "skipped";

	if (meeting.status === "failed" || meeting.summary?.status === "failed") {
		return {
			state: "failed",
			label: "Summary failed",
			description:
				"Processing did not produce a usable summary. The source context is shown when available.",
			sourceUrl,
			sourceTypeLabel: sourceType ? sourceTypeLabels[sourceType] : null,
			hasContentHash: Boolean(contentHash),
			error,
		};
	}

	if (!sourceUrl) {
		return {
			state: "missing-source",
			label: "Source unavailable",
			description:
				"This record does not include a source document link yet, so the summary cannot be traced back from this page.",
			sourceUrl: null,
			sourceTypeLabel: sourceType ? sourceTypeLabels[sourceType] : null,
			hasContentHash: Boolean(contentHash),
			error,
		};
	}

	if (!contentHash) {
		return {
			state: "source-linked",
			label: "Source linked",
			description: hasUsableSummary
				? "The original meeting source is linked, but a source content hash was not recorded for this summary."
				: "The original meeting source is linked, but a source content hash was not recorded for this record.",
			sourceUrl,
			sourceTypeLabel: sourceType ? sourceTypeLabels[sourceType] : null,
			hasContentHash: false,
			error,
		};
	}

	return {
		state: "source-backed",
		label: hasUsableSummary ? "Source-backed summary" : "Source-backed record",
		description: hasUsableSummary
			? "This summary is linked to the original meeting source and has recorded source provenance."
			: "The original meeting source is linked and recorded source provenance is available.",
		sourceUrl,
		sourceTypeLabel: sourceType ? sourceTypeLabels[sourceType] : null,
		hasContentHash: true,
		error,
	};
}

const sourceTypeLabels: Record<SourceType, string> = {
	scraped: "Scraped public record",
	uploaded: "Uploaded document",
	manual_entry: "Manual entry",
};
