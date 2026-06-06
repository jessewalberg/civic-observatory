// Convex ⇄ Clerk trust (WorkOS→Clerk migration plan §2.1). Inert until the
// CLERK_JWT_ISSUER_DOMAIN deployment env var is set AND the Clerk instance has
// a JWT template named "convex" — until then no Clerk JWTs validate and
// ctx.auth.getUserIdentity() stays null (legacy WorkOS mode).
export default {
	providers: [
		{
			domain: process.env.CLERK_JWT_ISSUER_DOMAIN,
			applicationID: "convex",
		},
	],
};
