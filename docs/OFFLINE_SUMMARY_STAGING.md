# Offline summary staging

A second, free path to a source-cited summary, for when the paid summarizer in
`convex/functions/ai/summarize.ts` should not or cannot run.

The existing path calls a pay-as-you-go inference API. This path accepts a
summary that was authored **outside the application** (by an operator, in their
own subscription session), validates it against the raw source text it claims to
summarize, and stages it. Nothing here authors a summary, and nothing here
imports one.

## What it is not

- **Not an inference API.** No credentials, no SDK, no daemon, no proxy. The
  module never calls a model; it only checks a summary someone already wrote.
- **Not an import.** Validation passing does not write to the database.
  `evaluateStagedImportRequest` requires an admin *and* an explicit approval.
- **Not a publication.** Coverage publication is still governed solely by
  `evaluateCoveragePublishRequest`. A staged summary does not open that gate.
- **Not offline OCR/extraction.** You bring the extracted text; it hashes it.

## Validate an envelope

    node scripts/validate-offline-summary.mjs <envelope.json> <source.txt>

Exit 0 valid, 1 invalid (every problem is listed at once), 2 usage/IO error.
The golden fixture is the real Coventry Town Council agenda for 2026-09-08:

    node scripts/validate-offline-summary.mjs \
      convex/lib/fixtures/coventry-20260908-agenda.staged.json \
      convex/lib/fixtures/coventry-20260908-agenda.txt

## What the validator enforces

| Rule | Why |
| --- | --- |
| `provenance.sourceUrl` is a public http(s) URL | a summary with no citable record is refused |
| `extractedTextSha256` matches the supplied bytes | provenance round-trip; a one-character edit fails |
| every `keyDecisions[].sourceAnchor` appears verbatim in the source | claims trace to text, they are not asserted |
| an agenda must be `kind: "agenda_preview"` | an agenda records what was *scheduled* |
| agenda items must set `agendaOnly: true` and carry no `voteResult` | an agenda records no vote and no outcome |
| `paidApiUsed` must be exactly `false` | this path exists to avoid the paid call |
| no key-like tokens or paid-provider endpoints anywhere in the envelope | envelopes are reviewable artifacts |

## Importing a staged summary

`toCreateSummaryArgs()` shapes a validated envelope into the exact args
`internal.functions.ai.mutations.createSummary` already takes — `modelUsed`
becomes `offline-staged:<authoredBy>` so a staged record is never mistaken for a
model-generated one, and staging-only fields (`sourceAnchor`, `agendaOnly`) are
stripped rather than written to the product record.

Wiring that into a Convex mutation is deliberately **not** part of this change.
The gate function is here and tested; the mutation that calls it is a separate,
reviewable step.
