import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";

const client = new ConvexHttpClient(process.env.VITE_CONVEX_URL);

const results = await client.query(api.functions.municipalities.queries.search, {
  query: "coventry",
});
const coventry = results.find(m => m.state === "Connecticut" && m.name === "Coventry");
if (!coventry) { console.log("Coventry not found"); process.exit(1); }
console.log(`Found: ${coventry.name}, ${coventry.state} (${coventry._id})`);

// Check current status counts
for (const status of ["summarized", "pending", "processing", "failed"]) {
  const result = await client.query(api.functions.meetings.queries.listByMunicipality, {
    municipalityId: coventry._id,
    status,
    limit: 200,
  });
  if (result.meetings.length > 0) {
    console.log(`  ${status}: ${result.meetings.length}`);
  }
}

// Requeue summarized meetings back to pending (limit to 3 for testing)
const summarized = await client.query(api.functions.meetings.queries.listByMunicipality, {
  municipalityId: coventry._id,
  status: "summarized",
  limit: 3,
});

if (summarized.meetings.length === 0) {
  console.log("\nNo summarized meetings to requeue.");
  process.exit(0);
}

console.log(`\nRequeuing ${summarized.meetings.length} summarized meetings to pending...`);
for (const m of summarized.meetings) {
  console.log(`  ${m._id}: ${m.title}`);
  await client.mutation(api.functions.meetings.mutations.updateStatus, {
    meetingId: m._id,
    status: "pending",
  });
}
console.log("Done. Meetings will be picked up by processPendingMeetings.");
