import alchemy from "alchemy";
import { D1Database, R2Bucket, TanStackStart } from "alchemy/cloudflare";

// This program has no production stage, DNS routes, or public preview URL.
if (process.env.ALCHEMY_STAGE !== "staging")
	throw new Error("Only the explicitly selected staging stage is allowed");
if (!process.env.APP_URL || !process.env.BETTER_AUTH_SECRET)
	throw new Error("Staging requires APP_URL and BETTER_AUTH_SECRET");
if (
	process.env.STRIPE_SECRET_KEY &&
	!/^(sk|rk)_test_/.test(process.env.STRIPE_SECRET_KEY)
)
	throw new Error("Only Stripe test keys are allowed");
const app = await alchemy("civic-observatory-stack", { stage: "staging" });
const database = await D1Database("data", {
	name: "civic-observatory-stack-staging",
	migrationsDir: "./migrations",
	delete: false,
});
const documents = await R2Bucket("documents", {
	name: "civic-observatory-stack-staging-documents",
	delete: false,
	devDomain: false,
});
await TanStackStart("app", {
	name: "civic-observatory-stack-staging",
	url: false,
	build: "bun run build",
	wrangler: { main: "src/server.ts" },
	bindings: {
		DB: database,
		DOCUMENTS: documents,
		APP_URL: process.env.APP_URL,
		BETTER_AUTH_SECRET: alchemy.secret(process.env.BETTER_AUTH_SECRET),
		OUTBOUND_ENABLED: "false",
		SCHEDULED_ENABLED: "false",
		...(process.env.STRIPE_SECRET_KEY
			? { STRIPE_SECRET_KEY: alchemy.secret(process.env.STRIPE_SECRET_KEY) }
			: {}),
		...(process.env.STRIPE_WEBHOOK_SECRET
			? {
					STRIPE_WEBHOOK_SECRET: alchemy.secret(
						process.env.STRIPE_WEBHOOK_SECRET,
					),
				}
			: {}),
		...(process.env.STRIPE_PRO_PRICE_ID
			? { STRIPE_PRO_PRICE_ID: process.env.STRIPE_PRO_PRICE_ID }
			: {}),
	},
	crons: ["* * * * *", "*/5 * * * *", "0 7 * * *", "0 8 * * *", "0 8 * * 1"],
});
await app.finalize();
