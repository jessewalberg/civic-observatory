import { type CoverageStatus, getCoverageStatus } from "./coveragePublication";

type Platform = "granicus" | "civicplus" | "generic" | "manual";
type ValidationStatus = "passed" | "partial" | "failed";
type CheckStatus = "pass" | "warning" | "fail" | "not_applicable";
type ScrapeJobStatus =
	| "pending"
	| "running"
	| "completed"
	| "failed"
	| "partial";
type MeetingStatus =
	| "pending"
	| "processing"
	| "summarized"
	| "failed"
	| "skipped";

export type OnboardingChecklistStepKey =
	| "source_url"
	| "platform_detection"
	| "test_scrape"
	| "first_summary"
	| "publish_state";

export type OnboardingChecklistStepStatus =
	| "completed"
	| "blocked"
	| "failed"
	| "next-action";

export type MunicipalityOnboardingInput = {
	now: number;
	municipality: {
		id: string;
		name: string;
		state: string;
		meetingsPageUrl?: string | null;
		platform: Platform;
		coverageStatus?: CoverageStatus;
		coverageStatusReason?: string | null;
		coverageStatusOverrideReason?: string | null;
		coverageStatusUpdatedAt?: number | null;
		isActive: boolean;
		isVerified: boolean;
	};
	latestValidation?: {
		status: ValidationStatus;
		createdAt: number;
		stats: {
			meetingsFound: number;
		};
		checks: Array<{
			name: string;
			status: CheckStatus;
			message: string;
		}>;
	} | null;
	scrapeJobs: Array<{
		status: ScrapeJobStatus;
		createdAt: number;
		completedAt?: number | null;
		meetingsFound?: number | null;
		errors?: Array<{
			message: string;
			timestamp?: number;
			url?: string;
		}> | null;
	}>;
	meetings: Array<{
		id: string;
		status: MeetingStatus;
	}>;
	summaries: Array<{
		meetingId: string;
		createdAt?: number | null;
	}>;
};

export type MunicipalityOnboardingChecklist = {
	municipality: MunicipalityOnboardingInput["municipality"];
	overallStatus: OnboardingChecklistStepStatus;
	nextAction: string | null;
	steps: Array<{
		key: OnboardingChecklistStepKey;
		label: string;
		status: OnboardingChecklistStepStatus;
		detail: string;
		nextAction: string | null;
		updatedAt: number | null;
	}>;
};

export function buildMunicipalityOnboardingChecklist(
	input: MunicipalityOnboardingInput,
): MunicipalityOnboardingChecklist {
	const source = sourceUrlStep(input);
	const platform = platformDetectionStep(input, source);
	const testScrape = testScrapeStep(input, platform);
	const firstSummary = firstSummaryStep(input, testScrape);
	const publish = publishStateStep(input, firstSummary);
	const steps = [source, platform, testScrape, firstSummary, publish];

	return {
		municipality: input.municipality,
		overallStatus: overallStatus(steps),
		nextAction: firstActionableStep(steps)?.nextAction ?? null,
		steps,
	};
}

function sourceUrlStep(
	input: MunicipalityOnboardingInput,
): MunicipalityOnboardingChecklist["steps"][number] {
	const hasSource = Boolean(input.municipality.meetingsPageUrl?.trim());

	return {
		key: "source_url",
		label: "Source URL",
		status: hasSource ? "completed" : "next-action",
		detail: hasSource
			? "Meetings source URL is configured."
			: "No meetings source URL is configured.",
		nextAction: hasSource ? null : "Add a meetings source URL",
		updatedAt: null,
	};
}

function platformDetectionStep(
	input: MunicipalityOnboardingInput,
	source: MunicipalityOnboardingChecklist["steps"][number],
): MunicipalityOnboardingChecklist["steps"][number] {
	if (source.status !== "completed") {
		return blockedStep(
			"platform_detection",
			"Platform Detection",
			"Add a source URL before validating platform detection.",
		);
	}

	const check = findCheck(input, "platform_detection");
	if (check?.status === "fail") {
		return {
			key: "platform_detection",
			label: "Platform Detection",
			status: "failed",
			detail: check.message,
			nextAction: "Fix platform detection",
			updatedAt: input.latestValidation?.createdAt ?? null,
		};
	}

	if (input.latestValidation && check) {
		return {
			key: "platform_detection",
			label: "Platform Detection",
			status: "completed",
			detail: check.message,
			nextAction: null,
			updatedAt: input.latestValidation.createdAt,
		};
	}

	return {
		key: "platform_detection",
		label: "Platform Detection",
		status: "next-action",
		detail: `Configured platform is ${input.municipality.platform}.`,
		nextAction: "Run scraper validation",
		updatedAt: null,
	};
}

function testScrapeStep(
	input: MunicipalityOnboardingInput,
	platform: MunicipalityOnboardingChecklist["steps"][number],
): MunicipalityOnboardingChecklist["steps"][number] {
	if (platform.status !== "completed") {
		return blockedStep(
			"test_scrape",
			"Test Scrape",
			"Complete platform detection before running a test scrape.",
		);
	}

	const latestJob = input.scrapeJobs[0] ?? null;
	const extractionCheck = findCheck(input, "meeting_extraction");
	if (
		extractionCheck?.status === "fail" ||
		input.latestValidation?.status === "failed"
	) {
		return {
			key: "test_scrape",
			label: "Test Scrape",
			status: "failed",
			detail: extractionCheck?.message ?? "Latest scraper validation failed.",
			nextAction: "Fix test scrape",
			updatedAt: input.latestValidation?.createdAt ?? null,
		};
	}

	if (latestJob?.status === "failed") {
		return {
			key: "test_scrape",
			label: "Test Scrape",
			status: "failed",
			detail: latestJob.errors?.[0]?.message ?? "Latest scrape job failed.",
			nextAction: "Fix test scrape",
			updatedAt: latestJob.completedAt ?? latestJob.createdAt,
		};
	}

	const validationFound = input.latestValidation?.stats.meetingsFound ?? 0;
	const jobFound = latestJob?.meetingsFound ?? 0;
	if (
		validationFound > 0 ||
		((latestJob?.status === "completed" || latestJob?.status === "partial") &&
			jobFound > 0)
	) {
		return {
			key: "test_scrape",
			label: "Test Scrape",
			status: "completed",
			detail: `${Math.max(validationFound, jobFound)} meetings found.`,
			nextAction: null,
			updatedAt:
				input.latestValidation?.createdAt ??
				latestJob?.completedAt ??
				latestJob?.createdAt ??
				null,
		};
	}

	return {
		key: "test_scrape",
		label: "Test Scrape",
		status: "next-action",
		detail: "No successful test scrape has found meetings yet.",
		nextAction: "Run a test scrape or validation",
		updatedAt: latestJob?.createdAt ?? null,
	};
}

function firstSummaryStep(
	input: MunicipalityOnboardingInput,
	testScrape: MunicipalityOnboardingChecklist["steps"][number],
): MunicipalityOnboardingChecklist["steps"][number] {
	if (testScrape.status !== "completed") {
		return blockedStep(
			"first_summary",
			"First Summary",
			"Complete a test scrape before generating the first summary.",
		);
	}

	if (input.summaries.length > 0) {
		const latestSummaryAt =
			input.summaries
				.map((summary) => summary.createdAt ?? null)
				.filter((createdAt): createdAt is number => createdAt !== null)
				.sort((a, b) => b - a)[0] ?? null;
		return {
			key: "first_summary",
			label: "First Summary",
			status: "completed",
			detail: "At least one meeting summary exists.",
			nextAction: null,
			updatedAt: latestSummaryAt,
		};
	}

	if (
		input.meetings.length > 0 &&
		input.meetings.every((meeting) => meeting.status === "failed")
	) {
		return {
			key: "first_summary",
			label: "First Summary",
			status: "failed",
			detail: "Meetings exist, but summary processing has failed.",
			nextAction: "Fix first summary generation",
			updatedAt: null,
		};
	}

	return {
		key: "first_summary",
		label: "First Summary",
		status: "next-action",
		detail: "No meeting summary exists yet.",
		nextAction: "Generate the first public summary",
		updatedAt: null,
	};
}

function publishStateStep(
	input: MunicipalityOnboardingInput,
	firstSummary: MunicipalityOnboardingChecklist["steps"][number],
): MunicipalityOnboardingChecklist["steps"][number] {
	if (firstSummary.status !== "completed") {
		return blockedStep(
			"publish_state",
			"Publish State",
			"Generate the first summary before publishing coverage.",
		);
	}

	const coverageStatus = getCoverageStatus(input.municipality);
	if (coverageStatus === "published") {
		return {
			key: "publish_state",
			label: "Publish State",
			status: "completed",
			detail: "Coverage is published.",
			nextAction: null,
			updatedAt: input.municipality.coverageStatusUpdatedAt ?? null,
		};
	}

	return {
		key: "publish_state",
		label: "Publish State",
		status: "next-action",
		detail:
			coverageStatus === "paused"
				? "Coverage is paused."
				: "Coverage is unpublished.",
		nextAction: "Publish coverage",
		updatedAt: input.municipality.coverageStatusUpdatedAt ?? null,
	};
}

function blockedStep(
	key: OnboardingChecklistStepKey,
	label: string,
	detail: string,
): MunicipalityOnboardingChecklist["steps"][number] {
	return {
		key,
		label,
		status: "blocked",
		detail,
		nextAction: null,
		updatedAt: null,
	};
}

function findCheck(input: MunicipalityOnboardingInput, name: string) {
	return input.latestValidation?.checks.find((check) => check.name === name);
}

function firstActionableStep(steps: MunicipalityOnboardingChecklist["steps"]) {
	return steps.find(
		(step) => step.status === "failed" || step.status === "next-action",
	);
}

function overallStatus(
	steps: MunicipalityOnboardingChecklist["steps"],
): OnboardingChecklistStepStatus {
	if (steps.every((step) => step.status === "completed")) return "completed";
	if (steps.some((step) => step.status === "failed")) return "failed";
	if (steps[0]?.status === "next-action") return "blocked";
	if (steps.some((step) => step.status === "next-action")) return "next-action";
	return "blocked";
}
