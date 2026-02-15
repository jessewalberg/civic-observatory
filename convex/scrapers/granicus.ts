"use node";

import * as cheerio from "cheerio";
import type { AnyNode, Element } from "domhandler";
import type {
	ScrapedMeeting,
	Scraper,
	ScraperConfig,
	ScraperError,
	ScraperResult,
} from "./types";
import {
	extractLegistarSlug,
	isLegistarUrl,
	tryLegistarApi,
} from "./legistarApi";
import {
	fetchWithRetry,
	hashContent,
	htmlToText,
	inferMeetingType,
	parseDate,
	resolveUrl,
} from "./utils";

// ═══════════════════════════════════════════════════════════════
// GRANICUS SCRAPER
// Handles Granicus/Legistar meeting management platforms
// Common URL patterns: /AgendaCenter, /Archive.aspx, legistar.com
// ═══════════════════════════════════════════════════════════════

/** URL patterns that indicate Granicus platform */
const GRANICUS_PATTERNS = [
	/granicus\.com/i,
	/legistar\.com/i,
	/\/AgendaCenter/i,
	/\/Archive\.aspx/i,
	/\.insite\.com/i,
];

/** Default selectors for Granicus AgendaCenter pages */
const AGENDA_CENTER_SELECTORS = {
	meetingList: ".catAgendaRow, .meeting-row, [data-meeting]",
	meetingTitle: ".catAgendaTitle, .meeting-title, h4, h3",
	meetingDate: ".catAgendaDate, .meeting-date, .date",
	documentLink:
		"a[href*='.pdf'], a[href*='ViewFile'], a[href*='Minutes'], a[href*='Agenda']",
};

/** Default selectors for Legistar pages */
const LEGISTAR_SELECTORS = {
	meetingList: "table tr.rgRow, table tr.rgAltRow, .meeting-item",
	meetingTitle: "td:nth-child(1), .meeting-body-name",
	meetingDate: "td:nth-child(2), .meeting-date",
	documentLink: "a[href*='View.ashx'], a[href*='Agenda'], a[href*='Minutes']",
};

export const granicusScraper: Scraper = {
	platform: "granicus",

	canHandle(url: string): boolean {
		return GRANICUS_PATTERNS.some((pattern) => pattern.test(url));
	},

	async scrape(url: string, config?: ScraperConfig): Promise<ScraperResult> {
		// Try Legistar REST API first for legistar.com URLs
		if (isLegistarUrl(url)) {
			const slug = extractLegistarSlug(url);
			if (slug) {
				try {
					const apiResult = await tryLegistarApi(slug);
					if (apiResult && apiResult.meetings.length > 0) {
						return apiResult;
					}
				} catch {
					// Fall through to HTML scraping
				}
			}
		}

		const meetings: ScrapedMeeting[] = [];
		const errors: ScraperError[] = [];
		const stats = { found: 0, new: 0, skipped: 0, failed: 0 };

		try {
			// Fetch the page
			const response = await fetchWithRetry(url);
			if (!response.ok) {
				return {
					success: false,
					meetings: [],
					errors: [
						{
							message: `HTTP ${response.status}: ${response.statusText}`,
							url,
							code: "network",
							timestamp: Date.now(),
						},
					],
					stats,
				};
			}

			const html = await response.text();
			const $ = cheerio.load(html);

			// Determine which selectors to use
			const selectors = detectSelectors($, url, config);

			// Extract meetings
			const meetingElements = $(selectors.meetingList);
			stats.found = meetingElements.length;

			meetingElements.each((_, node) => {
				try {
					// Skip non-element nodes
					if (!isElement(node)) return;
					const meeting = extractMeeting($, node, url, selectors);
					if (meeting) {
						meetings.push(meeting);
						stats.new++;
					} else {
						stats.skipped++;
					}
				} catch (error) {
					stats.failed++;
					errors.push({
						message:
							error instanceof Error
								? error.message
								: "Failed to extract meeting",
						url,
						code: "parse",
						timestamp: Date.now(),
					});
				}
			});

			// Handle pagination if present
			const nextPage = findNextPage($, url);
			if (nextPage && meetings.length > 0) {
				try {
					const nextResult = await this.scrape(nextPage, config);
					meetings.push(...nextResult.meetings);
					errors.push(...nextResult.errors);
					stats.found += nextResult.stats.found;
					stats.new += nextResult.stats.new;
					stats.skipped += nextResult.stats.skipped;
					stats.failed += nextResult.stats.failed;
				} catch (error) {
					errors.push({
						message: `Pagination failed: ${error instanceof Error ? error.message : "Unknown error"}`,
						url: nextPage,
						code: "network",
						timestamp: Date.now(),
					});
				}
			}

			return {
				success: true,
				meetings,
				errors,
				stats,
			};
		} catch (error) {
			return {
				success: false,
				meetings,
				errors: [
					{
						message: error instanceof Error ? error.message : "Unknown error",
						url,
						code: "unknown",
						timestamp: Date.now(),
					},
				],
				stats,
			};
		}
	},

	async extractContent(
		url: string,
		config?: ScraperConfig,
	): Promise<string | null> {
		try {
			// If it's a PDF, return the URL (PDF extraction handled separately)
			if (url.toLowerCase().includes(".pdf") || url.includes("ViewFile")) {
				return null; // Signal that this is a document URL, not inline content
			}

			// Fetch HTML content
			const response = await fetchWithRetry(url);
			if (!response.ok) {
				return null;
			}

			const html = await response.text();
			const $ = cheerio.load(html);

			// Use config selector if provided, otherwise try common content selectors
			const contentSelector =
				config?.contentSelector ||
				".meeting-content, .agenda-content, #content, .main-content, article, main";

			const content = $(contentSelector).first();
			if (content.length === 0) {
				// Fall back to body content
				return htmlToText($("body").html() || "");
			}

			return htmlToText(content.html() || "");
		} catch {
			return null;
		}
	},
};

// ═══════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════

interface Selectors {
	meetingList: string;
	meetingTitle: string;
	meetingDate: string;
	documentLink: string;
}

/**
 * Type guard to check if a node is an Element
 */
function isElement(node: AnyNode): node is Element {
	return node.type === "tag";
}

/**
 * Detect which selectors to use based on page structure
 */
function detectSelectors(
	$: cheerio.CheerioAPI,
	url: string,
	config?: ScraperConfig,
): Selectors {
	// If config provides selectors, use those
	if (config?.meetingListSelector) {
		return {
			meetingList: config.meetingListSelector,
			meetingTitle: config.meetingLinkSelector || ".title",
			meetingDate: config.dateSelector || ".date",
			documentLink: "a[href*='.pdf'], a[href*='View']",
		};
	}

	// Detect Legistar vs AgendaCenter
	if (url.includes("legistar") || $("table.rgMasterTable").length > 0) {
		return LEGISTAR_SELECTORS;
	}

	return AGENDA_CENTER_SELECTORS;
}

/**
 * Extract a single meeting from an element
 */
function extractMeeting(
	$: cheerio.CheerioAPI,
	element: Element,
	baseUrl: string,
	selectors: Selectors,
): ScrapedMeeting | null {
	const $el = $(element);

	// Extract title
	const titleEl = $el.find(selectors.meetingTitle).first();
	let title = titleEl.text().trim();

	// If no title found in child, try the element itself
	if (!title) {
		title = $el.text().trim().split("\n")[0]?.trim() || "";
	}

	if (!title || title.length < 3) {
		return null;
	}

	// Extract date
	const dateEl = $el.find(selectors.meetingDate).first();
	let dateStr = dateEl.text().trim();

	// Try to find date in title if not found separately
	if (!dateStr) {
		const dateMatch = title.match(/\d{1,2}\/\d{1,2}\/\d{4}|\w+ \d{1,2}, \d{4}/);
		if (dateMatch) {
			dateStr = dateMatch[0];
		}
	}

	const meetingDate = parseDate(dateStr);
	if (!meetingDate) {
		return null;
	}

	// Extract document links
	const links = $el.find(selectors.documentLink);
	let documentUrl: string | undefined;
	let sourceUrl = baseUrl;

	links.each((_, link) => {
		const href = $(link).attr("href");
		if (href) {
			const fullUrl = resolveUrl(baseUrl, href);
			// Prefer PDF links
			if (href.toLowerCase().includes(".pdf") || href.includes("ViewFile")) {
				documentUrl = fullUrl;
			}
			// Use first link as source URL
			if (!sourceUrl || sourceUrl === baseUrl) {
				sourceUrl = fullUrl;
			}
		}
	});

	// If no document link found, try to get a meeting detail link
	if (!documentUrl) {
		const detailLink = $el.find("a").first().attr("href");
		if (detailLink) {
			sourceUrl = resolveUrl(baseUrl, detailLink);
		}
	}

	// Infer meeting type
	const meetingType = inferMeetingType(title);

	// Generate content hash from title + date (actual content hash comes later)
	const contentHash = hashContent(`${title}-${meetingDate}`);

	return {
		title: cleanTitle(title),
		meetingDate,
		meetingType,
		sourceUrl,
		documentUrl,
		contentHash,
	};
}

/**
 * Clean up meeting title
 */
function cleanTitle(title: string): string {
	return title
		.replace(/\s+/g, " ")
		.replace(/^[-–—]\s*/, "")
		.replace(/\s*[-–—]$/, "")
		.trim();
}

/**
 * Find next page URL for pagination
 */
function findNextPage(
	$: cheerio.CheerioAPI,
	currentUrl: string,
): string | null {
	// Common pagination selectors
	const nextSelectors = [
		"a.next",
		'a[rel="next"]',
		'.pagination a:contains("Next")',
		'.pagination a:contains(">")',
		'a:contains("Next Page")',
		".rgPageNext a",
	];

	for (const selector of nextSelectors) {
		const nextLink = $(selector).first();
		if (nextLink.length > 0) {
			const href = nextLink.attr("href");
			if (href && !href.includes("javascript:")) {
				return resolveUrl(currentUrl, href);
			}
		}
	}

	return null;
}

export default granicusScraper;
