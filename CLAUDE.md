# Civic Pulse - Municipal Meeting Summarizer

## What We're Building

A platform that automatically:
1. **Scrapes** meeting documents from municipal websites
2. **Summarizes** them with AI into digestible formats
3. **Alerts** users when meetings match their interests
4. **Tracks usage** to manage costs and offer paid tiers

## Tech Stack

| Layer | Technology | Why |
|-------|------------|-----|
| Framework | TanStack Start | SSR + file routing + server functions |
| Database | Convex | Real-time sync, scheduled jobs, file storage |
| Auth | WorkOS AuthKit | Enterprise-ready, handles OAuth |
| UI | shadcn/ui + Tailwind v4 | Customizable, accessible |
| AI | Claude API (Anthropic) | Best at structured extraction |
| Scraping | Convex Actions + Cheerio | Serverless, scalable |
| Email | Resend | Simple transactional email |
| Payments | Stripe | Subscriptions |
| Deploy | Cloudflare Workers | Edge, fast globally |

## Project Structure

```
civic-pulse/
├── CLAUDE.md                    # This file
├── ARCHITECTURE.md              # Database schema, flows
├── PROMPTS.md                   # Development prompts
├── convex/
│   ├── schema.ts                # 8 tables
│   ├── users.ts                 # User management
│   ├── municipalities.ts        # Municipality CRUD
│   ├── meetings.ts              # Meeting management
│   ├── summaries.ts             # Summary operations
│   ├── subscriptions.ts         # Alert subscriptions
│   ├── alerts.ts                # Alert delivery
│   ├── usage.ts                 # Rate limiting
│   ├── ai.ts                    # AI summarization
│   ├── scrapers/
│   │   ├── index.ts             # Orchestration
│   │   ├── registry.ts          # Platform registry
│   │   ├── granicus.ts          # Granicus scraper
│   │   ├── civicplus.ts         # CivicPlus scraper
│   │   ├── generic.ts           # Generic HTML
│   │   └── types.ts             # Interfaces
│   ├── crons.ts                 # Scheduled jobs
│   └── stripe.ts                # Payments
├── src/
│   ├── routes/
│   │   ├── __root.tsx
│   │   ├── index.tsx            # Landing
│   │   ├── explore/             # Browse
│   │   ├── meeting/             # Summary view
│   │   ├── dashboard/           # User area
│   │   ├── admin/               # Admin area
│   │   ├── pricing.tsx
│   │   └── api/auth/callback.ts
│   ├── components/
│   │   ├── ui/                  # shadcn
│   │   ├── layout/
│   │   ├── meetings/
│   │   ├── subscriptions/
│   │   └── admin/
│   └── lib/
├── prompts/
│   └── summarize.md             # AI prompt
└── .env.example
```

## Database Tables (8)

| Table | Purpose |
|-------|---------|
| users | WorkOS sync, tier, Stripe |
| municipalities | Places, scrape config |
| meetings | Raw documents, status |
| summaries | AI output |
| subscriptions | Alert preferences |
| alerts | Delivery tracking |
| scrapeJobs | Scraper history |
| usageRecords | Rate limiting |

## User Tiers

| Feature | Anonymous | Free | Pro ($15/mo) |
|---------|-----------|------|--------------|
| View summaries | 10/day | 50/day | Unlimited |
| Municipalities | 3 | 10 | Unlimited |
| Subscriptions | 0 | 5 | Unlimited |
| Email alerts | No | Daily | Immediate |
| Upload meetings | No | 3/month | 20/month |
| API access | No | No | Yes |

## Scraper Architecture

### Platform Types
- **Granicus** (~40%): Structured pages
- **CivicPlus** (~30%): Consistent HTML
- **Generic** (~20%): Custom selectors
- **Manual** (~10%): Upload only

### Scraper Design
- Modular: One module per platform
- Configurable: Per-municipality selectors
- Resilient: Retries, error tracking
- Observable: Job history, logging

### Scrape Flow
```
Cron → For each municipality:
  → Create scrapeJob
  → Get platform scraper
  → Scrape meetings page
  → For each new meeting:
    → Extract content
    → Create meeting record
    → Schedule AI summarization
  → Update job results
```

## Alert System

### Flow
```
New summary created
  → Find matching subscriptions
    → Topic match
    → Meeting type match
    → Keyword filters
  → Create alert records
  → Based on frequency:
    → Immediate: Send now
    → Daily/Weekly: Queue for batch
```

### Frequencies
- **Immediate**: Within 5 minutes
- **Daily**: 8am digest
- **Weekly**: Monday 8am

## Development Phases

### Phase 1: Foundation (Days 1-4)
- Project scaffold
- Database schema
- Auth flow
- Design system
- Landing page
- Seed data

### Phase 2: Browse & View (Days 5-8)
- Municipality functions
- Explore page
- Municipality detail
- Meeting summary page
- Share functionality

### Phase 3: Manual Upload (Days 9-11)
- Meeting functions
- Upload page
- AI summarization
- PDF extraction
- Processing UI

### Phase 4: Scrapers (Days 12-17)
- Scraper architecture
- Granicus scraper
- CivicPlus scraper
- Generic scraper
- Orchestration
- Admin UI
- Cron jobs

### Phase 5: Subscriptions (Days 18-22)
- Subscription functions
- Subscription UI
- Alert generation
- Email sending
- Alert crons
- Dashboard feed

### Phase 6: Monetization (Days 23-26)
- Usage tracking
- Rate limiting
- Usage display
- Stripe integration
- Pricing page

### Phase 7: Polish (Days 27-30)
- Error handling
- Loading states
- SEO
- Admin dashboard
- Testing
- Deployment

## Design System

### Colors
```css
--accent: #FF6B4A;        /* Coral */
--bg: #0A0A0B;            /* Near black */
--surface: #141416;       /* Cards */
--text: #FAFAFA;
--text-muted: #A0A0A5;
```

### Typography
- Display: Fraunces (serif)
- Body: DM Sans (sans)
- Mono: JetBrains Mono

### Style
- Editorial magazine feel (Bloomberg/Politico)
- Dark mode default
- High contrast
- Motion animations

## Commands

```bash
pnpm dev          # Start dev
pnpm build        # Production build
pnpm lint         # Biome lint
pnpm typecheck    # TS check
npx convex dev    # Convex backend
```

## Environment Variables

```env
CONVEX_DEPLOYMENT=
VITE_CONVEX_URL=
WORKOS_CLIENT_ID=
WORKOS_API_KEY=
WORKOS_REDIRECT_URI=
WORKOS_COOKIE_PASSWORD=
ANTHROPIC_API_KEY=
RESEND_API_KEY=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
```
