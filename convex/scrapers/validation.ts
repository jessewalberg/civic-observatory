import type { Platform, ScrapedMeeting, ScraperError } from "./types";
import { normalizeUrl } from "./utils";

export type ScraperValidationStatus = "passed" | "partial" | "failed";

export type ScraperValidationCheckName =
	| "platform_detection"
	| "source_reachable"
	| "meeting_extraction"
	| "document_links"
	| "duplicate_behavior"
	| "summary_readiness";

export type ScraperValidationCheckStatus =
	| "pass"
	| "warning"
	| "fail"
	| "not_applicable";

export type ScraperValidationCheck = {
	name: ScraperValidationCheckName;
	status: ScraperValidationCheckStatus;
	message: string;
	details?: Array<{ label: string; value: string }>;
};

export type DuplicateValidationResult = {
	exists: boolean;
	sourceUrl?: string;
	contentHash?: string;
	reason?: string;
};

export type ScraperValidationMeetingSample = {
	title: string;
	meetingDate: number;
	sourceUrl: string;
	documentUrl?: string;
	hasRawContent: boolean;
	documentReady: boolean;
	summaryReady: boolean;
	duplicate: boolean;
};

export type ScraperValidationReport = {
	status: ScraperValidationStatus;
	checks: ScraperValidationCheck[];
	stats: {
		meetingsFound: number;
		documentReady: number;
		summaryReady: number;
		duplicates: number;
		errors: number;
	};
	meetingSample: ScraperValidationMeetingSample[];
	errors: Array<{
		message: string;
		url?: string;
		code?: ScraperError["code"];
		timestamp: number;
	}>;
};

export type ScraperValidationReportInput = {
	now: number;
	sourceUrl: string;
	configuredPlatform?: Platform;
	detectedPlatform: Platform;
	selectedPlatform?: Platform;
	scraperFound: boolean;
	scrapeSucceeded: boolean;
	meetings: ScrapedMeeting[];
	errors: ScraperError[];
	duplicateResults?: DuplicateValidationResult[];
};

export function buildScraperValidationReport(
	input: ScraperValidationReportInput,
): ScraperValidationReport {
	const duplicateResults = input.duplicateResults;
	const meetingSample = input.meetings.slice(0, 20).map((meeting, index) => {
		const duplicate = duplicateResults?.[index]?.exists === true;
		return {
			title: meeting.title,
			meetingDate: meeting.meetingDate,
			sourceUrl: meeting.sourceUrl,
			documentUrl: meeting.documentUrl,
			hasRawContent: hasRawContent(meeting),
			documentReady: isDocumentReady(meeting),
			summaryReady: isSummaryReady(meeting, input.sourceUrl),
			duplicate,
		};
	});

	const stats = {
		meetingsFound: input.meetings.length,
		documentReady: meetingSample.filter((meeting) => meeting.documentReady)
			.length,
		summaryReady: meetingSample.filter((meeting) => meeting.summaryReady)
			.length,
		duplicates:
			duplicateResults?.filter((duplicate) => duplicate.exists).length ?? 0,
		errors: input.errors.length,
	};

	const checks: ScraperValidationCheck[] = [
		platformDetectionCheck(input),
		sourceReachableCheck(input),
		meetingExtractionCheck(input),
		documentLinksCheck(stats, input.meetings.length),
		duplicateBehaviorCheck(input, stats),
		summaryReadinessCheck(stats, input.meetings.length),
	];

	return {
		status: overallStatus(checks),
		checks,
		stats,
		meetingSample,
		errors: input.errors.map((error) => ({
			message: error.message,
			url: error.url,
			code: error.code,
			timestamp: error.timestamp,
		})),
	};
}

function platformDetectionCheck(
	input: ScraperValidationReportInput,
): ScraperValidationCheck {
	if (input.configuredPlatform === "manual") {
		return {
			name: "platform_detection",
			status: "fail",
			message: "No automatic scraper is available for manual coverage.",
			details: platformDetails(input),
		};
	}

	if (!input.scraperFound) {
		return {
			name: "platform_detection",
			status: "fail",
			message: `No scraper is available for ${input.detectedPlatform}.`,
			details: platformDetails(input),
		};
	}

	if (
		input.configuredPlatform &&
		input.configuredPlatform !== input.detectedPlatform
	) {
		return {
			name: "platform_detection",
			status: "warning",
			message: `Detected ${input.detectedPlatform}, validating with configured ${input.configuredPlatform}.`,
			details: platformDetails(input),
		};
	}

	return {
		name: "platform_detection",
		status: "pass",
		message: `Using ${input.selectedPlatform ?? input.detectedPlatform} scraper.`,
		details: platformDetails(input),
	};
}

function sourceReachableCheck(
	input: ScraperValidationReportInput,
): ScraperValidationCheck {
	if (!input.scraperFound) {
		return {
			name: "source_reachable",
			status: "not_applicable",
			message: "Reachability was skipped because no scraper was available.",
		};
	}

	const firstError = input.errors[0];
	if (!input.scrapeSucceeded && input.meetings.length === 0) {
		return {
			name: "source_reachable",
			status: "fail",
			message: `Source was not reachable: ${firstError?.message ?? "scrape failed"}`,
		};
	}

	if (input.errors.length > 0) {
		return {
			name: "source_reachable",
			status: "warning",
			message: `Source responded with ${input.errors.length} scraper warning${input.errors.length === 1 ? "" : "s"}.`,
		};
	}

	return {
		name: "source_reachable",
		status: "pass",
		message: "Source responded to scraper validation.",
	};
}

function meetingExtractionCheck(
	input: ScraperValidationReportInput,
): ScraperValidationCheck {
	if (input.meetings.length === 0) {
		return {
			name: "meeting_extraction",
			status: "fail",
			message: "No meetings were extracted from the source.",
		};
	}

	return {
		name: "meeting_extraction",
		status: "pass",
		message: `${input.meetings.length} meeting${input.meetings.length === 1 ? "" : "s"} extracted.`,
		details: [{ label: "meetings", value: String(input.meetings.length) }],
	};
}

function documentLinksCheck(
	stats: ScraperValidationReport["stats"],
	meetingCount: number,
): ScraperValidationCheck {
	if (meetingCount === 0) {
		return {
			name: "document_links",
			status: "not_applicable",
			message: "Document checks require extracted meetings.",
		};
	}

	if (stats.documentReady === meetingCount) {
		return {
			name: "document_links",
			status: "pass",
			message: "Every extracted meeting had a document link or inline content.",
		};
	}

	if (stats.documentReady > 0) {
		return {
			name: "document_links",
			status: "warning",
			message: `Only ${stats.documentReady} of ${meetingCount} meetings had document links or inline content.`,
		};
	}

	return {
		name: "document_links",
		status: "fail",
		message: "No extracted meetings had document links or inline content.",
	};
}

function duplicateBehaviorCheck(
	input: ScraperValidationReportInput,
	stats: ScraperValidationReport["stats"],
): ScraperValidationCheck {
	if (input.meetings.length === 0) {
		return {
			name: "duplicate_behavior",
			status: "not_applicable",
			message: "Duplicate checks require extracted meetings.",
		};
	}

	if (!input.duplicateResults) {
		return {
			name: "duplicate_behavior",
			status: "warning",
			message:
				"Duplicate checks were skipped because no municipality record was selected.",
		};
	}

	if (input.duplicateResults.length < input.meetings.length) {
		return {
			name: "duplicate_behavior",
			status: "warning",
			message:
				"Only part of the extracted meeting set was checked for duplicates.",
		};
	}

	if (stats.duplicates === input.meetings.length) {
		return {
			name: "duplicate_behavior",
			status: "warning",
			message: "Every extracted meeting already exists for this municipality.",
		};
	}

	return {
		name: "duplicate_behavior",
		status: "pass",
		message: `${stats.duplicates} duplicate${stats.duplicates === 1 ? "" : "s"} detected.`,
	};
}

function summaryReadinessCheck(
	stats: ScraperValidationReport["stats"],
	meetingCount: number,
): ScraperValidationCheck {
	if (meetingCount === 0) {
		return {
			name: "summary_readiness",
			status: "not_applicable",
			message: "Summary-readiness checks require extracted meetings.",
		};
	}

	if (stats.summaryReady === meetingCount) {
		return {
			name: "summary_readiness",
			status: "pass",
			message: "Every extracted meeting can move toward summarization.",
		};
	}

	if (stats.summaryReady > 0) {
		return {
			name: "summary_readiness",
			status: "warning",
			message: `Only ${stats.summaryReady} of ${meetingCount} meetings look summary-ready.`,
		};
	}

	return {
		name: "summary_readiness",
		status: "fail",
		message: "No extracted meetings look summary-ready.",
	};
}

function overallStatus(
	checks: ScraperValidationCheck[],
): ScraperValidationStatus {
	if (checks.some((check) => check.status === "fail")) {
		return "failed";
	}
	if (checks.some((check) => check.status === "warning")) {
		return "partial";
	}
	return "passed";
}

function platformDetails(
	input: ScraperValidationReportInput,
): Array<{ label: string; value: string }> {
	return [
		{ label: "detected", value: input.detectedPlatform },
		{ label: "configured", value: input.configuredPlatform ?? "none" },
		{ label: "selected", value: input.selectedPlatform ?? "none" },
	];
}

function hasRawContent(meeting: ScrapedMeeting): boolean {
	return Boolean(meeting.rawContent?.trim());
}

function isDocumentReady(meeting: ScrapedMeeting): boolean {
	return hasRawContent(meeting) || Boolean(meeting.documentUrl?.trim());
}

function isSummaryReady(meeting: ScrapedMeeting, sourceUrl: string): boolean {
	if (hasRawContent(meeting)) return true;

	const documentUrl = meeting.documentUrl?.trim();
	if (documentUrl && isLikelyDocumentUrl(documentUrl)) return true;

	if (isLikelyDocumentUrl(meeting.sourceUrl)) return true;

	return normalizeUrl(meeting.sourceUrl) !== normalizeUrl(sourceUrl);
}

function isLikelyDocumentUrl(url: string): boolean {
	return (
		/\.pdf(\?|#|$)/i.test(url) ||
		/\/ViewFile/i.test(url) ||
		/\/View\.ashx/i.test(url)
	);
}
