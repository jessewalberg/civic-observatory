import type { PublicCoverageBadge } from "../../../src/lib/publicCoverageBadge";
import { getCoverageStatus } from "./coveragePublication";

type Platform = "granicus" | "civicplus" | "generic" | "manual";
type ScrapeStatus = "success" | "failed" | "partial";

type CoverageBadgeMunicipality = {
	coverageStatus?: "published" | "unpublished" | "paused";
	isActive: boolean;
	isVerified: boolean;
	platform: Platform;
	scrapeConfig?: { frequencyHours?: number | null } | null;
	lastScrapedAt?: number | null;
	lastScrapeStatus?: ScrapeStatus | null;
};

const DEFAULT_FREQUENCY_HOURS = 24;
const STALE_MULTIPLIER = 2;

export function buildPublicCoverageBadge(
	municipality: CoverageBadgeMunicipality,
	now = Date.now(),
): PublicCoverageBadge {
	const coverageStatus = getCoverageStatus(municipality);
	const latestHealth = getLatestHealth(municipality, now);
	const lastCheckedAt =
		municipality.platform === "manual"
			? null
			: (municipality.lastScrapedAt ?? null);

	if (coverageStatus === "paused") {
		return {
			kind: "paused",
			label: "Paused coverage",
			tone: "warning",
			description: "Coverage is temporarily paused while operators review it.",
			lastCheckedAt,
			latestHealth,
		};
	}

	if (coverageStatus === "unpublished") {
		return {
			kind: "unpublished",
			label: "Unpublished coverage",
			tone: "secondary",
			description: "Coverage is not currently published to public users.",
			lastCheckedAt,
			latestHealth,
		};
	}

	if (municipality.platform === "manual") {
		return {
			kind: "manual",
			label: "Manual coverage",
			tone: "secondary",
			description:
				"Meetings are added or verified manually; automated scrape freshness does not apply.",
			lastCheckedAt,
			latestHealth,
		};
	}

	if (municipality.isActive && municipality.isVerified) {
		return {
			kind: "verified",
			label: "Verified coverage",
			tone: "success",
			description:
				"Active scraper coverage has been verified by Civic Observatory.",
			lastCheckedAt,
			latestHealth,
		};
	}

	if (municipality.isActive) {
		return {
			kind: "active",
			label: "Active coverage",
			tone: "info",
			description:
				"Active scraper coverage is available but has not been independently verified yet.",
			lastCheckedAt,
			latestHealth,
		};
	}

	return {
		kind: "seeded",
		label: "Seeded coverage",
		tone: "warning",
		description:
			"Coverage is published from seeded data and has not been verified yet.",
		lastCheckedAt,
		latestHealth,
	};
}

export function withPublicCoverageBadge<T extends CoverageBadgeMunicipality>(
	municipality: T,
	now = Date.now(),
): T & { coverageBadge: PublicCoverageBadge } {
	return {
		...municipality,
		coverageBadge: buildPublicCoverageBadge(municipality, now),
	};
}

export function toSafePublicMunicipality<
	T extends CoverageBadgeMunicipality & { lastScrapeError?: string | null },
>(
	municipality: T,
	now = Date.now(),
): Omit<T, "lastScrapeError"> & {
	lastScrapeError?: never;
	coverageBadge: PublicCoverageBadge;
} {
	const { lastScrapeError: _lastScrapeError, ...safeMunicipality } =
		municipality;
	return {
		...safeMunicipality,
		coverageBadge: buildPublicCoverageBadge(municipality, now),
	};
}

function getLatestHealth(
	municipality: CoverageBadgeMunicipality,
	now: number,
): PublicCoverageBadge["latestHealth"] {
	if (municipality.platform === "manual") return "manual";
	if (municipality.lastScrapeStatus === "failed") return "failing";
	if (municipality.lastScrapeStatus === "partial") return "partial";
	if (!municipality.lastScrapedAt) return "unknown";
	if (isStale(municipality, now)) return "stale";
	if (municipality.lastScrapeStatus === "success") return "fresh";
	return "unknown";
}

function isStale(
	municipality: CoverageBadgeMunicipality,
	now: number,
): boolean {
	if (!municipality.lastScrapedAt) return false;

	const frequencyHours =
		municipality.scrapeConfig?.frequencyHours ?? DEFAULT_FREQUENCY_HOURS;
	const staleAfterMs = frequencyHours * 60 * 60 * 1000 * STALE_MULTIPLIER;
	return now - municipality.lastScrapedAt > staleAfterMs;
}
