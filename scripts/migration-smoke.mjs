import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

const root = path.resolve(`.wrangler/migration-smoke-${crypto.randomUUID()}`);
const snapshot = path.join(root, "snapshot");
const output = path.join(root, "compiled");
const state = path.join(root, "state");
const wrangler = path.resolve("node_modules/wrangler/bin/wrangler.js");
const run = (file, args) =>
	promisify(execFile)(file, args, {
		encoding: "utf8",
		env: { ...process.env, CI: "true", WRANGLER_SEND_METRICS: "false" },
	});
const cli = (args) => run(process.execPath, [wrangler, ...args]);
const created = Date.UTC(2026, 9, 1);
const fixture = (id, row) => ({ _id: id, _creationTime: created, ...row });
try {
	const tables = {
		users: [
			fixture("legacy_user", {
				clerkUserId: "user_export",
				email: "migration@example.test",
				tier: "pro",
				isAdmin: true,
				stripeCustomerId: "cus_preserved",
				createdAt: created,
				lastLoginAt: created,
			}),
		],
		municipalities: [
			fixture("legacy_municipality", {
				name: "Migration Borough",
				state: "Connecticut",
				slug: "migration-borough-ct",
				platform: "manual",
				isActive: true,
				isVerified: true,
				coverageStatus: "published",
				createdAt: created,
				updatedAt: created,
			}),
		],
		meetings: [
			fixture("legacy_meeting", {
				municipalityId: "legacy_municipality",
				title: "Preserved minutes",
				slug: "preserved-minutes",
				meetingType: "city_council",
				meetingDate: created,
				sourceType: "uploaded",
				documentStorageId: "legacy_document",
				uploadedByUserId: "legacy_user",
				status: "summarized",
				createdAt: created,
				updatedAt: created,
			}),
		],
		summaries: [
			fixture("legacy_summary", {
				meetingId: "legacy_meeting",
				version: 1,
				executiveSummary: "The council approved the minutes.",
				keyDecisions: [],
				discussionTopics: [],
				upcomingItems: [],
				topics: [],
				modelUsed: "fixture",
				promptVersion: "fixture",
				processingTimeMs: 1,
				createdAt: created,
			}),
		],
		subscriptions: [
			fixture("legacy_subscription", {
				userId: "legacy_user",
				municipalityId: "legacy_municipality",
				alertFrequency: "daily",
				emailEnabled: true,
				isActive: true,
				createdAt: created,
				updatedAt: created,
			}),
		],
		alerts: [
			fixture("legacy_alert", {
				userId: "legacy_user",
				subscriptionId: "legacy_subscription",
				meetingId: "legacy_meeting",
				summaryId: "legacy_summary",
				matchedTopics: [],
				status: "sent",
				createdAt: created,
			}),
		],
		scrapeJobs: [
			fixture("legacy_job", {
				municipalityId: "legacy_municipality",
				status: "completed",
				triggeredBy: "manual",
				createdAt: created,
			}),
		],
		scraperValidationRuns: [
			fixture("legacy_validation", {
				municipalityId: "legacy_municipality",
				sourceUrl: "https://example.test/meetings",
				detectedPlatform: "manual",
				status: "passed",
				checks: [],
				stats: {
					meetingsFound: 1,
					documentReady: 1,
					summaryReady: 1,
					duplicates: 0,
					errors: 0,
				},
				meetingSample: [],
				errors: [],
				createdAt: created,
				completedAt: created,
				durationMs: 1,
			}),
		],
		coveragePublicationEvents: [
			fixture("legacy_publication", {
				municipalityId: "legacy_municipality",
				fromStatus: "unpublished",
				toStatus: "published",
				triggeredByUserId: "legacy_user",
				latestValidationRunId: "legacy_validation",
				createdAt: created,
			}),
		],
		usageRecords: [
			fixture("legacy_usage", {
				userId: "legacy_user",
				action: "summary_view",
				windowStart: created,
				windowType: "day",
				count: 1,
			}),
		],
		coverageRequests: [
			fixture("legacy_request", {
				municipalityName: "Migration Borough",
				state: "Connecticut",
				requesterEmail: "migration@example.test",
				requesterUserId: "legacy_user",
				topicInterests: [],
				status: "active",
				priority: "medium",
				seededMunicipalityId: "legacy_municipality",
				createdAt: created,
				updatedAt: created,
			}),
		],
	};
	for (const [table, rows] of Object.entries(tables)) {
		const dir = path.join(snapshot, table);
		fs.mkdirSync(dir, { recursive: true });
		fs.writeFileSync(
			path.join(dir, "documents.jsonl"),
			`${rows.map((row) => JSON.stringify(row)).join("\n")}\n`,
		);
	}
	const storage = path.join(snapshot, "_storage");
	fs.mkdirSync(storage);
	fs.writeFileSync(
		path.join(storage, "legacy_document"),
		"Original uploaded municipal minutes.",
	);
	fs.writeFileSync(
		path.join(storage, "orphan_document"),
		"Unreferenced export object must not be dropped.",
	);
	const providerUsers = path.join(root, "identities.json");
	fs.writeFileSync(
		providerUsers,
		JSON.stringify([
			{
				id: "user_export",
				first_name: "Migration",
				last_name: "Reader",
				banned: false,
				locked: false,
				two_factor_enabled: false,
				totp_enabled: false,
				primary_email_address_id: "email_export",
				email_addresses: [
					{
						id: "email_export",
						email_address: "migration@example.test",
						verification: { status: "verified" },
					},
				],
			},
		]),
	);
	await run("bun", [
		"scripts/import-export.ts",
		"--snapshot",
		snapshot,
		"--clerk-users",
		providerUsers,
		"--output",
		output,
	]);
	const counts = JSON.parse(
		fs.readFileSync(path.join(output, "counts.json"), "utf8"),
	);
	assert.deepEqual(counts, {
		tables: Object.fromEntries(Object.keys(tables).map((table) => [table, 1])),
		documents: 2,
		accounts: 1,
	});
	await cli([
		"d1",
		"migrations",
		"apply",
		"DB",
		"--local",
		"--persist-to",
		state,
	]);
	await cli([
		"d1",
		"execute",
		"DB",
		"--local",
		"--persist-to",
		state,
		"--file",
		path.join(output, "data.sql"),
	]);
	await run(process.execPath, [
		"scripts/import-blobs.mjs",
		"--manifest",
		path.join(output, "blobs.json"),
		"--persist-to",
		state,
		"--local",
	]);
	const query =
		"SELECT json_extract(u.body,'$._id') AS id,json_extract(u.body,'$.tier') AS tier,json_extract(u.body,'$.isAdmin') AS admin,json_extract(u.body,'$.billingMode') AS mode,json_extract(u.body,'$.stripeCustomerId') AS customer,json_extract(u.body,'$.clerkUserId') AS oldIdentity,a.email AS email,d.owner_id=a.id AS ownsDocument,json_extract(m.body,'$.documentId') AS document,json_extract(m.body,'$.slug') AS slug,(SELECT count(*) FROM app_records) AS records,(SELECT count(*) FROM documents) AS blobs FROM app_records u JOIN user a ON a.id=json_extract(u.body,'$.authUserId') JOIN documents d ON d.id='legacy_document' JOIN app_records m ON m.id='legacy_meeting' WHERE u.id='legacy_user'";
	const result = JSON.parse(
		(
			await cli([
				"d1",
				"execute",
				"DB",
				"--local",
				"--persist-to",
				state,
				"--command",
				query,
				"--json",
			])
		).stdout,
	);
	assert.deepEqual(result[0].results[0], {
		id: "legacy_user",
		tier: "pro",
		admin: 1,
		mode: "live",
		customer: "cus_preserved",
		oldIdentity: null,
		email: "migration@example.test",
		ownsDocument: 1,
		document: "legacy_document",
		slug: "preserved-minutes",
		records: 11,
		blobs: 2,
	});
	console.log(
		"PASS all app tables, stable IDs/slugs, account ownership, tiers/admin/billing identities, and referenced/orphan blobs survive real local D1/R2 import",
	);
	// A source reference error must fail offline, before creating any import output.
	const bad = path.join(snapshot, "subscriptions", "documents.jsonl");
	fs.writeFileSync(
		bad,
		`${JSON.stringify(fixture("legacy_subscription", { ...tables.subscriptions[0], municipalityId: "missing_municipality" }))}\n`,
	);
	let rejected = false;
	try {
		await run("bun", [
			"scripts/import-export.ts",
			"--snapshot",
			snapshot,
			"--clerk-users",
			providerUsers,
			"--output",
			path.join(root, "rejected"),
		]);
	} catch {
		rejected = true;
	}
	assert(rejected);
	assert(!fs.existsSync(path.join(root, "rejected")));
	console.log(
		"PASS dangling source references are rejected before any import output or remote write",
	);
	fs.writeFileSync(bad, `${JSON.stringify(tables.subscriptions[0])}\n`);
	const blockedUsers = JSON.parse(fs.readFileSync(providerUsers, "utf8"));
	blockedUsers[0].banned = true;
	fs.writeFileSync(providerUsers, JSON.stringify(blockedUsers));
	let blocked = false;
	try {
		await run("bun", [
			"scripts/import-export.ts",
			"--snapshot",
			snapshot,
			"--clerk-users",
			providerUsers,
			"--output",
			path.join(root, "blocked"),
		]);
	} catch {
		blocked = true;
	}
	assert(blocked);
	assert(!fs.existsSync(path.join(root, "blocked")));
	console.log(
		"PASS blocked source accounts cannot be silently activated by migration",
	);
} finally {
	fs.rmSync(root, { recursive: true, force: true });
}
