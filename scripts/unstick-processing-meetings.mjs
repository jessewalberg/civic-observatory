#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { ConvexHttpClient } from "convex/browser";

function parseArgs(argv) {
	const options = {
		municipalityId: "",
		limit: 200,
		maxAgeMinutes: 10,
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
			if (Number.isFinite(parsed) && parsed > 0) options.limit = parsed;
			continue;
		}
		if (arg === "--limit") {
			const parsed = Number.parseInt(argv[i + 1] || "", 10);
			if (Number.isFinite(parsed) && parsed > 0) options.limit = parsed;
			i += 1;
			continue;
		}
		if (arg.startsWith("--maxAgeMinutes=")) {
			const parsed = Number.parseInt(arg.split("=")[1] || "", 10);
			if (Number.isFinite(parsed) && parsed > 0) options.maxAgeMinutes = parsed;
			continue;
		}
		if (arg === "--maxAgeMinutes") {
			const parsed = Number.parseInt(argv[i + 1] || "", 10);
			if (Number.isFinite(parsed) && parsed > 0) options.maxAgeMinutes = parsed;
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
			"  node scripts/unstick-processing-meetings.mjs --municipalityId <id> [--maxAgeMinutes 10] [--apply]",
			"  node scripts/unstick-processing-meetings.mjs <id> --apply",
			"",
			"Dry run by default. Add --apply to set stale processing meetings to pending.",
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

async function main() {
	const options = parseArgs(process.argv.slice(2));
	if (options.help || !options.municipalityId) {
		printUsage();
		process.exit(options.help ? 0 : 1);
	}

	loadDotEnvLocal();

	const deploymentUrl = process.env.VITE_CONVEX_URL;
	if (!deploymentUrl) throw new Error("VITE_CONVEX_URL is not set");
	const client = new ConvexHttpClient(deploymentUrl);

	const municipality = await client.query("functions.municipalities.queries.get", {
		id: options.municipalityId,
	});
	if (!municipality) throw new Error("Municipality not found");

	const now = Date.now();
	const cutoffMs = options.maxAgeMinutes * 60 * 1000;
	const meetings = await fetchMeetings(client, options.municipalityId, options.limit);

	const processing = meetings.filter((m) => m.status === "processing");
	const stale = processing.filter((m) => {
		const updatedAt = typeof m.updatedAt === "number" ? m.updatedAt : m.createdAt;
		return now - updatedAt >= cutoffMs;
	});

	const report = {
		generatedAt: new Date(now).toISOString(),
		dryRun: !options.apply,
		maxAgeMinutes: options.maxAgeMinutes,
		municipality: {
			id: municipality._id,
			name: municipality.name,
			state: municipality.state,
		},
		counts: {
			total: meetings.length,
			processing: processing.length,
			staleProcessing: stale.length,
		},
		sample: stale.slice(0, 50).map((m) => ({
			id: m._id,
			title: m.title,
			status: m.status,
			updatedAt: m.updatedAt ?? null,
			updatedAtIso: new Date(m.updatedAt ?? m.createdAt).toISOString(),
			minutesSinceUpdate: Math.floor(
				(now - (m.updatedAt ?? m.createdAt)) / (60 * 1000),
			),
			processingError: m.processingError ?? null,
		})),
	};

	const outputPath = options.output
		? path.resolve(process.cwd(), options.output)
		: path.resolve(
				process.cwd(),
				"tmp",
				`unstick-processing-${options.municipalityId}-${Date.now()}.json`,
			);
	fs.mkdirSync(path.dirname(outputPath), { recursive: true });
	fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));

	console.log(`Municipality: ${municipality.name}, ${municipality.state}`);
	console.log(`Total meetings: ${report.counts.total}`);
	console.log(`Processing: ${report.counts.processing}`);
	console.log(
		`Stale processing (>${options.maxAgeMinutes}m): ${report.counts.staleProcessing}`,
	);
	console.log(`Report: ${outputPath}`);

	if (!options.apply) {
		console.log("Dry run only. Add --apply to requeue stale processing meetings.");
		return;
	}

	let queued = 0;
	for (const meeting of stale) {
		await client.mutation("functions.meetings.mutations.updateStatus", {
			meetingId: meeting._id,
			status: "pending",
		});
		queued += 1;
	}

	console.log(`Queued stale processing meetings: ${queued}`);
}

main().catch((error) => {
	console.error(
		`Unstick failed: ${error instanceof Error ? error.message : String(error)}`,
	);
	process.exit(1);
});
