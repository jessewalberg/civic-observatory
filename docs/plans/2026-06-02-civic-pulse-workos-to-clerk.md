# Civic-Pulse: WorkOS AuthKit → Clerk Migration Plan

Status: **proposed** · Date: 2026-06-02 · Area: auth / security
Pilot for the portfolio-wide auth standardization (see secretkit
`docs/STANDARDIZATION.md`, Wave 3). Drop the hand-rolled WorkOS AuthKit SSR
implementation and adopt **Clerk** as the standard auth provider.

> **Headline:** this is as much a **security fix** as an auth swap. civic-pulse's
> Convex backend currently has **no `ctx.auth` and no `convex/auth.config.ts`** —
> authorization trusts a client-supplied `workosUserId` string passed as an
> argument to every privileged function (including admin mutations). Any client
> can pass any id and impersonate any user/admin. Phase 2 (the Convex identity
> bridge) closes this and is the keystone of the whole migration.

---

## 1. Current auth architecture (how a request authenticates today)

civic-pulse uses a **hand-rolled WorkOS AuthKit SSR implementation** under
`src/authkit/`. Convex never validates a token; the **WorkOS user id is passed
as a plain string argument** from the client into every privileged Convex
function, which Convex trusts implicitly.

### Request flow today
1. "Sign in" → anchor to `signInUrl`, a WorkOS hosted-auth URL built by
   `getAuthorizationUrl` (`src/authkit/ssr/session.ts:12`).
2. WorkOS redirects back to `GET /api/auth/callback`
   (`src/routes/api/auth/callback.tsx`): `authenticateWithCode` (line 25) →
   **upsert into Convex** via `ConvexHttpClient` +
   `api.functions.users.mutations.upsertOnLogin` (lines 53-69) → seal
   `{accessToken, refreshToken, user, impersonator}` into an iron-webcrypto
   cookie `wos-session` (`saveSession`, `session.ts:78`) → 307 redirect.
3. Every SSR render: `__root.tsx` loader (lines 78-81) calls the `getAuth`
   server fn (`src/authkit/serverFunctions.ts:25`) which decrypts the cookie
   (`session.ts:104`) and returns the `User`, plus `getSignInUrl`.
4. The `User` is threaded as a prop into `ConvexClientProvider`
   (`__root.tsx:134`) → `WorkOSUserContext` (`ConvexClientProvider.tsx:18`) →
   consumed by `useConvexUser`/`useCurrentUser` in `src/lib/auth.ts`.
5. **Client gating:** components/routes read `auth.user.id` and pass it to Convex
   as `workosUserId` / `requestingWorkosUserId`
   (`Header.tsx:43,53,73`, `admin/index.tsx:74-85`, `dashboard/index.tsx:73-78`,
   `SignInButton.tsx:46`).
6. **Server gating:** route loaders (`admin/index.tsx:25`, `dashboard/index.tsx:27`,
   `explore/$municipalityId.tsx:40`) call `getAuth()` and branch on `auth.user`.
   Admin enforcement is purely a DB lookup of `isAdmin` keyed by the
   client-supplied id.
7. Logout: `GET /api/auth/logout` clears the cookie and redirects to `/`.

### WorkOS-specific touchpoints (by file)
- `src/authkit/` — entire dir (8 files): `index.ts`, `serverFunctions.ts`,
  `ssr/{config.ts,session.ts,workos.ts,utils.ts,interfaces.ts}`. Deps:
  `@workos-inc/node`, `iron-webcrypto`.
- `src/routes/api/auth/callback.tsx`, `src/routes/api/auth/logout.tsx`.
- `src/routes/__root.tsx:12,78-81,134-135`.
- `src/components/ConvexClientProvider.tsx` — `WorkOSUserContext`, plain
  `ConvexProvider` (no auth integration).
- `src/lib/auth.ts` — re-exports authkit server fns; hooks query
  `getByWorkosUserId`.
- `src/components/{Header,SignInButton,UsageWidget,SubscribeButton,UsageLimitExceeded}.tsx`,
  `src/components/error/AuthRequired.tsx`.
- Route guards: `src/routes/admin/{index,users,scrapers,municipalities,investigations}.tsx`,
  `src/routes/dashboard/{index,subscriptions,upload}.tsx`,
  `src/routes/explore/$municipalityId.tsx`, `src/routes/meeting/$meetingId.tsx`,
  `src/routes/pricing.tsx`.
- `vite.config.ts:22-33` — `define` injects `process.env.WORKOS_*` into the bundle.
- `wrangler.jsonc:12-14`, `.env.example:14-28`, `CLAUDE.md:244-247` — docs.
- `scripts/rescrape-coventry.mjs:16-18` — uses `WORKOS_ADMIN_USER_ID`.

### Convex functions that consume the WorkOS identity (all via client-supplied arg)
- `convex/schema.ts:9,21` — `users.workosUserId` + `by_workos_id` index.
- `convex/functions/users/{queries,mutations}.ts` — `getByWorkosUserId`,
  `getByWorkosUserIdInternal`, `isAdmin`, `getAdminBootstrapStatus`, `listAll`,
  `getAdminStats`, `upsertOnLogin`, `setAdminStatus`, `claimInitialAdmin`,
  `adminUpdateUser`.
- `convex/functions/municipalities/mutations.ts:45,64,110,199,233,259` —
  `requireAdmin(ctx, requestingWorkosUserId)`.
- `convex/functions/meetings/mutations.ts:41,265,321,373,421,538,632,817` +
  `queries.ts:300,315`.
- `convex/functions/usage/{queries,mutations}.ts` — usage keyed by `workosUserId`.
- `convex/functions/scrapeJobs/mutations.ts:131,248`,
  `convex/functions/scrapers/actions.ts:444,513`,
  `convex/functions/stripe/actions.ts:18,85`.

**Critical:** no `ctx.auth`, no `getUserIdentity()`, no `convex/auth.config.ts`
anywhere (grep: zero matches). Authorization is entirely client-trusted.

---

## 2. Target Clerk architecture (TanStack Start + Convex)

> **Owner input / reference caveat:** no sibling repo on disk currently contains
> `ConvexProviderWithClerk` or `@clerk/tanstack-react-start` (grep: zero). The
> target must follow the canonical Clerk + Convex + TanStack Start docs (fetch
> exact APIs via context7/find-docs at build time), not a local copy. Confirm the
> canonical reference before Phase 1.

1. **`convex/auth.config.ts`** (new):
   ```ts
   export default {
     providers: [{ domain: process.env.CLERK_JWT_ISSUER_DOMAIN, applicationID: "convex" }],
   }
   ```
   Requires a Clerk **JWT template named `convex`** (issuer = Clerk Frontend API
   URL). `CLERK_JWT_ISSUER_DOMAIN` is a **Convex deployment env var**, not a
   worker secret.
2. **Provider wiring** — replace `ConvexClientProvider` with `<ClerkProvider>` +
   `<ConvexProviderWithClerk client useAuth={useAuth}>`; Clerk's `useAuth`
   supplies the `convex` JWT on every call so `ctx.auth.getUserIdentity()`
   resolves server-side.
3. **Identity bridge in Convex** — add `convex/lib/auth.ts` with
   `getIdentityOrThrow(ctx)` / `getCurrentUser(ctx)` / `requireAdmin(ctx)` reading
   `ctx.auth.getUserIdentity()`. Replace every `workosUserId` argument with this
   server-derived identity. `identity.subject` = Clerk user id (`user_...`).
4. **SSR session retrieval** — loaders that gate call Clerk's server `getAuth(request)`
   instead of authkit's `getAuth`. For SSR `ConvexHttpClient` calls needing
   identity, fetch the Clerk token server-side and `convex.setAuth(token)`.
5. **Sign-in / sign-up / logout** — replace `signInUrl` anchor with Clerk
   `<SignInButton>`/`<SignIn>`; replace `/api/auth/callback` with Clerk's mounted
   catch-all handler (WorkOS manual code exchange disappears); replace
   `/api/auth/logout` with Clerk `signOut()`.
6. **User upsert** — no more callback upsert. Options (owner decision):
   (a) Clerk **webhook** (`user.created`/`user.updated`) → Convex HTTP action; or
   (b) **lazy upsert** inside `getCurrentUser` on first authenticated call.
   Recommend (b) for the pilot; (a) as a follow-up.

---

## 3. Phased, ordered rewrite plan

Each phase independently shippable except where noted. **TDD: write the listed
tests first.** The repo currently has **no vitest config and no tests on `main`**
(Phase 0 establishes the harness — the earlier assumption that a hermetic vitest
config already exists is NOT true on `main`).

### Phase 0 — Test harness + Clerk prerequisites (blocking)
- Add `vitest.config.ts` (jsdom for components, node for `convex-test`); deps
  `vitest`/`jsdom`/`@testing-library/react` already present.
- Owner: create Clerk app (dev + prod), the `convex` JWT template, decide social
  providers (Google), obtain publishable/secret keys + issuer domain.
- Tests: vitest smoke test; a `convex-test` baseline against
  `convex/functions/users/queries.ts` capturing current behavior.

### Phase 1 — Add Clerk provider + env (additive)
- Add `@clerk/tanstack-react-start` (+ `@clerk/clerk-react` as needed); keep
  WorkOS installed for now.
- Add Clerk env (§4); add `VITE_CLERK_PUBLISHABLE_KEY` handling in `vite.config.ts`.
- Mount `ClerkProvider` + `ConvexProviderWithClerk` alongside (not yet replacing)
  the existing provider, gated so nothing breaks.
- Tests: provider mount render test; env-presence unit test.

### Phase 2 — Convex `auth.config.ts` + identity bridge (the keystone, security fix)
- Add `convex/auth.config.ts` + `convex/lib/auth.ts`
  (`getIdentityOrThrow`/`getCurrentUser`/`requireAdmin` via `ctx.auth`).
- Widen `users`: add `clerkUserId`/`subject` (keep `workosUserId` optional during
  transition); add `by_clerk_id` index.
- Refactor every function in §1 to derive identity from `ctx.auth` instead of the
  `workosUserId` arg, in dependency order:
  `users` → `usage` → `meetings` → `municipalities` → `scrapeJobs`/`scrapers` → `stripe`.
  Consider shipping Phase 2 + Phase 4 **together per domain** to avoid a window
  where client args and server expectations diverge.
- Tests (write first, highest-value in the whole migration): unauthenticated call
  throws; non-admin denied; admin passes; a user can only touch their own rows.

### Phase 3 — Replace SSR session + route guards
- Swap `__root.tsx` loader (78-81) from authkit `getAuth`/`getSignInUrl` to Clerk
  server `getAuth`; remove `signInUrl` plumbing.
- Update gating loaders (`admin/*`, `dashboard/*`, `explore/$municipalityId`,
  `meeting/$meetingId`); for SSR `ConvexHttpClient` reads needing identity,
  `convex.setAuth(clerkToken)`.
- Replace `/api/auth/callback.tsx` + `/api/auth/logout.tsx` with Clerk's mounted
  handler / catch-all route.
- Tests: loader tests — unauthenticated `/admin` + `/dashboard` return sign-in
  fallback; authenticated returns content.

### Phase 4 — Swap components/hooks to Clerk
- `ConvexClientProvider.tsx`: replace `WorkOSUserContext`/`useWorkOSUser` with
  Clerk `useUser`/`useAuth`.
- `src/lib/auth.ts`: rewrite `useConvexUser`/`useCurrentUser` to stop passing
  `workosUserId` (Convex now derives identity); `isAuthenticated`/`isAdmin`/`isPro`
  consume Clerk + Convex user.
- `Header.tsx`/`SignInButton.tsx`: Clerk `<SignInButton>`/`<UserButton>`/`signOut()`;
  remove all `user.id`→`workosUserId` prop drilling. Remove `@workos-inc/node`
  `User` type imports (`Header.tsx:2`, `SignInButton.tsx:2`,
  `ConvexClientProvider.tsx:1`, `lib/auth.ts:1`).
- Tests: signed-in vs signed-out Header/SignInButton render; `useCurrentUser` hook.

### Phase 5 — Delete `src/authkit` + WorkOS deps
- Delete `src/authkit/` (8 files) + the two `/api/auth/*` routes if not already
  replaced. Remove `@workos-inc/node`; remove `iron-webcrypto` if unused elsewhere
  (only `session.ts` uses it — verify). Remove WorkOS `define`
  (`vite.config.ts:22-33`) + docs (`wrangler.jsonc`, `.env.example`, `CLAUDE.md`).
  Update `scripts/rescrape-coventry.mjs:16-18`.
- Tests: `tsc --noEmit` passes; grep gate: zero `workos` in `src/`.

### Phase 6 — Data migration (users: WorkOS id → Clerk id)
- **Owner decision:** map existing users by
  (a) **email-based bulk import** (Clerk import → match `users.email` via
  `by_email`, backfill `clerkUserId`; risk: email collisions), or
  (b) **lazy claim on first Clerk login** (in `getCurrentUser`, if no `subject`
  match, look up by `identity.email` and attach `clerkUserId` to the existing row).
  **Recommend (b)** — zero downtime, preserves tier/stripe/admin.
- Use `convex-migration-helper` (widen → migrate → narrow): `clerkUserId` optional,
  backfill, later drop `workosUserId` + `by_workos_id`.
- **Preserve:** `isAdmin`, `tier`, `stripeCustomerId/SubscriptionId`, `createdAt`.
  Stripe metadata stores `workosUserId` (`stripe/actions.ts:44,74`) — write
  `clerkUserId` going forward; existing customers stay matched by
  `stripeCustomerId` (`by_stripe_customer`), so billing is unaffected.
- Tests: existing WorkOS-only row gets `clerkUserId` + retains admin/tier/stripe on
  first Clerk login; brand-new Clerk user creates a fresh row.

---

## 4. Environment variable changes (by destination)

`op run --env-file=.env.local` drives scripts; secrets live in 1Password. Per
civic-pulse's worker-secret model: bundle/SSR vars go through `vite.config.ts`
define + `.env.local`; Convex-side vars are set in the Convex deployment env.

**Remove (WorkOS):** `WORKOS_CLIENT_ID`, `WORKOS_API_KEY`, `WORKOS_REDIRECT_URI`,
`WORKOS_COOKIE_PASSWORD`, `WORKOS_COOKIE_NAME`, `WORKOS_API_HOSTNAME`,
`VITE_WORKOS_CLIENT_ID`, `VITE_WORKOS_REDIRECT_URI`, `WORKOS_ADMIN_USER_ID`
(script). Locations: `.env.example:14-28`, `CLAUDE.md:244-247`,
`vite.config.ts:22-33`, `wrangler.jsonc:12-14`.

**Add (Clerk):**

| Var | Destination | Notes |
|---|---|---|
| `VITE_CLERK_PUBLISHABLE_KEY` | **Bundle** (`.env.local` + `vite.config.ts`) | public, shipped to browser |
| `CLERK_SECRET_KEY` | **Worker/SSR** (server-only, never `VITE_`) | Clerk server helpers in loaders/handlers |
| `CLERK_JWT_ISSUER_DOMAIN` | **Convex deployment env** (`npx convex env set`) | read by `convex/auth.config.ts`; NOT a worker secret |
| `CLERK_WEBHOOK_SECRET` | Worker/SSR or Convex HTTP action | only if the Phase-2 webhook upsert path is chosen |

**Unchanged:** `CONVEX_DEPLOYMENT`, `VITE_CONVEX_URL`, `OPENROUTER_API_KEY`,
`STRIPE_*`, `VITE_APP_URL`.

> `CLERK_JWT_ISSUER_DOMAIN` must match the JWT-template issuer **exactly** or
> `getUserIdentity()` silently returns null. It belongs to Convex, not the worker —
> a common misconfiguration.

---

## 5. Risks / unknowns

- **Trust-model change is the big one.** Today any client can pass any
  `workosUserId`/`requestingWorkosUserId` and impersonate (incl. admin in
  `municipalities/mutations.ts`, `meetings/mutations.ts`). Phase 2 closes this but
  changes every privileged signature at once — sequence Phase 2 ↔ 4 per-domain.
- **No on-disk reference repo** — follow Clerk/Convex docs (context7/find-docs for
  `@clerk/tanstack-react-start` + `ConvexProviderWithClerk` exact APIs).
- **No existing tests / vitest config on `main`** — Phase 0 builds the harness first.
- **SSR token forwarding** — `explore/$municipalityId.tsx` + `meeting/$meetingId.tsx`
  create `ConvexHttpClient` in loaders without auth today; once Convex requires
  identity, any user-scoped read must `setAuth`. Most are public reads — verify each.
- **Stripe webhook** (`src/routes/api/webhooks/stripe.tsx`) is unauthenticated by
  design (Stripe signature, keyed by `stripeCustomerId`) — must NOT get gated
  behind Clerk.
- **`upsertOnLogin` timing** — webhook vs lazy upsert; lazy means the first
  authenticated query must tolerate "user row not yet created."
- **Cloudflare Workers runtime** — confirm `@clerk/tanstack-react-start` server
  helpers run under `nodejs_compat` (`wrangler.jsonc:6`); Clerk backend SDK has
  historically needed Node crypto. Verify in Phase 1.
- **`vitest run` requires `op run`** (scripts wrap in 1Password) — tests need Clerk
  dummy keys via `.env.local`/op or a test-only env shim.

---

## 6. Explicit owner input needed
- Provision **prod + dev Clerk instances** for the civic-pulse domain; supply
  publishable/secret keys + JWT issuer.
- Create the **`convex` JWT template** in Clerk.
- **Social/SSO providers**: WorkOS "authkit" fronts the IdP today
  (`session.ts:23`) — confirm which providers (Google?) to enable in Clerk.
- **Existing-user remapping** (Phase 6): email bulk-import vs lazy-claim-on-login.
- **Upsert mechanism**: Clerk webhook vs lazy upsert.
- Confirm `iron-webcrypto` can be removed (only authkit uses it).

---

## Critical files for implementation
- `convex/auth.config.ts` (new — Clerk issuer; keystone)
- `convex/functions/users/queries.ts`, `convex/functions/users/mutations.ts`
  (identity-bridge refactor + schema field)
- `convex/lib/auth.ts` (new — `getCurrentUser`/`requireAdmin`)
- `src/components/ConvexClientProvider.tsx` (ClerkProvider + ConvexProviderWithClerk)
- `src/routes/__root.tsx` (SSR auth loader swap)
- `vite.config.ts` (env define: drop WORKOS_*, add VITE_CLERK_PUBLISHABLE_KEY)
