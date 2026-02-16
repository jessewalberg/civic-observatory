#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { ConvexHttpClient } from "convex/browser";

function parseArgs(argv) {
	const options = {
		municipalityId: "",
		limit: 200,
		apply: false,
		output: "",
	};

	for (let i = 0; i < argv.length; i += 1) {
		const arg = argv[i];

		if (arg === "--help" || arg === "-h") {
			options.help = true;
			continue;
		}

		if (arg === "--apply") {
			options.apply = true;
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
			"  node scripts/requeue-municipality-meetings.mjs --municipalityId <id> [--apply] [--limit 200]",
			"  node scripts/requeue-municipality-meetings.mjs <id> --apply",
			"",
			"By default this runs in dry-run mode. Add --apply to queue candidates.",
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

		meetings.push(...(page?.meetings || []));

		if (!page?.hasMore || !page?.nextCursor) break;
		if (seenCursors.has(page.nextCursor)) {
			throw new Error("Cursor repeated while loading meetings");
		}
		seenCursors.add(page.nextCursor);
		cursor = page.nextCursor;
	}

	return meetings;
}

function findCandidates(meetings, meetingsPageUrl) {
	return meetings.filter((meeting) => {
		if (meeting.summary) return false;
		if (meeting.status !== "skipped" && meeting.status !== "failed") return false;
		if (!meeting.sourceUrl || meeting.sourceUrl.trim().length === 0) return false;
		if (isLikelyDocumentUrl(meeting.sourceUrl)) return true;
		if (!meetingsPageUrl) return true;
		return normalizeUrl(meeting.sourceUrl) !== normalizeUrl(meetingsPageUrl);
	});
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
	const candidates = findCandidates(meetings, municipality.meetingsPageUrl);

	const preview = candidates.slice(0, 30).map((meeting) => ({
		id: meeting._id,
		status: meeting.status,
		title: meeting.title,
		sourceUrl: meeting.sourceUrl || null,
	}));

	const result = {
		generatedAt: new Date().toISOString(),
		municipality: {
			id: options.municipalityId,
			name: municipality.name,
			state: municipality.state,
		},
		totalMeetings: meetings.length,
		candidates: candidates.length,
		dryRun: !options.apply,
		preview,
	};

	const outputPath = options.output
		? path.resolve(process.cwd(), options.output)
		: path.resolve(
				process.cwd(),
				"tmp",
				`requeue-candidates-${options.municipalityId}-${Date.now()}.json`,
			);
	fs.mkdirSync(path.dirname(outputPath), { recursive: true });
	fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));

	console.log(`Municipality: ${municipality.name}, ${municipality.state}`);
	console.log(`Total meetings scanned: ${meetings.length}`);
	console.log(`Requeue candidates: ${candidates.length}`);
	console.log(`Preview file: ${outputPath}`);

	if (!options.apply) {
		console.log("Dry run only. Add --apply to set candidates to pending.");
		return;
	}

	let queued = 0;
	for (const meeting of candidates) {
		await client.mutation("functions.meetings.mutations.updateStatus", {
			meetingId: meeting._id,
			status: "pending",
		});
		queued += 1;
	}

	console.log(`Queued for summarization: ${queued}`);
}

main().catch((error) => {
	console.error(
		`Requeue failed: ${error instanceof Error ? error.message : String(error)}`,
	);
	process.exit(1);
});
