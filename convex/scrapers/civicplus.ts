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
	fetchWithRetry,
	hashContent,
	htmlToText,
	inferMeetingType,
	parseDate,
	resolveUrl,
} from "./utils";

// ═══════════════════════════════════════════════════════════════
// CIVICPLUS SCRAPER
// Handles CivicPlus/CivicWeb meeting management platforms
// Common URL patterns: civicplus.com, civicweb.net, AgendaCenter
// ═══════════════════════════════════════════════════════════════

/** URL patterns that indicate CivicPlus platform */
const CIVICPLUS_PATTERNS = [
	/civicplus\.com/i,
	/civicweb\.net/i,
	/civiclive\.com/i,
	/municipalcodeonline\.com/i,
	/\/AgendaCenter\//i,
	/\/AgendaOnline\//i,
];

/** Default selectors for CivicPlus AgendaCenter pages */
const AGENDA_CENTER_SELECTORS = {
	meetingList: ".agendaRow, .minutesRow, .agenda-item, tr.catAgendaRow",
	meetingTitle: "p a[href*='ViewFile'], p a[href*='View.ashx'], .agendaTitle, .title, h4",
	meetingDate: "h3 strong, .agendaDate, .date",
	documentLink:
		"a[href*='.pdf'], a[href*='ViewFile'], a[href*='View.ashx'], a.pdf-link",
};

/** Default selectors for CivicPlus calendar/list pages */
const CALENDAR_SELECTORS = {
	meetingList: ".event-list-item, .calendar-event, .meeting-item, li.event",
	meetingTitle: ".event-title, .meeting-title, h3, h4, a:first-child",
	meetingDate: ".event-date, time, [datetime], .date",
	documentLink: "a[href*='.pdf'], a[href*='agenda'], a[href*='minutes']",
};

/** Default selectors for CivicPlus board/committee pages */
const BOARD_SELECTORS = {
	meetingList:
		"table.agendaTable tbody tr, .board-meetings li, .committee-meetings li",
	meetingTitle: "td:first-child, .meeting-name, a",
	meetingDate: "td:nth-child(2), .meeting-date",
	documentLink: "a[href*='.pdf'], a.agenda-link, a.minutes-link",
};

export const civicplusScraper: Scraper = {
	platform: "civicplus",

	canHandle(url: string): boolean {
		return CIVICPLUS_PATTERNS.some((pattern) => pattern.test(url));
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

			// Determine which selectors to use
			const selectors = detectSelectors($, url, config);

			// Extract meetings
			const meetingElements = $(selectors.meetingList);
			stats.found = meetingElements.length;

			if (stats.found === 0) {
				// Try alternative selectors if primary failed
				const altSelectors = tryAlternativeSelectors($);
				if (altSelectors) {
					const altElements = $(altSelectors.meetingList);
					if (altElements.length > 0) {
						stats.found = altElements.length;
						altElements.each((_, node) => {
							try {
								if (!isElement(node)) return;
								const meeting = extractMeeting($, node, url, altSelectors);
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
					}
				}
			} else {
				meetingElements.each((_, node) => {
					try {
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
			}

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
			// If it's a PDF, return null (PDF extraction handled separately)
			if (
				url.toLowerCase().includes(".pdf") ||
				url.includes("ViewFile") ||
				url.includes("View.ashx")
			) {
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

			// Try CivicPlus-specific content selectors
			const contentSelectors = [
				".agenda-content",
				".meeting-content",
				".document-content",
				"#agenda-body",
				".minutes-content",
				".page-content",
				"main",
				"article",
				"#content",
				".content",
			];

			for (const selector of contentSelectors) {
				const content = $(selector).first();
				if (content.length > 0 && content.text().trim().length > 100) {
					return htmlToText(content.html() || "");
				}
			}

			// Fall back to body content
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

	// Detect page type based on URL and content
	if (url.includes("AgendaCenter") || $(".agendaRow").length > 0) {
		return AGENDA_CENTER_SELECTORS;
	}

	if (
		url.includes("calendar") ||
		$(".event-list-item").length > 0 ||
		$(".calendar-event").length > 0
	) {
		return CALENDAR_SELECTORS;
	}

	if (
		url.includes("board") ||
		url.includes("committee") ||
		$("table.agendaTable").length > 0
	) {
		return BOARD_SELECTORS;
	}

	// Default to agenda center selectors
	return AGENDA_CENTER_SELECTORS;
}

/**
 * Try alternative selectors if primary detection failed
 */
function tryAlternativeSelectors($: cheerio.CheerioAPI): Selectors | null {
	// Try each selector set and return the first that finds elements
	const selectorSets = [
		AGENDA_CENTER_SELECTORS,
		CALENDAR_SELECTORS,
		BOARD_SELECTORS,
	];

	for (const selectors of selectorSets) {
		const count = $(selectors.meetingList).length;
		if (count >= 1 && count <= 100) {
			return selectors;
		}
	}

	// Try generic fallback selectors
	const fallbackSelectors = ["table tbody tr", ".list-item", "ul li", ".row"];

	for (const selector of fallbackSelectors) {
		const count = $(selector).length;
		if (count >= 3 && count <= 50) {
			return {
				meetingList: selector,
				meetingTitle: "a:first-child, td:first-child, h3, h4",
				meetingDate: "time, .date, td:nth-child(2)",
				documentLink: "a[href*='.pdf']",
			};
		}
	}

	return null;
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

	// If no title found in child, try the element itself or first link
	if (!title) {
		const firstLink = $el.find("a").first();
		if (firstLink.length > 0) {
			title = firstLink.text().trim();
		}
	}

	if (!title) {
		title = $el.text().trim().split("\n")[0]?.trim() || "";
	}

	if (!title || title.length < 3) {
		return null;
	}

	// Extract date
	const dateEl = $el.find(selectors.meetingDate).first();
	let dateStr = dateEl.attr("datetime") || dateEl.text().trim();

	// Try to find date in title if not found separately
	if (!dateStr) {
		const dateMatch = title.match(
			/\d{1,2}\/\d{1,2}\/\d{4}|\d{4}-\d{2}-\d{2}|\w+ \d{1,2},? \d{4}/,
		);
		if (dateMatch) {
			dateStr = dateMatch[0];
		}
	}

	// Try to find date anywhere in the element
	if (!dateStr) {
		const elementText = $el.text();
		const dateMatch = elementText.match(
			/\d{1,2}\/\d{1,2}\/\d{4}|\d{4}-\d{2}-\d{2}|\w+ \d{1,2},? \d{4}/,
		);
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
			if (
				href.toLowerCase().includes(".pdf") ||
				href.includes("ViewFile") ||
				href.includes("View.ashx")
			) {
				documentUrl = fullUrl;
			}
			// Use first link as source URL
			if (sourceUrl === baseUrl) {
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

	// Generate content hash from title + date
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
		.substring(0, 200)
		.trim();
}

/**
 * Find next page URL for pagination
 */
function findNextPage(
	$: cheerio.CheerioAPI,
	currentUrl: string,
): string | null {
	// CivicPlus pagination selectors
	const nextSelectors = [
		"a.next",
		'a[rel="next"]',
		'.pagination a:contains("Next")',
		'.pagination a:contains(">")',
		'a:contains("Next Page")',
		".pager-next a",
		"a.page-link:contains('»')",
		".page-numbers a:contains('Next')",
	];

	for (const selector of nextSelectors) {
		const nextLink = $(selector).first();
		if (nextLink.length > 0) {
			const href = nextLink.attr("href");
			if (href && !href.includes("javascript:") && href !== "#") {
				return resolveUrl(currentUrl, href);
			}
		}
	}

	return null;
}

export default civicplusScraper;
