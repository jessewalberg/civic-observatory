#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { ConvexHttpClient } from "convex/browser";

const VALID_STATUSES = [
	"pending",
	"processing",
	"summarized",
	"failed",
	"skipped",
];

function parseArgs(argv) {
	const options = {
		municipalityId: "",
		limit: 200,
		output: "",
	};

	for (let i = 0; i < argv.length; i += 1) {
		const arg = argv[i];

		if (arg === "--help" || arg === "-h") {
			options.help = true;
			continue;
		}

		if (arg.startsWith("--municipalityId=")) {
			options.municipalityId = arg.split("=")[1] || "";
			continue;
		}

		if (arg === "--municipalityId") {
			options.municipalityId = argv[i + 1] || "";
			i += 1;
			continue;
		}

		if (arg.startsWith("--limit=")) {
			const parsed = Number.parseInt(arg.split("=")[1] || "", 10);
			if (Number.isFinite(parsed) && parsed > 0) {
				options.limit = parsed;
			}
			continue;
		}

		if (arg === "--limit") {
			const parsed = Number.parseInt(argv[i + 1] || "", 10);
			if (Number.isFinite(parsed) && parsed > 0) {
				options.limit = parsed;
			}
			i += 1;
			continue;
		}

		if (arg.startsWith("--output=")) {
			options.output = arg.split("=")[1] || "";
			continue;
		}

		if (arg === "--output") {
			options.output = argv[i + 1] || "";
			i += 1;
			continue;
		}

		// Treat the first positional arg as municipalityId.
		if (!arg.startsWith("-") && !options.municipalityId) {
			options.municipalityId = arg;
		}
	}

	return options;
}

function printUsage() {
	console.log(
		[
			"Usage:",
			"  node scripts/municipality-data-audit.mjs --municipalityId <id> [--limit 200] [--output ./tmp/report.json]",
			"  node scripts/municipality-data-audit.mjs <id>",
			"",
			"Requires VITE_CONVEX_URL in environment or .env.local.",
		].join("\n"),
	);
}

function loadDotEnvLocal() {
	const envPath = path.resolve(process.cwd(), ".env.local");
	if (!fs.existsSync(envPath)) return;

	const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
	for (const line of lines) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) continue;
		const idx = trimmed.indexOf("=");
		if (idx < 1) continue;

		const key = trimmed.slice(0, idx).trim();
		const rawValue = trimmed.slice(idx + 1).trim();
		const value = rawValue.replace(/^['"]|['"]$/g, "");

		if (process.env[key] === undefined) {
			process.env[key] = value;
		}
	}
}

function normalizeUrl(url) {
	try {
		const parsed = new URL(url);
		const pathname = parsed.pathname.replace(/\/+$/, "") || "/";
		return `${parsed.protocol}//${parsed.host.toLowerCase()}${pathname}${parsed.search}`;
	} catch {
		return (url || "").trim().toLowerCase();
	}
}

function isLikelyDocumentUrl(url = "") {
	return (
		/\.pdf(\?|#|$)/i.test(url) ||
		/\/ViewFile/i.test(url) ||
		/\/View\.ashx/i.test(url)
	);
}

function toPct(part, total) {
	if (!total) return 0;
	return Math.round((part / total) * 1000) / 10;
}

function safeDate(ts) {
	if (!ts) return null;
	const d = new Date(ts);
	return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function buildDefaultOutputPath(municipalityId) {
	const stamp = new Date().toISOString().replace(/[:.]/g, "-");
	return path.resolve(
		process.cwd(),
		"tmp",
		`municipality-audit-${municipalityId}-${stamp}.json`,
	);
}

async function fetchMeetings(client, municipalityId, limit) {
	const meetings = [];
	let cursor;
	const seenCursors = new Set();

	for (;;) {
		const page = await client.query("functions.meetings.queries.listByMunicipality", {
			municipalityId,
			limit,
			cursor: cursor || undefined,
		});

		if (!page || !Array.isArray(page.meetings)) {
			throw new Error("Unexpected response from meetings.listByMunicipality");
		}

		meetings.push(...page.meetings);

		if (!page.hasMore || !page.nextCursor) {
			break;
		}

		if (seenCursors.has(page.nextCursor)) {
			throw new Error("Cursor repeated while paginating meetings");
		}
		seenCursors.add(page.nextCursor);
		cursor = page.nextCursor;
	}

	return meetings;
}

function computeReport({ municipalityId, municipality, meetings }) {
	const statusCounts = Object.fromEntries(VALID_STATUSES.map((s) => [s, 0]));
	for (const meeting of meetings) {
		if (VALID_STATUSES.includes(meeting.status)) {
			statusCounts[meeting.status] += 1;
		}
	}

	const meetingsPageUrl = municipality?.meetingsPageUrl;

	const withSummary = meetings.filter((m) => Boolean(m.summary));
	const withRawContent = meetings.filter(
		(m) => typeof m.rawContent === "string" && m.rawContent.trim().length > 0,
	);
	const withDocumentLikeSource = meetings.filter((m) =>
		isLikelyDocumentUrl(m.sourceUrl || ""),
	);
	const sourceEqualsListings = meetings.filter((m) => {
		if (!m.sourceUrl || !meetingsPageUrl) return false;
		return normalizeUrl(m.sourceUrl) === normalizeUrl(meetingsPageUrl);
	});
	const noSummary = meetings.filter((m) => !m.summary);
	const failed = meetings.filter((m) => m.status === "failed");
	const skipped = meetings.filter((m) => m.status === "skipped");
	const skippedWithExtractableSource = skipped.filter((m) => {
		if (isLikelyDocumentUrl(m.sourceUrl || "")) return true;
		if (!m.sourceUrl || !meetingsPageUrl) return false;
		return normalizeUrl(m.sourceUrl) !== normalizeUrl(meetingsPageUrl);
	});

	const sampleOf = (arr, size = 20) =>
		arr.slice(0, size).map((meeting) => ({
			id: meeting._id,
			title: meeting.title,
			status: meeting.status,
			meetingDate: safeDate(meeting.meetingDate),
			sourceUrl: meeting.sourceUrl || null,
			processingError: meeting.processingError || null,
			hasRawContent: Boolean(
				typeof meeting.rawContent === "string" && meeting.rawContent.trim(),
			),
			hasSummary: Boolean(meeting.summary),
		}));

	return {
		generatedAt: new Date().toISOString(),
		municipality: municipality
			? {
					id: municipalityId,
					name: municipality.name,
					state: municipality.state,
					county: municipality.county || null,
					platform: municipality.platform,
					meetingsPageUrl: municipality.meetingsPageUrl || null,
					lastScrapedAt: safeDate(municipality.lastScrapedAt),
					lastScrapeStatus: municipality.lastScrapeStatus || null,
					lastScrapeError: municipality.lastScrapeError || null,
				}
			: null,
		totals: {
			meetings: meetings.length,
			summaries: withSummary.length,
			withRawContent: withRawContent.length,
			withDocumentLikeSource: withDocumentLikeSource.length,
			sourceEqualsMeetingsPage: sourceEqualsListings.length,
		},
		statuses: statusCounts,
		coverage: {
			summaryCoveragePct: toPct(withSummary.length, meetings.length),
			rawContentCoveragePct: toPct(withRawContent.length, meetings.length),
			documentLikeSourcePct: toPct(withDocumentLikeSource.length, meetings.length),
			noSummaryPct: toPct(noSummary.length, meetings.length),
		},
		samples: {
			noSummary: sampleOf(noSummary),
			failed: sampleOf(failed),
			skippedWithExtractableSource: sampleOf(skippedWithExtractableSource),
			sourceEqualsMeetingsPage: sampleOf(sourceEqualsListings),
		},
	};
}

async function main() {
	const options = parseArgs(process.argv.slice(2));
	if (options.help) {
		printUsage();
		process.exit(0);
	}

	loadDotEnvLocal();

	if (!options.municipalityId) {
		printUsage();
		process.exit(1);
	}

	const deploymentUrl = process.env.VITE_CONVEX_URL;
	if (!deploymentUrl) {
		throw new Error("VITE_CONVEX_URL is not set");
	}

	const client = new ConvexHttpClient(deploymentUrl);
	const municipality = await client.query("functions.municipalities.queries.get", {
		id: options.municipalityId,
	});

	if (!municipality) {
		throw new Error(`Municipality not found: ${options.municipalityId}`);
	}

	const meetings = await fetchMeetings(
		client,
		options.municipalityId,
		options.limit,
	);
	const report = computeReport({
		municipalityId: options.municipalityId,
		municipality,
		meetings,
	});

	const outputPath = options.output
		? path.resolve(process.cwd(), options.output)
		: buildDefaultOutputPath(options.municipalityId);

	fs.mkdirSync(path.dirname(outputPath), { recursive: true });
	fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));

	console.log(`Municipality: ${municipality.name}, ${municipality.state}`);
	console.log(`Meetings: ${report.totals.meetings}`);
	console.log(`Summaries: ${report.totals.summaries}`);
	console.log(`Summary coverage: ${report.coverage.summaryCoveragePct}%`);
	console.log(`Raw content coverage: ${report.coverage.rawContentCoveragePct}%`);
	console.log(`Document-like source URLs: ${report.coverage.documentLikeSourcePct}%`);
	console.log(`Report written: ${outputPath}`);
}

main().catch((error) => {
	console.error(`Audit failed: ${error instanceof Error ? error.message : String(error)}`);
	process.exit(1);
});
