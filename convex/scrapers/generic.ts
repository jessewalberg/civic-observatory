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
	hashContent,
	htmlToText,
	inferMeetingType,
	parseDate,
	resolveUrl,
} from "./utils";

// ═══════════════════════════════════════════════════════════════
// GENERIC SCRAPER
// Fallback scraper for custom municipal sites
// Relies heavily on per-municipality config selectors
// ═══════════════════════════════════════════════════════════════

/** Default selectors when config is not provided */
const DEFAULT_SELECTORS = {
	meetingList: [
		// Common meeting list patterns
		".meeting-list li",
		".meetings-list .meeting",
		".agenda-list .agenda-item",
		"table.meetings tbody tr",
		".meeting-row",
		"[data-meeting]",
		// Calendar-style layouts
		".calendar-event",
		".event-item",
		// Generic list items
		"ul.meetings li",
		"article.meeting",
	],
	meetingTitle: [
		".meeting-title",
		".title",
		"h3",
		"h4",
		".name",
		"a:first-child",
		"td:first-child",
	],
	meetingDate: [
		".meeting-date",
		".date",
		"time",
		"[datetime]",
		".event-date",
		"td:nth-child(2)",
	],
	documentLink: [
		'a[href*=".pdf"]',
		'a[href*="agenda"]',
		'a[href*="minutes"]',
		'a[href*="packet"]',
		'a[href*="document"]',
		".document-link a",
		".attachment a",
	],
};

export const genericScraper: Scraper = {
	platform: "generic",

	canHandle(_url: string): boolean {
		// Generic scraper is the fallback - it can attempt to handle any URL
		return true;
	},

	async scrape(url: string, config?: ScraperConfig): Promise<ScraperResult> {
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

			// Determine selectors - prefer config, fall back to auto-detection
			const selectors = getSelectors($, config);

			if (!selectors.meetingList) {
				return {
					success: false,
					meetings: [],
					errors: [
						{
							message:
								"Could not find meeting list on page. Configure meetingListSelector.",
							url,
							code: "parse",
							timestamp: Date.now(),
						},
					],
					stats,
				};
			}

			// Extract meetings
			const meetingElements = $(selectors.meetingList);
			stats.found = meetingElements.length;

			if (stats.found === 0) {
				errors.push({
					message: `No meetings found with selector: ${selectors.meetingList}`,
					url,
					code: "parse",
					timestamp: Date.now(),
				});
			}

			meetingElements.each((_, node) => {
				try {
					if (!isElement(node)) return;
					const meeting = extractMeeting($, node, url, selectors, config);
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

			return {
				success: meetings.length > 0 || errors.length === 0,
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
			// If it's a PDF, return null (PDF extraction handled separately)
			if (url.toLowerCase().endsWith(".pdf")) {
				return null;
			}

			// Fetch HTML content
			const response = await fetchWithRetry(url);
			if (!response.ok) {
				return null;
			}

			const html = await response.text();
			const $ = cheerio.load(html);

			// Use config selector if provided
			if (config?.contentSelector) {
				const content = $(config.contentSelector).first();
				if (content.length > 0) {
					return htmlToText(content.html() || "");
				}
			}

			// Try common content selectors
			const contentSelectors = [
				"main",
				"article",
				".content",
				".main-content",
				"#content",
				".page-content",
				".meeting-content",
				".agenda-content",
			];

			for (const selector of contentSelectors) {
				const content = $(selector).first();
				if (content.length > 0 && content.text().trim().length > 100) {
					return htmlToText(content.html() || "");
				}
			}

			// Fall back to body content (cleaned)
			// Remove common non-content elements
			$(
				"header, footer, nav, aside, script, style, .sidebar, .menu, .navigation",
			).remove();
			return htmlToText($("body").html() || "");
		} catch {
			return null;
		}
	},
};

// ═══════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════

interface ResolvedSelectors {
	meetingList: string | null;
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
 * Get selectors from config or auto-detect
 */
function getSelectors(
	$: cheerio.CheerioAPI,
	config?: ScraperConfig,
): ResolvedSelectors {
	// If config provides selectors, use those
	if (config?.meetingListSelector) {
		return {
			meetingList: config.meetingListSelector,
			meetingTitle:
				config.meetingLinkSelector || DEFAULT_SELECTORS.meetingTitle[0],
			meetingDate: config.dateSelector || DEFAULT_SELECTORS.meetingDate[0],
			documentLink: DEFAULT_SELECTORS.documentLink.join(", "),
		};
	}

	// Auto-detect meeting list selector
	let meetingListSelector: string | null = null;
	let maxCount = 0;

	for (const selector of DEFAULT_SELECTORS.meetingList) {
		const count = $(selector).length;
		// Look for reasonable number of meetings (3-50)
		if (count >= 3 && count <= 50 && count > maxCount) {
			meetingListSelector = selector;
			maxCount = count;
		}
	}

	// Auto-detect title selector within found elements
	let titleSelector = DEFAULT_SELECTORS.meetingTitle[0];
	if (meetingListSelector) {
		const firstElement = $(meetingListSelector).first();
		for (const selector of DEFAULT_SELECTORS.meetingTitle) {
			if (firstElement.find(selector).length > 0) {
				titleSelector = selector;
				break;
			}
		}
	}

	// Auto-detect date selector
	let dateSelector = DEFAULT_SELECTORS.meetingDate[0];
	if (meetingListSelector) {
		const firstElement = $(meetingListSelector).first();
		for (const selector of DEFAULT_SELECTORS.meetingDate) {
			if (firstElement.find(selector).length > 0) {
				dateSelector = selector;
				break;
			}
		}
	}

	return {
		meetingList: meetingListSelector,
		meetingTitle: titleSelector,
		meetingDate: dateSelector,
		documentLink: DEFAULT_SELECTORS.documentLink.join(", "),
	};
}

/**
 * Extract a single meeting from an element
 */
function extractMeeting(
	$: cheerio.CheerioAPI,
	element: Element,
	baseUrl: string,
	selectors: ResolvedSelectors,
	config?: ScraperConfig,
): ScrapedMeeting | null {
	const $el = $(element);

	// Extract title
	let title = "";
	const titleEl = $el.find(selectors.meetingTitle).first();
	if (titleEl.length > 0) {
		title = titleEl.text().trim();
	}

	// If no title found with selector, try first link or heading
	if (!title) {
		const firstLink = $el.find("a").first();
		if (firstLink.length > 0) {
			title = firstLink.text().trim();
		}
	}

	if (!title) {
		const firstHeading = $el.find("h1, h2, h3, h4, h5, h6").first();
		if (firstHeading.length > 0) {
			title = firstHeading.text().trim();
		}
	}

	// Last resort: use first text content
	if (!title) {
		title = $el.text().trim().split("\n")[0]?.trim() || "";
	}

	if (!title || title.length < 3) {
		return null;
	}

	// Extract date
	let dateStr = "";
	const dateEl = $el.find(selectors.meetingDate).first();
	if (dateEl.length > 0) {
		// Check for datetime attribute first
		dateStr = dateEl.attr("datetime") || dateEl.text().trim();
	}

	// Try to extract date from title if not found
	if (!dateStr) {
		const datePatterns = [
			/\d{1,2}\/\d{1,2}\/\d{4}/,
			/\d{4}-\d{2}-\d{2}/,
			/\w+\s+\d{1,2},?\s+\d{4}/,
			/\d{1,2}\s+\w+\s+\d{4}/,
		];

		for (const pattern of datePatterns) {
			const match = title.match(pattern) || $el.text().match(pattern);
			if (match) {
				dateStr = match[0];
				break;
			}
		}
	}

	const meetingDate = parseDate(dateStr, config?.dateFormat);
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
			if (href.toLowerCase().includes(".pdf")) {
				documentUrl = fullUrl;
			}
			// Use first link as source URL if not set
			if (sourceUrl === baseUrl) {
				sourceUrl = fullUrl;
			}
		}
	});

	// If no document link, check for any link as detail page
	if (!documentUrl) {
		const detailLink = $el.find("a").first().attr("href");
		if (detailLink) {
			sourceUrl = resolveUrl(baseUrl, detailLink);
		}
	}

	// Infer meeting type
	const meetingType = inferMeetingType(title);

	// Generate content hash
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
		.replace(/^[-–—•]\s*/, "")
		.replace(/\s*[-–—]$/, "")
		.substring(0, 200) // Limit length
		.trim();
}

/**
 * Fetch with retry logic
 */
async function fetchWithRetry(
	url: string,
	retries = 3,
	timeout = 30000,
): Promise<Response> {
	let lastError: Error | null = null;

	for (let i = 0; i < retries; i++) {
		try {
			const controller = new AbortController();
			const timeoutId = setTimeout(() => controller.abort(), timeout);

			const response = await fetch(url, {
				signal: controller.signal,
				headers: {
					"User-Agent":
						"Mozilla/5.0 (compatible; CivicPulse/1.0; +https://civicpulse.app)",
					Accept:
						"text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
				},
			});

			clearTimeout(timeoutId);
			return response;
		} catch (error) {
			lastError = error instanceof Error ? error : new Error(String(error));

			// Don't retry on abort (timeout)
			if (lastError.name === "AbortError") {
				throw new Error(`Request timeout after ${timeout}ms`);
			}

			// Wait before retry (exponential backoff)
			if (i < retries - 1) {
				await new Promise((resolve) => setTimeout(resolve, 1000 * (i + 1)));
			}
		}
	}

	throw lastError || new Error("Failed to fetch after retries");
}

export default genericScraper;
