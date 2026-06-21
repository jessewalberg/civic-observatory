import { meetingPath } from "./publicUrls";

export const SOURCE_PROOF_FALLBACK_COPY =
	"No source-backed summaries are available yet. New verified summaries will appear here after supported meetings are summarized with public source links.";

const DEFAULT_LIMIT = 3;
const EXCERPT_MAX_LENGTH = 190;

export type SourceProofSummaryRecord = {
	_id: string;
	executiveSummary?: string | null;
	sourceUrl?: string | null;
	meeting?: {
		_id: string;
		slug?: string | null;
		title?: string | null;
		meetingDate?: number | null;
		sourceUrl?: string | null;
	} | null;
	municipality?: {
		name?: string | null;
		state?: string | null;
	} | null;
};

export type SourceProofExample = {
	summaryId: string;
	municipality: string;
	meetingTitle: string;
	meetingDate: number;
	meetingPath: string;
	sourceUrl: string;
	summaryExcerpt: string;
};

export function buildSourceProofExamples(
	records: SourceProofSummaryRecord[],
	limit = DEFAULT_LIMIT,
): SourceProofExample[] {
	const examples: SourceProofExample[] = [];

	for (const record of records) {
		if (examples.length >= limit) break;

		const meeting = record.meeting;
		const municipality = record.municipality;
		const sourceUrl = firstNonEmpty(record.sourceUrl, meeting?.sourceUrl);
		const executiveSummary = record.executiveSummary?.trim();

		if (
			!meeting?._id ||
			!meeting.title?.trim() ||
			typeof meeting.meetingDate !== "number" ||
			!municipality?.name?.trim() ||
			!municipality.state?.trim() ||
			!sourceUrl ||
			!executiveSummary
		) {
			continue;
		}

		examples.push({
			summaryId: record._id,
			municipality: `${municipality.name.trim()}, ${municipality.state.trim()}`,
			meetingTitle: meeting.title.trim(),
			meetingDate: meeting.meetingDate,
			meetingPath: meetingPath({ _id: meeting._id, slug: meeting.slug }),
			sourceUrl,
			summaryExcerpt: excerpt(executiveSummary),
		});
	}

	return examples;
}

function firstNonEmpty(
	...values: Array<string | null | undefined>
): string | null {
	for (const value of values) {
		const trimmed = value?.trim();
		if (trimmed) return trimmed;
	}
	return null;
}

function excerpt(text: string): string {
	if (text.length <= EXCERPT_MAX_LENGTH) return text;
	return `${text.slice(0, EXCERPT_MAX_LENGTH - 1).trimEnd()}...`;
}
