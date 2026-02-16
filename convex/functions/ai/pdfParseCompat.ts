"use node";

import { createRequire } from "node:module";
import { dirname, join } from "node:path";

type LegacyPdfParse = (
	buffer: Buffer,
	options?: {
		max?: number;
	},
) => Promise<{
	text?: string;
}>;

const require = createRequire(import.meta.url);
let legacyPdfParse: LegacyPdfParse | null = null;

function getLegacyPdfParse(): LegacyPdfParse {
	if (!legacyPdfParse) {
		legacyPdfParse = loadLegacyPdfParse();
	}
	return legacyPdfParse;
}

function loadLegacyPdfParse(): LegacyPdfParse {
	// Convex external package resolution can block package subpaths (e.g. "pkg/lib/x.js"),
	// so resolve the package entrypoint and load the file by absolute path.
	try {
		const entry = require.resolve("pdf-parse");
		const root = dirname(entry);
		const parserPath = join(root, "lib", "pdf-parse.js");
		return require(parserPath) as LegacyPdfParse;
	} catch (error) {
		// Fallback for local/dev environments where the package root import is sufficient.
		try {
			return require("pdf-parse") as LegacyPdfParse;
		} catch (fallbackError) {
			throw fallbackError instanceof Error ? fallbackError : error;
		}
	}
}

export async function extractTextFromPdfData(
	data: Uint8Array,
): Promise<string> {
	const parsePdf = getLegacyPdfParse();

	try {
		const result = await parsePdf(Buffer.from(data), { max: 100 });
		return (result.text ?? "").trim();
	} catch (error) {
		if (error instanceof Error) {
			if (error.message.includes("password")) {
				throw new Error("PDF is password protected");
			}
			if (
				error.message.includes("corrupt") ||
				error.message.includes("invalid")
			) {
				throw new Error("PDF appears to be corrupted or invalid");
			}
		}
		throw error;
	}
}
