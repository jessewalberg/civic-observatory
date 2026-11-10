import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { evaluateCoveragePublishRequest } from "../functions/municipalities/coveragePublication";
import {
	evaluateStagedImportRequest,
	formatValidationReport,
	sha256Hex,
	STAGING_ENVELOPE_VERSION,
	toCreateSummaryArgs,
	validateStagedSummary,
} from "./offlineSummaryStaging";

// Fixture-only transport: the bytes are read from disk. No fetch, no network,
// no Convex function is executed anywhere in this file.
const SOURCE_PATH = fileURLToPath(
	new URL("./fixtures/coventry-20260908-agenda.txt", import.meta.url),
);
const ENVELOPE_PATH = fileURLToPath(
	new URL("./fixtures/coventry-20260908-agenda.staged.json", import.meta.url),
);

const sourceText = readFileSync(SOURCE_PATH, "utf8");

// Tests deliberately mutate the fixture into invalid shapes (deleting required
// fields, assigning wrong types), so it is typed as loose JSON rather than as
// StagedSummaryEnvelope — the whole point is that it stops being one.
// biome-ignore lint/suspicious/noExplicitAny: invalid-by-design fixture mutation
type LooseJson = Record<string, any>;

const goldenEnvelope: LooseJson = JSON.parse(readFileSync(ENVELOPE_PATH, "utf8"));

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function errorsFor(mutate: (envelope: LooseJson) => void) {
	const envelope = clone(goldenEnvelope);
	mutate(envelope);
	const result = validateStagedSummary(envelope, sourceText);
	expect(result.ok).toBe(false);
	return result.ok ? [] : result.errors;
}

describe("offline summary staging — golden Coventry agenda", () => {
	it("accepts the golden fixture and reports it as staged only", () => {
		const result = validateStagedSummary(goldenEnvelope, sourceText);
		if (!result.ok) throw new Error(result.errors.join("\n"));
		expect(result.envelope.envelopeVersion).toBe(STAGING_ENVELOPE_VERSION);
		expect(result.envelope.keyDecisions).toHaveLength(5);
		expect(formatValidationReport(result)).toContain(
			"staged only — not imported, not published",
		);
	});

	it("verifies the provenance round-trip against the real source bytes", () => {
		expect(sha256Hex(sourceText)).toBe(
			"882763c2fcf81bfb27c4e33da29ccc59e85a8b252c3562346e4c1d1b91d9a65e",
		);
		expect(goldenEnvelope.provenance.extractedTextSha256).toBe(
			sha256Hex(sourceText),
		);
	});

	it("agrees with node:crypto sha256 on real and edge-case inputs", () => {
		const cases = [
			sourceText,
			"",
			"a",
			"abc",
			// 55/56/64-byte boundaries where sha256 padding changes block count
			"x".repeat(55),
			"x".repeat(56),
			"x".repeat(64),
			"x".repeat(1000),
			// multi-byte UTF-8 must hash as bytes, not code units
			"Coventry — Town Manager’s review · café",
		];
		for (const input of cases) {
			expect(sha256Hex(input)).toBe(
				createHash("sha256").update(input, "utf8").digest("hex"),
			);
		}
	});

	it("anchors every key decision in verbatim source text", () => {
		const flat = sourceText.replace(/\s+/g, " ").toLowerCase();
		for (const decision of goldenEnvelope.keyDecisions) {
			expect(
				flat.includes(decision.sourceAnchor.replace(/\s+/g, " ").toLowerCase()),
			).toBe(true);
		}
	});

	it("asserts no vote and no outcome for an agenda", () => {
		for (const decision of goldenEnvelope.keyDecisions) {
			expect(decision.agendaOnly).toBe(true);
			expect(decision.voteResult).toBeUndefined();
		}
	});

	it("rejects a summary whose recorded hash does not match the bytes", () => {
		const errors = errorsFor((e) => {
			e.provenance.extractedTextSha256 = "0".repeat(64);
		});
		expect(errors.some((e) => e.includes("Provenance round-trip failed"))).toBe(
			true,
		);
	});

	it("detects a single edited character in the source text", () => {
		const tampered = sourceText.replace("Town Hall Annex", "Town Hall Annexx");
		const result = validateStagedSummary(goldenEnvelope, tampered);
		expect(result.ok).toBe(false);
	});
});

describe("offline summary staging — rejections", () => {
	it("rejects a non-object payload", () => {
		expect(validateStagedSummary("not json", sourceText).ok).toBe(false);
		expect(validateStagedSummary(null, sourceText).ok).toBe(false);
		expect(validateStagedSummary([1, 2, 3], sourceText).ok).toBe(false);
	});

	it("rejects a source-free summary", () => {
		const errors = errorsFor((e) => {
			e.provenance = undefined;
		});
		expect(errors.some((e) => e.includes("Missing provenance block"))).toBe(true);
	});

	it("rejects a summary with no sourceUrl", () => {
		const errors = errorsFor((e) => {
			e.provenance.sourceUrl = "";
		});
		expect(errors.some((e) => e.includes("sourceUrl is required"))).toBe(true);
	});

	it("rejects a non-http sourceUrl", () => {
		const errors = errorsFor((e) => {
			e.provenance.sourceUrl = "file:///tmp/agenda.txt";
		});
		expect(errors.some((e) => e.includes("must be an http(s) URL"))).toBe(true);
	});

	it("rejects an agenda staged as a full meeting summary", () => {
		const errors = errorsFor((e) => {
			e.kind = "summary";
		});
		expect(
			errors.some((e) => e.includes('may only be staged as kind "agenda_preview"')),
		).toBe(true);
	});

	it("rejects an agenda item that claims a vote result", () => {
		const errors = errorsFor((e) => {
			e.keyDecisions[0].voteResult = {
				yes: 6,
				no: 1,
				abstain: 0,
				passed: true,
			};
		});
		expect(errors.some((e) => e.includes("records no vote or outcome"))).toBe(
			true,
		);
	});

	it("rejects an agenda item missing the agendaOnly marker", () => {
		const errors = errorsFor((e) => {
			delete e.keyDecisions[1].agendaOnly;
		});
		expect(errors.some((e) => e.includes("agendaOnly must be true"))).toBe(true);
	});

	it("rejects a claim whose anchor is not in the source", () => {
		const errors = errorsFor((e) => {
			e.keyDecisions[0].sourceAnchor =
				"The Council voted unanimously to raise the mill rate";
		});
		expect(
			errors.some((e) => e.includes("does not appear in the cited source text")),
		).toBe(true);
	});

	it("rejects a claim with no anchor at all", () => {
		const errors = errorsFor((e) => {
			delete e.keyDecisions[2].sourceAnchor;
		});
		expect(errors.some((e) => e.includes("sourceAnchor is required"))).toBe(true);
	});

	it("rejects an envelope produced by a paid API", () => {
		const errors = errorsFor((e) => {
			e.provenance.paidApiUsed = true;
		});
		expect(errors.some((e) => e.includes("paidApiUsed must be exactly false"))).toBe(
			true,
		);
	});

	it("rejects an envelope carrying credential-like or paid-endpoint material", () => {
		expect(
			errorsFor((e) => {
				e.provenance.retrievalMethod = "POST https://openrouter.ai/api/v1/chat/completions";
			}).some((e) => e.includes("paid inference endpoint")),
		).toBe(true);
		expect(
			errorsFor((e) => {
				e.provenance.authoredBy = "worker sk-abcdefghijklmnopqrstuvwx";
			}).some((e) => e.includes("api-key-like token")),
		).toBe(true);
	});

	it("rejects an unknown envelope version", () => {
		const errors = errorsFor((e) => {
			e.envelopeVersion = "v9";
		});
		expect(errors.some((e) => e.includes("envelopeVersion must be"))).toBe(true);
	});

	it("rejects malformed dates and missing required prose", () => {
		const errors = errorsFor((e) => {
			e.provenance.meetingDate = "Sept 8 2026";
			e.executiveSummary = "";
		});
		expect(errors.some((e) => e.includes("meetingDate must be YYYY-MM-DD"))).toBe(
			true,
		);
		expect(errors.some((e) => e.includes("executiveSummary is required"))).toBe(
			true,
		);
	});

	it("reports every problem at once rather than failing on the first", () => {
		const errors = errorsFor((e) => {
			e.envelopeVersion = "v9";
			e.provenance.sourceUrl = "";
			e.provenance.paidApiUsed = true;
			e.executiveSummary = "";
		});
		expect(errors.length).toBeGreaterThanOrEqual(4);
	});
});

describe("offline summary staging — import is owner-only and explicit", () => {
	const validation = validateStagedSummary(goldenEnvelope, sourceText);

	it("refuses import for an anonymous caller", () => {
		const result = evaluateStagedImportRequest({
			actor: null,
			validation,
			approval: { explicit: true, approvedBy: "owner" },
		});
		expect(result).toEqual({
			allowed: false,
			reason: "Forbidden: importing a staged offline summary is owner-only.",
		});
	});

	it("refuses import for a signed-in non-admin", () => {
		const result = evaluateStagedImportRequest({
			actor: { isAdmin: false },
			validation,
			approval: { explicit: true, approvedBy: "owner" },
		});
		expect(result.allowed).toBe(false);
	});

	it("refuses import for an admin without an explicit approval", () => {
		expect(
			evaluateStagedImportRequest({
				actor: { isAdmin: true },
				validation,
				approval: null,
			}).allowed,
		).toBe(false);
		expect(
			evaluateStagedImportRequest({
				actor: { isAdmin: true },
				validation,
				approval: { explicit: true },
			}).allowed,
		).toBe(false);
	});

	it("refuses import of an envelope that failed validation, even for the owner", () => {
		const bad = validateStagedSummary({ envelopeVersion: "v9" }, sourceText);
		expect(
			evaluateStagedImportRequest({
				actor: { isAdmin: true },
				validation: bad,
				approval: { explicit: true, approvedBy: "owner" },
			}).allowed,
		).toBe(false);
	});

	it("allows import only for an admin with an explicit approval", () => {
		expect(
			evaluateStagedImportRequest({
				actor: { isAdmin: true },
				validation,
				approval: { explicit: true, approvedBy: "owner" },
			}),
		).toEqual({ allowed: true });
	});
});

describe("offline summary staging — createSummary shape and gate isolation", () => {
	it("produces args matching the existing createSummary summary object", () => {
		const validation = validateStagedSummary(goldenEnvelope, sourceText);
		if (!validation.ok) throw new Error(validation.errors.join("\n"));
		const args = toCreateSummaryArgs(validation.envelope);

		expect(args.kind).toBe("agenda_preview");
		// Fields the existing validator requires.
		for (const field of [
			"executiveSummary",
			"keyDecisions",
			"discussionTopics",
			"upcomingItems",
			"topics",
			"modelUsed",
			"promptVersion",
			"processingTimeMs",
		]) {
			expect(args.summary).toHaveProperty(field);
		}
		// Staging-only fields must not leak into the product record.
		for (const decision of args.summary.keyDecisions as Array<
			Record<string, unknown>
		>) {
			expect(decision).not.toHaveProperty("sourceAnchor");
			expect(decision).not.toHaveProperty("agendaOnly");
		}
		expect(args.summary.modelUsed).not.toMatch(/anthropic|openrouter|gpt/i);
		expect(String(args.summary.modelUsed)).toMatch(/^offline-staged:/);
	});

	it("leaves the coverage publication gate exactly as it was", () => {
		// A validated, staged summary is not a scraper validation. The product's
		// own unmodified gate must stay shut.
		expect(
			evaluateCoveragePublishRequest({
				latestValidation: null,
				overrideReason: null,
			}).allowed,
		).toBe(false);
		expect(
			evaluateCoveragePublishRequest({
				latestValidation: { status: "failed", stats: { meetingsFound: 5 } },
				overrideReason: null,
			}).allowed,
		).toBe(false);
		expect(
			evaluateCoveragePublishRequest({
				latestValidation: { status: "passed", stats: { meetingsFound: 0 } },
				overrideReason: null,
			}).allowed,
		).toBe(false);
		expect(
			evaluateCoveragePublishRequest({
				latestValidation: { status: "passed", stats: { meetingsFound: 3 } },
				overrideReason: null,
			}),
		).toEqual({ allowed: true, mode: "validation" });
	});

	it("contains no network, credential, or Node-builtin access in the staging module", () => {
		const moduleSource = readFileSync(
			fileURLToPath(new URL("./offlineSummaryStaging.ts", import.meta.url)),
			"utf8",
		);
		expect(moduleSource).not.toMatch(/\bfetch\s*\(/);
		expect(moduleSource).not.toMatch(/process\.env\./);
		expect(moduleSource).not.toMatch(/openrouter\.ai\/api/);
		// Convex pushes every file under convex/; a Node builtin import in a
		// default-runtime module would break the deployment bundle.
		expect(moduleSource).not.toMatch(/from "node:/);
		expect(moduleSource).not.toMatch(/^\s*"use node";/m);
	});
});
