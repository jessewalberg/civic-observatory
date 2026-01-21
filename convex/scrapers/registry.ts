import type { Platform, Scraper } from "./types";

// ═══════════════════════════════════════════════════════════════
// SCRAPER REGISTRY - Central registry for platform scrapers
// ═══════════════════════════════════════════════════════════════

/** Registry of available scrapers by platform */
const scrapers = new Map<Platform, Scraper>();

/**
 * Register a scraper for a platform
 * @param scraper - Scraper implementation to register
 */
export function registerScraper(scraper: Scraper): void {
  scrapers.set(scraper.platform, scraper);
}

/**
 * Get a scraper for a specific platform
 * @param platform - Platform identifier
 * @returns Scraper instance or undefined if not registered
 */
export function getScraper(platform: Platform): Scraper | undefined {
  return scrapers.get(platform);
}

/**
 * Get all registered scrapers
 * @returns Array of registered scrapers
 */
export function getAllScrapers(): Scraper[] {
  return Array.from(scrapers.values());
}

/**
 * Check if a platform has a registered scraper
 * @param platform - Platform identifier
 * @returns true if scraper is registered
 */
export function hasScraperFor(platform: Platform): boolean {
  return scrapers.has(platform);
}

// ═══════════════════════════════════════════════════════════════
// PLATFORM DETECTION - Detect platform from URL patterns
// ═══════════════════════════════════════════════════════════════

/** URL patterns for platform detection */
const platformPatterns: Array<{ pattern: RegExp; platform: Platform }> = [
  // Granicus patterns
  {
    pattern: /granicus\.com/i,
    platform: "granicus",
  },
  {
    pattern: /legistar\.com/i,
    platform: "granicus",
  },
  {
    pattern: /\.insite\.com/i,
    platform: "granicus",
  },

  // CivicPlus patterns
  {
    pattern: /civicplus\.com/i,
    platform: "civicplus",
  },
  {
    pattern: /\.civicweb\.net/i,
    platform: "civicplus",
  },
  {
    pattern: /municipalcodeonline\.com/i,
    platform: "civicplus",
  },

  // Note: "manual" platform doesn't have URL patterns - it's for uploads only
];

/**
 * Detect the platform from a URL
 * @param url - URL to analyze
 * @returns Detected platform or "generic" if unknown
 */
export function detectPlatform(url: string): Platform {
  const normalizedUrl = url.toLowerCase();

  for (const { pattern, platform } of platformPatterns) {
    if (pattern.test(normalizedUrl)) {
      return platform;
    }
  }

  // Default to generic scraper
  return "generic";
}

/**
 * Find a scraper that can handle the given URL
 * Tries platform detection first, then falls back to checking all scrapers
 * @param url - URL to find scraper for
 * @returns Scraper that can handle the URL, or undefined
 */
export function findScraperForUrl(url: string): Scraper | undefined {
  // First, try platform detection
  const detectedPlatform = detectPlatform(url);
  const platformScraper = getScraper(detectedPlatform);

  if (platformScraper?.canHandle(url)) {
    return platformScraper;
  }

  // Fall back to checking all scrapers
  for (const scraper of scrapers.values()) {
    if (scraper.canHandle(url)) {
      return scraper;
    }
  }

  // Return generic scraper as last resort
  return getScraper("generic");
}

// ═══════════════════════════════════════════════════════════════
// PLATFORM METADATA - Information about each platform
// ═══════════════════════════════════════════════════════════════

export interface PlatformInfo {
  name: string;
  description: string;
  commonUrls: string[];
  marketShare: string;
}

export const platformInfo: Record<Platform, PlatformInfo> = {
  granicus: {
    name: "Granicus",
    description: "Leading provider of government meeting management software",
    commonUrls: ["*.granicus.com", "*.legistar.com", "*.insite.com"],
    marketShare: "~40%",
  },
  civicplus: {
    name: "CivicPlus",
    description: "Municipal website and agenda management platform",
    commonUrls: ["*.civicplus.com", "*.civicweb.net"],
    marketShare: "~30%",
  },
  generic: {
    name: "Generic",
    description: "Custom HTML scraper for sites without standard platform",
    commonUrls: [],
    marketShare: "~20%",
  },
  manual: {
    name: "Manual Upload",
    description: "Municipalities where we only accept manual uploads",
    commonUrls: [],
    marketShare: "~10%",
  },
};
