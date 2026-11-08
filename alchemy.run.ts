import alchemy from "alchemy";
import { D1Database, R2Bucket, TanStackStart } from "alchemy/cloudflare";

// Reachable workers.dev staging only. No production stage, DNS routes or domains.
if (process.env.ALCHEMY_STAGE !== "staging")
	throw new Error("Only the explicitly selected staging stage is allowed");
const required = (key: string): string => {
	const value = process.env[key];
	if (!value) throw new Error(`Staging requires ${key}`);
	return value;
};
const appUrl = required("APP_URL");
if (
	!/^https:\/\/civic-observatory-stack-staging\.[a-z0-9-]+\.workers\.dev$/.test(
		appUrl,
	)
)
	throw new Error(
		"APP_URL must be this staging Worker's exact workers.dev origin",
	);
const authSecret = required("BETTER_AUTH_SECRET");
if (authSecret.length < 32)
	throw new Error("BETTER_AUTH_SECRET must contain at least 32 characters");
const emailToken = required("EMAIL_API_TOKEN");
const emailAccount = required("EMAIL_ACCOUNT_ID");
const emailFrom = required("EMAIL_FROM_ADDRESS");
const testRecipient = required("STAGING_MAIL_TO").toLowerCase();
if (
	!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(emailFrom) ||
	!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(testRecipient)
)
	throw new Error(
		"Staging requires valid verified sender and approved test recipient addresses",
	);
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
	url: true,
	build: "bun run build",
	wrangler: { main: "src/server.ts" },
	bindings: {
		DB: database,
		DOCUMENTS: documents,
		APP_URL: appUrl,
		BETTER_AUTH_SECRET: alchemy.secret(authSecret),
		DEPLOYMENT_STAGE: "staging",
		EMAIL_API_TOKEN: alchemy.secret(emailToken),
		EMAIL_ACCOUNT_ID: emailAccount,
		EMAIL_FROM_ADDRESS: emailFrom,
		STAGING_MAIL_TO: testRecipient,
		ADMIN_EMAIL: testRecipient,
		OUTBOUND_ENABLED: "true",
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
