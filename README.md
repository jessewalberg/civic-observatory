# Civic Observatory

Municipal meeting discovery, source-backed summaries, subscriptions and alerts.

## Stack

| Surface | Implementation |
| --- | --- |
| Application | TanStack Start on Cloudflare Workers |
| Infrastructure | Alchemy, isolated staging resources only |
| Server | Effect procedures and typed same-origin requests |
| Data | D1, indexed JSON entity records and FTS5 |
| Sign-in | Better Auth with D1 sessions and email/password |
| Documents | Private R2 binding |
| Scheduled work | Worker cron triggers and a transactional D1 job outbox |
| Billing | Stripe **test mode only** |
| Summarization / mail | Existing OpenRouter model and Cloudflare Email Sending integrations; disabled by default |

No production deployment, DNS route, remote data write, or provider deletion is performed by this change. Merging runs local verification, not deployment. The existing live installations remain untouched.

## Local development

Use Node 24+, pnpm 9.15.9 and Bun 1.4.4.

```sh
SHARP_IGNORE_GLOBAL_LIBVIPS=1 pnpm install --frozen-lockfile
node scripts/local-env.mjs
pnpm db:local
pnpm dev
```

The install flag selects prebuilt binaries for the retained offline brand-asset generator instead of compiling against host libvips; Worker PDF/OCR code does not use it. The setup helper creates ignored local signing settings, not provider credentials. `wrangler.jsonc` contains local D1/R2 bindings and no production routes. Never resolve production secret references for a local run.

```sh
pnpm build
pnpm lint
pnpm smoke:local
pnpm smoke:migration
```

`build` also typechecks. The bounded smoke starts the actual built Worker against fresh local D1/R2, exercises sign-up, sessions, recovery/verification, coverage, subscriptions, uploads, scraping, PDF extraction, scheduled processing, a killed/restarted Worker, stale-write rollback, concurrent public reads/webhooks and Stripe replay protection. Its network-boundary fixtures intercept public source/DNS and mail-provider traffic; unlisted requests fail closed. There is no production localhost bypass, model call or real message delivery. It removes its own state afterward. The migration smoke imports every entity type, `_tables` export metadata, Clerk and WorkOS-only identity cases, explicit activation maps and referenced/orphan blobs into real local D1/R2, checking ownership and checksums.

No unit tests: do not create, run, maintain or reintroduce them in errands, gates, CI or review (Jesse, 2026-10-09). Use real-surface reproductions, integration/end-to-end checks and build/type/lint checks. CI has no deployment credentials or remote deployment step.

## Existing data migration

The compiler is offline and never fetches credentials or writes to any deployment.

1. The owner supplies a consistent Convex snapshot including file storage and a complete Clerk users JSON export, including verified primary emails and banned/locked/MFA flags. A dashboard CSV alone is insufficient to prove account security state. Keep both under ignored `migration-private/`; never commit, print or post their contents. Export instructions: [Convex export](https://docs.convex.dev/cli/reference/export), [Better Auth's Clerk migration guide](https://better-auth.com/docs/guides/clerk-migration-guide).
2. Unpack the snapshot, retaining each `<table>/documents.jsonl` and `_storage/` directory. Compile it:

   ```sh
   pnpm import:export --snapshot migration-private/snapshot --clerk-users migration-private/clerk-users.json --output migration-private/compiled
   ```

3. Review the private `counts.json`, then apply the SQL only to a new, empty, isolated local database for rehearsal:

   ```sh
   pnpm exec wrangler d1 migrations apply DB --local --persist-to .wrangler/import-state
   pnpm exec wrangler d1 execute DB --local --persist-to .wrangler/import-state --file migration-private/compiled/data.sql
   node scripts/import-blobs.mjs --manifest migration-private/compiled/blobs.json --persist-to .wrangler/import-state --local
   ```

4. Compare source/import counts, relationship integrity, canonical meeting/municipality URLs, account ownership, paid tiers/admin roles, and every blob checksum. Interrupted imports must be investigated on the isolated target; do not reapply to a populated database.

IDs, creation times, slugs, relationships, preferences, delivery state and billing identifiers are preserved. Provider subjects become owner-verified Better Auth identity mappings, never client-controlled claim-by-email. Existing live billing identifiers are marked `live` and cannot be used or overwritten by test checkout. All storage objects are retained; unattributed orphan objects stay private with no invented owner.

The reserved `_tables` directory is export metadata, not an unknown app table. WorkOS-only or providerless app rows are preserved with their roles, tiers, references and private documents, but remain unlinked: an email match never transfers access. Review private `activation-required.json` and `counts.json.pendingAccounts`. To activate a legacy row, the owner supplies `--identity-map migration-private/identity-map.json`, an array of `{ "appUserId": "<existing row ID>", "clerkUserId": "<verified exported target subject>" }` after verifying ownership. Both the explicit map and the verified provider export are required; blocked/MFA accounts cannot bypass security checks through a map. Recompile from the original snapshot into a new output and empty isolated database. Add `--require-complete-identities` for the final cutover compilation: it refuses any pending activation before producing output. Unmapped document ownership remains a non-login pending principal, never another resident's account.

Existing sessions and password hashes are not copied. Imported accounts require a password-reset email before their first native sign-in. Real recovery delivery must be proven before cutover; an HTTP 200 alone is not proof because Better Auth deliberately hides account/delivery status. The compiler rejects ambiguous mappings, unverified provider primary emails, blocked/locked/MFA accounts or incomplete security metadata, unknown app fields/tables, dangling references and missing blobs rather than dropping them. Whether live accounts use social-only, phone-only or MFA sign-in is **unmeasured**: audit the owner export and preserve those sign-in/security requirements before moving affected accounts.

## Live cutover needs a separate approval

- Provision isolated resources with Alchemy only after approval; this errand does not run it. `pnpm infra:staging` enables only `civic-observatory-stack-staging.<account-subdomain>.workers.dev`, using [Alchemy's Worker URL setting](https://v1.alchemy.run/providers/cloudflare/worker). It rejects other stages, non-staging origins and live Stripe keys. There are no production DNS routes/domains; D1/R2 destruction is disabled.
- Supply `APP_URL` as that exact HTTPS staging origin, a fresh `BETTER_AUTH_SECRET` of at least 32 characters, dedicated least-privilege `EMAIL_API_TOKEN`, `EMAIL_ACCOUNT_ID`, verified `EMAIL_FROM_ADDRESS`, and Jesse-approved `STAGING_MAIL_TO`. Optional Stripe key/webhook/price settings must be test-mode. The test recipient is the staging administrator address; native verification still precedes admin bootstrap. Never use the infrastructure token for mail. Staging enables outbound transport for the recovery rehearsal but has no model key, rejects mail to every other recipient, and keeps all scheduled work disabled.
- Rehearse the snapshot and blob migration on an empty staging target; production record counts, data sizes, source platform availability and runtime timings are **unmeasured** here.
- On the approved isolated staging URL, request a reset for the approved test account, observe the provider's accepted delivery and inbox receipt, follow the link back to that exact staging origin, reset the password and sign in. Prove verification, required social/MFA paths and test checkout/portal too. Paid model/OCR verification needs separate approval and configuration; it is not enabled by staging setup. Local transport fixtures deliberately send no messages and are not evidence of remote delivery.
- Decide a write-freeze window, take a final consistent snapshot, revalidate the new data and ownership, then separately approve routing changes, webhook changes and scheduler handoff. Do not run both systems' mail/scrape schedulers concurrently. Keep the old deployments/data intact for rollback; reconciling any post-cutover writes is required before rolling back routing.
- Production billing is deliberately unavailable in this PR. A separately approved change must enable live credentials/events and prove real entitlement mapping before a live billing cutover.

## Differences and verification limits

D1 does not provide the former reactive subscriptions. The client invalidates reads after successful commands and refreshes active reads every 15 seconds; caches are scoped to the signed-in account. SQL writes and scheduled jobs share one guarded D1 batch, so stale concurrent mutations retry without leaving partial records/outbox entries.

Native `sharp` image conversion cannot run inside a Worker. OCR now uses documented raw-PDF input and the Cloudflare AI parser via [OpenRouter's PDF API](https://openrouter.ai/docs/guides/overview/multimodal/pdfs), not a fake fallback. Text PDF, TXT and DOCX extraction are Worker-compatible; paid OCR/model execution was not run. Stripe remains the payment service; the model gateway remains external. There is no claim that those external services were replaced by D1.

Bulk discovery/probing, summary batches and digest delivery fan out into bounded jobs. Each cron claims only the job it executes, with a fenced claim and a 20-minute lease exceeding the platform's [15-minute scheduled invocation limit](https://developers.cloudflare.com/workers/platform/limits/#duration). Failed results record their sanitized real errors; killed runs become interrupted rather than automatically running again. `/admin/jobs` shows failures, exhausted migrated jobs and attempt history. Retry requires explicit external-effect reconciliation and a note, including after five attempts. This deliberately trades automatic retry availability for avoiding ambiguous paid/delivery replays; the provider may have accepted work before a crash. Completed records also preserve cron-event deduplication. Previous disabled scrape/cleanup schedules remain disabled.

Collection-scoped SQL guards protect only a writer's read set; public reads never consult a global write counter, and unrelated collection changes do not abort a write. Same-collection stale writes still roll back records, receipts and jobs atomically; only write procedures retry, never whole external-side-effect tasks. Stripe event IDs and entitlement changes commit together: replays cannot revive cancelled access and failed application is still retryable.

All untrusted source requests obey `OUTBOUND_ENABLED`, allow HTTP(S) public addresses on standard ports only, validate IPv4/IPv6 and fresh DNS answers, and follow at most five redirects with the same checks at every hop. Keep public Cloudflare fetch egress: do not attach private/VPC outbound networking to the source-fetch path. The local fixture intercepts public hostnames at the runtime boundary; production has no localhost exception.

Exercised: build, typecheck, lint, built Worker sign-in/admin HTML, native D1/R2 end-to-end workflows including real Worker kill/restart, local recovery/verification transport, concurrent scraping/webhooks, replay protection and snapshot/blob migration. Unit tests, browser interaction, external checkout/portal, real mail delivery, paid model/OCR calls, remote Alchemy deployment/reachability, production migration and live cutover: **not run**. UI appearance and production performance remain unmeasured. The supplied code-only review's five blockers were reproduced locally before repair; a second independent review was not run.
