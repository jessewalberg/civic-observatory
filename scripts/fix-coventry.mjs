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

// fixState is admin-gated (Clerk migration Phase 2). This one-off maintenance
// script runs unauthenticated (ConvexHttpClient, no session), so it uses the
// legacy no-identity admin path: pass an admin's WorkOS user id via env.
const adminWorkosUserId = process.env.ADMIN_WORKOS_USER_ID;
if (!adminWorkosUserId) {
  console.error("Set ADMIN_WORKOS_USER_ID (a current admin's WorkOS id) to run this.");
  process.exit(1);
}
await client.mutation(api.functions.municipalities.mutations.fixState, {
  id: coventry._id,
  state: "Connecticut",
  requestingWorkosUserId: adminWorkosUserId,
});

console.log("Done. Coventry is now 'Connecticut'.");
