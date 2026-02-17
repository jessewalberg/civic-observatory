import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";

const client = new ConvexHttpClient(process.env.VITE_CONVEX_URL);

const results = await client.query(api.functions.municipalities.queries.search, {
  query: "coventry",
});
const coventry = results.find(m => m.state === "CT");

const failed = await client.query(api.functions.meetings.queries.listByMunicipality, {
  municipalityId: coventry._id,
  status: "failed",
  limit: 2,
});

console.log(`Requeuing ${failed.meetings.length} meetings...`);
for (const m of failed.meetings) {
  console.log(`  ${m._id}: ${m.title}`);
  await client.mutation(api.functions.meetings.mutations.updateStatus, {
    meetingId: m._id,
    status: "pending",
  });
}
console.log("Done. Check Convex dashboard logs for [hydrate] and [extractTextFromPdf] output.");
