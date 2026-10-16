/**
 * Offline summary staging — validate a source-cited summary that was authored
 * OUTSIDE this application, then stage it for a later, explicitly approved
 * import by the owner.
 *
 * Why this exists: `convex/functions/ai/summarize.ts` authors summaries by
 * POSTing to a pay-as-you-go inference API. This module adds a second, free
 * path: a human/operator-authored envelope is validated against the raw source
 * text it claims to summarize, and only then can be handed to the existing
 * `ai.mutations.createSummary` shape.
 *
 * Deliberate non-goals (do not "fix" these):
 *   - No network. Nothing here fetches; the caller passes bytes it already has.
 *   - No credentials, no inference SDK, no daemon, no proxy. This module never
 *     authors a summary; it only validates one that already exists.
 *   - No publication. Staging an envelope does not touch municipality coverage
 *     status; `evaluateCoveragePublishRequest` remains the only publish gate.
 */

export const STAGING_ENVELOPE_VERSION = "offline-staging-1";

export const STAGED_DOCUMENT_TYPES = ["agenda", "minutes"] as const;
export type StagedDocumentType = (typeof STAGED_DOCUMENT_TYPES)[number];

/** Mirrors the `kind` column on the `summaries` table. */
export type SummaryKind = "summary" | "agenda_preview";

const SHA256_RE = /^[0-9a-f]{64}$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Substrings that must never appear anywhere in a staged envelope. An offline
 * envelope is a public artifact; a leaked key or a paid-provider endpoint in it
 * is a hard rejection, not a warning.
 */
const FORBIDDEN_MATERIAL: Array<{ pattern: RegExp; label: string }> = [
	{ pattern: /sk-[A-Za-z0-9_-]{16,}/, label: "api-key-like token" },
	{ pattern: /\bBearer\s+[A-Za-z0-9._-]{16,}/i, label: "bearer credential" },
	{ pattern: /OPENROUTER_API_KEY/i, label: "OpenRouter key reference" },
	{ pattern: /openrouter\.ai/i, label: "paid inference endpoint" },
	{ pattern: /api\.anthropic\.com/i, label: "paid inference endpoint" },
	{ pattern: /api\.openai\.com/i, label: "paid inference endpoint" },
];

export type StagedProvenance = {
	municipality: string;
	state: string;
	body: string;
	meetingDate: string;
	documentType: StagedDocumentType;
	sourceUrl: string;
	retrievedAt: string;
	retrievalMethod: string;
	extractedTextSha256: string;
	/** Free-text attribution of who/what wrote the summary. */
	authoredBy: string;
	paidApiUsed: boolean;
};

export type StagedKeyDecision = {
	title: string;
	description: string;
	topics: string[];
	importance?: "high" | "medium" | "low";
	/**
	 * Verbatim substring of the source text that this item is drawn from. This
	 * is what makes provenance checkable instead of asserted.
	 */
	sourceAnchor: string;
	/** Required true when documentType is "agenda": scheduled, not decided. */
	agendaOnly?: boolean;
	voteResult?: { yes: number; no: number; abstain: number; passed: boolean };
};

export type StagedSummaryEnvelope = {
	envelopeVersion: string;
	provenance: StagedProvenance;
	kind: SummaryKind;
	executiveSummary: string;
	keyDecisions: StagedKeyDecision[];
	discussionTopics: Array<{ topic: string; summary: string; category: string }>;
	upcomingItems: Array<{ title: string; expectedDate?: string }>;
	topics: string[];
	sentiment?: "routine" | "contentious" | "celebratory" | "urgent";
	promptVersion: string;
};

export type StagingValidation =
	| { ok: true; envelope: StagedSummaryEnvelope; warnings: string[] }
	| { ok: false; errors: string[] };

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
	return typeof value === "string" && value.trim().length > 0;
}

/**
 * SHA-256 over the UTF-8 bytes of `text`, dependency-free.
 *
 * Deliberately NOT `node:crypto`: every file under `convex/` is pushed to the
 * deployment, and a module importing a Node builtin without the `"use node"`
 * directive breaks the default-runtime bundle. Web Crypto is async and would
 * make the validator async for no benefit. The test asserts this implementation
 * agrees with `node:crypto` on the real fixture, so it is checked, not trusted.
 */
const K = [
	0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
	0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
	0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
	0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
	0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
	0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
	0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
	0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
	0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
	0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
	0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

export function sha256Hex(text: string): string {
	const bytes = new TextEncoder().encode(text);
	const bitLength = bytes.length * 8;
	// message + 0x80 + zero padding to 56 mod 64 + 8-byte big-endian length
	const paddedLength = (((bytes.length + 8) >> 6) + 1) << 6;
	const buffer = new Uint8Array(paddedLength);
	buffer.set(bytes);
	buffer[bytes.length] = 0x80;
	const view = new DataView(buffer.buffer);
	view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x100000000), false);
	view.setUint32(paddedLength - 4, bitLength >>> 0, false);

	const h = [
		0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c,
		0x1f83d9ab, 0x5be0cd19,
	];
	const w = new Uint32Array(64);
	const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));

	for (let offset = 0; offset < paddedLength; offset += 64) {
		for (let i = 0; i < 16; i++) w[i] = view.getUint32(offset + i * 4, false);
		for (let i = 16; i < 64; i++) {
			const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
			const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
			w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
		}

		let [a, b, c, d, e, f, g, hh] = h;
		for (let i = 0; i < 64; i++) {
			const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
			const ch = (e & f) ^ (~e & g);
			const temp1 = (hh + S1 + ch + K[i] + w[i]) >>> 0;
			const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
			const maj = (a & b) ^ (a & c) ^ (b & c);
			const temp2 = (S0 + maj) >>> 0;

			hh = g;
			g = f;
			f = e;
			e = (d + temp1) >>> 0;
			d = c;
			c = b;
			b = a;
			a = (temp1 + temp2) >>> 0;
		}

		h[0] = (h[0] + a) >>> 0;
		h[1] = (h[1] + b) >>> 0;
		h[2] = (h[2] + c) >>> 0;
		h[3] = (h[3] + d) >>> 0;
		h[4] = (h[4] + e) >>> 0;
		h[5] = (h[5] + f) >>> 0;
		h[6] = (h[6] + g) >>> 0;
		h[7] = (h[7] + hh) >>> 0;
	}

	return h.map((x) => x.toString(16).padStart(8, "0")).join("");
}

/**
 * Normalize whitespace so an anchor copied out of extracted text still matches
 * when line wrapping differs. Case-insensitive on purpose; punctuation is kept
 * because resolution ids ("26/27-11") are the strongest anchors available.
 */
function flatten(text: string): string {
	return text.replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * Validate an offline-authored summary envelope against the raw source text it
 * cites. Returns every failure at once — an operator fixing an envelope by hand
 * should not have to re-run six times.
 */
export function validateStagedSummary(
	input: unknown,
	sourceText: string,
): StagingValidation {
	const errors: string[] = [];
	const warnings: string[] = [];

	if (!isRecord(input)) {
		return { ok: false, errors: ["Envelope is not a JSON object."] };
	}

	const serialized = JSON.stringify(input);
	for (const { pattern, label } of FORBIDDEN_MATERIAL) {
		if (pattern.test(serialized)) {
			errors.push(`Envelope contains forbidden material: ${label}.`);
		}
	}

	if (input.envelopeVersion !== STAGING_ENVELOPE_VERSION) {
		errors.push(
			`envelopeVersion must be "${STAGING_ENVELOPE_VERSION}", got ${JSON.stringify(input.envelopeVersion)}.`,
		);
	}

	if (!nonEmptyString(sourceText)) {
		errors.push("No source text supplied; provenance cannot be checked.");
	}

	// ── provenance ────────────────────────────────────────────────────────────
	const prov = input.provenance;
	let documentType: StagedDocumentType | null = null;

	if (!isRecord(prov)) {
		errors.push("Missing provenance block — a source-free summary is refused.");
	} else {
		for (const field of [
			"municipality",
			"state",
			"body",
			"retrievalMethod",
			"authoredBy",
		]) {
			if (!nonEmptyString(prov[field])) {
				errors.push(`provenance.${field} is required.`);
			}
		}

		if (!nonEmptyString(prov.sourceUrl)) {
			errors.push("provenance.sourceUrl is required — refusing a source-free summary.");
		} else if (!/^https?:\/\//i.test(prov.sourceUrl)) {
			errors.push("provenance.sourceUrl must be an http(s) URL to the public record.");
		}

		if (!nonEmptyString(prov.meetingDate) || !ISO_DATE_RE.test(prov.meetingDate)) {
			errors.push("provenance.meetingDate must be YYYY-MM-DD.");
		}
		if (!nonEmptyString(prov.retrievedAt) || !ISO_DATE_RE.test(prov.retrievedAt)) {
			errors.push("provenance.retrievedAt must be YYYY-MM-DD.");
		}

		if (
			!nonEmptyString(prov.documentType) ||
			!(STAGED_DOCUMENT_TYPES as readonly string[]).includes(prov.documentType)
		) {
			errors.push(
				`provenance.documentType must be one of ${STAGED_DOCUMENT_TYPES.join(", ")}.`,
			);
		} else {
			documentType = prov.documentType as StagedDocumentType;
		}

		if (prov.paidApiUsed !== false) {
			errors.push(
				"provenance.paidApiUsed must be exactly false — a paid-API summary may not be staged on this path.",
			);
		}

		// Provenance round-trip: the recorded digest must match the bytes.
		if (
			!nonEmptyString(prov.extractedTextSha256) ||
			!SHA256_RE.test(prov.extractedTextSha256)
		) {
			errors.push("provenance.extractedTextSha256 must be a 64-char hex sha256.");
		} else if (nonEmptyString(sourceText)) {
			const actual = sha256Hex(sourceText);
			if (actual !== prov.extractedTextSha256) {
				errors.push(
					`Provenance round-trip failed: extractedTextSha256 ${prov.extractedTextSha256} does not match the supplied source text (${actual}).`,
				);
			}
		}
	}

	// ── summary kind vs document type ─────────────────────────────────────────
	const kind = input.kind;
	if (kind !== "summary" && kind !== "agenda_preview") {
		errors.push('kind must be "summary" or "agenda_preview".');
	} else if (documentType === "agenda" && kind !== "agenda_preview") {
		errors.push(
			'An agenda may only be staged as kind "agenda_preview" — staging an agenda as a meeting summary would present scheduled items as decisions.',
		);
	} else if (documentType === "minutes" && kind !== "summary") {
		errors.push('Minutes must be staged as kind "summary".');
	}

	if (!nonEmptyString(input.executiveSummary)) {
		errors.push("executiveSummary is required.");
	}
	if (!nonEmptyString(input.promptVersion)) {
		errors.push("promptVersion is required so a staged summary is attributable.");
	}

	// ── list-shaped fields ────────────────────────────────────────────────────
	for (const field of [
		"keyDecisions",
		"discussionTopics",
		"upcomingItems",
		"topics",
	]) {
		if (!Array.isArray(input[field])) {
			errors.push(`${field} must be an array.`);
		}
	}

	const flatSource = nonEmptyString(sourceText) ? flatten(sourceText) : "";

	if (Array.isArray(input.keyDecisions)) {
		if (input.keyDecisions.length === 0) {
			warnings.push("keyDecisions is empty; nothing will be attributed to the source.");
		}
		input.keyDecisions.forEach((raw, i) => {
			const at = `keyDecisions[${i}]`;
			if (!isRecord(raw)) {
				errors.push(`${at} is not an object.`);
				return;
			}
			if (!nonEmptyString(raw.title)) errors.push(`${at}.title is required.`);
			if (!nonEmptyString(raw.description)) {
				errors.push(`${at}.description is required.`);
			}
			if (!Array.isArray(raw.topics)) errors.push(`${at}.topics must be an array.`);

			if (!nonEmptyString(raw.sourceAnchor)) {
				errors.push(
					`${at}.sourceAnchor is required — every claim must quote the source it came from.`,
				);
			} else if (flatSource && !flatSource.includes(flatten(raw.sourceAnchor))) {
				errors.push(
					`${at}.sourceAnchor ${JSON.stringify(raw.sourceAnchor)} does not appear in the cited source text.`,
				);
			}

			if (documentType === "agenda") {
				if (raw.agendaOnly !== true) {
					errors.push(
						`${at}.agendaOnly must be true for an agenda — the record shows what was scheduled, not what was decided.`,
					);
				}
				if (raw.voteResult !== undefined) {
					errors.push(
						`${at}.voteResult is not allowed on an agenda: an agenda records no vote or outcome.`,
					);
				}
			}
		});
	}

	if (errors.length > 0) return { ok: false, errors };
	return { ok: true, envelope: input as StagedSummaryEnvelope, warnings };
}

/**
 * Shape a validated envelope into the exact args object the product's existing
 * `internal.functions.ai.mutations.createSummary` already accepts. This module
 * does not call it; the caller with authority does.
 */
export function toCreateSummaryArgs(envelope: StagedSummaryEnvelope): {
	kind: SummaryKind;
	summary: Record<string, unknown>;
} {
	return {
		kind: envelope.kind,
		summary: {
			executiveSummary: envelope.executiveSummary,
			keyDecisions: envelope.keyDecisions.map((d) => {
				const mapped: Record<string, unknown> = {
					title: d.title,
					description: d.description,
					topics: d.topics,
				};
				if (d.importance) mapped.importance = d.importance;
				if (d.voteResult) mapped.voteResult = d.voteResult;
				return mapped;
			}),
			discussionTopics: envelope.discussionTopics,
			upcomingItems: envelope.upcomingItems,
			topics: envelope.topics,
			...(envelope.sentiment ? { sentiment: envelope.sentiment } : {}),
			modelUsed: `offline-staged:${envelope.provenance.authoredBy}`,
			promptVersion: envelope.promptVersion,
			processingTimeMs: 0,
		},
	};
}

export type ImportActor = { isAdmin?: boolean } | null | undefined;

export type ImportEvaluation =
	| { allowed: true }
	| { allowed: false; reason: string };

/**
 * Owner-only, explicitly-approved import. Two independent conditions: the
 * caller must be an admin (same `isAdmin` flag `requireAdmin` reads), and the
 * import must carry an explicit approval. Validation alone never imports.
 */
export function evaluateStagedImportRequest({
	actor,
	validation,
	approval,
}: {
	actor: ImportActor;
	validation: StagingValidation;
	approval?: { explicit?: boolean; approvedBy?: string } | null;
}): ImportEvaluation {
	if (!actor?.isAdmin) {
		return {
			allowed: false,
			reason: "Forbidden: importing a staged offline summary is owner-only.",
		};
	}
	if (!validation.ok) {
		return {
			allowed: false,
			reason: "Staged summary failed validation and cannot be imported.",
		};
	}
	if (!approval?.explicit || !nonEmptyString(approval.approvedBy)) {
		return {
			allowed: false,
			reason:
				"Staged summaries are held, not imported: an explicit approval (approvedBy) is required.",
		};
	}
	return { allowed: true };
}

/** Human-readable one-line-per-problem report for the CLI. */
export function formatValidationReport(result: StagingValidation): string {
	if (result.ok) {
		const lines = [
			`PASS  ${result.envelope.provenance.municipality}, ${result.envelope.provenance.state} — ${result.envelope.provenance.body} ${result.envelope.provenance.meetingDate} (${result.envelope.provenance.documentType})`,
			`      source: ${result.envelope.provenance.sourceUrl}`,
			`      anchors verified: ${result.envelope.keyDecisions.length}`,
			"      staged only — not imported, not published",
		];
		for (const w of result.warnings) lines.push(`      warn: ${w}`);
		return lines.join("\n");
	}
	return ["FAIL", ...result.errors.map((e) => `      - ${e}`)].join("\n");
}
