import type { AuthConfig } from "convex/server";

const clerkJwtIssuerDomain =
	process.env.CLERK_JWT_ISSUER_DOMAIN ??
	"https://missing-clerk-jwt-issuer.invalid";

// Convex ⇄ Clerk trust. Requires the CLERK_JWT_ISSUER_DOMAIN deployment env var
// set AND a Clerk JWT template named "convex"; until both exist no Clerk JWTs
// validate and ctx.auth.getUserIdentity() returns null (so identity-gated
// functions deny). The placeholder issuer is intentionally non-real so missing
// configuration fails closed. Clerk is the only auth provider (WorkOS removed
// in Phase 6).
export default {
	providers: [
		{
			domain: clerkJwtIssuerDomain,
			applicationID: "convex",
		},
	],
} satisfies AuthConfig;
