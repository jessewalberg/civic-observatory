import {
	type AlertFrequency,
	MEETING_TYPE_LABELS,
	type MeetingTypeValue,
	type UserTier,
} from "./subscriptionOptions";

export type SubscriptionPreviewInput = {
	municipalityName: string;
	selectedTopics: string[];
	selectedMeetingTypes: string[];
	alertFrequency: AlertFrequency;
	emailEnabled: boolean;
	agendaAlertsEnabled?: boolean;
	userTier?: UserTier;
};

export type SubscriptionPreview = {
	title: string;
	body: string;
	delivery: string;
	agendaNotice: string;
	proNotice: string | null;
};

const FREQUENCY_LABELS: Record<AlertFrequency, string> = {
	immediate: "Immediate alert",
	daily: "Daily digest",
	weekly: "Weekly digest",
};

const FREQUENCY_BODY_LABELS: Record<AlertFrequency, string> = {
	immediate: "an immediate alert",
	daily: "a daily digest",
	weekly: "a weekly digest",
};

export function buildSubscriptionPreview({
	municipalityName,
	selectedTopics,
	selectedMeetingTypes,
	alertFrequency,
	emailEnabled,
	agendaAlertsEnabled = false,
	userTier,
}: SubscriptionPreviewInput): SubscriptionPreview {
	const meetingTypeText = formatList(
		selectedMeetingTypes.map((type) =>
			isMeetingType(type) ? MEETING_TYPE_LABELS[type] : type,
		),
	);
	const topicText = formatList(selectedTopics);
	const filterText = buildFilterText({
		meetingTypeText,
		topicText,
		municipalityName,
	});

	return {
		title: `${FREQUENCY_LABELS[alertFrequency]} preview`,
		body: `You will get ${FREQUENCY_BODY_LABELS[alertFrequency]} when ${filterText}.`,
		delivery: emailEnabled
			? "Email delivery is on."
			: "Email delivery is off; alerts still appear in your dashboard.",
		agendaNotice: agendaAlertsEnabled
			? "Pre-meeting agenda preview alerts are on."
			: "Pre-meeting agenda preview alerts are off.",
		proNotice:
			alertFrequency === "immediate" && userTier !== "pro"
				? "Immediate email alerts require Pro. Daily and weekly digests are available on Free."
				: null,
	};
}

function isMeetingType(value: string): value is MeetingTypeValue {
	return value in MEETING_TYPE_LABELS;
}

function buildFilterText({
	meetingTypeText,
	topicText,
	municipalityName,
}: {
	meetingTypeText: string | null;
	topicText: string | null;
	municipalityName: string;
}): string {
	if (meetingTypeText && topicText) {
		return `${meetingTypeText} summaries mention ${topicText} in ${municipalityName}`;
	}
	if (meetingTypeText) {
		return `${meetingTypeText} summaries are ready for ${municipalityName}`;
	}
	if (topicText) {
		return `meeting summaries mention ${topicText} in ${municipalityName}`;
	}
	return `any meeting summary is ready for ${municipalityName}`;
}

function formatList(values: string[]): string | null {
	if (values.length === 0) return null;
	if (values.length === 1) return values[0] ?? null;
	return `${values.slice(0, -1).join(", ")} or ${values.at(-1)}`;
}
