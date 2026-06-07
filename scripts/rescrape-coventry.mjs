import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";

// Locates the Coventry, CT municipality and prints how to trigger a re-scrape.
// triggerScrape is an admin action authorized via the Clerk identity in
// ctx.auth, so it cannot be invoked from this unauthenticated node script —
// run it from the Convex dashboard (or the in-app admin scrapers page) instead.

const client = new ConvexHttpClient(process.env.VITE_CONVEX_URL);

const results = await client.query(api.functions.municipalities.queries.search, {
  query: "coventry",
});
const coventry = results.find(
  (m) => m.state === "Connecticut" && m.name === "Coventry",
);
if (!coventry) {
  console.log("Not found");
  process.exit(1);
}

console.log(`Coventry, CT — ${coventry._id}`);
console.log(`Meetings URL: ${coventry.meetingsPageUrl}`);
console.log("\nTrigger a re-scrape (signed in as an admin):");
console.log("  • App: /admin/scrapers → Trigger scrape for this municipality");
console.log("  • Convex dashboard → functions/scrapeJobs/mutations:triggerScrape");
console.log(`    Args: { "municipalityId": "${coventry._id}" }`);
