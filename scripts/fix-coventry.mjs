import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";

const client = new ConvexHttpClient(process.env.VITE_CONVEX_URL);

const results = await client.query(api.functions.municipalities.queries.search, {
  query: "coventry",
});

const coventry = results.find(m => m.state === "CT");
if (!coventry) {
  console.log("No Coventry with state='CT' found — already fixed or doesn't exist.");
  process.exit(0);
}

console.log(`Found: ${coventry.name}, state="${coventry.state}" (id: ${coventry._id})`);
console.log("Patching state to 'Connecticut'...");

// Use the internal seed mutation to patch directly (no admin auth needed)
await client.mutation(api.functions.municipalities.mutations.fixState, {
  id: coventry._id,
  state: "Connecticut",
});

console.log("Done. Coventry is now 'Connecticut'.");
