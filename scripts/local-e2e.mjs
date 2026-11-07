import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { promisify } from "node:util";
import { strToU8, zipSync } from "fflate";
import superjson from "superjson";

const port = Number(process.env.SMOKE_PORT ?? 3100);
const origin = `http://localhost:${port}`;
const state = path.resolve(`.wrangler/e2e-${crypto.randomUUID()}`);
const wrangler = path.resolve("node_modules/wrangler/bin/wrangler.js");
const cli = (args) =>
	promisify(execFile)(process.execPath, [wrangler, ...args], {
		encoding: "utf8",
		env: { ...process.env, CI: "true", WRANGLER_SEND_METRICS: "false" },
	});
const sql = (statement) => {
	const file = path.join(state, "fixture.sql");
	fs.writeFileSync(file, statement);
	return cli([
		"d1",
		"execute",
		"DB",
		"--local",
		"--persist-to",
		state,
		"--file",
		file,
		"--json",
	]);
};
const quote = (text) => `'${String(text).replaceAll("'", "''")}'`;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let worker;
let fixture;
let cookie = "";
let workerErrors = "";
const evidence = [];
const pass = (text) => {
	evidence.push(text);
	console.log(`PASS ${text}`);
};
async function request(
	route,
	{ method = "GET", data, signedIn = true, headers = {}, body } = {},
) {
	return fetch(`${origin}${route}`, {
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
	}).catch(() => {
		throw new Error(
			`Local Worker disconnected during ${endpoint}; ${workerErrors.replace(/(?:sk_test_|whsec_)[^\s]+/g, "[redacted]")}`,
		);
	});
	assert.equal(response.status, 200, `${endpoint} returned ${response.status}`);
	return superjson.deserialize((await response.json()).result);
}
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

try {
	assert(
		fs.existsSync("dist/server/wrangler.json"),
		"Build the app before running local smoke",
	);
	assert(fs.existsSync(".dev.vars"), "Run node scripts/local-env.mjs first");
	const local = Object.fromEntries(
		fs
			.readFileSync(".dev.vars", "utf8")
			.split("\n")
			.filter((line) => line.includes("="))
			.map((line) => {
				const i = line.indexOf("=");
				return [line.slice(0, i), line.slice(i + 1)];
			}),
	);
	assert(
		local.STRIPE_WEBHOOK_SECRET,
		"Local webhook signing configuration is required",
	);
	fs.mkdirSync(state, { recursive: true });
	await cli([
		"d1",
		"migrations",
		"apply",
		"DB",
		"--local",
		"--persist-to",
		state,
	]);
	const sourceText =
		"The town council met on October 1, 2026. Members reviewed the public park proposal and approved the minutes. Residents discussed traffic safety and requested clearer crossings. The council voted to schedule a public hearing and adjourned the meeting.";
	fixture = http.createServer((req, res) => {
		if (req.url === "/minutes.pdf") {
			res.setHeader("Content-Type", "application/pdf");
			res.end(pdf(sourceText));
		} else {
			res.setHeader("Content-Type", "text/html");
			res.end(
				'<html><main><article class="meeting"><h3><a href="/minutes.pdf">Town Council Meeting Minutes</a></h3><time class="date" datetime="2026-10-01">October 1, 2026</time></article></main></html>',
			);
		}
	});
	await new Promise((resolve) => fixture.listen(0, "127.0.0.1", resolve));
	const fixtureUrl = `http://127.0.0.1:${fixture.address().port}`;
	worker = spawn(
		process.execPath,
		[
			wrangler,
			"dev",
			"--config",
			"dist/server/wrangler.json",
			"--port",
			String(port),
			"--persist-to",
			state,
			"--test-scheduled",
			"--var",
			`APP_URL:${origin}`,
			"--var",
			"OUTBOUND_ENABLED:false",
			"--var",
			"SCHEDULED_ENABLED:true",
			"--log-level",
			"error",
		],
		{
			stdio: ["ignore", "pipe", "pipe"],
			env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
		},
	);
	// Consume child output, but never print settings, session tokens or response bodies.
	const capture = (chunk) => {
		workerErrors = (workerErrors + chunk.toString()).slice(-12000);
	};
	worker.stdout.on("data", capture);
	worker.stderr.on("data", capture);
	let ready = false;
	for (let i = 0; i < 120; i++) {
		if (worker.exitCode !== null)
			throw new Error(
				Object.values(local).reduce(
					(message, secret) =>
						secret ? message.replaceAll(secret, "[redacted]") : message,
					`Local Worker exited before readiness: ${workerErrors}`,
				),
			);
		try {
			const response = await request("/api/auth/get-session");
			if (response.ok) {
				ready = true;
				break;
			}
		} catch {
			/* Wait for the real Worker listener. */
		}
		await pause(500);
	}
	assert(ready, "Local Worker did not become ready");
	assert.deepEqual(
		await rpc("functions/municipalities/queries:list", {}, false),
		[],
	);
	const signIn = await request("/sign-in");
	assert.equal(signIn.status, 200);
	await signIn.arrayBuffer();
	pass("Worker serves sign-in and queries a fresh local D1 database");
	const email = `smoke-${crypto.randomUUID()}@example.test`;
	const password = crypto.randomBytes(24).toString("hex");
	const signup = await request("/api/auth/sign-up/email", {
		method: "POST",
		data: { email, password, name: "Smoke Resident" },
	});
	assert.equal(signup.status, 200, "Better Auth sign-up failed");
	cookie = signup.headers
		.getSetCookie()
		.map((item) => item.split(";")[0])
		.join("; ");
	assert(cookie, "Sign-up did not issue a session cookie");
	const session = await (await request("/api/auth/get-session")).json();
	assert.equal(session.user.email, email);
	const userId = await rpc("functions/users/mutations:ensureFromIdentity");
	assert.equal((await rpc("functions/users/queries:current"))._id, userId);
	assert.equal(
		(
			await request("/api/rpc", {
				method: "POST",
				data: {
					path: "functions/stripe/mutations:handleSubscriptionDeleted",
					args: { stripeSubscriptionId: "sub_local" },
				},
			})
		).status,
		404,
	);
	assert.equal(
		(
			await request("/api/rpc", {
				method: "POST",
				data: { path: "functions/users/queries:getByEmail", args: { email } },
				signedIn: false,
			})
		).status,
		403,
	);
	pass(
		"Better Auth sign-up/session and account isolation; internal billing is not client-callable",
	);
	await sql(
		`UPDATE app_records SET body=json_set(body,'$.isAdmin',json('true'),'$.billingMode','test','$.stripeSubscriptionId','sub_local_smoke') WHERE id=${quote(userId)}; UPDATE app_revision SET revision=revision+1 WHERE id=1;`,
	);
	const municipalityId = await rpc(
		"functions/municipalities/mutations:create",
		{
			name: "Local Smoke Borough",
			state: "Connecticut",
			platform: "generic",
			meetingsPageUrl: `${fixtureUrl}/meetings`,
			websiteUrl: fixtureUrl,
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
		`UPDATE app_records SET body=json_set(body,'$.coverageStatus','published') WHERE id=${quote(municipalityId)}; UPDATE app_revision SET revision=revision+1 WHERE id=1;`,
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
	const subscriptions = await rpc("functions/subscriptions/queries:listByUser");
	assert.equal(subscriptions[0]._id, subscriptionId);
	assert.equal(subscriptions[0].municipality._id, municipalityId);
	pass(
		"Coverage visibility and subscriptions persist through native D1 procedures",
	);
	const text = `Uploaded minutes. ${sourceText}`;
	const upload = await request("/api/documents", {
		method: "POST",
		headers: { "Content-Type": "text/plain" },
		body: text,
	});
	assert.equal(upload.status, 201);
	const { documentId } = await upload.json();
	const meetingId = await rpc("functions/meetings/mutations:create", {
		municipalityId,
		title: "Uploaded local minutes",
		meetingType: "city_council",
		meetingDate: Date.UTC(2026, 9, 1),
		documentId,
	});
	const scrape = await rpc("functions/scrapeJobs/mutations:triggerScrape", {
		municipalityId,
	});
	assert.equal(scrape.success, true, "Local municipal source scrape failed");
	assert.equal(scrape.stats?.created, 1);
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
	const docxId = await rpc("functions/meetings/mutations:create", {
		municipalityId,
		title: "Uploaded DOCX minutes",
		meetingType: "city_council",
		meetingDate: Date.UTC(2026, 9, 1),
		documentId: (await docxUpload.json()).documentId,
	});
	const scheduled = await request("/cdn-cgi/handler/scheduled?cron=*+*+*+*+*");
	const scheduledBody = await scheduled.text();
	await pause(200);
	const safeScheduledBody = Object.values(local).reduce(
		(message, secret) =>
			secret ? message.replaceAll(secret, "[redacted]") : message,
		`${scheduledBody}\n${workerErrors}`,
	);
	assert.equal(scheduled.status, 200, safeScheduledBody);
	let processed;
	for (let i = 0; i < 60; i++) {
		processed = await rpc("functions/meetings/queries:getWithSummary", {
			id: meetingId,
		});
		if (processed?.status === "failed") break;
		await pause(500);
	}
	assert.equal(processed.rawContent, text);
	assert.equal(processed.status, "failed");
	assert.match(
		processed.processingError,
		/OPENROUTER_API_KEY|AI processing is disabled/,
	);
	const meetings = await rpc("functions/meetings/queries:listByMunicipality", {
		municipalityId,
	});
	const docxMeeting = meetings.meetings.find((item) => item._id === docxId);
	assert.equal(docxMeeting?.rawContent?.trim(), docxText);
	const scraped = meetings.meetings.find(
		(item) => item.sourceType === "scraped",
	);
	assert(
		scraped?.rawContent?.includes("public park proposal"),
		"PDF extraction did not persist source text",
	);
	pass(
		"R2 TXT/DOCX uploads, real HTML scraping, PDF extraction, and scheduled D1 outbox processing; external AI stays disabled",
	);
	const webhook = async (event) => {
		const body = JSON.stringify(event);
		const timestamp = Math.floor(Date.now() / 1000);
		const signature = crypto
			.createHmac("sha256", local.STRIPE_WEBHOOK_SECRET)
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
	};
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
	assert.equal(
		(
			await webhook({
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
			})
		).status,
		200,
	);
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
	pass(
		"Real Stripe signature verification updates test entitlements and rejects invalid signatures/live events",
	);
	assert.equal(
		(await request("/api/auth/sign-out", { method: "POST", data: {} })).status,
		200,
	);
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
		"Sign-out invalidates the session; sign-in recovers the same persisted account and subscription",
	);
	console.log(
		"NOT RUN paid AI, outbound email, provider checkout/portal, production deployment, browser interaction, unit tests",
	);
} finally {
	if (worker) {
		worker.kill("SIGTERM");
		await Promise.race([
			new Promise((resolve) => worker.once("exit", resolve)),
			pause(5_000),
		]);
	}
	if (fixture) await new Promise((resolve) => fixture.close(resolve));
	fs.rmSync(state, { recursive: true, force: true });
}
