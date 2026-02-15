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
		// Drupal patterns
		".view-content .views-row",
		".field-items .field-item",
		// WordPress patterns
		".entry-content table tbody tr",
		".wp-block-table tbody tr",
		// Broader content-scoped tables
		"main table tbody tr",
		"#content table tbody tr",
		".content table tbody tr",
		"#main-content table tbody tr",
		// Generic repeated elements in content
		"main li",
		"#content li",
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
				// Try heuristic detection before giving up
				const heuristicMeetings = findMeetingsByHeuristic($, url);
				if (heuristicMeetings.length > 0) {
					return {
						success: true,
						meetings: heuristicMeetings,
						errors: [],
						stats: {
							found: heuristicMeetings.length,
							new: heuristicMeetings.length,
							skipped: 0,
							failed: 0,
						},
					};
				}

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

// ═══════════════════════════════════════════════════════════════
// HEURISTIC DETECTION - Find meetings by pattern matching
// ═══════════════════════════════════════════════════════════════

/** Date patterns to look for in text */
const DATE_REGEX =
	/\d{1,2}\/\d{1,2}\/\d{2,4}|\d{4}-\d{2}-\d{2}|\d{1,2}-\d{1,2}-\d{4}|\d{1,2}\.\d{1,2}\.\d{2,4}|\w+\s+\d{1,2},?\s+\d{4}|\d{1,2}\s+\w+\s+\d{4}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\.?\s+\d{1,2}/;

/**
 * Heuristic: find meetings by looking for tables/lists with date-like content
 * within content areas (excluding nav, header, footer, aside)
 */
function findMeetingsByHeuristic(
	$: cheerio.CheerioAPI,
	baseUrl: string,
): ScrapedMeeting[] {
	const meetings: ScrapedMeeting[] = [];

	// Remove non-content elements to avoid false positives
	const $content = cheerio.load($.html() || "");
	$content(
		"header, footer, nav, aside, .sidebar, .menu, .navigation, #sidebar, #nav, #footer, #header",
	).remove();

	// Strategy 1: Find tables where rows contain dates
	$content("table").each((_, table) => {
		const rows = $content(table).find("tr");
		let rowsWithDates = 0;

		rows.each((__, row) => {
			if (DATE_REGEX.test($content(row).text())) rowsWithDates++;
		});

		// Need at least 3 rows with dates to consider it a meeting table
		if (rowsWithDates >= 3 && meetings.length === 0) {
			rows.each((__, row) => {
				if (!isElement(row)) return;
				const $row = $content(row);
				const rowText = $row.text();

				const dateMatch = rowText.match(DATE_REGEX);
				if (!dateMatch) return;

				const meetingDate = parseDate(dateMatch[0]);
				if (!meetingDate) return;

				// Get title: first link text, or first cell text
				const link = $row.find("a").first();
				let title = link.text().trim();
				if (!title || title.length < 3) {
					title = $row.find("td").first().text().trim();
				}
				if (!title || title.length < 3) return;

				// Clean the date out of the title if it's embedded
				title = title.replace(DATE_REGEX, "").trim();
				if (title.length < 3) {
					title = $row
						.find("td")
						.eq(1)
						.text()
						.trim()
						.replace(DATE_REGEX, "")
						.trim();
				}
				if (!title || title.length < 3) return;

				let documentUrl: string | undefined;
				$row.find('a[href*=".pdf"], a[href*="agenda"], a[href*="minutes"]').each(
					(_, a) => {
						const href = $content(a).attr("href");
						if (href) documentUrl = resolveUrl(baseUrl, href);
					},
				);

				const sourceUrl = link.attr("href")
					? resolveUrl(baseUrl, link.attr("href")!)
					: baseUrl;

				meetings.push({
					title: cleanTitle(title),
					meetingDate,
					meetingType: inferMeetingType(title),
					sourceUrl,
					documentUrl,
					contentHash: hashContent(`${title}-${meetingDate}`),
				});
			});
		}
	});

	if (meetings.length > 0) return meetings;

	// Strategy 2: Find lists where items contain links + dates
	$content("ul, ol").each((_, list) => {
		const items = $content(list).find("li");
		let itemsWithDates = 0;

		items.each((__, li) => {
			const text = $content(li).text();
			if (DATE_REGEX.test(text) && $content(li).find("a").length > 0) {
				itemsWithDates++;
			}
		});

		if (itemsWithDates >= 2 && meetings.length === 0) {
			items.each((__, li) => {
				if (!isElement(li)) return;
				const $li = $content(li);
				const text = $li.text();

				const dateMatch = text.match(DATE_REGEX);
				if (!dateMatch) return;

				const meetingDate = parseDate(dateMatch[0]);
				if (!meetingDate) return;

				const link = $li.find("a").first();
				const title = link.text().trim() || text.replace(DATE_REGEX, "").trim();
				if (!title || title.length < 3) return;

				const sourceUrl = link.attr("href")
					? resolveUrl(baseUrl, link.attr("href")!)
					: baseUrl;

				meetings.push({
					title: cleanTitle(title),
					meetingDate,
					meetingType: inferMeetingType(title),
					sourceUrl,
					contentHash: hashContent(`${title}-${meetingDate}`),
				});
			});
		}
	});

	if (meetings.length > 0) return meetings;

	// Strategy 3: Find repeated div/article/section elements with dates + links
	// Covers WordPress download managers, Drupal views, custom CMS layouts
	const containerSelectors = [
		".wpdm-download-link",
		".wpdm-package",
		".widgetItem",
		".views-row",
		".field-item",
		"article",
		".post",
		".entry",
		".item",
		".event",
		".meeting",
		".agenda",
		".calendar-item",
		".list-group-item",
	];

	for (const containerSel of containerSelectors) {
		const containers = $content(containerSel);
		if (containers.length < 2) continue;

		let containersWithDates = 0;
		containers.each((__, el) => {
			if (DATE_REGEX.test($content(el).text())) containersWithDates++;
		});

		if (containersWithDates >= 2 && meetings.length === 0) {
			containers.each((__, el) => {
				if (!isElement(el)) return;
				const $el = $content(el);
				const text = $el.text();

				const dateMatch = text.match(DATE_REGEX);
				if (!dateMatch) return;

				const meetingDate = parseDate(dateMatch[0]);
				if (!meetingDate) return;

				// Get title from heading, link, or strong element
				const link = $el.find("a").first();
				let title =
					$el.find("h1, h2, h3, h4, h5, h6, strong").first().text().trim() ||
					link.text().trim() ||
					text.replace(DATE_REGEX, "").trim().split("\n")[0]?.trim() ||
					"";

				// Clean date out of title
				title = title.replace(DATE_REGEX, "").trim();
				if (!title || title.length < 3) return;

				let documentUrl: string | undefined;
				$el.find('a[href*=".pdf"], a[href*="agenda"], a[href*="minutes"], a[href*="download"]').each(
					(___, a) => {
						const href = $content(a).attr("href");
						if (href) documentUrl = resolveUrl(baseUrl, href);
					},
				);

				const sourceUrl = link.attr("href")
					? resolveUrl(baseUrl, link.attr("href")!)
					: baseUrl;

				meetings.push({
					title: cleanTitle(title),
					meetingDate,
					meetingType: inferMeetingType(title),
					sourceUrl,
					documentUrl,
					contentHash: hashContent(`${title}-${meetingDate}`),
				});
			});

			if (meetings.length > 0) break;
		}
	}

	if (meetings.length > 0) return meetings;

	// Strategy 4: Broadest fallback — find ANY links with dates in their text or nearby text
	const allLinks = $content("main a, #content a, .content a, article a, .page-content a");
	const linkMeetings: ScrapedMeeting[] = [];

	allLinks.each((_, a) => {
		const $a = $content(a);
		const href = $a.attr("href");
		if (!href || href === "#" || href.startsWith("javascript:")) return;

		// Check link text and parent text for dates
		const linkText = $a.text().trim();
		const parentText = $a.parent().text().trim();
		const searchText = `${linkText} ${parentText}`;

		const dateMatch = searchText.match(DATE_REGEX);
		if (!dateMatch) return;

		const meetingDate = parseDate(dateMatch[0]);
		if (!meetingDate) return;

		// Filter out navigation/utility links
		const lowerText = linkText.toLowerCase();
		if (
			lowerText.includes("read more") ||
			lowerText.includes("click here") ||
			lowerText.includes("back to") ||
			lowerText.length < 5 ||
			lowerText.length > 200
		)
			return;

		let title = linkText.replace(DATE_REGEX, "").trim();
		if (!title || title.length < 3) return;

		linkMeetings.push({
			title: cleanTitle(title),
			meetingDate,
			meetingType: inferMeetingType(title),
			sourceUrl: resolveUrl(baseUrl, href),
			contentHash: hashContent(`${title}-${meetingDate}`),
		});
	});

	// Only use link-based results if we found a reasonable number
	if (linkMeetings.length >= 3 && linkMeetings.length <= 200) {
		return linkMeetings;
	}

	return meetings;
}

export default genericScraper;
