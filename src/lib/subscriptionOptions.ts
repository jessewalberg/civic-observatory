export const TOPIC_OPTIONS = [
	"Budget & Finance",
	"Housing & Development",
	"Public Safety",
	"Education",
	"Transportation",
	"Environment",
	"Parks & Recreation",
	"Utilities",
	"Zoning",
	"Health & Human Services",
] as const;

export const MEETING_TYPE_OPTIONS = [
	{ value: "city_council", label: "City Council" },
	{ value: "school_board", label: "School Board" },
	{ value: "planning_commission", label: "Planning Commission" },
	{ value: "zoning_board", label: "Zoning Board" },
	{ value: "budget_committee", label: "Budget Committee" },
	{ value: "other", label: "Other" },
] as const;

export const ALERT_FREQUENCY_OPTIONS = [
	{
		value: "immediate",
		label: "Immediate",
		description: "Get notified as soon as summaries are ready",
	},
	{ value: "daily", label: "Daily Digest", description: "Once per day at 8am" },
	{
		value: "weekly",
		label: "Weekly Digest",
		description: "Once per week on Mondays",
	},
] as const;

export type MeetingTypeValue = (typeof MEETING_TYPE_OPTIONS)[number]["value"];
export type AlertFrequency = (typeof ALERT_FREQUENCY_OPTIONS)[number]["value"];
export type UserTier = "free" | "pro";

export const MEETING_TYPE_LABELS = Object.fromEntries(
	MEETING_TYPE_OPTIONS.map(({ value, label }) => [value, label]),
) as Record<MeetingTypeValue, string>;
