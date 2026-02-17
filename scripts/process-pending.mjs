import { ConvexHttpClient } from "convex/browser";
import { api, internal } from "../convex/_generated/api.js";

const client = new ConvexHttpClient(process.env.VITE_CONVEX_URL);

// We can't call internal actions from the HTTP client.
// Instead, check if there's a public action or use the admin UI.
// For now, let's just call retryFailedMeeting one at a time.

const results = await client.query(api.functions.municipalities.queries.search, {
  query: "coventry",
});
const coventry = results.find(m => m.state === "CT");

const pending = await client.query(api.functions.meetings.queries.listByMunicipality, {
  municipalityId: coventry._id,
  status: "pending",
  limit: 5,
});

console.log(`Pending meetings: ${pending.meetings.length}`);

if (pending.meetings.length > 0) {
  console.log("First pending meeting:", pending.meetings[0]._id, pending.meetings[0].title);
  console.log("\nTo process, use the Convex dashboard to run:");
  console.log(`  functions.ai.summarize.processPendingMeetings({ limit: 5 })`);
  console.log("\nOr trigger via admin UI scrapers page.");
}
