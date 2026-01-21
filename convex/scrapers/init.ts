"use node";

import { registerScraper } from "./registry";
import { granicusScraper } from "./granicus";
import { genericScraper } from "./generic";

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
