# Civic Pulse — Municipal Meeting Intelligence Platform

## What This Project Is

Civic Pulse is a SaaS platform that automatically scrapes meeting documents from municipal government websites, summarizes them with AI, and alerts users when topics they care about are discussed. Think "Google Alerts for local government meetings."

## Tech Stack (Non-Negotiable)

| Layer | Technology | Notes |
|-------|-----------|-------|
| Frontend Framework | TanStack Start (React) | SSR, type-safe routing, server functions |
| Backend / Database | Convex | Reactive DB, server functions, crons, file storage |
| Authentication | WorkOS AuthKit | Hosted UI, social logins, free to 1M MAUs |
| Hosting | Cloudflare Workers | Edge deployment via Wrangler |
| UI Components | shadcn/ui + Tailwind v4 | CSS-first config, all components from shadcn |
| AI | OpenRouter (Claude) | Meeting summarization via Convex actions |
| Scraping | Convex Actions + Cheerio | Serverless, runs in Convex runtime |
| Payments | Stripe | Subscriptions, webhooks, customer portal |
| Email | Cloudflare Email Sending | Alert notification emails |
| Animation | Motion (Framer Motion) | Page transitions, micro-interactions |
| Package Manager | Bun | For all installs, scripts, and commands |

## Project Documentation

Read these documents IN ORDER before starting any work:

1. **`docs/DESIGN_SYSTEM.md`** — Design philosophy, color palette, typography, component patterns. Read FIRST before writing any UI code.
2. **`docs/AUTH_PATTERN.md`** — How authentication works with WorkOS AuthKit. Every route and Convex function must follow this pattern.
3. **`docs/CONVEX_GUIDE.md`** — How to write Convex functions (queries, mutations, actions), schema design, and cron jobs.
4. **`docs/ROUTES_AND_PAGES.md`** — Every page in the app, what data it needs, which tier can access it.
5. **`docs/SCRAPER.md`** — The scraping pipeline: platform detection, HTML extraction, rate limiting.
6. **`docs/DEPLOYMENT.md`** — Cloudflare Workers setup, Convex deployment, environment variables.

## Critical Rules

0. **Bun only, never npm/npx.** Always use `bun` for all commands. The PATH requires sourcing: run `source ~/.zshrc && bun ...` or use the full path `/Users/home/.bun/bin/bun`. Never use npm, npx, yarn, or pnpm.

1. **Design first, code second.** Set up shadcn/ui and the full design system before building any pages. Every component should look production-grade from day one.

2. **Auth is modeled on WorkOS AuthKit.** Use the official template: https://github.com/get-convex/templates/tree/main/template-tanstack-start-authkit. Do not invent custom auth. Use `getAuth()` for server-side checks, sync users to Convex on first login.

3. **Convex is the API for all data operations.** Never create REST endpoints for reading/writing data. All data flows through Convex queries/mutations/actions. **Exception: auth.** WorkOS session management runs in TanStack Start server functions.

4. **Type safety everywhere.** Convex generates types from your schema. Use them. TanStack Router infers route params. Use them. Never use `any`.

5. **Real-time by default.** Use `useQuery` from Convex React for all data fetching. Data updates live via WebSocket automatically.

6. **Tiered access in Convex, not the frontend.** Subscription checks happen in Convex query/mutation handlers, not in React components. The frontend shows/hides UI, but the backend enforces access.

7. **Dark mode is default.** No light mode toggle. The app is dark-themed only.

## File Structure

```
civic-pulse/
├── src/                          # TanStack Start application
│   ├── routes/                   # File-based routes
│   │   ├── __root.tsx            # Root layout: providers, fonts, toaster
│   │   ├── index.tsx             # Landing page
│   │   ├── explore/
│   │   │   ├── index.tsx         # Municipality grid + search
│   │   │   └── $slug.tsx         # Municipality detail
│   │   ├── meeting/
│   │   │   └── $meetingId.tsx    # Meeting summary (KEY PAGE)
│   │   ├── dashboard/
│   │   │   ├── index.tsx         # Alert feed
│   │   │   ├── subscriptions.tsx # Manage subscriptions
│   │   │   └── upload.tsx        # Manual upload
│   │   ├── admin/
│   │   │   ├── index.tsx         # Admin overview
│   │   │   ├── municipalities.tsx
│   │   │   ├── users.tsx
│   │   │   └── scrapers.tsx
│   │   ├── pricing.tsx
│   │   └── api/
│   │       ├── auth/callback.ts  # WorkOS callback
│   │       ├── stripe/webhook.ts # Stripe webhook
│   │       ├── sitemap.tsx
│   │       └── robots.tsx
│   ├── components/
│   │   ├── ui/                   # shadcn/ui components (DO NOT MODIFY)
│   │   ├── layout/               # Header, Footer
│   │   ├── skeletons/            # Loading states
│   │   ├── error/                # Error boundaries
│   │   ├── TopicBadge.tsx        # Topic color badges
│   │   └── UsageWidget.tsx       # Usage display
│   ├── lib/
│   │   ├── utils.ts              # cn(), formatDate()
│   │   ├── toast.ts              # Toast wrapper
│   │   └── seo.ts                # SEO helpers
│   ├── authkit/
│   │   └── serverFunctions.ts    # WorkOS helpers
│   └── styles.css                # Tailwind + design tokens
├── convex/                       # Convex backend (THIS IS THE ENTIRE BACKEND)
│   ├── schema.ts                 # Database schema (8 tables)
│   ├── _generated/               # Auto-generated types
│   ├── functions/
│   │   ├── users/                # User queries, mutations
│   │   ├── municipalities/       # Municipality CRUD
│   │   ├── meetings/             # Meeting management
│   │   ├── summaries/            # Summary queries
│   │   ├── subscriptions/        # Alert subscriptions
│   │   ├── alerts/               # Alert generation, email
│   │   ├── scrapeJobs/           # Scraper job tracking
│   │   ├── usage/                # Rate limiting
│   │   ├── ai/                   # Summarization actions
│   │   └── stripe/               # Payment actions
│   ├── scrapers/
│   │   ├── types.ts              # Scraper interfaces
│   │   ├── registry.ts           # Platform detection
│   │   ├── granicus.ts           # Granicus scraper
│   │   ├── civicplus.ts          # CivicPlus scraper
│   │   ├── generic.ts            # Generic HTML scraper
│   │   └── utils.ts              # Shared utilities
│   └── crons.ts                  # Scheduled jobs
├── docs/                         # Documentation for Claude Code
├── prompts/                      # Build prompts (in order)
├── vite.config.ts
├── wrangler.toml
├── components.json               # shadcn/ui config
└── package.json
```

## Database Schema (8 Tables)

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `users` | User accounts | workosUserId, email, tier, role, stripeCustomerId |
| `municipalities` | Locations to scrape | name, slug, state, platform, scrapeConfig |
| `meetings` | Raw meeting documents | municipalityId, title, meetingType, processingStatus |
| `summaries` | AI-generated summaries | meetingId, executiveSummary, keyDecisions, discussionTopics |
| `subscriptions` | Alert preferences | userId, municipalityId, topics, frequency |
| `alerts` | Pending/sent alerts | userId, meetingId, matchedTopics, isSent |
| `scrapeJobs` | Scraper run history | municipalityId, status, stats, errors |
| `usageRecords` | Rate limiting | userId, action, timestamp |

## User Tiers

| Feature | Anonymous | Free | Pro ($15/mo) |
|---------|:---------:|:----:|:------------:|
| View summaries | 10/day | 50/day | Unlimited |
| Municipalities | 3 | 10 | Unlimited |
| Subscriptions | 0 | 5 | Unlimited |
| Email alerts | — | Daily digest | Immediate |
| Upload meetings | — | 3/month | 20/month |
| API access | — | — | Yes |

## Build Order

This is the sequence of work. Do NOT skip ahead. Each phase corresponds to a prompt file in `prompts/`.

### Phase 0: Scaffold + Design System (`prompts/00-scaffold-design-system.md`)
1. Create project from TanStack Start template
2. Add Convex + WorkOS AuthKit
3. Add Cloudflare Workers support
4. Install and configure shadcn/ui with custom dark theme
5. Build ALL reusable components with the design system applied
6. Create layout shell (Header, Footer)
7. Verify auth flow works end-to-end
8. Create placeholder routes for every page

### Phase 1: Database + Scraper (`prompts/01-schema-scraper.md`)
9. Define Convex schema (all 8 tables with indexes)
10. Create auth helper functions
11. Build municipality queries and mutations
12. Build meeting and summary queries
13. Build scraper actions (registry + platform scrapers + extractors)
14. Set up crons for scheduled crawling
15. Seed database with test data

### Phase 2: Core Pages (`prompts/02-core-pages.md`)
16. Landing page with hero, features, CTA
17. Explore page with municipality grid + search/filter
18. Municipality detail with meeting list
19. Meeting summary page with all 4 tabs (summary, decisions, topics, comments)
20. Build TopicBadge, VoteDisplay, and chart components

### Phase 3: Upload + AI (`prompts/03-upload-ai.md`)
21. Upload page with drag-and-drop file input
22. File storage via Convex
23. PDF text extraction action
24. AI summarization action (OpenRouter)
25. Processing status UI (pending → processing → complete/failed)
26. Usage tracking for upload limits

### Phase 4: Subscriptions + Alerts (`prompts/04-subscriptions-alerts.md`)
27. Subscription CRUD mutations
28. Subscription modal with topic/keyword filters
29. Alert generation on new summary
30. Email sending action (Cloudflare Email Sending REST API)
31. Cron jobs (immediate, daily digest, weekly digest)
32. Dashboard alert feed

### Phase 5: Monetization (`prompts/05-monetization.md`)
33. Usage tracking queries
34. Rate limiting checks
35. Usage display widgets
36. Stripe checkout session action
37. Stripe webhook handler
38. Customer portal action
39. Pricing page with tier comparison

### Phase 6: Admin Dashboard (`prompts/06-admin-dashboard.md`)
40. Admin access control (isAdmin check)
41. Admin overview with stats
42. Municipality CRUD admin
43. User management (tier, role changes)
44. Scraper monitoring and manual triggers

### Phase 7: Polish + Production (`prompts/07-polish-production.md`)
45. Error boundaries on all routes
46. Loading skeletons on all pages
47. Toast notifications
48. SEO (meta tags, sitemap, robots.txt)
49. Responsive audit
50. Pre-deploy checklist
51. Production deployment

## Commands

```bash
# Development
bun dev               # Start frontend dev server
bun convex dev        # Start Convex dev server (run in separate terminal)

# Code Quality
bun typecheck         # TypeScript check
bun lint              # Biome lint

# Production
bun run build         # Build for production
bun convex deploy --prod   # Deploy Convex
bun wrangler deploy        # Deploy to Cloudflare
```

## Environment Variables

```env
# Convex
CONVEX_DEPLOYMENT=dev:your-deployment
VITE_CONVEX_URL=https://your-deployment.convex.cloud

# WorkOS AuthKit
WORKOS_CLIENT_ID=client_...
WORKOS_API_KEY=sk_test_...
WORKOS_REDIRECT_URI=http://localhost:3000/api/auth/callback
WORKOS_COOKIE_PASSWORD=32-character-minimum-secret

# OpenRouter (AI API routing)
OPENROUTER_API_KEY=sk-or-...

# Cloudflare Email Sending (sendEmail action) — token needs email-send perm,
# domain civicpulse.com onboarded to CF Email Sending
CLOUDFLARE_API_TOKEN=...
CLOUDFLARE_ACCOUNT_ID=...

# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRO_PRICE_ID=price_...

# App
SITE_URL=http://localhost:3000
```
