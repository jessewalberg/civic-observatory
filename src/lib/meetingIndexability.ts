type MeetingIndexabilityInput = {
	summary: {
		executiveSummary?: string;
	} | null;
};

export function isMeetingIndexable(meeting: MeetingIndexabilityInput): boolean {
	return Boolean(meeting.summary?.executiveSummary?.trim());
}
