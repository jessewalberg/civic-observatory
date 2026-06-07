import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";

// Checks whether Coventry's state is the mis-stored "CT" and, if so, prints how
// to patch it. fixState is admin-gated via the Clerk identity in ctx.auth, so it
// cannot be invoked from this unauthenticated node script — run it from the
// Convex dashboard (or the in-app admin page) signed in as an admin.

const client = new ConvexHttpClient(process.env.VITE_CONVEX_URL);

const results = await client.query(api.functions.municipalities.queries.search, {
  query: "coventry",
});
const coventry = results.find((m) => m.state === "CT");
if (!coventry) {
  console.log("No Coventry with state='CT' found — already fixed or doesn't exist.");
  process.exit(0);
}

console.log(`Found: ${coventry.name}, state="${coventry.state}" (id: ${coventry._id})`);
console.log("\nPatch state to 'Connecticut' (signed in as an admin):");
console.log("  Convex dashboard → functions/municipalities/mutations:fixState");
console.log(`  Args: { "id": "${coventry._id}", "state": "Connecticut" }`);
