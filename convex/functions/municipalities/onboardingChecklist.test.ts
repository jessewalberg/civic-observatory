import { describe, expect, it } from "vitest";
import {
	buildMunicipalityOnboardingChecklist,
	type MunicipalityOnboardingInput,
} from "./onboardingChecklist";

const NOW = new Date("2026-06-21T12:00:00.000Z").getTime();

describe("municipality onboarding checklist", () => {
	it("marks the workflow complete when source, validation, scrape, summary, and publish state are ready", () => {
		const checklist = buildMunicipalityOnboardingChecklist(
			input({
				latestValidation: validation({ status: "passed", meetingsFound: 3 }),
				scrapeJobs: [job({ status: "completed", meetingsFound: 3 })],
				meetings: [{ id: "meeting_1", status: "summarized" }],
				summaries: [{ meetingId: "meeting_1", createdAt: NOW }],
				municipality: { isActive: true, isVerified: true },
			}),
		);

		expect(statuses(checklist)).toEqual({
			source_url: "completed",
			platform_detection: "completed",
			test_scrape: "completed",
			first_summary: "completed",
			publish_state: "completed",
		});
		expect(checklist.overallStatus).toBe("completed");
		expect(checklist.nextAction).toBeNull();
	});

	it("blocks downstream work until a source URL exists", () => {
		const checklist = buildMunicipalityOnboardingChecklist(
			input({
				municipality: {
					meetingsPageUrl: null,
					platform: "manual",
					isActive: false,
					isVerified: false,
				},
			}),
		);

		expect(statuses(checklist)).toEqual({
			source_url: "next-action",
			platform_detection: "blocked",
			test_scrape: "blocked",
			first_summary: "blocked",
			publish_state: "blocked",
		});
		expect(checklist.overallStatus).toBe("blocked");
		expect(checklist.nextAction).toBe("Add a meetings source URL");
	});

	it("surfaces failed platform validation before test scrape work continues", () => {
		const checklist = buildMunicipalityOnboardingChecklist(
			input({
				latestValidation: validation({
					status: "failed",
					checks: [
						{
							name: "platform_detection",
							status: "fail",
							message: "No automatic scraper is available for manual coverage.",
						},
					],
					meetingsFound: 0,
				}),
			}),
		);

		expect(statuses(checklist)).toMatchObject({
			source_url: "completed",
			platform_detection: "failed",
			test_scrape: "blocked",
		});
		expect(checklist.overallStatus).toBe("failed");
		expect(checklist.nextAction).toBe("Fix platform detection");
	});

	it("shows first summary as the next action after a successful test scrape creates meetings", () => {
		const checklist = buildMunicipalityOnboardingChecklist(
			input({
				latestValidation: validation({ status: "passed", meetingsFound: 2 }),
				scrapeJobs: [job({ status: "completed", meetingsFound: 2 })],
				meetings: [{ id: "meeting_1", status: "pending" }],
			}),
		);

		expect(statuses(checklist)).toMatchObject({
			source_url: "completed",
			platform_detection: "completed",
			test_scrape: "completed",
			first_summary: "next-action",
			publish_state: "blocked",
		});
		expect(checklist.nextAction).toBe("Generate the first public summary");
	});

	it("shows publish state as the next action after a first summary exists", () => {
		const checklist = buildMunicipalityOnboardingChecklist(
			input({
				latestValidation: validation({ status: "passed", meetingsFound: 2 }),
				scrapeJobs: [job({ status: "completed", meetingsFound: 2 })],
				meetings: [{ id: "meeting_1", status: "summarized" }],
				summaries: [{ meetingId: "meeting_1", createdAt: NOW }],
				municipality: { isActive: false, isVerified: false },
			}),
		);

		expect(statuses(checklist)).toMatchObject({
			first_summary: "completed",
			publish_state: "next-action",
		});
		expect(checklist.nextAction).toBe("Publish or verify coverage");
	});
});

function statuses(
	checklist: ReturnType<typeof buildMunicipalityOnboardingChecklist>,
) {
	return Object.fromEntries(
		checklist.steps.map((step) => [step.key, step.status]),
	);
}

function input(
	overrides: Omit<Partial<MunicipalityOnboardingInput>, "municipality"> & {
		municipality?: Partial<MunicipalityOnboardingInput["municipality"]>;
	} = {},
): MunicipalityOnboardingInput {
	return {
		now: NOW,
		municipality: {
			id: "muni_1",
			name: "Validation Falls",
			state: "CT",
			meetingsPageUrl: "https://example.test/agendas",
			platform: "civicplus",
			isActive: false,
			isVerified: false,
			...overrides.municipality,
		},
		latestValidation: overrides.latestValidation ?? null,
		scrapeJobs: overrides.scrapeJobs ?? [],
		meetings: overrides.meetings ?? [],
		summaries: overrides.summaries ?? [],
	};
}

function validation(
	overrides: Partial<
		NonNullable<MunicipalityOnboardingInput["latestValidation"]>
	> & {
		meetingsFound?: number;
	} = {},
): NonNullable<MunicipalityOnboardingInput["latestValidation"]> {
	return {
		status: overrides.status ?? "passed",
		createdAt: NOW - 60_000,
		stats: {
			meetingsFound: overrides.meetingsFound ?? 1,
		},
		checks: overrides.checks ?? [
			{
				name: "platform_detection",
				status: "pass",
				message: "Using CivicPlus scraper.",
			},
			{
				name: "meeting_extraction",
				status: "pass",
				message: "Meetings extracted.",
			},
		],
	};
}

function job(
	overrides: Partial<MunicipalityOnboardingInput["scrapeJobs"][number]> = {},
): MunicipalityOnboardingInput["scrapeJobs"][number] {
	return {
		status: "completed",
		createdAt: NOW - 30_000,
		completedAt: NOW - 20_000,
		meetingsFound: 1,
		errors: [],
		...overrides,
	};
}
