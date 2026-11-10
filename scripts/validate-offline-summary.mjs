#!/usr/bin/env node
/**
 * Validate an offline-authored summary envelope against the source text it
 * cites, and report whether it is safe to stage.
 *
 *   node scripts/validate-offline-summary.mjs <envelope.json> <source.txt>
 *
 * Read-only and offline by construction: it opens two local files, runs the
 * shared validator in convex/lib/offlineSummaryStaging.ts, and prints a report.
 * It never fetches, never authenticates, never writes, and never imports the
 * envelope into the database — import is a separate, owner-only, explicitly
 * approved step.
 *
 * Exit codes: 0 valid, 1 invalid, 2 usage/IO error.
 */

import { readFileSync } from "node:fs";
import {
	formatValidationReport,
	validateStagedSummary,
} from "../convex/lib/offlineSummaryStaging.ts";

const [envelopePath, sourcePath] = process.argv.slice(2);

if (!envelopePath || !sourcePath) {
	console.error(
		"usage: node scripts/validate-offline-summary.mjs <envelope.json> <source.txt>",
	);
	process.exit(2);
}

let envelope;
let sourceText;
try {
	envelope = JSON.parse(readFileSync(envelopePath, "utf8"));
	sourceText = readFileSync(sourcePath, "utf8");
} catch (error) {
	console.error(`Could not read inputs: ${error.message}`);
	process.exit(2);
}

const result = validateStagedSummary(envelope, sourceText);
console.log(formatValidationReport(result));
process.exit(result.ok ? 0 : 1);
