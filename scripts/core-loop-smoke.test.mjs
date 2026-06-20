import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
	parseArgs,
	parseConvexJson,
	runCoreLoopSmoke,
} from "./core-loop-smoke.mjs";

describe("core loop smoke script", () => {
	it("runs seed -> scrape -> summarize -> status against a dev deployment", async () => {
		const cwd = makeProjectDir();
		const calls = [];
		const runner = async (args) => {
			calls.push(args);

			if (args.includes("seedMunicipalities:seedState")) {
				return JSON.stringify({
					success: true,
					state: "Connecticut",
					inserted: 0,
					skipped: 31,
					total: 31,
				});
			}

			if (args.includes("--inline-query") && calls.length === 2) {
				return JSON.stringify({
					_id: "municipality_coventry",
					name: "Coventry",
					state: "Connecticut",
					meetingsPageUrl: "https://www.coventry-ct.gov/AgendaCenter",
				});
			}

			if (args.includes("functions/scrapers/actions:runScraper")) {
				return JSON.stringify({
					success: true,
					jobId: "job_coventry",
					stats: { found: 203, created: 1, skipped: 202, failed: 0 },
				});
			}

			if (args.includes("--inline-query") && calls.length === 4) {
				return JSON.stringify([
					{ _id: "meeting_1", title: "Town Council Meeting: June 15, 2026" },
					{ _id: "meeting_2", title: "Town Council Meeting: June 1, 2026" },
					{ _id: "meeting_3", title: "Town Council Meeting: May 18, 2026" },
				]);
			}

			if (args.includes("functions/ai/summarize:summarizeMeeting")) {
				return JSON.stringify({
					success: true,
				});
			}

			if (args.includes("--inline-query")) {
				return JSON.stringify({
					totalMeetings: 203,
					statuses: {
						pending: 5,
						processing: 0,
						summarized: 190,
						failed: 0,
						skipped: 8,
					},
					summaryCount: 190,
					summariesWithSource: 190,
				});
			}

			throw new Error(`Unexpected command: ${args.join(" ")}`);
		};

		const result = await runCoreLoopSmoke({
			argv: ["--deployment", "dev", "--no-push", "--summary-limit", "3"],
			cwd,
			runner,
			now: () => new Date("2026-06-20T22:00:00.000Z"),
		});

		expect(result).toMatchObject({
			municipality: {
				id: "municipality_coventry",
				name: "Coventry",
				state: "Connecticut",
			},
			seed: { inserted: 0, skipped: 31 },
			scrape: { found: 203, created: 1, skipped: 202, failed: 0 },
			summarize: { processed: 3, succeeded: 3, failed: 0 },
			status: {
				totalMeetings: 203,
				statuses: {
					pending: 5,
					processing: 0,
					summarized: 190,
					failed: 0,
					skipped: 8,
				},
			},
		});
		expect(calls).toHaveLength(8);
		expect(calls[0]).toContain("--deployment");
		expect(calls[0]).toContain("dev");
		expect(calls[0]).not.toContain("--push");
		expect(
			calls.filter((args) =>
				args.includes("functions/ai/summarize:summarizeMeeting"),
			),
		).toHaveLength(3);
		expect(calls.map((args) => args.join(" ")).join("\n")).not.toMatch(
			/[A-Z][A-Z0-9_]*(?:KEY|SECRET|TOKEN|PASSWORD)/,
		);

		rmSync(cwd, { recursive: true, force: true });
	});

	it("fails before running commands when project config is missing", async () => {
		const cwd = mkdtempSync(join(tmpdir(), "civic-smoke-missing-"));

		await expect(
			runCoreLoopSmoke({
				argv: ["--deployment", "dev"],
				cwd,
				runner: async () => {
					throw new Error("runner should not be called");
				},
			}),
		).rejects.toThrow("convex.json");

		rmSync(cwd, { recursive: true, force: true });
	});

	it("rejects production targets", () => {
		expect(() => parseArgs(["--prod"])).toThrow("dev or staging");
		expect(() => parseArgs(["--deployment", "prod"])).toThrow(
			"dev or staging",
		);
	});

	it("accepts package-manager argument separators", () => {
		expect(parseArgs(["--", "--deployment", "dev", "--no-push"])).toMatchObject(
			{
				deployment: "dev",
				push: false,
			},
		);
	});

	it("parses JSON even when Convex prints logs first", () => {
		expect(
			parseConvexJson('Preparing deployment...\n{"success":true,"count":3}\n'),
		).toEqual({ success: true, count: 3 });
	});
});

function makeProjectDir() {
	const cwd = mkdtempSync(join(tmpdir(), "civic-smoke-"));
	writeFileSync(join(cwd, "convex.json"), "{}\n");
	return cwd;
}
