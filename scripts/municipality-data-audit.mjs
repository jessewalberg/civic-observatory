#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
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
		platform: "",
		limit: 200,
		output: "",
		exceptions: [],
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

		if (arg.startsWith("--platform=")) {
			options.platform = arg.split("=")[1] || "";
			continue;
		}

		if (arg === "--platform") {
			options.platform = argv[i + 1] || "";
			i += 1;
			continue;
		}

		if (
			arg.startsWith("--launchException=") ||
			arg.startsWith("--exception=")
		) {
			options.exceptions.push(arg.slice(arg.indexOf("=") + 1).trim());
			continue;
		}

		if (arg === "--launchException" || arg === "--exception") {
			options.exceptions.push((argv[i + 1] || "").trim());
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
			"  node scripts/municipality-data-audit.mjs --municipalityId <id> [--meetingsPageUrl <url>] [--platform civicplus|granicus|generic|manual] [--launchException <text>] [--limit 200] [--output ./tmp/report.json]",
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

export function normalizeUrl(url) {
	try {
		const parsed = new URL(url);
		const pathname = parsed.pathname.replace(/\/+$/, "") || "/";
		return `${parsed.protocol}//${parsed.host.toLowerCase()}${pathname}${parsed.search}`;
	} catch {
		return (url || "").trim().toLowerCase();
	}
}

export function normalizeMeetingSourceUrl(url) {
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
		/\/View\.ashx/i.test(url) ||
		/[?&](agenda|minutes|packet)=/i.test(url)
	);
}

function isLikelyDetailUrl(url = "", text = "") {
	return (
		/MeetingDetail\.aspx/i.test(url) ||
		/\/AgendaCenter\/ViewFile\/Agenda\//i.test(url) ||
		/\b(details?|meeting)\b/i.test(text)
	);
}

function inferLiveSourcePlatform(platform = "", meetingsPageUrl = "") {
	const normalizedPlatform = platform.toLowerCase().trim();
	const normalizedUrl = normalizeUrl(meetingsPageUrl);

	if (
		normalizedPlatform === "civicplus" ||
		normalizedPlatform === "civicplus_agenda_center" ||
		/\/AgendaCenter/i.test(normalizedUrl)
	) {
		return "civicplus_agenda_center";
	}

	if (
		normalizedPlatform === "legistar" ||
		/\.legistar\.com/i.test(normalizedUrl) ||
		/MeetingDetail\.aspx|Calendar\.aspx/i.test(normalizedUrl)
	) {
		return "legistar";
	}

	if (normalizedPlatform === "granicus" || /granicus/i.test(normalizedUrl)) {
		return "granicus";
	}

	return normalizedPlatform || "generic";
}

function absoluteUrl(url = "", baseUrl = "") {
	try {
		return new URL(url, baseUrl).href;
	} catch {
		return url;
	}
}

function uniqueUrls(urls) {
	const seen = new Set();
	return urls.filter((url) => {
		if (!url) return false;
		const identity = normalizeMeetingSourceUrl(url);
		if (!identity || seen.has(identity)) return false;
		seen.add(identity);
		return true;
	});
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
		alternateSourceUrls: row.alternateSourceUrls || [],
	};
}

function extractLinks($, $row, meetingsPageUrl) {
	return $row
		.find("a[href]")
		.map((_, link) => {
			const href = $(link).attr("href") || "";
			return {
				text: cleanText($(link).text()),
				url: absoluteUrl(href, meetingsPageUrl),
			};
		})
		.get()
		.filter((link) => link.url);
}

function buildLiveRow({ title, date, sourceUrl, alternateSourceUrls = [] }) {
	const uniqueAlternateSourceUrls = uniqueUrls(alternateSourceUrls).filter(
		(url) =>
			normalizeMeetingSourceUrl(url) !== normalizeMeetingSourceUrl(sourceUrl),
	);
	return {
		title: cleanText(title || ""),
		date: cleanText(date || ""),
		sourceUrl,
		alternateSourceUrls: uniqueAlternateSourceUrls,
	};
}

function extractCivicPlusAgendaRows($, meetingsPageUrl) {
	return $("tr.catAgendaRow")
		.map((_, row) => {
			const $row = $(row);
			const title = cleanText(
				$row.find('p > a[href*="/AgendaCenter/ViewFile/Agenda/"]').first().text(),
			);
			const date = cleanText($row.find("h3 strong").first().text());
			const links = extractLinks($, $row, meetingsPageUrl).filter((link) =>
				/\/AgendaCenter\/ViewFile\/Agenda\//i.test(link.url),
			);
			const packetUrl =
				links.find(
					(link) => /packet/i.test(link.text) || /[?&]packet=true\b/i.test(link.url),
				)?.url || null;
			const sourceUrl = packetUrl || links[0]?.url || "";

			return buildLiveRow({
				title,
				date,
				sourceUrl,
				alternateSourceUrls: links.map((link) => link.url),
			});
		})
		.get()
		.filter((row) => row.title && row.sourceUrl);
}

function extractLegistarRows($, meetingsPageUrl) {
	return $("tr.rgRow, tr.rgAltRow, .meeting-item")
		.map((_, row) => {
			const $row = $(row);
			const cells = $row.find("td");
			const links = extractLinks($, $row, meetingsPageUrl);
			const detailLink =
				links.find((link) => /MeetingDetail\.aspx/i.test(link.url)) ||
				links.find((link) => isLikelyDetailUrl(link.url, link.text));
			const documentLinks = links.filter(
				(link) => isLikelyDocumentUrl(link.url) || /\b(agenda|minutes)\b/i.test(link.text),
			);
			const sourceUrl =
				detailLink?.url ||
				links.find((link) => !isLikelyDocumentUrl(link.url))?.url ||
				documentLinks[0]?.url ||
				links[0]?.url ||
				"";
			const title =
				cleanText($row.find(".meeting-body-name").first().text()) ||
				cleanText(cells.first().text()) ||
				cleanText(links[0]?.text || "");
			const date =
				cleanText($row.find(".meeting-date").first().text()) ||
				cleanText(cells.eq(1).text()) ||
				"";

			return buildLiveRow({
				title,
				date,
				sourceUrl,
				alternateSourceUrls: documentLinks.map((link) => link.url),
			});
		})
		.get()
		.filter((row) => row.title && row.sourceUrl);
}

function extractGenericRows($, meetingsPageUrl) {
	const candidateRows = $("tr, li, .meeting-item, .agenda-item, .event-list-item, .calendar-event")
		.map((_, row) => $(row))
		.get()
		.filter(($row) => extractLinks($, $row, meetingsPageUrl).length > 0);

	const rows = candidateRows.map(($row) => {
		const links = extractLinks($, $row, meetingsPageUrl);
		const documentLinks = links.filter(
			(link) => isLikelyDocumentUrl(link.url) || /\b(agenda|minutes|packet)\b/i.test(link.text),
		);
		const sourceUrl =
			links.find((link) => isLikelyDetailUrl(link.url, link.text))?.url ||
			links.find((link) => !isLikelyDocumentUrl(link.url))?.url ||
			documentLinks[0]?.url ||
			links[0]?.url ||
			"";
		const title =
			cleanText($row.find("h1,h2,h3,h4,.title,.meeting-title").first().text()) ||
			cleanText(links[0]?.text || "") ||
			cleanText($row.text()).slice(0, 120);
		const date =
			cleanText($row.find("time,[datetime],.date,.meeting-date").first().text()) ||
			cleanText($row.text().match(/\b[A-Z][a-z]{2,8}\s+\d{1,2},\s+\d{4}\b/)?.[0] || "");

		return buildLiveRow({
			title,
			date,
			sourceUrl,
			alternateSourceUrls: documentLinks.map((link) => link.url),
		});
	});

	const seen = new Set();
	return rows.filter((row) => {
		const identity = normalizeMeetingSourceUrl(row.sourceUrl);
		if (!row.title || !identity || seen.has(identity)) return false;
		seen.add(identity);
		return true;
	});
}

export function extractLiveSourceRows({ html, meetingsPageUrl, platform = "" }) {
	const $ = cheerio.load(html);
	const inferredPlatform = inferLiveSourcePlatform(platform, meetingsPageUrl);

	if (inferredPlatform === "civicplus_agenda_center") {
		return extractCivicPlusAgendaRows($, meetingsPageUrl);
	}

	if (inferredPlatform === "legistar" || inferredPlatform === "granicus") {
		const legistarRows = extractLegistarRows($, meetingsPageUrl);
		if (legistarRows.length > 0 || inferredPlatform === "legistar") {
			return legistarRows;
		}
	}

	return extractGenericRows($, meetingsPageUrl);
}

function identityCandidatesForRow(row) {
	return uniqueUrls([row.sourceUrl, ...(row.alternateSourceUrls || [])]).map((url) =>
		normalizeMeetingSourceUrl(url),
	);
}

function hasIdentityMatch(row, identitySet) {
	return identityCandidatesForRow(row).some((identity) => identitySet.has(identity));
}

export function compareLiveSourceRows({ platform = "", liveRows, meetings }) {
	const normalizedPlatform = platform || "generic";
	const storedRows = meetings
		.filter((meeting) => meeting.sourceUrl)
		.map((meeting) => ({
			title: meeting.title,
			sourceUrl: meeting.sourceUrl,
			status: meeting.status,
			alternateSourceUrls: meeting.documentUrl ? [meeting.documentUrl] : [],
		}));
	const liveIdentitySet = new Set(liveRows.flatMap(identityCandidatesForRow));
	const storedIdentitySet = new Set(storedRows.flatMap(identityCandidatesForRow));
	const liveRowsMissingFromStorage = liveRows.filter(
		(row) => !hasIdentityMatch(row, storedIdentitySet),
	);
	const storedRowsMissingFromLive = storedRows.filter(
		(row) => !hasIdentityMatch(row, liveIdentitySet),
	);

	return {
		platform: normalizedPlatform,
		liveRows: liveRows.length,
		storedRowsWithSource: storedRows.length,
		liveRowsMissingFromStorage: liveRowsMissingFromStorage.length,
		storedRowsMissingFromLive: storedRowsMissingFromLive.length,
		samples: {
			liveRowsMissingFromStorage: liveRowsMissingFromStorage
				.slice(0, 20)
				.map(sampleLiveRow),
			storedRowsMissingFromLive: storedRowsMissingFromLive
				.slice(0, 20)
				.map((row) => ({
					title: row.title,
					sourceUrl: row.sourceUrl,
					status: row.status,
				})),
		},
	};
}

async function compareLiveSource({
	meetingsPageUrl,
	platform = "",
	meetings,
	fetchImpl = fetch,
}) {
	if (!meetingsPageUrl) {
		return null;
	}

	const inferredPlatform = inferLiveSourcePlatform(platform, meetingsPageUrl);
	const response = await fetchImpl(meetingsPageUrl, {
		headers: {
			"User-Agent":
				"Mozilla/5.0 (compatible; CivicObservatory/1.0; +https://civicobservatory.com)",
			Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
		},
	});
	if (!response.ok) {
		throw new Error(`Live ${inferredPlatform} source returned HTTP ${response.status}`);
	}

	const liveRows = extractLiveSourceRows({
		html: await response.text(),
		meetingsPageUrl,
		platform: inferredPlatform,
	});

	return compareLiveSourceRows({
		platform: inferredPlatform,
		liveRows,
		meetings,
	});
}

function hasRawContent(meeting) {
	return typeof meeting.rawContent === "string" && meeting.rawContent.trim().length > 0;
}

function hasSourceAuditException(exceptions) {
	return exceptions.some((exception) =>
		/\b(source|live|website|manual|unsupported|extract)\b/i.test(exception),
	);
}

function hasRawContentException(exceptions) {
	return exceptions.some((exception) =>
		/\b(raw|content|agenda|preview|pending|future|document)\b/i.test(exception),
	);
}

export function buildLaunchGate({
	liveSourceAudit,
	statusCounts = {},
	meetings = [],
	exceptions = [],
}) {
	const documentedExceptions = exceptions.filter((exception) => exception.trim());
	const sourceExceptionApplied = hasSourceAuditException(documentedExceptions);
	const liveAuditPresent = Boolean(liveSourceAudit && !liveSourceAudit.error);
	const liveAuditExceptionApplied = !liveAuditPresent && sourceExceptionApplied;
	const liveRows = liveAuditPresent ? liveSourceAudit.liveRows || 0 : null;
	const liveRowsMissingFromStorage =
		liveAuditPresent ? liveSourceAudit.liveRowsMissingFromStorage || 0 : null;
	const storedRowsMissingFromLive =
		liveAuditPresent ? liveSourceAudit.storedRowsMissingFromLive || 0 : null;
	const storedSourceCount =
		meetings.length > 0
			? meetings.filter((meeting) => meeting.sourceUrl).length
			: liveSourceAudit?.storedRowsWithSource || 0;
	const storedSourceTotal =
		meetings.length > 0
			? meetings.length
			: liveSourceAudit?.storedRowsTotal || liveSourceAudit?.storedRowsWithSource || 0;
	const storedRowsMissingSource = Math.max(
		0,
		storedSourceTotal - storedSourceCount,
	);
	const rawContentCount = meetings.filter(hasRawContent).length;
	const rawContentMissing = meetings.length - rawContentCount;
	const rawContentExceptionApplied =
		rawContentMissing > 0 && hasRawContentException(documentedExceptions);

	const checks = {
		liveSourceAudit: {
			ok: liveAuditPresent || liveAuditExceptionApplied,
			value: liveAuditPresent
				? "present"
				: liveSourceAudit?.error || "missing",
			expected: "present",
			exceptionApplied: liveAuditExceptionApplied,
		},
		liveRowsPresent: {
			ok: liveAuditPresent ? liveRows > 0 || sourceExceptionApplied : liveAuditExceptionApplied,
			value: liveRows,
			expected: "> 0",
			exceptionApplied: liveAuditPresent && liveRows === 0 && sourceExceptionApplied,
		},
		storedRowsPresent: {
			ok: storedSourceTotal > 0 || sourceExceptionApplied,
			value: storedSourceTotal,
			expected: "> 0",
			exceptionApplied: storedSourceTotal === 0 && sourceExceptionApplied,
		},
		storedSourceCoverage: {
			ok: storedRowsMissingSource === 0 || sourceExceptionApplied,
			value: `${storedSourceCount}/${storedSourceTotal}`,
			expected: `${storedSourceTotal}/${storedSourceTotal}`,
			missing: storedRowsMissingSource,
			exceptionApplied: storedRowsMissingSource > 0 && sourceExceptionApplied,
		},
		liveRowsMissingFromStorage: {
			ok: liveAuditPresent
				? liveRowsMissingFromStorage === 0
				: liveAuditExceptionApplied,
			value: liveRowsMissingFromStorage,
			expected: 0,
			exceptionApplied: !liveAuditPresent && liveAuditExceptionApplied,
		},
		storedRowsMissingFromLive: {
			ok: liveAuditPresent
				? storedRowsMissingFromLive === 0
				: liveAuditExceptionApplied,
			value: storedRowsMissingFromLive,
			expected: 0,
			exceptionApplied: !liveAuditPresent && liveAuditExceptionApplied,
		},
		failedRows: {
			ok: (statusCounts.failed || 0) === 0,
			value: statusCounts.failed || 0,
			expected: 0,
		},
		skippedRows: {
			ok: (statusCounts.skipped || 0) === 0,
			value: statusCounts.skipped || 0,
			expected: 0,
		},
		processingRows: {
			ok: (statusCounts.processing || 0) === 0,
			value: statusCounts.processing || 0,
			expected: 0,
		},
		rawContentCoverage: {
			ok: rawContentMissing === 0 || rawContentExceptionApplied,
			value: `${rawContentCount}/${meetings.length}`,
			expected: `${meetings.length}/${meetings.length}`,
			missing: rawContentMissing,
			exceptionApplied: rawContentExceptionApplied,
		},
	};

	const hardCheckNames = [
		"liveSourceAudit",
		"liveRowsPresent",
		"storedRowsPresent",
		"storedSourceCoverage",
		"liveRowsMissingFromStorage",
		"storedRowsMissingFromLive",
		"failedRows",
		"skippedRows",
		"processingRows",
	];
	const hardFailures = hardCheckNames.filter((name) => !checks[name].ok);
	const failedChecks = Object.entries(checks)
		.filter(([, check]) => !check.ok)
		.map(([name]) => name);

	let status = "ready";
	if (hardFailures.length > 0 || failedChecks.length > 0) {
		status = "blocked";
	} else if (
		documentedExceptions.length > 0 ||
		Object.values(checks).some((check) => check.exceptionApplied)
	) {
		status = "ready_with_exceptions";
	}

	return {
		status,
		checks,
		failedChecks,
		hardFailures,
		exceptions: documentedExceptions,
	};
}

function computeReport({
	municipalityId,
	municipality,
	meetings,
	liveSourceAudit,
	exceptions,
}) {
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
	const withRawContent = meetings.filter(hasRawContent);
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
	const launchGate = buildLaunchGate({
		liveSourceAudit,
		statusCounts,
		meetings,
		exceptions,
	});

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
		launchGate,
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
	const meetingsPageUrl = options.meetingsPageUrl || municipality.meetingsPageUrl;
	const platform = options.platform || municipality.platform || "";
	let liveSourceAudit = null;
	try {
		liveSourceAudit = await compareLiveSource({
			meetingsPageUrl,
			platform,
			meetings,
		});
	} catch (error) {
		liveSourceAudit = {
			error: error instanceof Error ? error.message : String(error),
		};
	}
	const report = computeReport({
		municipalityId: options.municipalityId,
		municipality: { ...municipality, meetingsPageUrl, platform },
		meetings,
		liveSourceAudit,
		exceptions: options.exceptions,
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
		console.log(`Live source platform: ${report.liveSourceAudit.platform}`);
		console.log(`Live source rows: ${report.liveSourceAudit.liveRows}`);
		console.log(
			`Live rows missing from storage: ${report.liveSourceAudit.liveRowsMissingFromStorage}`,
		);
		console.log(
			`Stored rows missing from live site: ${report.liveSourceAudit.storedRowsMissingFromLive}`,
		);
	} else if (report.liveSourceAudit?.error) {
		console.log(`Live source audit failed: ${report.liveSourceAudit.error}`);
	}
	console.log(`Launch gate: ${report.launchGate.status}`);
	if (report.launchGate.failedChecks.length > 0) {
		console.log(`Failed checks: ${report.launchGate.failedChecks.join(", ")}`);
	}
	console.log(`Report written: ${outputPath}`);
}

if (
	process.argv[1] &&
	path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
	main().catch((error) => {
		console.error(
			`Audit failed: ${error instanceof Error ? error.message : String(error)}`,
		);
		process.exit(1);
	});
}
