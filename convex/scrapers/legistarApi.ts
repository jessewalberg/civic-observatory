"use node";

import type { ScrapedMeeting, ScraperResult } from "./types";
import { hashContent, inferMeetingType } from "./utils";

// ═══════════════════════════════════════════════════════════════
// LEGISTAR REST API CLIENT
// Public API at webapi.legistar.com — structured JSON, no HTML parsing
// Used as primary path for *.legistar.com municipalities
// ═══════════════════════════════════════════════════════════════

const LEGISTAR_API_BASE = "https://webapi.legistar.com/v1";

/** Minimum response size to consider valid (wildcard returns 19 bytes) */
const MIN_VALID_RESPONSE_SIZE = 50;

/** API response shape for events */
interface LegistarEvent {
	EventId: number;
	EventBodyName: string;
	EventDate: string; // "2024-01-15T00:00:00"
	EventTime: string; // "2:00 PM"
	EventLocation: string;
	EventAgendaFile: string | null;
	EventMinutesFile: string | null;
	EventInSiteURL: string;
	EventAgendaStatusName: string;
	EventMinutesStatusName: string;
}

/**
 * Check if a URL is a Legistar URL
 */
export function isLegistarUrl(url: string): boolean {
	return /legistar\.com/i.test(url);
}

/**
 * Extract the Legistar slug from a URL
 * e.g. "https://birmingham.legistar.com/Calendar.aspx" → "birmingham"
 */
export function extractLegistarSlug(url: string): string | null {
	try {
		const hostname = new URL(url).hostname;
		const match = hostname.match(/^([^.]+)\.legistar\.com$/i);
		return match ? match[1].toLowerCase() : null;
	} catch {
		return null;
	}
}

/**
 * Fetch events from the Legistar REST API
 * Validates that the response is a real JSON array (not the wildcard 19-byte response)
 */
export async function fetchLegistarEvents(
	slug: string,
	options?: { top?: number },
): Promise<LegistarEvent[] | null> {
	const top = options?.top ?? 100;
	const apiUrl = `${LEGISTAR_API_BASE}/${slug}/events?$top=${top}&$orderby=EventDate%20desc`;

	try {
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), 10000);

		const response = await fetch(apiUrl, {
			signal: controller.signal,
			headers: {
				Accept: "application/json",
				"User-Agent":
					"Mozilla/5.0 (compatible; CivicPulse/1.0; +https://civicpulse.app)",
			},
		});

		clearTimeout(timeoutId);

		if (!response.ok) return null;

		const text = await response.text();

		// Wildcard subdomains return 200 with ~19 bytes of non-JSON content
		if (text.length < MIN_VALID_RESPONSE_SIZE) return null;

		// Must be a JSON array
		const trimmed = text.trim();
		if (!trimmed.startsWith("[")) return null;

		const events: LegistarEvent[] = JSON.parse(trimmed);
		if (!Array.isArray(events) || events.length === 0) return null;

		return events;
	} catch {
		return null;
	}
}

/**
 * Map a Legistar API event to our ScrapedMeeting interface
 */
export function mapToScrapedMeeting(
	event: LegistarEvent,
	slug: string,
): ScrapedMeeting | null {
	// Parse the date
	const meetingDate = new Date(event.EventDate).getTime();
	if (Number.isNaN(meetingDate)) return null;

	// Build title from body name + time
	const title = event.EventTime
		? `${event.EventBodyName} - ${event.EventTime}`
		: event.EventBodyName;

	if (!title || title.length < 3) return null;

	// Source URL — prefer InSiteURL, fall back to constructed URL
	const sourceUrl =
		event.EventInSiteURL ||
		`https://${slug}.legistar.com/MeetingDetail.aspx?ID=${event.EventId}`;

	// Document URL — prefer agenda PDF, then minutes PDF
	const documentUrl = event.EventAgendaFile || event.EventMinutesFile || undefined;

	return {
		title,
		meetingDate,
		meetingType: inferMeetingType(title),
		sourceUrl,
		documentUrl: documentUrl || undefined,
		contentHash: hashContent(`${event.EventBodyName}-${meetingDate}`),
	};
}

/**
 * Try scraping via the Legistar API
 * Returns a ScraperResult if successful, null if the API doesn't work for this slug
 */
export async function tryLegistarApi(
	slug: string,
): Promise<ScraperResult | null> {
	const events = await fetchLegistarEvents(slug);
	if (!events) return null;

	const meetings: ScrapedMeeting[] = [];

	for (const event of events) {
		const meeting = mapToScrapedMeeting(event, slug);
		if (meeting) {
			meetings.push(meeting);
		}
	}

	if (meetings.length === 0) return null;

	return {
		success: true,
		meetings,
		errors: [],
		stats: {
			found: events.length,
			new: meetings.length,
			skipped: events.length - meetings.length,
			failed: 0,
		},
	};
}
