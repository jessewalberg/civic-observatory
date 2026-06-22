#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import * as cheerio from "cheerio";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";

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
		meetingsPageUrl: "",
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

		if (arg.startsWith("--meetingsPageUrl=")) {
			options.meetingsPageUrl = arg.split("=")[1] || "";
			continue;
		}

		if (arg === "--meetingsPageUrl") {
			options.meetingsPageUrl = argv[i + 1] || "";
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
			"  node scripts/municipality-data-audit.mjs --municipalityId <id> [--meetingsPageUrl <url>] [--limit 200] [--output ./tmp/report.json]",
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

function normalizeMeetingSourceUrl(url) {
	try {
		const parsed = new URL(normalizeUrl(url));
		if (/\/AgendaCenter\/ViewFile\//i.test(parsed.pathname)) {
			parsed.searchParams.delete("html");
			parsed.searchParams.delete("packet");
			return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
		}
		return normalizeUrl(url);
	} catch {
		return normalizeUrl(url);
	}
}

function isLikelyDocumentUrl(url = "") {
	return (
		/\.pdf(\?|#|$)/i.test(url) ||
		/\/ViewFile/i.test(url) ||
		/\/View\.ashx/i.test(url)
	);
}

function sourceVariant(url = "") {
	if (!url) return "missing";
	if (/\/AgendaCenter\/ViewFile\/Agenda\//i.test(url)) {
		if (/[?&]packet=true\b/i.test(url)) return "civicplus_packet";
		if (/[?&]html=true\b/i.test(url)) return "civicplus_html";
		return "civicplus_agenda_file";
	}
	if (isLikelyDocumentUrl(url)) return "document";
	return "html_or_detail";
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
		const page = await client.query(api.functions.meetings.queries.listByMunicipality, {
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

function cleanText(text) {
	return text.replace(/\s+/g, " ").trim();
}

function sampleLiveRow(row) {
	return {
		title: row.title,
		date: row.date || null,
		sourceUrl: row.sourceUrl,
	};
}

async function compareLiveAgendaCenter({ meetingsPageUrl, meetings }) {
	if (!meetingsPageUrl || !/\/AgendaCenter/i.test(meetingsPageUrl)) {
		return null;
	}

	const response = await fetch(meetingsPageUrl, {
		headers: {
			"User-Agent":
				"Mozilla/5.0 (compatible; CivicObservatory/1.0; +https://civicobservatory.com)",
			Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
		},
	});
	if (!response.ok) {
		throw new Error(`Live AgendaCenter returned HTTP ${response.status}`);
	}

	const $ = cheerio.load(await response.text());
	const liveRows = $("tr.catAgendaRow")
		.map((_, row) => {
			const $row = $(row);
			const title = cleanText(
				$row.find('p > a[href*="/AgendaCenter/ViewFile/Agenda/"]').first().text(),
			);
			const date = cleanText($row.find("h3 strong").first().text());
			const links = $row
				.find('a[href*="/AgendaCenter/ViewFile/Agenda/"]')
				.map((__, link) => ({
					text: cleanText($(link).text()),
					url: new URL($(link).attr("href"), meetingsPageUrl).href,
				}))
				.get();
			const packetUrl =
				links.find(
					(link) => /packet/i.test(link.text) || /[?&]packet=true\b/i.test(link.url),
				)?.url || null;
			const sourceUrl = packetUrl || links[0]?.url || "";

			return {
				title,
				date,
				sourceUrl,
				identity: sourceUrl ? normalizeMeetingSourceUrl(sourceUrl) : "",
			};
		})
		.get()
		.filter((row) => row.title && row.identity);

	const liveIdentitySet = new Set(liveRows.map((row) => row.identity));
	const storedRows = meetings
		.filter((meeting) => meeting.sourceUrl)
		.map((meeting) => ({
			title: meeting.title,
			sourceUrl: meeting.sourceUrl,
			status: meeting.status,
			identity: normalizeMeetingSourceUrl(meeting.sourceUrl),
		}));
	const storedIdentitySet = new Set(storedRows.map((row) => row.identity));

	return {
		platform: "civicplus_agenda_center",
		liveRows: liveRows.length,
		storedRowsWithSource: storedRows.length,
		liveRowsMissingFromStorage: liveRows.filter(
			(row) => !storedIdentitySet.has(row.identity),
		).length,
		storedRowsMissingFromLive: storedRows.filter(
			(row) => !liveIdentitySet.has(row.identity),
		).length,
		samples: {
			liveRowsMissingFromStorage: liveRows
				.filter((row) => !storedIdentitySet.has(row.identity))
				.slice(0, 20)
				.map(sampleLiveRow),
			storedRowsMissingFromLive: storedRows
				.filter((row) => !liveIdentitySet.has(row.identity))
				.slice(0, 20)
				.map((row) => ({
					title: row.title,
					sourceUrl: row.sourceUrl,
					status: row.status,
				})),
		},
	};
}

function computeReport({ municipalityId, municipality, meetings, liveSourceAudit }) {
	const statusCounts = Object.fromEntries(VALID_STATUSES.map((s) => [s, 0]));
	for (const meeting of meetings) {
		if (VALID_STATUSES.includes(meeting.status)) {
			statusCounts[meeting.status] += 1;
		}
	}
	const sourceVariantCounts = {};
	for (const meeting of meetings) {
		const variant = sourceVariant(meeting.sourceUrl);
		sourceVariantCounts[variant] = (sourceVariantCounts[variant] || 0) + 1;
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
		sourceVariants: sourceVariantCounts,
		liveSourceAudit,
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
	const municipality = await client.query(api.functions.municipalities.queries.get, {
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
	let liveSourceAudit = null;
	try {
		liveSourceAudit = await compareLiveAgendaCenter({
			meetingsPageUrl: municipality.meetingsPageUrl || options.meetingsPageUrl,
			meetings,
		});
	} catch (error) {
		liveSourceAudit = {
			error: error instanceof Error ? error.message : String(error),
		};
	}
	const report = computeReport({
		municipalityId: options.municipalityId,
		municipality,
		meetings,
		liveSourceAudit,
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
	if (report.liveSourceAudit && !report.liveSourceAudit.error) {
		console.log(`Live AgendaCenter rows: ${report.liveSourceAudit.liveRows}`);
		console.log(
			`Live rows missing from storage: ${report.liveSourceAudit.liveRowsMissingFromStorage}`,
		);
		console.log(
			`Stored rows missing from live site: ${report.liveSourceAudit.storedRowsMissingFromLive}`,
		);
	} else if (report.liveSourceAudit?.error) {
		console.log(`Live source audit failed: ${report.liveSourceAudit.error}`);
	}
	console.log(`Report written: ${outputPath}`);
}

main().catch((error) => {
	console.error(`Audit failed: ${error instanceof Error ? error.message : String(error)}`);
	process.exit(1);
});
