import type { MeetingType } from "./types";

// ═══════════════════════════════════════════════════════════════
// DATE PARSING - Parse dates from various formats
// ═══════════════════════════════════════════════════════════════

/** Common date format patterns */
const datePatterns = [
	// ISO format: 2024-01-15
	/(\d{4})-(\d{2})-(\d{2})/,
	// US format: 01/15/2024 or 1/15/2024
	/(\d{1,2})\/(\d{1,2})\/(\d{4})/,
	// US format: 01-15-2024
	/(\d{1,2})-(\d{1,2})-(\d{4})/,
	// Long format: January 15, 2024
	/([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})/,
	// Medium format: Jan 15, 2024
	/([A-Za-z]{3})\s+(\d{1,2}),?\s+(\d{4})/,
	// European format: 15 January 2024
	/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/,
];

const monthNames: Record<string, number> = {
	january: 0,
	jan: 0,
	february: 1,
	feb: 1,
	march: 2,
	mar: 2,
	april: 3,
	apr: 3,
	may: 4,
	june: 5,
	jun: 5,
	july: 6,
	jul: 6,
	august: 7,
	aug: 7,
	september: 8,
	sep: 8,
	sept: 8,
	october: 9,
	oct: 9,
	november: 10,
	nov: 10,
	december: 11,
	dec: 11,
};

/**
 * Parse a date string into a timestamp
 * Handles various common date formats
 * @param dateStr - Date string to parse
 * @param format - Optional format hint (e.g., "MM/DD/YYYY")
 * @returns Timestamp in milliseconds, or null if parsing fails
 */
export function parseDate(dateStr: string, _format?: string): number | null {
	if (!dateStr) return null;

	const trimmed = dateStr.trim();

	// Try native Date parsing first (handles ISO and many formats)
	const nativeDate = new Date(trimmed);
	if (!Number.isNaN(nativeDate.getTime())) {
		// Validate year is reasonable (1990-2100)
		const year = nativeDate.getFullYear();
		if (year >= 1990 && year <= 2100) {
			return nativeDate.getTime();
		}
	}

	// Try pattern matching
	for (const pattern of datePatterns) {
		const match = trimmed.match(pattern);
		if (match) {
			let year: number;
			let month: number;
			let day: number;

			// ISO format: YYYY-MM-DD
			if (pattern === datePatterns[0]) {
				year = parseInt(match[1], 10);
				month = parseInt(match[2], 10) - 1;
				day = parseInt(match[3], 10);
			}
			// US format: MM/DD/YYYY or MM-DD-YYYY
			else if (pattern === datePatterns[1] || pattern === datePatterns[2]) {
				month = parseInt(match[1], 10) - 1;
				day = parseInt(match[2], 10);
				year = parseInt(match[3], 10);
			}
			// Long/medium format: Month DD, YYYY
			else if (pattern === datePatterns[3] || pattern === datePatterns[4]) {
				const monthStr = match[1].toLowerCase();
				month = monthNames[monthStr] ?? -1;
				if (month === -1) continue;
				day = parseInt(match[2], 10);
				year = parseInt(match[3], 10);
			}
			// European format: DD Month YYYY
			else if (pattern === datePatterns[5]) {
				day = parseInt(match[1], 10);
				const monthStr = match[2].toLowerCase();
				month = monthNames[monthStr] ?? -1;
				if (month === -1) continue;
				year = parseInt(match[3], 10);
			} else {
				continue;
			}

			// Validate parsed values
			if (
				year >= 1990 &&
				year <= 2100 &&
				month >= 0 &&
				month <= 11 &&
				day >= 1 &&
				day <= 31
			) {
				const date = new Date(year, month, day);
				return date.getTime();
			}
		}
	}

	return null;
}

// ═══════════════════════════════════════════════════════════════
// MEETING TYPE INFERENCE - Detect meeting type from title
// ═══════════════════════════════════════════════════════════════

/** Keywords for each meeting type */
const meetingTypeKeywords: Record<MeetingType, string[]> = {
	city_council: [
		"city council",
		"town council",
		"village council",
		"board of aldermen",
		"common council",
		"municipal council",
		"council meeting",
		"regular meeting",
		"special meeting",
	],
	school_board: [
		"school board",
		"board of education",
		"school committee",
		"education board",
		"school district",
		"trustees",
	],
	planning_commission: [
		"planning commission",
		"planning board",
		"planning committee",
		"land use",
		"comprehensive plan",
		"master plan",
	],
	zoning_board: [
		"zoning board",
		"zoning commission",
		"zoning appeals",
		"board of adjustment",
		"zoning variance",
		"zoning hearing",
	],
	budget_committee: [
		"budget committee",
		"finance committee",
		"budget hearing",
		"budget workshop",
		"fiscal committee",
		"appropriations",
	],
	other: [],
};

/**
 * Infer meeting type from title and content
 * @param title - Meeting title
 * @param content - Optional meeting content for additional context
 * @returns Inferred meeting type
 */
export function inferMeetingType(title: string, content?: string): MeetingType {
	const searchText = `${title} ${content ?? ""}`.toLowerCase();

	// Check each type's keywords
	for (const [type, keywords] of Object.entries(meetingTypeKeywords)) {
		if (type === "other") continue;

		for (const keyword of keywords) {
			if (searchText.includes(keyword)) {
				return type as MeetingType;
			}
		}
	}

	return "other";
}

// ═══════════════════════════════════════════════════════════════
// CONTENT HASHING - Generate hash for deduplication
// ═══════════════════════════════════════════════════════════════

/**
 * Simple hash function (djb2 algorithm)
 * Used for content deduplication - not cryptographic
 */
function simpleHash(str: string): string {
	let hash = 5381;
	for (let i = 0; i < str.length; i++) {
		hash = (hash * 33) ^ str.charCodeAt(i);
	}
	// Convert to hex string and ensure it's positive
	return (hash >>> 0).toString(16).padStart(8, "0");
}

/**
 * Generate a content hash for deduplication
 * Normalizes content before hashing to handle minor variations
 * @param content - Content to hash
 * @returns Hash of normalized content
 */
export function hashContent(content: string): string {
	// Normalize: lowercase, remove extra whitespace, remove punctuation
	const normalized = content
		.toLowerCase()
		.replace(/\s+/g, " ")
		.replace(/[^\w\s]/g, "")
		.trim();

	// Generate multiple hashes from different parts for better distribution
	const len = normalized.length;
	const part1 = simpleHash(normalized.slice(0, Math.min(1000, len)));
	const part2 = simpleHash(normalized.slice(Math.max(0, len - 1000)));
	const part3 = simpleHash(
		normalized.slice(Math.floor(len / 4), Math.floor((len * 3) / 4)),
	);
	const part4 = simpleHash(len.toString() + normalized.slice(0, 100));

	return `${part1}${part2}${part3}${part4}`;
}

/**
 * Generate a meeting identifier hash
 * Uses title + date for a unique-ish identifier
 * @param title - Meeting title
 * @param date - Meeting date timestamp
 * @returns Hash identifier
 */
export function hashMeetingId(title: string, date: number): string {
	const combined = `${title.toLowerCase().trim()}-${date}`;
	return (
		simpleHash(combined) + simpleHash(combined.split("").reverse().join(""))
	);
}

// ═══════════════════════════════════════════════════════════════
// URL UTILITIES
// ═══════════════════════════════════════════════════════════════

/**
 * Normalize a URL for comparison
 * @param url - URL to normalize
 * @returns Normalized URL string
 */
export function normalizeUrl(url: string): string {
	try {
		const parsed = new URL(url);
		// Remove trailing slashes, lowercase host
		parsed.hostname = parsed.hostname.toLowerCase();
		let path = parsed.pathname.replace(/\/+$/, "");
		if (!path) path = "/";
		return `${parsed.protocol}//${parsed.host}${path}${parsed.search}`;
	} catch {
		return url.toLowerCase().trim();
	}
}

/**
 * Resolve a relative URL against a base
 * @param base - Base URL
 * @param relative - Relative URL to resolve
 * @returns Absolute URL
 */
export function resolveUrl(base: string, relative: string): string {
	try {
		return new URL(relative, base).href;
	} catch {
		// If parsing fails, try simple concatenation
		if (relative.startsWith("/")) {
			const baseUrl = new URL(base);
			return `${baseUrl.protocol}//${baseUrl.host}${relative}`;
		}
		return relative;
	}
}

/**
 * Extract domain from URL
 * @param url - URL to extract domain from
 * @returns Domain string
 */
export function extractDomain(url: string): string {
	try {
		return new URL(url).hostname;
	} catch {
		return "";
	}
}

// ═══════════════════════════════════════════════════════════════
// TEXT UTILITIES
// ═══════════════════════════════════════════════════════════════

/**
 * Clean HTML content to plain text
 * @param html - HTML string
 * @returns Plain text
 */
export function htmlToText(html: string): string {
	return (
		html
			// Remove script and style elements
			.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
			.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
			// Replace common block elements with newlines
			.replace(/<\/(p|div|br|h[1-6]|li|tr)>/gi, "\n")
			.replace(/<(br|hr)\s*\/?>/gi, "\n")
			// Remove all other HTML tags
			.replace(/<[^>]+>/g, " ")
			// Decode common HTML entities
			.replace(/&nbsp;/g, " ")
			.replace(/&amp;/g, "&")
			.replace(/&lt;/g, "<")
			.replace(/&gt;/g, ">")
			.replace(/&quot;/g, '"')
			.replace(/&#39;/g, "'")
			// Clean up whitespace
			.replace(/\s+/g, " ")
			.replace(/\n\s*\n/g, "\n\n")
			.trim()
	);
}

/**
 * Truncate text to a maximum length
 * @param text - Text to truncate
 * @param maxLength - Maximum length
 * @param suffix - Suffix to add if truncated
 * @returns Truncated text
 */
export function truncateText(
	text: string,
	maxLength: number,
	suffix = "...",
): string {
	if (text.length <= maxLength) return text;
	return text.slice(0, maxLength - suffix.length) + suffix;
}

/**
 * Extract a summary from the beginning of content
 * @param content - Full content
 * @param maxLength - Maximum summary length
 * @returns Summary text
 */
export function extractSummary(content: string, maxLength = 500): string {
	// Try to find a natural break point (sentence end)
	const truncated = content.slice(0, maxLength + 100);
	const sentenceEnd = truncated.lastIndexOf(".");

	if (sentenceEnd > maxLength * 0.6) {
		return truncated.slice(0, sentenceEnd + 1);
	}

	return truncateText(content, maxLength);
}
