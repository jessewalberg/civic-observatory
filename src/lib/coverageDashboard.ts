export type CoverageHealthState =
	| "live"
	| "stale"
	| "failing"
	| "unsupported"
	| "pending"
	| "never-probed";

export type CoverageDashboardRow = {
	municipality: {
		id: string;
		name: string;
		state: string;
		platform: "granicus" | "civicplus" | "generic" | "manual";
		coverageStatus?: "published" | "unpublished" | "paused";
		isActive: boolean;
		isVerified: boolean;
	};
	health: {
		state: CoverageHealthState;
		freshness: {
			lastScrapedAt: number | null;
			lastSuccessAt: number | null;
			ageMs: number | null;
			frequencyHours: number;
			staleAfterMs: number;
			isStale: boolean;
		};
		scrapeSuccessRate: number | null;
		scrapeJobSample: {
			total: number;
			completed: number;
			partial: number;
			failed: number;
		};
		latestScrape: {
			status: "pending" | "running" | "completed" | "failed" | "partial";
			at: number;
			meetingsFound: number;
			meetingsCreated: number;
			meetingsSkipped: number;
			meetingsFailed: number;
		} | null;
		documentAvailabilityPct: number;
		summaryStatus: {
			totalMeetings: number;
			summarized: number;
			pending: number;
			processing: number;
			failed: number;
			skipped: number;
			summaryCoveragePct: number;
			lastSummarizedAt: number | null;
		};
		lastFailure: {
			message: string;
			at: number | null;
			url?: string;
		} | null;
	};
};

export type CoverageAlert = {
	id: string;
	kind: "repeated-failure" | "stale";
	severity: "critical" | "warning";
	municipalityId: string;
	municipalityName: string;
	platform: CoverageDashboardRow["municipality"]["platform"];
	reason: string;
	lastSuccessAt: number | null;
	suggestedAction: string;
};

export type CoverageDashboardFilters = {
	search?: string;
	state?: string;
	activity?: "all" | "active" | "inactive";
	verification?: "all" | "verified" | "unverified";
	healthState?: CoverageHealthState | "all";
	platform?: CoverageDashboardRow["municipality"]["platform"] | "all";
	freshness?: "all" | "fresh" | "stale" | "never";
	failure?: "all" | "has-failure" | "none";
	coverage?:
		| "all"
		| "complete"
		| "attention"
		| "no-meetings"
		| "needs-documents"
		| "needs-summaries";
};

export type CoverageDashboardSort = {
	key:
		| "name"
		| "health"
		| "platform"
		| "lastScrape"
		| "lastSummary"
		| "freshness"
		| "coverage"
		| "documentAvailability"
		| "summaryCoverage"
		| "scrapeSuccess"
		| "failure";
	direction: "asc" | "desc";
};

const DEFAULT_SORT: CoverageDashboardSort = {
	key: "health",
	direction: "asc",
};

const HEALTH_RANK: Record<CoverageHealthState, number> = {
	failing: 0,
	stale: 1,
	pending: 2,
	"never-probed": 3,
	unsupported: 4,
	live: 5,
};

const REPEATED_FAILURE_THRESHOLD = 2;
const PLATFORM_ORDER: CoverageDashboardRow["municipality"]["platform"][] = [
	"granicus",
	"civicplus",
	"generic",
	"manual",
];

export function getCoverageDashboardRows(
	rows: CoverageDashboardRow[],
	filters: CoverageDashboardFilters = {},
	sort: CoverageDashboardSort = DEFAULT_SORT,
): CoverageDashboardRow[] {
	return rows
		.filter((row) => matchesFilters(row, filters))
		.sort((a, b) => compareRows(a, b, sort));
}

export function getCoverageDashboardStats(rows: CoverageDashboardRow[]) {
	return {
		total: rows.length,
		active: rows.filter((row) => row.municipality.isActive).length,
		inactive: rows.filter((row) => !row.municipality.isActive).length,
		verified: rows.filter((row) => row.municipality.isVerified).length,
		live: rows.filter((row) => row.health.state === "live").length,
		stale: rows.filter((row) => row.health.state === "stale").length,
		failing: rows.filter((row) => row.health.state === "failing").length,
		broken: rows.filter((row) => row.health.state === "failing").length,
		pending: rows.filter((row) => row.health.state === "pending").length,
		unsupported: rows.filter((row) => row.health.state === "unsupported")
			.length,
		neverProbed: rows.filter((row) => row.health.state === "never-probed")
			.length,
		withFailures: rows.filter(hasFailure).length,
		coverageAttention: rows.filter(needsCoverageAttention).length,
	};
}

export function getCoveragePlatformStats(rows: CoverageDashboardRow[]) {
	return PLATFORM_ORDER.map((platform) => {
		const platformRows = rows.filter(
			(row) => row.municipality.platform === platform,
		);

		return {
			platform,
			total: platformRows.length,
			live: platformRows.filter((row) => row.health.state === "live").length,
			stale: platformRows.filter((row) => row.health.state === "stale").length,
			failing: platformRows.filter((row) => row.health.state === "failing")
				.length,
			pending: platformRows.filter((row) => row.health.state === "pending")
				.length,
			unsupported: platformRows.filter(
				(row) => row.health.state === "unsupported",
			).length,
			neverProbed: platformRows.filter(
				(row) => row.health.state === "never-probed",
			).length,
		};
	});
}

export function getCoverageAlerts(
	rows: CoverageDashboardRow[],
): CoverageAlert[] {
	const byId = new Map<string, CoverageAlert>();

	for (const row of rows) {
		const alert = coverageAlert(row);
		if (alert && !byId.has(alert.id)) {
			byId.set(alert.id, alert);
		}
	}

	return [...byId.values()].sort((a, b) => {
		const severity = severityRank(a.severity) - severityRank(b.severity);
		if (severity !== 0) return severity;
		return a.municipalityName.localeCompare(b.municipalityName);
	});
}

function matchesFilters(
	row: CoverageDashboardRow,
	filters: CoverageDashboardFilters,
) {
	const search = filters.search?.trim().toLowerCase();
	if (
		search &&
		![
			row.municipality.name,
			row.municipality.state,
			row.municipality.platform,
			row.health.state,
		].some((value) => value.toLowerCase().includes(search))
	) {
		return false;
	}

	if (filters.state?.trim() && filters.state !== "all") {
		if (row.municipality.state !== filters.state) return false;
	}

	if (filters.activity === "active" && !row.municipality.isActive) {
		return false;
	}
	if (filters.activity === "inactive" && row.municipality.isActive) {
		return false;
	}

	if (filters.verification === "verified" && !row.municipality.isVerified) {
		return false;
	}
	if (filters.verification === "unverified" && row.municipality.isVerified) {
		return false;
	}

	if (
		filters.healthState &&
		filters.healthState !== "all" &&
		row.health.state !== filters.healthState
	) {
		return false;
	}

	if (
		filters.platform &&
		filters.platform !== "all" &&
		row.municipality.platform !== filters.platform
	) {
		return false;
	}

	if (filters.freshness && filters.freshness !== "all") {
		if (filters.freshness === "never" && row.health.freshness.lastScrapedAt) {
			return false;
		}
		if (filters.freshness === "stale" && !row.health.freshness.isStale) {
			return false;
		}
		if (
			filters.freshness === "fresh" &&
			(!row.health.freshness.lastScrapedAt || row.health.freshness.isStale)
		) {
			return false;
		}
	}

	if (filters.failure === "has-failure" && !hasFailure(row)) {
		return false;
	}
	if (filters.failure === "none" && hasFailure(row)) {
		return false;
	}

	return matchesCoverageFilter(row, filters.coverage ?? "all");
}

function matchesCoverageFilter(
	row: CoverageDashboardRow,
	coverage: NonNullable<CoverageDashboardFilters["coverage"]>,
) {
	if (coverage === "all") return true;
	if (coverage === "complete") return isCoverageComplete(row);
	if (coverage === "attention") return needsCoverageAttention(row);
	if (coverage === "no-meetings") {
		return row.health.summaryStatus.totalMeetings === 0;
	}
	if (coverage === "needs-documents") {
		return (
			row.health.summaryStatus.totalMeetings > 0 &&
			row.health.documentAvailabilityPct < 100
		);
	}
	if (coverage === "needs-summaries") {
		return (
			row.health.summaryStatus.totalMeetings > 0 &&
			row.health.summaryStatus.summaryCoveragePct < 100
		);
	}

	return true;
}

function compareRows(
	a: CoverageDashboardRow,
	b: CoverageDashboardRow,
	sort: CoverageDashboardSort,
) {
	const direction = sort.direction === "asc" ? 1 : -1;
	const result = compareSortValues(
		sortValue(a, sort.key),
		sortValue(b, sort.key),
	);

	if (result !== 0) return result * direction;

	return a.municipality.name.localeCompare(b.municipality.name);
}

function sortValue(
	row: CoverageDashboardRow,
	key: CoverageDashboardSort["key"],
) {
	switch (key) {
		case "name":
			return row.municipality.name;
		case "health":
			return HEALTH_RANK[row.health.state];
		case "platform":
			return row.municipality.platform;
		case "lastScrape":
			return row.health.freshness.lastScrapedAt;
		case "lastSummary":
			return row.health.summaryStatus.lastSummarizedAt;
		case "freshness":
			return row.health.freshness.ageMs;
		case "coverage":
			return coverageRank(row);
		case "documentAvailability":
			return row.health.documentAvailabilityPct;
		case "summaryCoverage":
			return row.health.summaryStatus.summaryCoveragePct;
		case "scrapeSuccess":
			return row.health.scrapeSuccessRate;
		case "failure":
			return row.health.lastFailure?.at ?? null;
	}
}

function compareSortValues(
	a: string | number | null,
	b: string | number | null,
) {
	if (typeof a === "string" && typeof b === "string") {
		return a.localeCompare(b);
	}
	const left = typeof a === "number" ? a : Number.NEGATIVE_INFINITY;
	const right = typeof b === "number" ? b : Number.NEGATIVE_INFINITY;
	return left - right;
}

function hasFailure(row: CoverageDashboardRow) {
	return row.health.state === "failing" || row.health.lastFailure !== null;
}

function isCoverageComplete(row: CoverageDashboardRow) {
	return (
		row.health.summaryStatus.totalMeetings > 0 &&
		row.health.documentAvailabilityPct === 100 &&
		row.health.summaryStatus.summaryCoveragePct === 100
	);
}

function needsCoverageAttention(row: CoverageDashboardRow) {
	return (
		row.health.summaryStatus.totalMeetings === 0 ||
		row.health.documentAvailabilityPct < 100 ||
		row.health.summaryStatus.summaryCoveragePct < 100
	);
}

function coverageRank(row: CoverageDashboardRow) {
	if (row.health.summaryStatus.totalMeetings === 0) return 0;
	if (
		row.health.documentAvailabilityPct < 100 &&
		row.health.summaryStatus.summaryCoveragePct < 100
	) {
		return 1;
	}
	if (row.health.documentAvailabilityPct < 100) return 2;
	if (row.health.summaryStatus.summaryCoveragePct < 100) return 3;
	return 4;
}

function coverageAlert(row: CoverageDashboardRow): CoverageAlert | null {
	if (isRepeatedFailure(row)) {
		return {
			id: `${row.municipality.id}:repeated-failure`,
			kind: "repeated-failure",
			severity: "critical",
			municipalityId: row.municipality.id,
			municipalityName: row.municipality.name,
			platform: row.municipality.platform,
			reason: row.health.lastFailure?.message ?? "Repeated scrape failures.",
			lastSuccessAt: row.health.freshness.lastSuccessAt,
			suggestedAction:
				"Inspect scraper logs, confirm the agenda URL still works, then retry the scraper.",
		};
	}

	if (row.health.state === "stale") {
		return {
			id: `${row.municipality.id}:stale`,
			kind: "stale",
			severity: "warning",
			municipalityId: row.municipality.id,
			municipalityName: row.municipality.name,
			platform: row.municipality.platform,
			reason: "No successful scrape inside the freshness window.",
			lastSuccessAt:
				row.health.freshness.lastSuccessAt ??
				row.health.freshness.lastScrapedAt,
			suggestedAction:
				"Run a manual scrape or check whether the meeting source changed.",
		};
	}

	return null;
}

function isRepeatedFailure(row: CoverageDashboardRow) {
	return (
		row.health.state === "failing" &&
		row.health.scrapeJobSample.failed >= REPEATED_FAILURE_THRESHOLD
	);
}

function severityRank(severity: CoverageAlert["severity"]) {
	return severity === "critical" ? 0 : 1;
}
