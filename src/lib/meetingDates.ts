const MEETING_DATE_TIME_ZONE = "UTC";

export function formatMeetingDate(timestamp: number): string {
	return new Intl.DateTimeFormat("en-US", {
		weekday: "long",
		year: "numeric",
		month: "long",
		day: "numeric",
		timeZone: MEETING_DATE_TIME_ZONE,
	}).format(timestamp);
}

export function formatMeetingScheduleDate(timestamp: number): string {
	return new Intl.DateTimeFormat("en-US", {
		weekday: "long",
		month: "long",
		day: "numeric",
		timeZone: MEETING_DATE_TIME_ZONE,
	}).format(timestamp);
}
