import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";

const client = new ConvexHttpClient(process.env.VITE_CONVEX_URL);

const results = await client.query(api.functions.municipalities.queries.search, {
  query: "coventry",
});
const coventry = results.find(m => m.state === "CT");
console.log(`Municipality: ${coventry.name}, ${coventry.state}`);

for (const status of ["pending", "processing", "summarized", "failed"]) {
  const result = await client.query(api.functions.meetings.queries.listByMunicipality, {
    municipalityId: coventry._id,
    status,
    limit: 200,
  });
  if (result.meetings.length > 0) {
    console.log(`${status}: ${result.meetings.length}`);
    if (status === "failed") {
      const errorGroups = {};
      for (const m of result.meetings) {
        const err = m.processingError || "no error";
        errorGroups[err] = (errorGroups[err] || 0) + 1;
      }
      for (const [err, count] of Object.entries(errorGroups)) {
        console.log(`  ${count}x: ${err}`);
      }
    }
  }
}

const doApply = process.argv.includes("--apply");
if (doApply) {
  const failed = await client.query(api.functions.meetings.queries.listByMunicipality, {
    municipalityId: coventry._id,
    status: "failed",
    limit: 200,
  });
  let queued = 0;
  for (const m of failed.meetings) {
    await client.mutation(api.functions.meetings.mutations.updateStatus, {
      meetingId: m._id,
      status: "pending",
    });
    queued++;
  }
  console.log(`\nRequeued ${queued} failed meetings.`);
}
