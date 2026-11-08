# Agent development instructions

Read `README.md` and `ARCHITECTURE.md` before changing application behavior.

## Standing decisions carried by this migration

- Jesse, 2026-10-09: no unit tests. Do not create, run, maintain, restore, request or delegate unit tests, including through gates, CI or review. Remove obsolete unit-test dependencies and instructions when touching an affected surface.
- Jesse, 2026-11-07: migrate off Convex and Clerk; use Alchemy, Effect, Better Auth and Cloudflare D1. Keep sign-in, billing, uploads, scraping and scheduled processing functional.
- Jesse, LIFE-288, 2026-11-07: Effect at the server edges is sufficient now; convert handlers later as they are touched. Do not require a wholesale handler rewrite for this migration.
- This errand is not a production cutover. No production DNS, remote data writes, provider deployment deletion, spending, public posting or live Stripe activity. A merge must not deploy.

## Implementation contracts

Use native Effect procedures under `server/functions/`, the D1 schema/model and existing domain helpers. Do not restore old provider APIs, aliases, token bridges, generated clients or compatibility routes. Generate typed references with `pnpm generate` after procedure changes.

Resolve the actor from the server session. Never accept a client-supplied identity, role or billing tier as authority. Keep internal handlers unreachable over HTTP, validate cross-entity IDs, and preserve publication visibility and account ownership. Never log export records, credentials, cookies, verification links or password-reset tokens.

Maintain the guarded D1 batch/outbox boundary. A write must not leave partial records or jobs behind. External requests belong in tasks, not retryable write procedures. Keep long batch work split into bounded jobs and preserve delivery reservations.

Use only local D1/R2 fixtures for routine validation. `pnpm build`, `pnpm lint`, `pnpm smoke:local` and `pnpm smoke:migration` are the intended checks. They do not require provider credentials, production access or unit suites. Record omitted browser, external-service and deployment checks as not run; request independent review through the pull request, without adding unit-test gates.

Do not run Alchemy application/destruction, remote Wrangler commands, source exports or secret resolution merely to inspect the code. Keep private exports and migration outputs in ignored directories. Use the offline compiler and local checksum rehearsal described in `README.md`; any live routing, scheduler, billing or authentication handoff needs a separate owner-approved plan.
