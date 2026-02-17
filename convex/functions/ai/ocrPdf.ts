"use node";

import sharp from "sharp";
import { inflate } from "node:zlib";
import { promisify } from "node:util";

const inflateAsync = promisify(inflate);

const OCR_PROMPT =
	"Extract all text from this scanned document. Return ONLY the raw text content, preserving formatting. No commentary or markdown.";

/**
 * OCR a scanned/image-only PDF.
 *
 * Strategy: extract the single embedded image from the PDF binary,
 * convert to PNG via sharp, then send to Claude Vision for text extraction.
 * If no image can be extracted, send the raw PDF as a document to Claude.
 */
export async function ocrPdf(data: Uint8Array): Promise<string> {
	const apiKey = process.env.OPENROUTER_API_KEY;
	if (!apiKey) {
		throw new Error("[ocrPdf] OPENROUTER_API_KEY not set");
	}

	// Try to extract an image and convert to PNG
	const png = await extractFirstImageAsPng(data);

	if (png) {
		return callVisionWithImage(apiKey, png);
	}

	// No extractable image — send raw PDF as a document
	return callVisionWithPdf(apiKey, data);
}

async function callVisionWithImage(
	apiKey: string,
	png: Buffer,
): Promise<string> {
	const base64 = png.toString("base64");
	const response = await fetch(
		"https://openrouter.ai/api/v1/chat/completions",
		{
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${apiKey}`,
				"HTTP-Referer": "https://civicpulse.io",
				"X-Title": "Civic Pulse OCR",
			},
			body: JSON.stringify({
				model: "anthropic/claude-sonnet-4",
				max_tokens: 4096,
				messages: [
					{
						role: "user",
						content: [
							{
								type: "image_url",
								image_url: {
									url: `data:image/png;base64,${base64}`,
								},
							},
							{ type: "text", text: OCR_PROMPT },
						],
					},
				],
			}),
		},
	);

	if (!response.ok) {
		const errorText = await response.text();
		throw new Error(
			`[ocrPdf] Vision API (${response.status}): ${errorText.slice(0, 200)}`,
		);
	}

	const result = await response.json();
	return (result.choices?.[0]?.message?.content ?? "").trim();
}

async function callVisionWithPdf(
	apiKey: string,
	data: Uint8Array,
): Promise<string> {
	const base64 = Buffer.from(data).toString("base64");
	const response = await fetch(
		"https://openrouter.ai/api/v1/chat/completions",
		{
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${apiKey}`,
				"HTTP-Referer": "https://civicpulse.io",
				"X-Title": "Civic Pulse OCR",
			},
			body: JSON.stringify({
				model: "anthropic/claude-sonnet-4",
				max_tokens: 4096,
				messages: [
					{
						role: "user",
						content: [
							{
								type: "document",
								source: {
									type: "base64",
									media_type: "application/pdf",
									data: base64,
								},
							},
							{ type: "text", text: OCR_PROMPT },
						],
					},
				],
			}),
		},
	);

	if (!response.ok) {
		const errorText = await response.text();
		throw new Error(
			`[ocrPdf] PDF Vision API (${response.status}): ${errorText.slice(0, 200)}`,
		);
	}

	const result = await response.json();
	return (result.choices?.[0]?.message?.content ?? "").trim();
}

/**
 * Extract the first image from a PDF and return it as PNG.
 * Returns null if no extractable image is found (e.g. vector-only PDFs).
 */
async function extractFirstImageAsPng(
	pdfBytes: Uint8Array,
): Promise<Buffer | null> {
	const text = new TextDecoder("latin1").decode(pdfBytes);

	// Resolve indirect length references (e.g., "/Length 7 0 R" → actual number)
	const objectValues: Record<string, string> = {};
	const simpleObjRegex = /(\d+)\s+0\s+obj\s*\n?(\d+)\s*\n?endobj/g;
	let m: RegExpExecArray | null;
	while ((m = simpleObjRegex.exec(text)) !== null) {
		objectValues[m[1]] = m[2];
	}

	// Scan for "N M obj" markers and check each object
	const objRegex = /(\d+)\s+\d+\s+obj\b/g;
	let objMatch: RegExpExecArray | null;

	while ((objMatch = objRegex.exec(text)) !== null) {
		const afterObj = objMatch.index + objMatch[0].length;

		// Find the dictionary << ... >>
		const dictStart = text.indexOf("<<", afterObj);
		if (dictStart === -1 || dictStart > afterObj + 10) continue;

		// Parse the full dict with nesting
		let depth = 0;
		let dictEnd = -1;
		for (let i = dictStart; i < text.length - 1; i++) {
			if (text[i] === "<" && text[i + 1] === "<") {
				depth++;
				i++;
			} else if (text[i] === ">" && text[i + 1] === ">") {
				depth--;
				i++;
				if (depth === 0) {
					dictEnd = i + 1;
					break;
				}
			}
		}
		if (dictEnd === -1) continue;

		const dict = text.slice(dictStart + 2, dictEnd - 2);

		// Only care about Image XObjects
		if (!dict.includes("/Image") || !dict.includes("/Subtype")) continue;

		// Find "stream" after the dict
		const streamPos = text.indexOf("stream", dictEnd);
		if (streamPos === -1 || streamPos > dictEnd + 20) continue;

		// Skip "stream\r\n" or "stream\n"
		let dataStart = streamPos + 6;
		if (pdfBytes[dataStart] === 0x0d) dataStart++;
		if (pdfBytes[dataStart] === 0x0a) dataStart++;

		// Resolve stream length
		const indirectRef = dict.match(/\/Length\s+(\d+)\s+0\s+R/);
		const directLen = dict.match(/\/Length\s+(\d+)(?!\s+0\s+R)/);
		const lengthStr = indirectRef
			? objectValues[indirectRef[1]]
			: directLen?.[1];
		if (!lengthStr) continue;

		const streamLength = Number.parseInt(lengthStr, 10);
		if (streamLength <= 0) continue;

		const streamData = pdfBytes.slice(dataStart, dataStart + streamLength);

		// CCITT Fax → wrap in TIFF → convert to PNG
		if (dict.includes("/CCITTFaxDecode")) {
			const width =
				dict.match(/\/Width\s+(\d+)/)?.[1] ??
				dict.match(/\/Columns\s+(\d+)/)?.[1];
			const height =
				dict.match(/\/Height\s+(\d+)/)?.[1] ??
				dict.match(/\/Rows\s+(\d+)/)?.[1];
			if (!width || !height) continue;

			const tiff = wrapCCITTasTIFF(
				streamData,
				Number.parseInt(width, 10),
				Number.parseInt(height, 10),
			);
			return sharp(tiff, { failOn: "none" }).png().toBuffer();
		}

		// Flate+DCT filter chain — decompress Flate first to get JPEG
		if (dict.includes("/FlateDecode") && dict.includes("/DCTDecode")) {
			try {
				const decompressed = await inflateAsync(Buffer.from(streamData));
				return sharp(decompressed, { failOn: "none" }).png().toBuffer();
			} catch {
				continue;
			}
		}

		// Plain JPEG → convert to PNG
		if (
			dict.includes("/DCTDecode") ||
			(streamData[0] === 0xff && streamData[1] === 0xd8)
		) {
			return sharp(Buffer.from(streamData), { failOn: "none" })
				.png()
				.toBuffer();
		}
	}

	// No extractable image found
	return null;
}

/** Wrap raw CCITT Fax Group 4 data in a minimal TIFF container. */
function wrapCCITTasTIFF(
	ccittData: Uint8Array,
	width: number,
	height: number,
): Buffer {
	const numTags = 9;
	const ifdSize = 2 + numTags * 12 + 4;
	const dataOffset = 8 + ifdSize;
	const tiff = Buffer.alloc(dataOffset + ccittData.length);

	tiff.writeUInt16LE(0x4949, 0); // Little-endian
	tiff.writeUInt16LE(42, 2); // TIFF magic
	tiff.writeUInt32LE(8, 4); // IFD offset

	let pos = 8;
	tiff.writeUInt16LE(numTags, pos);
	pos += 2;

	const wt = (tag: number, type: number, count: number, value: number) => {
		tiff.writeUInt16LE(tag, pos);
		pos += 2;
		tiff.writeUInt16LE(type, pos);
		pos += 2;
		tiff.writeUInt32LE(count, pos);
		pos += 4;
		tiff.writeUInt32LE(value, pos);
		pos += 4;
	};

	wt(256, 3, 1, width); // ImageWidth
	wt(257, 3, 1, height); // ImageLength
	wt(258, 3, 1, 1); // BitsPerSample
	wt(259, 3, 1, 4); // Compression = CCITT Group 4
	wt(262, 3, 1, 0); // PhotometricInterpretation
	wt(273, 4, 1, dataOffset); // StripOffsets
	wt(277, 3, 1, 1); // SamplesPerPixel
	wt(278, 3, 1, height); // RowsPerStrip
	wt(279, 4, 1, ccittData.length); // StripByteCounts

	tiff.writeUInt32LE(0, pos); // Next IFD = 0
	tiff.set(ccittData, dataOffset);

	return tiff;
}
