# Civic Observatory - Municipal Meeting Summarizer

AI-powered summaries of local government meetings.

## Quick Start

Install dependencies:

```bash
pnpm install
```

Run the launch municipality core-loop smoke against a non-production Convex
deployment:

```bash
pnpm smoke:core-loop -- --deployment dev
```

The smoke script is intentionally scoped to Coventry, Connecticut, the launch
municipality fixture in `docs/fixtures/launch-municipality-coventry-ct.md`.
It runs:

1. Seed Connecticut municipality rows.
2. Find Coventry by canonical name and state.
3. Run the internal scraper for Coventry.
4. Re-summarize up to three recent past Coventry meetings.
5. Report scrape counts, summary counts, and meeting statuses.

Useful options:

```bash
pnpm smoke:core-loop -- --deployment dev --summary-limit 3
pnpm smoke:core-loop -- --deployment dev --no-push
pnpm smoke:core-loop -- --deployment dev --json
```

By default, the first Convex command pushes local Convex code before running.
Use `--no-push` only when the target deployment already has the current local
functions. Production targets are rejected by the script; use a dev or staging
deployment.

If the smoke completes with failures, fix the reported deployment configuration
or source-processing issue and rerun the same command. Do not paste secret
values into the repo or the command line.

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | TanStack Start |
| Backend | Convex |
| Auth | Clerk |
| UI | shadcn/ui + Tailwind v4 |
| AI | OpenRouter (Claude) |
| Email | Cloudflare Email Sending |
| Deploy | Cloudflare Workers |

## Structure

```
civic-observatory/
├── CLAUDE.md           # Project overview
├── ARCHITECTURE.md     # Database + systems
├── PROMPTS.md          # Development prompts
├── convex/             # Backend
├── src/                # Frontend
└── prompts/            # AI templates
```

## Timeline

~30 days for full implementation:
- Phase 1-2: Foundation + Browse (8 days)
- Phase 3-4: Upload + Scrapers (9 days)
- Phase 5-6: Alerts + Payments (8 days)
- Phase 7: Polish + Launch (5 days)

Built with Claude Code.
