# ADR-0002 — The INV-8 pre-merge build gate must not run `convex codegen`

- **Status:** accepted
- **Date:** 2026-06-19
- **Owner:** jesse
- **Area:** ci / build / secrets-custody
- **Confidence:** high
- **Sources:** PR #23 (`fix(build): drop convex codegen from build so the INV-8 gate is
  green`, merged `e6536ce`); `.github/workflows/deploy.yml` (the `Test & build gate` job +
  the deploy job); `package.json` `build`/`deploy` scripts; committed `convex/_generated/`;
  portfolio invariants INV-7 (no deploy-key/`op://` secrets in CI) and INV-8 (generated
  pre-merge build gate). Portfolio-wide convention — see "Scope" below.

## Decision

The INV-8 pre-merge **build gate must not run `convex codegen`**. The committed
`convex/_generated/` directory plus `tsc --noEmit` is the gate-time typecheck and
codegen-drift contract; `convex deploy` regenerates `_generated/` on the deploy path
only. Concretely, the gate-time `build` script is:

```
"build": "vite build && tsc --noEmit"
```

not `npx convex codegen && vite build && tsc --noEmit`.

## Context

The INV-8 gate runs `pnpm build` as a pre-merge check (`.github/workflows/deploy.yml`,
job `Test & build gate`) so the test+build gate passes BEFORE a PR can merge — the repo
deploys on push to `main`, so a red gate cannot be allowed to merge. Per **INV-7**, that
gate job carries **no `CONVEX_DEPLOYMENT` / no Convex deploy key** (runtime/deploy secrets
are synced out-of-band by the owner and live only on the deploy path, never in CI). But
`convex codegen` needs a configured Convex deployment to resolve the function/schema
graph, so running it inside the keyless gate fails the build — the gate went red on a
change that was otherwise correct.

The fix (PR #23) is to recognize that codegen is a **deploy-path** concern, not a
gate-path one:

- **Gate path** (`build` script, runs in CI with no deploy key): consume the
  **committed** `convex/_generated/`; `tsc --noEmit` then both typechecks the app and
  fails if those generated files have drifted from source — so the committed artifacts
  ARE the drift contract.
- **Deploy path** (`deploy` script / deploy job, runs with the owner-synced deploy key):
  `convex deploy` regenerates `_generated/` against the real deployment before the build.

## Options considered

1. **Keep `convex codegen` in `build`, give CI a Convex deploy key.** Rejected — wiring a
   Convex deploy key into the gate workflow directly violates **INV-7** (no deploy
   key / `op://` / `secretkit sync` / `op run` in any CI YAML). The gate must stay keyless.
2. **Drop codegen from `build`; commit `convex/_generated/`; rely on `tsc --noEmit` for
   drift.** Chosen.
3. **Add a separate keyless `convex codegen --typecheck`-style step.** Rejected as
   redundant: `convex codegen` still wants a deployment, and committed `_generated/` +
   `tsc` already gives the typecheck + drift signal with no key.

## Tradeoffs / consequences

- `convex/_generated/` must stay **committed** and current; a contributor who edits the
  Convex schema/functions must regenerate and commit `_generated/` or `tsc --noEmit` goes
  red in the gate. This is the intended drift contract, not a bug.
- The gate stays **fully keyless** (INV-7-clean): no Convex deployment env, no `op://`,
  no `op run`/`secretkit sync` in `deploy.yml`'s gate job.
- Codegen correctness against the live deployment is enforced on the **deploy path**
  (`convex deploy`), where the owner-synced key already exists.
- **Drift follow-up:** the gate-job comment in `.github/workflows/deploy.yml`
  (~"`pnpm build` = convex codegen … + vite build + tsc") is now **stale** — `build` no
  longer runs codegen. Correct that comment so the workflow doc matches this ADR.

  **2026-06-19 update:** resolved in the workflow comment. The gate comment now
  states that `pnpm build` is keyless (`vite build` + `tsc --noEmit`) and that
  `convex deploy` regenerates committed `_generated/` files on the deploy path.

## Scope — portfolio-wide convention

This is **not** civic-observatory-specific. **Any repo whose `build` script runs
`convex codegen` will fail its generated INV-8 build gate** for the same reason (keyless
gate, no deployment to resolve codegen). The convention for every Convex repo on the
standard: keep `convex codegen` **out** of the gate-time `build`, commit `_generated/`,
let `tsc --noEmit` carry the drift contract, and regenerate via `convex deploy` on the
deploy path.

## What would change our mind

A keyless, offline `convex codegen` mode that resolves purely from local schema files
(no deployment) would let the gate regenerate instead of relying on committed artifacts;
then committing `_generated/` could become optional. Until such a mode exists, committed
`_generated/` + `tsc` is the contract.

## Source-of-store note

`docs/decisions/README.md` previously pointed new decisions at a shared cross-repo store
that is now retired. This ADR is filed **repo-local** per the current portfolio operating
model: durable, in-repo decisions are read in-context by agents. Recorded here as the
load-bearing committed record; the README is left as-is and should be reconciled separately.
