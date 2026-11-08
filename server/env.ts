import { env as bindings } from "cloudflare:workers";
export interface Bindings {
	DB: D1Database;
	DOCUMENTS: R2Bucket;
	APP_URL: string;
	BETTER_AUTH_SECRET: string;
	OPENROUTER_API_KEY?: string;
	STRIPE_SECRET_KEY?: string;
	STRIPE_PRO_PRICE_ID?: string;
	STRIPE_WEBHOOK_SECRET?: string;
	EMAIL_API_TOKEN?: string;
	EMAIL_ACCOUNT_ID?: string;
	EMAIL_FROM_ADDRESS?: string;
	DEPLOYMENT_STAGE?: "staging";
	STAGING_MAIL_TO?: string;
	ADMIN_EMAIL?: string;
	OUTBOUND_ENABLED?: string;
	SCHEDULED_ENABLED?: string;
}
export const env = bindings as unknown as Bindings;
