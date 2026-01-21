import type { Id } from "../_generated/dataModel";

// ═══════════════════════════════════════════════════════════════
// PLATFORM TYPES
// ═══════════════════════════════════════════════════════════════
export type Platform = "granicus" | "civicplus" | "generic" | "manual";

export type MeetingType =
  | "city_council"
  | "school_board"
  | "planning_commission"
  | "zoning_board"
  | "budget_committee"
  | "other";

// ═══════════════════════════════════════════════════════════════
// SCRAPER CONFIG - Per-municipality scraping configuration
// ═══════════════════════════════════════════════════════════════
export interface ScraperConfig {
  /** CSS selector for meeting list container */
  meetingListSelector?: string;
  /** CSS selector for individual meeting links */
  meetingLinkSelector?: string;
  /** CSS selector for meeting date */
  dateSelector?: string;
  /** Date format string (e.g., "MM/DD/YYYY") */
  dateFormat?: string;
  /** CSS selector for meeting content */
  contentSelector?: string;
  /** How often to scrape (in hours) */
  frequencyHours: number;
}

// ═══════════════════════════════════════════════════════════════
// SCRAPED MEETING - Raw data from scraper
// ═══════════════════════════════════════════════════════════════
export interface ScrapedMeeting {
  /** Meeting title */
  title: string;
  /** Meeting date as timestamp */
  meetingDate: number;
  /** Inferred meeting type */
  meetingType: MeetingType;
  /** URL where meeting was found */
  sourceUrl: string;
  /** Raw text content (if available) */
  rawContent?: string;
  /** URL to PDF/document (if available) */
  documentUrl?: string;
  /** Hash of content for deduplication */
  contentHash: string;
}

// ═══════════════════════════════════════════════════════════════
// SCRAPER ERROR - Structured error from scraping
// ═══════════════════════════════════════════════════════════════
export interface ScraperError {
  /** Error message */
  message: string;
  /** URL that caused the error */
  url?: string;
  /** Error code/type */
  code?: "network" | "parse" | "timeout" | "auth" | "rate_limit" | "unknown";
  /** Timestamp when error occurred */
  timestamp: number;
}

// ═══════════════════════════════════════════════════════════════
// SCRAPER RESULT - Return type from scrape operation
// ═══════════════════════════════════════════════════════════════
export interface ScraperResult {
  /** Whether scraping succeeded */
  success: boolean;
  /** Scraped meetings (if successful) */
  meetings: ScrapedMeeting[];
  /** Errors encountered during scraping */
  errors: ScraperError[];
  /** Stats about the scrape */
  stats: {
    /** Total meetings found on page */
    found: number;
    /** New meetings (not already in DB) */
    new: number;
    /** Meetings skipped (already exist) */
    skipped: number;
    /** Meetings that failed to process */
    failed: number;
  };
}

// ═══════════════════════════════════════════════════════════════
// SCRAPER INTERFACE - Contract for platform scrapers
// ═══════════════════════════════════════════════════════════════
export interface Scraper {
  /** Platform identifier */
  platform: Platform;

  /**
   * Check if this scraper can handle the given URL
   * @param url - URL to check
   * @returns true if this scraper can handle the URL
   */
  canHandle(url: string): boolean;

  /**
   * Scrape meetings from the given URL
   * @param url - Meetings page URL
   * @param config - Optional scraper configuration
   * @returns Scraper result with meetings and errors
   */
  scrape(url: string, config?: ScraperConfig): Promise<ScraperResult>;

  /**
   * Extract content from a specific meeting page
   * @param url - Meeting detail page URL
   * @param config - Optional scraper configuration
   * @returns Extracted content or null
   */
  extractContent(url: string, config?: ScraperConfig): Promise<string | null>;
}

// ═══════════════════════════════════════════════════════════════
// SCRAPE JOB CONTEXT - Passed to scrapers for context
// ═══════════════════════════════════════════════════════════════
export interface ScrapeJobContext {
  /** Municipality ID being scraped */
  municipalityId: Id<"municipalities">;
  /** Scrape job ID */
  jobId: Id<"scrapeJobs">;
  /** Municipality name (for logging) */
  municipalityName: string;
  /** State (for date parsing) */
  state: string;
}

// ═══════════════════════════════════════════════════════════════
// CONTENT EXTRACTION RESULT
// ═══════════════════════════════════════════════════════════════
export interface ContentExtractionResult {
  /** Extracted text content */
  content: string;
  /** Content type detected */
  contentType: "html" | "pdf" | "text";
  /** Word count */
  wordCount: number;
}
