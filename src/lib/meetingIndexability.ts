type MeetingIndexabilityInput = {
	status: string;
	meetingDate: number;
	rawContent?: string;
	summary: {
		executiveSummary?: string;
	} | null;
};

export function isMeetingIndexable(meeting: MeetingIndexabilityInput): boolean {
	if (meeting.status === "summarized") {
		return Boolean(meeting.summary?.executiveSummary?.trim());
	}

	if (meeting.status === "pending" && meeting.meetingDate > Date.now()) {
		return Boolean(meeting.rawContent?.trim());
	}

	return false;
}
