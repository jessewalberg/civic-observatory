"use node";

import { genericScraper } from "./generic";
import { granicusScraper } from "./granicus";
import { registerScraper } from "./registry";

// ═══════════════════════════════════════════════════════════════
// SCRAPER INITIALIZATION
// Register all platform scrapers
// This file should be imported by scraper actions
// ═══════════════════════════════════════════════════════════════

let initialized = false;

export function initializeScrapers(): void {
	if (initialized) return;

	// Register platform scrapers
	registerScraper(granicusScraper);
	// registerScraper(civicPlusScraper); // TODO: Implement CivicPlus scraper
	registerScraper(genericScraper); // Fallback for custom sites

	initialized = true;
}

// Auto-initialize when imported
initializeScrapers();
