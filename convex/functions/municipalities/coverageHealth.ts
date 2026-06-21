export type CoverageHealthState =
	| "live"
	| "stale"
	| "failing"
	| "unsupported"
	| "pending"
	| "never-probed";

type ScrapeStatus = "success" | "failed" | "partial";
type Platform = "granicus" | "civicplus" | "generic" | "manual";
type MeetingStatus =
	| "pending"
	| "processing"
	| "summarized"
	| "failed"
	| "skipped";
type ScrapeJobStatus =
	| "pending"
	| "running"
	| "completed"
	| "failed"
	| "partial";

export type CoverageHealthInput = {
	now: number;
	municipality: {
		isActive: boolean;
		platform: Platform;
		meetingsPageUrl?: string | null;
		scrapeConfig?: { frequencyHours?: number | null } | null;
		lastScrapedAt?: number | null;
		lastScrapeStatus?: ScrapeStatus | null;
		lastScrapeError?: string | null;
	};
	meetings: Array<{
		id: string;
		status: MeetingStatus;
		sourceUrl?: string | null;
		rawContent?: string | null;
		documentStorageId?: string | null;
	}>;
	summaries: Array<{
		meetingId: string;
		createdAt?: number | null;
	}>;
	scrapeJobs: Array<{
		status: ScrapeJobStatus;
		createdAt: number;
		completedAt?: number | null;
		errors?: Array<{
			message: string;
			timestamp?: number;
			url?: string;
		}> | null;
	}>;
};

export type MunicipalityCoverageHealth = {
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

const DEFAULT_FREQUENCY_HOURS = 24;
const STALE_MULTIPLIER = 2;

export function buildMunicipalityCoverageHealth(
	input: CoverageHealthInput,
): MunicipalityCoverageHealth {
	const frequencyHours =
		input.municipality.scrapeConfig?.frequencyHours ?? DEFAULT_FREQUENCY_HOURS;
	const frequencyMs = frequencyHours * 60 * 60 * 1000;
	const staleAfterMs = frequencyMs * STALE_MULTIPLIER;
	const lastScrapedAt = input.municipality.lastScrapedAt ?? null;
	const ageMs = lastScrapedAt ? Math.max(0, input.now - lastScrapedAt) : null;
	const isStale = typeof ageMs === "number" && ageMs > staleAfterMs;
	const isSupported =
		input.municipality.isActive &&
		input.municipality.platform !== "manual" &&
		Boolean(input.municipality.meetingsPageUrl?.trim());
	const hasActiveJob = input.scrapeJobs.some(
		(job) => job.status === "pending" || job.status === "running",
	);
	const terminalJobs = input.scrapeJobs.filter(
		(job) => job.status !== "pending" && job.status !== "running",
	);
	const latestTerminalJob = terminalJobs[0] ?? null;
	const lastFailure = findLastFailure(input);
	const lastSuccessAt = findLastSuccess(input, terminalJobs);

	let state: CoverageHealthState;
	if (!isSupported) {
		state = "unsupported";
	} else if (hasActiveJob) {
		state = "pending";
	} else if (!lastScrapedAt && terminalJobs.length === 0) {
		state = "never-probed";
	} else if (
		input.municipality.lastScrapeStatus === "failed" ||
		latestTerminalJob?.status === "failed"
	) {
		state = "failing";
	} else if (isStale) {
		state = "stale";
	} else {
		state = "live";
	}

	return {
		state,
		freshness: {
			lastScrapedAt,
			lastSuccessAt,
			ageMs,
			frequencyHours,
			staleAfterMs,
			isStale,
		},
		scrapeSuccessRate: scrapeSuccessRate(terminalJobs),
		scrapeJobSample: scrapeJobSample(terminalJobs),
		documentAvailabilityPct: documentAvailabilityPct(input.meetings),
		summaryStatus: summaryStatus(input),
		lastFailure,
	};
}

function scrapeSuccessRate(
	jobs: CoverageHealthInput["scrapeJobs"],
): number | null {
	if (jobs.length === 0) return null;

	const score = jobs.reduce((total, job) => {
		if (job.status === "completed") return total + 1;
		if (job.status === "partial") return total + 0.5;
		return total;
	}, 0);

	return score / jobs.length;
}

function scrapeJobSample(
	jobs: CoverageHealthInput["scrapeJobs"],
): MunicipalityCoverageHealth["scrapeJobSample"] {
	return {
		total: jobs.length,
		completed: jobs.filter((job) => job.status === "completed").length,
		partial: jobs.filter((job) => job.status === "partial").length,
		failed: jobs.filter((job) => job.status === "failed").length,
	};
}

function documentAvailabilityPct(
	meetings: CoverageHealthInput["meetings"],
): number {
	if (meetings.length === 0) return 0;

	const available = meetings.filter(
		(meeting) =>
			Boolean(meeting.sourceUrl?.trim()) ||
			Boolean(meeting.rawContent?.trim()) ||
			Boolean(meeting.documentStorageId),
	).length;

	return percent(available, meetings.length);
}

function summaryStatus(
	input: CoverageHealthInput,
): MunicipalityCoverageHealth["summaryStatus"] {
	const byStatus = {
		totalMeetings: input.meetings.length,
		summarized: 0,
		pending: 0,
		processing: 0,
		failed: 0,
		skipped: 0,
	};

	for (const meeting of input.meetings) {
		byStatus[meeting.status]++;
	}

	return {
		...byStatus,
		summaryCoveragePct: percent(input.summaries.length, input.meetings.length),
		lastSummarizedAt: latestTimestamp(input.summaries),
	};
}

function latestTimestamp(summaries: CoverageHealthInput["summaries"]) {
	const timestamps = summaries
		.map((summary) => summary.createdAt)
		.filter((createdAt): createdAt is number => typeof createdAt === "number");

	return timestamps.length > 0 ? Math.max(...timestamps) : null;
}

function findLastFailure(
	input: CoverageHealthInput,
): MunicipalityCoverageHealth["lastFailure"] {
	if (input.municipality.lastScrapeError) {
		return {
			message: input.municipality.lastScrapeError,
			at: input.municipality.lastScrapedAt ?? null,
		};
	}

	for (const job of input.scrapeJobs) {
		if (job.status !== "failed" && job.status !== "partial") continue;
		const error = job.errors?.[0];
		if (error) {
			return {
				message: error.message,
				at: error.timestamp ?? job.completedAt ?? job.createdAt,
				url: error.url,
			};
		}
		if (job.status === "failed") {
			return {
				message: "Scrape job failed",
				at: job.completedAt ?? job.createdAt,
			};
		}
	}

	return null;
}

function findLastSuccess(
	input: CoverageHealthInput,
	jobs: CoverageHealthInput["scrapeJobs"],
) {
	for (const job of jobs) {
		if (job.status === "completed") {
			return job.completedAt ?? job.createdAt;
		}
	}

	if (
		input.municipality.lastScrapeStatus === "success" &&
		input.municipality.lastScrapedAt
	) {
		return input.municipality.lastScrapedAt;
	}

	return null;
}

function percent(numerator: number, denominator: number): number {
	if (denominator === 0) return 0;
	return Math.round((numerator / denominator) * 100);
}
