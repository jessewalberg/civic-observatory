export type PublicCoverageBadge = {
	kind: "verified" | "active" | "manual" | "seeded" | "paused" | "unpublished";
	label: string;
	tone: "success" | "info" | "warning" | "secondary";
	description: string;
	lastCheckedAt: number | null;
	latestHealth:
		| "fresh"
		| "stale"
		| "failing"
		| "partial"
		| "unknown"
		| "manual";
};
