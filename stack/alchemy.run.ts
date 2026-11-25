import * as Cloudflare from "@alchemy.run/cloudflare";
import * as Alchemy from "alchemy";
import { Stage } from "alchemy/Stage";
import { Effect } from "effect";
import { readInfrastructure } from "./scripts/infra";
import { CALLS } from "./src/lib/limits";
import { ORIGIN, RECORDS, WORKERS } from "./src/lib/site";

// Two stages (README.md, "Stages and release"). Validate before constructing
// providers or state: even `plan` can bootstrap remotely. Whatever command loads
// this file, readInfrastructure() refuses an apply (anything but `plan`) from a
// dirty tree or with APP_RELEASE other than HEAD, refuses destroy, and refuses a
// production apply outside production.yml's job, so calling Alchemy's CLI
// directly is no way around scripts/infra.ts.
const infrastructure = readInfrastructure();

export default Alchemy.Stack(
	"civic-docket",
	{ providers: Cloudflare.providers(), state: Cloudflare.state() },
	Effect.gen(function* () {
		const stage = yield* Stage;
		if (stage !== infrastructure.stage)
			return yield* Effect.die(
				new Error(
					"CLI stage must match ALCHEMY_STAGE; use the guarded infrastructure commands.",
				),
			);
		const production = infrastructure.stage === "production";
		// Stable logical IDs, the same in both stages. Production's data outlives any
		// edit of this file: the release applies unattended, and Alchemy's default
		// deletes a renamed, replaced or dropped database. Retained, it is forgotten
		// and left in place.
		const database = yield* Cloudflare.D1.Database("Database", {
			migrations: "./migrations",
		}).pipe(Alchemy.RemovalPolicy.retain(production));
		// Each stage mints its own once and keeps it in Alchemy's encrypted state:
		// never in a file or in another stage. 32 bytes, as 64 characters.
		const clientKey = yield* Alchemy.Random("SignupClientKey", { bytes: 32 });
		// The preview's workers.dev and version preview URLs sit behind Cloudflare
		// Access, admitting only this stage's verifier service token: no person, no
		// `everyone`, no bypass. Production is public and has no Access.
		const verifier = production
			? undefined
			: yield* Cloudflare.Access.ServiceToken("Verifier", {
					name: "civic-docket-preview-verifier",
					duration: "8760h",
				});
		// One data point for each request; no URL, query, address or identity.
		const requestRecords = yield* Cloudflare.AnalyticsEngine.Dataset(
			"RequestRecords",
			{ dataset: RECORDS },
		);
		yield* Cloudflare.Website.Vite("Website", {
			// Our entry wraps TanStack Start's handler in the request boundary.
			main: "./src/server.ts",
			// A fixed name keeps the hostnames known before the first deploy.
			name: WORKERS[infrastructure.stage],
			// ---- preview only ----
			...(verifier
				? {
						access: {
							name: `${WORKERS.preview} (systems only)`,
							policies: [
								{
									decision: "non_identity" as const,
									include: [{ serviceToken: verifier.serviceTokenId }],
								},
							],
							sessionDuration: "1h",
							previews: true,
						},
					}
				: {}),
			// ---- production only ----
			// Production serves only on its custom domain. The first cutover's apply
			// leaves custom domains alone and the Worker is checked on workers.dev,
			// because the old Worker still holds the hostname and Alchemy refuses to
			// take it; production.yml moves it and applies again with it declared.
			...(production
				? infrastructure.productionDomain === "unmanaged"
					? { workersDev: { enabled: true, previewsEnabled: false } }
					: { domain: new URL(ORIGIN).hostname, workersDev: false }
				: {}),
			// As wrangler.jsonc, which the checks run with; check:guard compares them.
			compatibility: { date: "2026-01-14", flags: ["nodejs_compat"] },
			// No invocation logs: they hold every URL and the caller's address. What
			// is kept is src/server/observability.ts's own records.
			observability: {
				enabled: true,
				headSamplingRate: 1,
				logs: {
					enabled: true,
					headSamplingRate: 1,
					persist: true,
					invocationLogs: false,
				},
				issues: { enabled: true },
				traces: { enabled: false },
			},
			// Static files otherwise answer before the Worker, robots.txt too.
			assets: { runWorkerFirst: ["/robots.txt"] },
			env: {
				APP_ENV: stage,
				// Changes on every release, so every apply uploads its commit.
				APP_RELEASE: infrastructure.release,
				DB: database,
				REQUEST_RECORDS: requestRecords,
				SIGNUP_CLIENT_KEY: clientKey.text,
				[CALLS.binding]: Cloudflare.RateLimit(CALLS.binding, {
					namespaceId: CALLS.namespace[infrastructure.stage],
					simple: { limit: CALLS.calls, period: CALLS.period },
				}),
			},
		});
		// Alchemy prints what is returned here, and a release's output is public: no
		// ID, no address.
		return { environment: stage, release: infrastructure.release };
	}),
);
