export const COVERAGE_STATUSES = [
	"published",
	"unpublished",
	"paused",
] as const;

export type CoverageStatus = (typeof COVERAGE_STATUSES)[number];

type CoverageStatusInput = {
	coverageStatus?: CoverageStatus;
	isActive?: boolean;
	isVerified?: boolean;
};

type ValidationForPublication = {
	status: "passed" | "partial" | "failed";
	stats: {
		meetingsFound: number;
	};
};

export type CoveragePublishEvaluation =
	| { allowed: true; mode: "validation" | "override" }
	| { allowed: false; reason: string };

export function getCoverageStatus(
	municipality: CoverageStatusInput,
): CoverageStatus {
	if (municipality.coverageStatus) {
		return municipality.coverageStatus;
	}

	return municipality.isActive && municipality.isVerified
		? "published"
		: "unpublished";
}

export function isCoveragePublic(municipality: CoverageStatusInput): boolean {
	return getCoverageStatus(municipality) === "published";
}

export function evaluateCoveragePublishRequest({
	latestValidation,
	overrideReason,
}: {
	latestValidation?: ValidationForPublication | null;
	overrideReason?: string | null;
}): CoveragePublishEvaluation {
	if (overrideReason?.trim()) {
		return { allowed: true, mode: "override" };
	}

	if (
		latestValidation &&
		(latestValidation.status === "passed" ||
			latestValidation.status === "partial") &&
		latestValidation.stats.meetingsFound > 0
	) {
		return { allowed: true, mode: "validation" };
	}

	return {
		allowed: false,
		reason:
			"Publishing requires a successful scraper validation or an explicit override reason.",
	};
}
