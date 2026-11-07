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

`build` also typechecks. The bounded smoke starts the actual built Worker against a fresh local D1/R2 state directory, exercises sign-up, sessions, sign-in/out, coverage, subscriptions, TXT/DOCX upload, HTML scraping, PDF extraction, cron processing and signed Stripe test-webhook state changes, then removes its own fixtures. The migration smoke compiles and imports every app entity type, account mappings and referenced/unreferenced blobs into real local D1/R2 and checks ownership and checksums.

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

Existing sessions and password hashes are not copied. Imported accounts require a password-reset email before their first native sign-in. Recovery delivery must be proven before cutover. The compiler refuses missing/ambiguous identities, unverified primary emails, blocked/locked/MFA accounts or incomplete security metadata, unknown entity fields/tables, dangling references and missing blobs rather than dropping them. Whether live accounts use social-only, phone-only or MFA sign-in is **unmeasured**: audit the owner export and add the required native sign-in/migration support before moving any affected account. No such account is silently downgraded by this tool.

## Live cutover needs a separate approval

- Provision isolated resources with Alchemy only after approval; this errand does not run it. `pnpm infra:staging` requires staging settings and rejects other stages/live Stripe keys. It defines no public preview URL or production DNS. D1/R2 destruction is disabled.
- Supply a stable app origin, a fresh Better Auth secret, the intended verified administrator, test billing settings and dedicated least-privilege sender credentials. Never bind the infrastructure deployment token as the mail sender token.
- Rehearse the snapshot and blob migration on an empty staging target; production record counts, data sizes, source platform availability and runtime timings are **unmeasured** here.
- Prove password recovery/verification, any actually used social/MFA paths, test checkout/portal, AI summaries and mail delivery on approved private staging. Local checks deliberately do not spend money or contact recipients.
- Decide a write-freeze window, take a final consistent snapshot, revalidate the new data and ownership, then separately approve routing changes, webhook changes and scheduler handoff. Do not run both systems' mail/scrape schedulers concurrently. Keep the old deployments/data intact for rollback; reconciling any post-cutover writes is required before rolling back routing.
- Production billing is deliberately unavailable in this PR. A separately approved change must enable live credentials/events and prove real entitlement mapping before a live billing cutover.

## Differences and verification limits

D1 does not provide the former reactive subscriptions. The client invalidates reads after successful commands and refreshes active reads every 15 seconds; caches are scoped to the signed-in account. SQL writes and scheduled jobs share one guarded D1 batch, so stale concurrent mutations retry without leaving partial records/outbox entries.

Native `sharp` image conversion cannot run inside a Worker. OCR now uses documented raw-PDF input and the Cloudflare AI parser via [OpenRouter's PDF API](https://openrouter.ai/docs/guides/overview/multimodal/pdfs), not a fake fallback. Text PDF, TXT and DOCX extraction are Worker-compatible; paid OCR/model execution was not run. Stripe remains the payment service; the model gateway remains external. There is no claim that those external services were replaced by D1.

Bulk discovery/probing, summary batches and digest delivery fan out into bounded jobs rather than sleeping through one long Worker invocation. Cron handlers retain the enabled daily/weekly/immediate schedules; previously disabled scrape-all/cleanup schedules remain disabled. The queue retains failed attempts for inspection.

Exercised: local build/typecheck, Worker/D1/R2 workflow and snapshot/blob migration. Browser interaction, external checkout/portal, outbound mail, paid model/OCR calls, remote Alchemy application, production migration and live cutover: **not run**. UI appearance and production performance remain unmeasured. Independent review belongs to the pull request; it was not represented as completed by this sprite.
