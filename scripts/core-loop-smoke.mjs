#!/usr/bin/env bun

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const DEFAULT_MUNICIPALITY = "Coventry";
const DEFAULT_STATE = "Connecticut";
const DEFAULT_SUMMARY_LIMIT = 3;
const DEFAULT_MEETING_LIMIT = 500;
const SAFE_DEFAULT_DEPLOYMENT = "dev";

export function parseArgs(argv = [], env = process.env) {
	const options = {
		municipality: DEFAULT_MUNICIPALITY,
		state: DEFAULT_STATE,
		deployment: env.CIVIC_SMOKE_DEPLOYMENT || SAFE_DEFAULT_DEPLOYMENT,
		push: true,
		summaryLimit: DEFAULT_SUMMARY_LIMIT,
		meetingLimit: DEFAULT_MEETING_LIMIT,
		json: false,
		help: false,
	};

	for (let i = 0; i < argv.length; i += 1) {
		const arg = argv[i];

		if (arg === "--") {
			continue;
		}

		if (arg === "--help" || arg === "-h") {
			options.help = true;
			continue;
		}

		if (arg === "--json") {
			options.json = true;
			continue;
		}

		if (arg === "--no-push") {
			options.push = false;
			continue;
		}

		if (arg === "--prod") {
			throw new Error(
				"Core loop smoke runs only against a dev or staging deployment.",
			);
		}

		if (arg === "--deployment") {
			options.deployment = readRequiredValue(argv, i, arg);
			i += 1;
			continue;
		}

		if (arg.startsWith("--deployment=")) {
			options.deployment = arg.slice("--deployment=".length);
			continue;
		}

		if (arg === "--municipality") {
			options.municipality = readRequiredValue(argv, i, arg);
			i += 1;
			continue;
		}

		if (arg.startsWith("--municipality=")) {
			options.municipality = arg.slice("--municipality=".length);
			continue;
		}

		if (arg === "--state") {
			options.state = readRequiredValue(argv, i, arg);
			i += 1;
			continue;
		}

		if (arg.startsWith("--state=")) {
			options.state = arg.slice("--state=".length);
			continue;
		}

		if (arg === "--summary-limit" || arg === "--limit") {
			options.summaryLimit = parsePositiveInt(readRequiredValue(argv, i, arg), arg);
			i += 1;
			continue;
		}

		if (arg.startsWith("--summary-limit=")) {
			options.summaryLimit = parsePositiveInt(
				arg.slice("--summary-limit=".length),
				"--summary-limit",
			);
			continue;
		}

		if (arg.startsWith("--limit=")) {
			options.summaryLimit = parsePositiveInt(
				arg.slice("--limit=".length),
				"--limit",
			);
			continue;
		}

		if (arg === "--meeting-limit") {
			options.meetingLimit = parsePositiveInt(
				readRequiredValue(argv, i, arg),
				arg,
			);
			i += 1;
			continue;
		}

		if (arg.startsWith("--meeting-limit=")) {
			options.meetingLimit = parsePositiveInt(
				arg.slice("--meeting-limit=".length),
				"--meeting-limit",
			);
			continue;
		}

		throw new Error(`Unknown option: ${arg}`);
	}

	assertNonProductionTarget(options.deployment);
	return options;
}

export function parseConvexJson(stdout) {
	const text = stdout.trim();
	for (let index = text.length - 1; index >= 0; index -= 1) {
		const char = text[index];
		if (char !== "{" && char !== "[") continue;

		try {
			return JSON.parse(text.slice(index));
		} catch {
			// Keep scanning for the real start of the final JSON payload.
		}
	}

	throw new Error(`Convex command did not return JSON: ${redactConfigNames(text)}`);
}

export async function runCoreLoopSmoke({
	argv = process.argv.slice(2),
	cwd = process.cwd(),
	env = process.env,
	runner = runConvex,
	now = () => new Date(),
} = {}) {
	const options = parseArgs(argv, env);
	if (options.help) {
		return { help: true, usage: usageText() };
	}

	assertProjectConfig(cwd);

	const seed = await runFunction({
		runner,
		cwd,
		env,
		options,
		name: "seedMunicipalities:seedState",
		args: { state: options.state },
		push: options.push,
	});

	const municipality = await runInlineQuery({
		runner,
		cwd,
		env,
		options,
		query: buildMunicipalityQuery(options),
	});

	if (!municipality?._id) {
		throw new Error(
			`Launch municipality not found after seeding: ${options.municipality}, ${options.state}`,
		);
	}

	const scrapeResult = await runFunction({
		runner,
		cwd,
		env,
		options,
		name: "functions/scrapers/actions:runScraper",
		args: {
			municipalityId: municipality._id,
			triggeredBy: "manual",
		},
		push: false,
	});

	if (scrapeResult.success === false) {
		throw new Error(
			`Scrape failed: ${redactConfigNames(scrapeResult.error ?? "unknown error")}`,
		);
	}

	const summaryCandidates = await runInlineQuery({
		runner,
		cwd,
		env,
		options,
		query: buildSummaryCandidateQuery(municipality._id, options.summaryLimit),
	});
	const summarize = await summarizeMeetings({
		runner,
		cwd,
		env,
		options,
		meetings: summaryCandidates,
	});

	const status = await runInlineQuery({
		runner,
		cwd,
		env,
		options,
		query: buildStatusQuery(municipality._id, options.meetingLimit),
	});

	const scrape = normalizeScrapeStats(scrapeResult);
	const ok = scrape.failed === 0 && (summarize.failed ?? 0) === 0;

	return {
		ok,
		generatedAt: now().toISOString(),
		deployment: options.deployment,
		municipality: {
			id: municipality._id,
			name: municipality.name,
			state: municipality.state,
			meetingsPageUrl: municipality.meetingsPageUrl,
		},
		seed,
		scrape,
		scrapeJobId: scrapeResult.jobId,
		summarize,
		status,
	};
}

function readRequiredValue(argv, index, flag) {
	const value = argv[index + 1];
	if (!value || value.startsWith("-")) {
		throw new Error(`${flag} requires a value`);
	}
	return value;
}

function parsePositiveInt(value, flag) {
	const parsed = Number.parseInt(value, 10);
	if (!Number.isFinite(parsed) || parsed < 1) {
		throw new Error(`${flag} must be a positive integer`);
	}
	return parsed;
}

function assertNonProductionTarget(deployment) {
	const normalized = deployment.trim().toLowerCase();
	const lastSegment = normalized.split(":").at(-1) ?? normalized;
	if (
		normalized === "prod" ||
		lastSegment === "prod" ||
		normalized.includes("production")
	) {
		throw new Error(
			"Core loop smoke runs only against a dev or staging deployment.",
		);
	}
}

function assertProjectConfig(cwd) {
	const configPath = path.join(cwd, "convex.json");
	if (!existsSync(configPath)) {
		throw new Error(`Missing convex.json at ${configPath}`);
	}
}

async function runFunction({ runner, cwd, env, options, name, args, push }) {
	const commandArgs = [name, JSON.stringify(args), ...targetFlags(options)];
	if (push) {
		commandArgs.push("--push");
	}

	return parseConvexJson(await runner(commandArgs, { cwd, env }));
}

async function runInlineQuery({ runner, cwd, env, options, query }) {
	return parseConvexJson(
		await runner(["--inline-query", query, ...targetFlags(options)], {
			cwd,
			env,
		}),
	);
}

function targetFlags(options) {
	return ["--deployment", options.deployment];
}

function buildMunicipalityQuery(options) {
	const state = JSON.stringify(options.state);
	const municipality = JSON.stringify(options.municipality);
	return `
const records = await ctx.db
  .query("municipalities")
  .withIndex("by_state", (q) => q.eq("state", ${state}))
  .collect();
return records.find((record) => record.name === ${municipality}) ?? null;
`;
}

function buildStatusQuery(municipalityId, meetingLimit) {
	const id = JSON.stringify(municipalityId);
	const limit = Number.isFinite(meetingLimit) ? meetingLimit : DEFAULT_MEETING_LIMIT;
	return `
const meetings = await ctx.db
  .query("meetings")
  .withIndex("by_municipality", (q) => q.eq("municipalityId", ${id}))
  .take(${limit});
const statuses = { pending: 0, processing: 0, summarized: 0, failed: 0, skipped: 0 };
for (const meeting of meetings) {
  statuses[meeting.status] = (statuses[meeting.status] ?? 0) + 1;
}
const summaries = await ctx.db.query("summaries").collect();
const municipalitySummaries = summaries.filter((summary) => summary.municipalityId === ${id});
return {
  totalMeetings: meetings.length,
  statuses,
  summaryCount: municipalitySummaries.length,
  summariesWithSource: municipalitySummaries.filter((summary) =>
    summary.status === "summarized" &&
    summary.sourceUrl &&
    summary.sourceContentHash
  ).length,
};
`;
}

function buildSummaryCandidateQuery(municipalityId, limit) {
	const id = JSON.stringify(municipalityId);
	const candidateLimit = Number.isFinite(limit) ? limit : DEFAULT_SUMMARY_LIMIT;
	return `
const meetings = await ctx.db
  .query("meetings")
  .withIndex("by_municipality_date", (q) => q.eq("municipalityId", ${id}))
  .order("desc")
  .collect();
return meetings
  .filter((meeting) =>
    meeting.status === "summarized" &&
    meeting.meetingDate <= Date.now() &&
    meeting.sourceUrl
  )
  .slice(0, ${candidateLimit})
  .map((meeting) => ({
    _id: meeting._id,
    title: meeting.title,
    meetingDate: meeting.meetingDate,
  }));
`;
}

async function summarizeMeetings({ runner, cwd, env, options, meetings }) {
	const results = {
		found: meetings.length,
		processed: 0,
		succeeded: 0,
		failed: 0,
		errors: [],
	};

	for (const meeting of meetings) {
		const result = await runFunction({
			runner,
			cwd,
			env,
			options,
			name: "functions/ai/summarize:summarizeMeeting",
			args: { meetingId: meeting._id },
			push: false,
		});

		results.processed += 1;
		if (result.success) {
			results.succeeded += 1;
		} else {
			results.failed += 1;
			results.errors.push(
				`${meeting.title}: ${redactConfigNames(result.error ?? "unknown error")}`,
			);
		}
	}

	return results;
}

function normalizeScrapeStats(result) {
	const stats = result.stats ?? {};
	return {
		found: stats.found ?? 0,
		created: stats.created ?? 0,
		skipped: stats.skipped ?? 0,
		failed: stats.failed ?? 0,
	};
}

async function runConvex(args, { cwd, env }) {
	const child = spawn("pnpm", ["exec", "convex", "run", ...args], {
		cwd,
		env,
		stdio: ["ignore", "pipe", "pipe"],
	});

	let stdout = "";
	let stderr = "";
	child.stdout.setEncoding("utf8");
	child.stderr.setEncoding("utf8");
	child.stdout.on("data", (chunk) => {
		stdout += chunk;
	});
	child.stderr.on("data", (chunk) => {
		stderr += chunk;
	});

	const code = await new Promise((resolve, reject) => {
		child.on("error", reject);
		child.on("close", resolve);
	});

	if (code !== 0) {
		throw new Error(
			[
				`Convex command failed with exit code ${code}.`,
				redactConfigNames(stderr.trim() || stdout.trim()),
			]
				.filter(Boolean)
				.join("\n"),
		);
	}

	return stdout;
}

function redactConfigNames(value) {
	return String(value).replace(
		/\b[A-Z][A-Z0-9_]*(?:KEY|SECRET|TOKEN|PASSWORD)\b/g,
		"[redacted config name]",
	);
}

function formatHumanResult(result) {
	if (result.help) return result.usage;

	const statuses = result.status.statuses;
	return [
		`Core loop smoke ${result.ok ? "completed" : "completed with failures"} for ${result.municipality.name}, ${result.municipality.state}`,
		`Deployment: ${result.deployment}`,
		`Seed: ${result.seed.inserted ?? 0} inserted, ${result.seed.skipped ?? 0} skipped`,
		`Scrape: ${result.scrape.found} found, ${result.scrape.created} created, ${result.scrape.skipped} skipped, ${result.scrape.failed} failed`,
		`Summaries: ${result.summarize.processed ?? 0} processed, ${result.summarize.succeeded ?? 0} succeeded, ${result.summarize.failed ?? 0} failed`,
		`Meeting statuses: pending=${statuses.pending}, processing=${statuses.processing}, summarized=${statuses.summarized}, failed=${statuses.failed}, skipped=${statuses.skipped}`,
		`Source-backed summaries: ${result.status.summariesWithSource}/${result.status.summaryCount}`,
	]
		.map(redactConfigNames)
		.join("\n");
}

function usageText() {
	return [
		"Usage:",
		"  pnpm smoke:core-loop -- [--deployment dev] [--summary-limit 3] [--no-push] [--json]",
		"",
		"Runs the launch municipality smoke against a non-production Convex deployment:",
		"  1. seed Connecticut municipality rows",
		"  2. find Coventry, Connecticut",
		"  3. run the internal scraper",
		"  4. re-summarize recent past Coventry meetings",
		"  5. report meeting and source-backed summary status counts",
	].join("\n");
}

async function main() {
	try {
		const result = await runCoreLoopSmoke();
		if (result.help) {
			console.log(result.usage);
			return;
		}

		if (parseArgs(process.argv.slice(2)).json) {
			console.log(JSON.stringify(result, null, 2));
		} else {
			console.log(formatHumanResult(result));
		}

		if (!result.ok) {
			process.exitCode = 1;
		}
	} catch (error) {
		console.error(
			redactConfigNames(error instanceof Error ? error.message : String(error)),
		);
		process.exitCode = 1;
	}
}

if (import.meta.url === `file://${process.argv[1]}`) {
	await main();
}
