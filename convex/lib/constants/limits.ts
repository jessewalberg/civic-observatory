// Rate limits by tier and action
// Values are per-window limits (day or month)
export const LIMITS = {
	anonymous: {
		summary_view: { day: 10 },
	},
	free: {
		summary_view: { day: 50 },
		meeting_upload: { month: 3 },
	},
	pro: {
		summary_view: { day: Infinity },
		meeting_upload: { month: 20 },
		api_request: { day: 1000 },
	},
} as const;

// Subscription limits by tier
export const SUBSCRIPTION_LIMITS = {
	anonymous: {
		subscriptions: 0,
		municipalities: 3,
	},
	free: {
		subscriptions: 5,
		municipalities: 10,
	},
	pro: {
		subscriptions: Infinity,
		municipalities: Infinity,
	},
} as const;

// Type for accessing limits
export type Tier = keyof typeof LIMITS;
export type Action =
	| "summary_view"
	| "meeting_upload"
	| "api_request"
	| "alert_sent";

export const INPUT_LIMITS = {
	MIN_TRANSCRIPT_LENGTH: 100,
	MAX_TRANSCRIPT_LENGTH: 50000,
} as const;
