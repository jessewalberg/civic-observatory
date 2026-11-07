import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { strToU8, zipSync } from "fflate";
import superjson from "superjson";
import { localWorker, NetworkResponse } from "./local-worker.mjs";

const origin = "http://localhost:3100";
const state = path.resolve(`.wrangler/e2e-${crypto.randomUUID()}`);
const email = `smoke-${crypto.randomUUID()}@example.test`;
const bindings = {
	APP_URL: origin,
	BETTER_AUTH_SECRET: crypto.randomBytes(40).toString("hex"),
	STRIPE_SECRET_KEY: "sk_test_local_signature_verification_only",
	STRIPE_WEBHOOK_SECRET: crypto.randomBytes(32).toString("hex"),
	OUTBOUND_ENABLED: "false",
	SCHEDULED_ENABLED: "true",
	DEPLOYMENT_STAGE: "staging",
	STAGING_MAIL_TO: email,
	EMAIL_API_TOKEN: crypto.randomBytes(32).toString("hex"),
	EMAIL_ACCOUNT_ID: "local_fixture_account",
	EMAIL_FROM_ADDRESS: "staging-sender@example.test",
};
const source = "https://municipal.example.org";
const sourceText =
	"The town council met on October 1, 2026. Members reviewed the public park proposal and approved the minutes. Residents discussed traffic safety and requested clearer crossings. The council voted to schedule a public hearing and adjourned the meeting.";
const network = [];
const mail = [];
let slowRelease;
let slowStarted = false;
let worker;
let cookie = "";
let password = crypto.randomBytes(24).toString("hex");
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const pass = (text) => console.log(`PASS ${text}`);
function pdf(text) {
	const objects = [
		"<< /Type /Catalog /Pages 2 0 R >>",
		"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
		"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
		"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
	];
	const content = `BT /F1 10 Tf 30 750 Td (${text}) Tj ET`;
	objects.push(
		`<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
	);
	let out = "%PDF-1.4\n";
	const offsets = [0];
	for (let i = 0; i < objects.length; i++) {
		offsets.push(Buffer.byteLength(out));
		out += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
	}
	const start = Buffer.byteLength(out);
	out += `xref\n0 6\n0000000000 65535 f \n${offsets
		.slice(1)
		.map((n) => `${String(n).padStart(10, "0")} 00000 n \n`)
		.join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
	return out;
}
// Network-boundary fixtures, not an application localhost bypass. Every real
// outbound request is intercepted and unlisted hosts fail closed, including AI.
async function outbound(request) {
	const url = new URL(request.url);
	network.push({ host: url.hostname, path: url.pathname });
	if (url.hostname === "cloudflare-dns.com") {
		const name = url.searchParams.get("name"),
			type = url.searchParams.get("type");
		assert(name?.endsWith(".example.org"), "Unexpected DNS request");
		const data = name === "private.example.org" ? "10.0.0.1" : "8.8.8.8";
		return NetworkResponse.json({
			Status: 0,
			Answer: type === "A" ? [{ type: 1, data }] : [],
		});
	}
	if (
		url.hostname === "api.cloudflare.com" &&
		url.pathname ===
			"/client/v4/accounts/local_fixture_account/email/sending/send"
	) {
		const body = await request.json();
		assert.equal(body.to, email);
		assert.equal(body.from.address, bindings.EMAIL_FROM_ADDRESS);
		mail.push(body);
		return NetworkResponse.json({
			success: true,
			result: { message_id: `local-mail-${mail.length}`, queued: [email] },
		});
	}
	assert.equal(
		url.hostname,
		"municipal.example.org",
		"A private or unlisted host reached the network boundary",
	);
	if (url.pathname === "/redirect-internal")
		return new NetworkResponse(null, {
			status: 302,
			headers: { Location: "http://127.0.0.1/metadata" },
		});
	if (url.pathname === "/redirect-private-dns")
		return new NetworkResponse(null, {
			status: 307,
			headers: { Location: "https://private.example.org/metadata" },
		});
	if (url.pathname === "/redirect-public")
		return new NetworkResponse(null, {
			status: 302,
			headers: { Location: "/minutes.pdf" },
		});
	if (url.pathname === "/slow") {
		slowStarted = true;
		await new Promise((resolve) => {
			slowRelease = resolve;
		});
		return new NetworkResponse(`<main>${sourceText}</main>`, {
			headers: { "Content-Type": "text/html" },
		});
	}
	if (url.pathname === "/minutes.pdf")
		return new NetworkResponse(pdf(sourceText), {
			headers: { "Content-Type": "application/pdf" },
		});
	return new NetworkResponse(
		'<html><main><article class="meeting"><h3><a href="/minutes.pdf">Town Council Meeting Minutes</a></h3><time class="date" datetime="2026-10-01">October 1, 2026</time></article></main></html>',
		{ headers: { "Content-Type": "text/html" } },
	);
}
async function request(
	route,
	{ method = "GET", data, signedIn = true, headers = {}, body } = {},
) {
	return worker.fetch(`${origin}${route}`, {
		method,
		headers: {
			Origin: origin,
			...(signedIn && cookie ? { Cookie: cookie } : {}),
			...(data ? { "Content-Type": "application/json" } : {}),
			...headers,
		},
		body: data ? JSON.stringify(data) : body,
		redirect: "manual",
		signal: AbortSignal.timeout(60_000),
	});
}
async function rpc(endpoint, args = {}, signedIn = true) {
	const response = await request("/api/rpc", {
		method: "POST",
		data: { path: endpoint, args },
		signedIn,
	});
	assert.equal(response.status, 200, `${endpoint} returned ${response.status}`);
	return superjson.deserialize((await response.json()).result);
}
const sql = (text, ...values) =>
	worker.db
		.prepare(text)
		.bind(...values)
		.run();
const row = (id) =>
	worker.db
		.prepare("SELECT body FROM app_records WHERE id=?")
		.bind(id)
		.first()
		.then((result) => (result ? JSON.parse(result.body) : null));
async function drain() {
	for (let i = 0; i < 40; i++) {
		const pending = await worker.db
			.prepare(
				"SELECT count(*) AS n FROM jobs WHERE state='pending' AND due_at<=?",
			)
			.bind(Date.now())
			.first();
		if (!pending.n) return;
		await worker.scheduled();
	}
	throw new Error("Local job budget exceeded");
}
async function meeting(municipalityId, title, extra = {}) {
	return rpc("functions/meetings/mutations:create", {
		municipalityId,
		title,
		meetingType: "city_council",
		meetingDate: Date.UTC(2026, 9, 1),
		...extra,
	});
}
async function webhook(event) {
	const body = JSON.stringify(event),
		timestamp = Math.floor(Date.now() / 1000),
		signature = crypto
			.createHmac("sha256", bindings.STRIPE_WEBHOOK_SECRET)
			.update(`${timestamp}.${body}`)
			.digest("hex");
	return request("/api/webhooks/stripe", {
		method: "POST",
		signedIn: false,
		headers: {
			"Content-Type": "application/json",
			"stripe-signature": `t=${timestamp},v1=${signature}`,
		},
		body,
	});
}
try {
	assert(
		fs.existsSync("dist/server/wrangler.json"),
		"Build before running local smoke",
	);
	fs.mkdirSync(state, { recursive: true });
	worker = await localWorker({ state, bindings, outbound });
	assert.deepEqual(
		await rpc("functions/municipalities/queries:list", {}, false),
		[],
	);
	const signIn = await request("/sign-in");
	assert.equal(signIn.status, 200);
	assert.match(await signIn.text(), /Sign in|Sign In/);
	pass(
		"built Worker serves the actual sign-in surface and fresh local D1 queries",
	);
	const signup = await request("/api/auth/sign-up/email", {
		method: "POST",
		data: { email, password, name: "Smoke Resident" },
	});
	assert.equal(signup.status, 200);
	cookie = signup.headers
		.getSetCookie()
		.map((item) => item.split(";")[0])
		.join("; ");
	assert(cookie);
	assert.equal(
		(await (await request("/api/auth/get-session")).json()).user.email,
		email,
	);
	const userId = await rpc("functions/users/mutations:ensureFromIdentity");
	assert.equal((await rpc("functions/users/queries:current"))._id, userId);
	assert.equal(
		(
			await request("/api/rpc", {
				method: "POST",
				data: {
					path: "functions/stripe/mutations:applyEvent",
					args: {
						eventId: "forged",
						eventType: "ignored",
						change: { kind: "ignored" },
					},
				},
			})
		).status,
		404,
	);
	assert.equal(
		(
			await request("/api/rpc", {
				method: "POST",
				data: {
					path: "functions/jobs/operations:list",
					args: { state: "all" },
				},
				signedIn: false,
			})
		).status,
		403,
	);
	assert.equal(
		(
			await request("/api/rpc", {
				method: "POST",
				data: {
					path: "functions/jobs/operations:list",
					args: { state: "all" },
				},
			})
		).status,
		403,
	);
	pass(
		"Better Auth sessions isolate accounts and deny internal billing and non-admin job access",
	);
	await sql(
		"UPDATE app_records SET body=json_set(body,'$.isAdmin',json('true'),'$.billingMode','test','$.stripeSubscriptionId','sub_local_smoke') WHERE id=?",
		userId,
	);
	const municipalityId = await rpc(
		"functions/municipalities/mutations:create",
		{
			name: "Local Smoke Borough",
			state: "Connecticut",
			platform: "generic",
			meetingsPageUrl: `${source}/meetings`,
			websiteUrl: source,
			isVerified: true,
			scrapeConfig: {
				meetingListSelector: ".meeting",
				dateSelector: ".date",
				contentSelector: "main",
				frequencyHours: 24,
			},
		},
	);
	assert.deepEqual(
		await rpc("functions/municipalities/queries:list", {}, false),
		[],
	);
	await sql(
		"UPDATE app_records SET body=json_set(body,'$.coverageStatus','published') WHERE id=?",
		municipalityId,
	);
	assert.equal(
		(await rpc("functions/municipalities/queries:list", {}, false))[0]._id,
		municipalityId,
	);
	const subscriptionId = await rpc("functions/subscriptions/mutations:create", {
		municipalityId,
		alertFrequency: "daily",
		emailEnabled: true,
	});
	assert.equal(
		(await rpc("functions/subscriptions/queries:listByUser"))[0].municipality
			._id,
		municipalityId,
	);
	pass("coverage visibility and subscriptions persist in native D1 procedures");
	const disabled = await meeting(municipalityId, "Disabled outbound source", {
		sourceUrl: `${source}/disabled.pdf`,
	});
	await drain();
	assert.match(
		(await row(disabled)).processingError,
		/Outbound requests are disabled/,
	);
	assert.equal(network.length, 0);
	const disabledScrape = await rpc(
		"functions/scrapeJobs/mutations:triggerScrape",
		{ municipalityId },
	);
	assert.equal(disabledScrape.success, false);
	assert.equal(network.length, 0);
	pass(
		"OUTBOUND_ENABLED=false prevents source hydration, scraping and even DNS egress",
	);
	bindings.OUTBOUND_ENABLED = "true";
	await worker.setBindings({ OUTBOUND_ENABLED: "true" });
	const text = `Uploaded minutes. ${sourceText}`;
	const upload = await request("/api/documents", {
		method: "POST",
		headers: { "Content-Type": "text/plain" },
		body: text,
	});
	assert.equal(upload.status, 201);
	const { documentId } = await upload.json();
	const meetingId = await meeting(municipalityId, "Uploaded local minutes", {
		documentId,
	});
	const docxText = `${sourceText} Public comment & discussion recorded.`;
	const docx = zipSync({
		"[Content_Types].xml": strToU8(
			'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
		),
		"_rels/.rels": strToU8(
			'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
		),
		"word/document.xml": strToU8(
			`<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${docxText.replaceAll("&", "&amp;")}</w:t></w:r></w:p></w:body></w:document>`,
		),
	});
	const docxUpload = await request("/api/documents", {
		method: "POST",
		headers: {
			"Content-Type":
				"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
		},
		body: docx,
	});
	assert.equal(docxUpload.status, 201);
	const docxId = await meeting(municipalityId, "Uploaded DOCX minutes", {
		documentId: (await docxUpload.json()).documentId,
	});
	const scrape = await rpc("functions/scrapeJobs/mutations:triggerScrape", {
		municipalityId,
	});
	assert.equal(scrape.success, true, scrape.error);
	assert.equal(scrape.stats.created, 1);
	await drain();
	assert.equal((await row(meetingId)).rawContent, text);
	assert.equal((await row(docxId)).rawContent.trim(), docxText);
	const meetings = await rpc("functions/meetings/queries:listByMunicipality", {
		municipalityId,
	});
	assert(
		meetings.meetings
			.find((item) => item.sourceType === "scraped")
			?.rawContent.includes("public park proposal"),
	);
	pass(
		"R2 TXT/DOCX uploads, public-source HTML scraping, PDF extraction and native cron/outbox processing; no AI provider requests",
	);
	for (const [label, url] of [
		["loopback", "http://127.0.0.1/metadata"],
		["numeric loopback", "http://2130706433/metadata"],
		["IPv6 loopback", "http://[::1]/metadata"],
		["mapped IPv6", "http://[::ffff:127.0.0.1]/metadata"],
		["private redirect", `${source}/redirect-internal`],
		["private DNS redirect", `${source}/redirect-private-dns`],
	]) {
		const id = await meeting(municipalityId, label, { sourceUrl: url });
		await drain();
		assert.match((await row(id)).processingError, /not public|non-public/);
	}
	assert(
		!network.some(
			(item) =>
				item.host === "127.0.0.1" || item.host === "private.example.org",
		),
	);
	const redirected = await meeting(municipalityId, "Safe public redirect", {
		sourceUrl: `${source}/redirect-public`,
	});
	await drain();
	assert((await row(redirected)).rawContent.includes("public park proposal"));
	pass(
		"signed-in sourceUrl cannot reach internal IPv4/IPv6, numeric aliases or private redirect/DNS targets; a public redirect still extracts its PDF",
	);
	await sql(
		"INSERT INTO jobs(id,path,args,due_at) VALUES('bad-path','missing:procedure','{}',0)",
	);
	await sql(
		"INSERT INTO jobs(id,path,args,due_at) VALUES('bad-json','missing:procedure','not-json',0)",
	);
	await drain();
	const failures = (
		await worker.db
			.prepare("SELECT id,error FROM jobs WHERE id IN ('bad-path','bad-json')")
			.all()
	).results;
	assert.equal(failures.length, 2);
	assert.notEqual(failures[0].error, failures[1].error);
	assert(failures.some((item) => item.error.includes("Unknown endpoint")));
	assert(failures.some((item) => item.error.includes("SyntaxError")));
	const health = await rpc("functions/jobs/operations:list", {
		state: "attention",
		limit: 100,
	});
	assert(health.some((job) => job.id === "bad-path" && job.state === "failed"));
	assert(
		(
			await rpc("functions/jobs/operations:attempts", { jobId: "bad-json" })
		)[0].error.includes("SyntaxError"),
	);
	const jobsPage = await request("/admin/jobs");
	assert.equal(jobsPage.status, 200);
	assert.match(await jobsPage.text(), /Background jobs/);
	await sql(
		"INSERT INTO jobs(id,path,args,due_at,state,attempts,error) VALUES('exhausted','missing:procedure','{}',0,'failed',5,'old failure')",
	);
	assert(
		(
			await rpc("functions/jobs/operations:list", {
				state: "attention",
				limit: 100,
			})
		).some((job) => job.id === "exhausted"),
	);
	assert.equal(
		(
			await request("/api/rpc", {
				method: "POST",
				data: {
					path: "functions/jobs/operations:retry",
					args: {
						jobId: "exhausted",
						externalEffectsChecked: false,
						reconciliation: "Provider results checked",
					},
				},
			})
		).status,
		400,
	);
	await rpc("functions/jobs/operations:retry", {
		jobId: "exhausted",
		externalEffectsChecked: true,
		reconciliation: "Local invalid endpoint; no external effect occurred",
	});
	await drain();
	assert.equal(
		(
			await worker.db
				.prepare("SELECT attempts FROM jobs WHERE id='exhausted'")
				.first()
		).attempts,
		6,
	);
	pass(
		"admin job page exposes distinct real errors and exhausted work; reconciled retries remain available beyond five attempts",
	);
	await sql(
		"INSERT INTO jobs(id,path,args,due_at,state,attempts,lease_until,started_at,error) VALUES('claim-only','missing:procedure','{}',0,'running',1,0,0,'Running; interruption will require reconciliation')",
	);
	await worker.scheduled();
	assert.equal(
		(
			await rpc("functions/jobs/operations:attempts", { jobId: "claim-only" })
		)[0].state,
		"interrupted",
	);
	// Kill the actual runtime during a held source request, then reopen its local DB.
	const killedId = await meeting(municipalityId, "Interrupted source", {
		sourceUrl: `${source}/slow`,
	});
	const running = worker.scheduled().catch(() => undefined);
	for (let i = 0; i < 100 && !slowStarted; i++) await pause(10);
	assert(slowStarted);
	const claim = await worker.db
		.prepare(
			"SELECT id,lease_until,started_at,error FROM jobs WHERE state='running'",
		)
		.first();
	assert(claim.lease_until - claim.started_at >= 20 * 60_000);
	assert.match(claim.error, /interruption/);
	assert.equal(
		(
			await request("/api/rpc", {
				method: "POST",
				data: {
					path: "functions/jobs/operations:retry",
					args: {
						jobId: claim.id,
						externalEffectsChecked: true,
						reconciliation: "Attempt is still running; must not replay",
					},
				},
			})
		).status,
		409,
	);
	await worker.close();
	slowRelease();
	await running;
	worker = await localWorker({ state, bindings, outbound, initialize: false });
	await sql("UPDATE jobs SET lease_until=0 WHERE id=?", claim.id);
	const slowHits = network.filter((item) => item.path === "/slow").length;
	await worker.scheduled();
	assert.equal(
		network.filter((item) => item.path === "/slow").length,
		slowHits,
	);
	const interrupted = await worker.db
		.prepare("SELECT state,error FROM jobs WHERE id=?")
		.bind(claim.id)
		.first();
	assert.equal(interrupted.state, "interrupted");
	assert.match(interrupted.error, /reconcile external effects/);
	await sql(
		"UPDATE app_records SET body=json_set(body,'$.sourceUrl',?) WHERE id=?",
		`${source}/redirect-public`,
		killedId,
	);
	await rpc("functions/jobs/operations:retry", {
		jobId: claim.id,
		externalEffectsChecked: true,
		reconciliation:
			"Local source fetch was interrupted; no paid request was made",
	});
	await drain();
	assert((await row(killedId)).rawContent.includes("public park proposal"));
	pass(
		"actual Worker kill preserves a visible claim; expiry never re-executes it, active retries are denied, and reconciled recovery completes without duplicate source calls",
	);
	// Exercise the real transaction implementation against the same native D1.
	const require = createRequire(import.meta.url);
	const { build } = await import(
		pathToFileURL(
			require.resolve("esbuild", {
				paths: [path.dirname(require.resolve("vite/package.json"))],
			}),
		).href
	);
	const storeFile = path.join(state, "store.mjs");
	await build({
		stdin: {
			contents: `export {DataStore,WriteConflict} from ${JSON.stringify(path.resolve("server/database.ts"))};`,
			resolveDir: process.cwd(),
		},
		outfile: storeFile,
		bundle: true,
		platform: "node",
		format: "esm",
		packages: "external",
	});
	const { DataStore, WriteConflict } = await import(
		pathToFileURL(storeFile).href
	);
	const reader = new DataStore(worker.db.withSession("first-primary"), false);
	await reader.find(userId);
	const writer = new DataStore(worker.db.withSession("first-primary"), true);
	await writer.update(userId, { lastLoginAt: Date.now() });
	await sql(
		"UPDATE app_records SET body=json_set(body,'$.updatedAt',?) WHERE id=?",
		Date.now(),
		municipalityId,
	);
	await reader.finish();
	await writer.finish();
	const a = new DataStore(worker.db.withSession("first-primary"), true),
		b = new DataStore(worker.db.withSession("first-primary"), true);
	await a.update(meetingId, { title: "Committed title" });
	await b.update(meetingId, { title: "Stale title" });
	b.jobs.push({
		id: "must-rollback",
		path: "missing:procedure",
		args: "{}",
		due: 0,
	});
	await a.finish();
	await assert.rejects(b.finish(), WriteConflict);
	assert.equal((await row(meetingId)).title, "Committed title");
	assert.equal(
		await worker.db
			.prepare("SELECT id FROM jobs WHERE id='must-rollback'")
			.first(),
		null,
	);
	pass(
		"unrelated native D1 writes do not abort reads or account writes; same-collection stale writes still roll back their entire record/outbox batch",
	);
	assert.equal(
		(
			await request("/api/webhooks/stripe", {
				method: "POST",
				signedIn: false,
				headers: { "stripe-signature": "invalid" },
				body: "{}",
			})
		).status,
		400,
	);
	const active = {
		id: "evt_local_active",
		type: "customer.subscription.updated",
		livemode: false,
		data: {
			object: {
				id: "sub_local_smoke",
				status: "active",
				items: { data: [{ current_period_end: 1800000000 }] },
			},
		},
	};
	const duringScrape = await Promise.all([
		rpc("functions/scrapeJobs/mutations:triggerScrape", { municipalityId }),
		...Array.from({ length: 8 }, () =>
			rpc("functions/municipalities/queries:list", {}, false),
		),
		webhook(active),
	]);
	assert.equal(duringScrape.at(-1).status, 200);
	const upgraded = await rpc("functions/users/queries:current");
	assert.equal(upgraded.tier, "pro");
	assert.equal(upgraded.stripeCurrentPeriodEnd, 1800000000000);
	assert.equal(
		(
			await webhook({
				id: "evt_local_live",
				type: "customer.subscription.deleted",
				livemode: true,
				data: { object: { id: "sub_local_smoke" } },
			})
		).status,
		400,
	);
	assert.equal((await rpc("functions/users/queries:current")).tier, "pro");
	assert.equal(
		(
			await webhook({
				id: "evt_local_deleted",
				type: "customer.subscription.deleted",
				livemode: false,
				data: { object: { id: "sub_local_smoke" } },
			})
		).status,
		200,
	);
	assert.equal((await rpc("functions/users/queries:current")).tier, "free");
	assert.equal((await webhook(active)).status, 200);
	assert.equal((await rpc("functions/users/queries:current")).tier, "free");
	const receipts = (
		await worker.db
			.prepare("SELECT event_id FROM stripe_events ORDER BY event_id")
			.all()
	).results;
	assert.deepEqual(
		receipts.map((item) => item.event_id),
		["evt_local_active", "evt_local_deleted"],
	);
	const missingEvent = {
		id: "evt_missing_mapping",
		type: "customer.subscription.updated",
		livemode: false,
		data: {
			object: {
				id: "sub_missing",
				status: "active",
				items: { data: [{ current_period_end: 1800000000 }] },
			},
		},
	};
	assert.equal((await webhook(missingEvent)).status, 503);
	assert.equal(
		await worker.db
			.prepare(
				"SELECT event_id FROM stripe_events WHERE event_id='evt_missing_mapping'",
			)
			.first(),
		null,
	);
	pass(
		"public reads and signed Stripe webhooks survive concurrent scraping; event-ID replay cannot restore cancelled access, and failed application leaves no receipt",
	);
	// Native recovery + verification use the actual mail request/response contract,
	// intercepted before the network. Never send a real message from this script.
	const reset = await request("/api/auth/request-password-reset", {
		method: "POST",
		data: { email, redirectTo: `${origin}/reset-password` },
	});
	assert.equal(reset.status, 200);
	assert.equal(mail.length, 1);
	const recoveryLink = new URL(
		mail[0].html.match(/href="([^"]+)"/)[1].replaceAll("&amp;", "&"),
	);
	assert.equal(recoveryLink.origin, origin);
	const recovery = await request(recoveryLink.pathname + recoveryLink.search);
	assert.equal(recovery.status, 302);
	const token = new URL(
		recovery.headers.get("location"),
		origin,
	).searchParams.get("token");
	assert(token);
	password = crypto.randomBytes(24).toString("hex");
	assert.equal(
		(
			await request("/api/auth/reset-password", {
				method: "POST",
				data: { token, newPassword: password },
			})
		).status,
		200,
	);
	assert.equal(
		(
			await request("/api/auth/send-verification-email", {
				method: "POST",
				data: { email, callbackURL: `${origin}/dashboard` },
			})
		).status,
		200,
	);
	assert.equal(mail.length, 2);
	const verificationLink = new URL(
		mail[1].html.match(/href="([^"]+)"/)[1].replaceAll("&amp;", "&"),
	);
	assert.equal(verificationLink.origin, origin);
	assert(
		[200, 302].includes(
			(await request(verificationLink.pathname + verificationLink.search))
				.status,
		),
	);
	assert.equal(
		(
			await worker.db
				.prepare("SELECT emailVerified FROM user WHERE email=?")
				.bind(email)
				.first()
		).emailVerified,
		1,
	);
	const otherEmail = `other-${crypto.randomUUID()}@example.test`;
	assert.equal(
		(
			await request("/api/auth/sign-up/email", {
				method: "POST",
				signedIn: false,
				data: {
					email: otherEmail,
					password: crypto.randomBytes(24).toString("hex"),
					name: "Other Resident",
				},
			})
		).status,
		200,
	);
	await request("/api/auth/request-password-reset", {
		method: "POST",
		data: { email: otherEmail, redirectTo: `${origin}/reset-password` },
	});
	assert.equal(mail.length, 2);
	pass(
		"native password recovery and email verification complete through the real mail transport contract; staging rejects delivery to another recipient (fixture only, no mail sent)",
	);
	await request("/api/auth/sign-out", { method: "POST", data: {} });
	cookie = "";
	assert.equal(await (await request("/api/auth/get-session")).json(), null);
	const login = await request("/api/auth/sign-in/email", {
		method: "POST",
		signedIn: false,
		data: { email, password },
	});
	assert.equal(login.status, 200);
	cookie = login.headers
		.getSetCookie()
		.map((item) => item.split(";")[0])
		.join("; ");
	assert.equal(
		(await rpc("functions/subscriptions/queries:listByUser"))[0]._id,
		subscriptionId,
	);
	pass(
		"new recovery password signs into the same persisted account and subscription",
	);
	console.log(
		"NOT RUN unit tests, paid AI/OCR, real mail delivery, external checkout/portal, remote staging deployment/reachability, production changes or browser interaction",
	);
} finally {
	slowRelease?.();
	if (worker) await worker.close();
	fs.rmSync(state, { recursive: true, force: true });
}
