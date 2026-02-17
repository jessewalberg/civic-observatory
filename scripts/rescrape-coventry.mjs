import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";

const client = new ConvexHttpClient(process.env.VITE_CONVEX_URL);

const results = await client.query(api.functions.municipalities.queries.search, {
  query: "coventry",
});
const coventry = results.find(m => m.state === "Connecticut" && m.name === "Coventry");
if (!coventry) { console.log("Not found"); process.exit(1); }

console.log(`Triggering scrape for ${coventry.name}, ${coventry.state} (${coventry._id})...`);
console.log(`URL: ${coventry.meetingsPageUrl}`);

// Use the public triggerScrape action (requires admin workosUserId)
const workosUserId = process.env.WORKOS_ADMIN_USER_ID;
if (!workosUserId) {
  console.log("Set WORKOS_ADMIN_USER_ID env var to your admin WorkOS user ID");
  console.log("\nAlternatively, trigger from the Convex dashboard:");
  console.log(`  Function: functions/scrapers/actions:runScraper`);
  console.log(`  Args: { municipalityId: "${coventry._id}", triggeredBy: "manual" }`);
  process.exit(1);
}

const result = await client.action(api.functions.scrapeJobs.mutations.triggerScrape, {
  municipalityId: coventry._id,
  workosUserId,
});
console.log("Result:", result);
