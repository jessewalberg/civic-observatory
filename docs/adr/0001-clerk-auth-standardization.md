# ADR-0001 — Clerk replaces hand-rolled WorkOS AuthKit (with a Convex identity bridge)

- **Status:** accepted
- **Date:** 2026-06-02 (planned) · shipped 2026-06 (PRs #1–#14 merged to `main`)
- **Owner:** jesse
- **Area:** auth / security
- **Confidence:** high
- **Supersedes:** the hand-rolled WorkOS AuthKit SSR implementation (`src/authkit/`)
- **Review by:** 2026-12-02
- **Sources:** `docs/plans/2026-06-02-civic-pulse-workos-to-clerk.md` (the realized migration plan, now
  superseded by this ADR); `convex/auth.config.ts`; `@clerk/*` deps in `package.json`; secretkit
  `docs/STANDARDIZATION.md` (Wave 3); portfolio auth invariant INV-4 (`~/.ai/REVIEW-INVARIANTS.md`)

## Decision

Adopt **Clerk** as civic-observatory's auth provider, replacing the hand-rolled
**WorkOS AuthKit SSR** implementation, and put a real **Convex identity bridge**
(`convex/auth.config.ts` + `ctx.auth`) in front of every privileged Convex
function. Identity is **create-only**: first Clerk login makes a fresh app-user
keyed by the Clerk `userId`; WorkOS-era account history is **not** remapped
(owner-confirmed 2026-06-06).

## Update — 2026-06-22 public route provider boundary

Clerk remains the only authenticated identity path, but it is no longer mounted
around every route. Signed-out public/SEO routes use a plain Convex provider and
explicit signed-out UI fallbacks so they can query public data without eagerly
requesting Clerk UI bundles. ClerkProvider + ConvexProviderWithClerk now mount
only for sign-in/sign-up and protected dashboard/admin routes; authenticated
public-page affordances live in lazy auth islands or route through sign-in.

## Context

This was as much a **security fix** as an auth swap. Pre-migration, the Convex
backend had **no `ctx.auth` and no `convex/auth.config.ts`** — authorization
trusted a **client-supplied `workosUserId`** string passed as an argument into
every privileged function (including admin mutations), so any client could
impersonate any user/admin. A `upsertOnLogin` email-write path additionally
exposed a row-takeover (pro/admin) primitive. The migration is the portfolio
pilot for auth standardization (secretkit `docs/STANDARDIZATION.md`, Wave 3) and
brings the repo onto the Clerk standard (INV-4).

## Chosen approach + why

- **Clerk + Convex identity bridge.** Convex validates the Clerk token via
  `convex/auth.config.ts` and reads identity from `ctx.auth` — no more trusting a
  client-supplied id. This is the keystone that closes the impersonation hole.
- **Create-only identity (no remap).** `ensureFromIdentity` is create-only: first
  Clerk login always makes a fresh user; WorkOS-era tier/Stripe/admin history is
  not carried over. There is no claim-by-email and no remap mutation, so the
  row-takeover surface is removed. The owner accepted no backwards compatibility
  for the pilot (no meaningful production user data existed).

## Tradeoffs / risks

- WorkOS-era users + their owned data are orphaned at cutover — accepted (no real
  data). **What would change our mind:** real owned data exists at cutover → use an
  email-match backfill instead.
- Adds a vendor (Clerk) on the standard path; this is the intended portfolio
  direction (INV-4), not a deviation.

## Status note (why this ADR exists)

The 2026-06-02 plan doc shipped fully (PRs #1–#14, through "Phase 6 — remove WorkOS
legacy fallback, identity-only auth"); `main` now carries `@clerk/*` + the Convex
auth config and **zero WorkOS deps**. This ADR graduates that shipped plan into a
durable repo-local decision record per vault ADR-0004 (knowledge in repo files).
The plan doc is retained for history and marked superseded by this ADR.
