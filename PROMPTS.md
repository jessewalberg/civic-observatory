# Claude Code Development Prompts

Execute these prompts in order. Each builds on the previous. Test after each prompt.

---

## Phase 1: Foundation (Days 1-4)

### Prompt 1.1: Project Scaffold
```
Initialize Civic Pulse from the reference repo https://github.com/jessewalberg/aita

1. Read CLAUDE.md and ARCHITECTURE.md thoroughly first
2. Set up project with same patterns:
   - TanStack Start with file-based routing
   - Convex for backend
   - WorkOS AuthKit for auth
   - shadcn/ui + Tailwind v4
   - Biome for linting
3. Rename from "aita" to "civic-pulse"
4. Create directory structure from CLAUDE.md
5. Set up .env.example
6. Verify dev server starts

Don't implement features - just get the skeleton working.
```

### Prompt 1.2: Database Schema
```
Implement the complete Convex schema from ARCHITECTURE.md.

Create convex/schema.ts with all 8 tables:
1. users - WorkOS sync, tier, Stripe
2. municipalities - places, scrape config
3. meetings - documents, status
4. summaries - AI output
5. subscriptions - alert preferences
6. alerts - notification tracking
7. scrapeJobs - scraper history
8. usageRecords - rate limiting

Include ALL indexes. Run `npx convex dev` to verify.
```

### Prompt 1.3: User Management
```
Implement user management:

convex/users.ts:
- upsertFromWorkOS: Create/update on login
- getByWorkosId: Find by WorkOS ID
- getCurrentUser: Get from auth context
- updateTier: For Stripe webhook

src/lib/auth.ts:
- getAuth(): Get user from session
- requireAuth(): Throw if not authenticated
- useAuth(): Client hook

src/routes/api/auth/callback.ts:
- Handle WorkOS callback
- Upsert user
- Redirect

Test sign in/out flow works.
```

### Prompt 1.4: Design System
```
Set up design system from CLAUDE.md:

1. Google Fonts in root layout:
   - Fraunces, DM Sans, JetBrains Mono

2. Tailwind v4 CSS variables:
   - Brand colors (coral #FF6B4A)
   - Dark theme defaults
   - Topic colors

3. shadcn/ui:
   - Initialize with dark mode
   - Add: Button, Card, Badge, Input, Select, Dialog, Toast

4. Custom components:
   - TopicBadge (colored by category)
   - VoteDisplay (visual bars)

Verify dark mode with correct fonts.
```

### Prompt 1.5: Landing Page
```
Build stunning landing page at src/routes/index.tsx

Design: Editorial magazine feel (Bloomberg/Politico), NOT generic civic tech

Sections:
1. Hero - Bold headline, animated background, CTAs
2. Recent Meetings - 4 cards with mock data
3. How It Works - 3 steps
4. Value Props - 4 columns for different audiences
5. CTA Section

Use Motion for animations. Make it MEMORABLE.
```

### Prompt 1.6: Seed Data
```
Create seed data in convex/seed.ts:

- 10 municipalities (various states)
- 25 meetings across them
- Full summaries with:
  - Realistic decisions
  - Vote results
  - Topic tags
  - Public comments

Make data feel real. Run seeders and verify.
```

---

## Phase 2: Browse & View (Days 5-8)

### Prompt 2.1: Municipality Functions
```
Implement convex/municipalities.ts:

Queries:
- list: All municipalities, optional state filter
- get: Single by ID
- getWithMeetings: With recent meetings
- search: Full-text search
- listByState: Grouped by state
- listDueForScrape: For cron job

Mutations:
- create: Add municipality
- update: Modify details
- updateScrapeStatus: After scrape runs

Test each in Convex dashboard.
```

### Prompt 2.2: Explore Page
```
Build src/routes/explore/index.tsx:

1. Search + state filter
2. Municipality grid (responsive 1-4 columns)
3. MunicipalityCard:
   - Name, state, population
   - Meeting count
   - Hover animation
4. Empty state
5. Loading skeletons

Use loader for SSR.
```

### Prompt 2.3: Municipality Detail
```
Build src/routes/explore/$municipalityId.tsx:

1. Header: Name, state, website link, subscribe button
2. Meeting filters: type, date range
3. Meeting list with MeetingCard:
   - Date, type, status
   - Topic badges
   - Summary preview
4. Pagination
5. Empty state

SSR with loader.
```

### Prompt 2.4: Meeting Summary Page
```
Build src/routes/meeting/$meetingId.tsx - KEY PAGE:

1. Processing state (if not summarized)
2. Header: breadcrumb, title, date, topics, share
3. Executive Summary (large text)
4. Key Decisions:
   - DecisionCard with VoteDisplay
5. Discussion Topics (by category)
6. Public Comments (if present)
7. Upcoming Items
8. Raw Content toggle

Real-time updates via useQuery.
```

### Prompt 2.5: Share & SEO
```
Add sharing:

1. Share button (copy link, native share)
2. Open Graph meta tags (dynamic)
3. Public access without auth
4. Structured data (JSON-LD)
5. Sitemap generation
```

---

## Phase 3: Manual Upload (Days 9-11)

### Prompt 3.1: Meeting Functions
```
Implement convex/meetings.ts:

Queries:
- get: By ID with municipality
- getWithSummary: With latest summary
- listByMunicipality: Paginated
- listRecent: For landing page
- findBySourceUrl: Duplicate check
- findByContentHash: Content duplicate

Mutations:
- create: New meeting, triggers summarization
- updateStatus: Processing status
- createFromScrape: Internal, from scraper

Include auth checks.
```

### Prompt 3.2: Upload Page
```
Build src/routes/dashboard/upload.tsx (auth required):

1. Auth check in loader
2. Usage limit check
3. Form:
   - Municipality select (or add new)
   - Title, type, date
   - File upload OR paste text
4. Submit with loading
5. Redirect to meeting page
6. Record usage

Handle PDF, DOCX, TXT.
```

### Prompt 3.3: AI Summarization
```
Implement convex/ai.ts:

summarize action:
1. Update status to "processing"
2. Get meeting + municipality
3. Extract text from PDF if needed
4. Build prompt
5. Call Claude API
6. Parse JSON response
7. Validate schema
8. Create summary
9. Update status
10. Trigger alert generation

Error handling with retries.
```

### Prompt 3.4: PDF Extraction
```
Add PDF text extraction in ai.ts:

1. If documentStorageId present:
   - Download from Convex storage
   - Use pdf-parse
   - Store in rawContent
2. Handle image-only PDFs (mark failed)
3. Truncate very long content

Test various PDF types.
```

### Prompt 3.5: Processing UI
```
Enhance meeting page for processing:

Status displays:
- "pending": Queued message
- "processing": Analyzing animation
- "failed": Error + retry button

Real-time updates as status changes.
```

---

## Phase 4: Scraper System (Days 12-17)

### Prompt 4.1: Scraper Architecture
```
Set up scraper foundation:

convex/scrapers/types.ts:
- ScraperResult, ScrapedMeeting, ScraperError interfaces
- ScraperConfig interface
- Scraper interface (canHandle, scrape, extractContent)

convex/scrapers/registry.ts:
- scrapers map
- getScraper(platform)
- detectPlatform(url)

convex/scrapers/utils.ts:
- parseDate, inferMeetingType, hashContent helpers
```

### Prompt 4.2: Granicus Scraper
```
Implement convex/scrapers/granicus.ts:

canHandle:
- granicus.com, /AgendaCenter, /Archive.aspx

scrape:
- Fetch meetings page
- Parse with cheerio
- Extract meetings with dates, titles, doc links
- Handle pagination

extractContent:
- HTML: fetch and clean
- PDF: return URL

Test against real Granicus sites.
```

### Prompt 4.3: CivicPlus Scraper
```
Implement convex/scrapers/civicplus.ts:

Similar structure to Granicus but:
- Different URL patterns
- Different HTML structure
- May need AJAX handling

Test against real CivicPlus sites.
```

### Prompt 4.4: Generic Scraper
```
Implement convex/scrapers/generic.ts:

- Fallback for custom sites
- Relies on config selectors
- More configurable, less automatic

This handles municipalities not on standard platforms.
```

### Prompt 4.5: Scraper Orchestration
```
Implement convex/scrapers/index.ts:

runScraper action:
1. Create scrapeJob
2. Get municipality config
3. Select scraper
4. Run scrape
5. For each meeting:
   - Check duplicates
   - Extract content
   - Create meeting
   - Schedule summarization
6. Update job results
7. Update municipality status

scrapeAllDue action:
- Find due municipalities
- Schedule with staggered timing
```

### Prompt 4.6: Scrape Job Tracking
```
Implement convex/scrapeJobs.ts:

Mutations:
- create: New job
- update: Status and results

Queries:
- getByMunicipality: History for one
- getRecent: Last N jobs
- getFailed: Failed jobs for review

This enables monitoring scraper health.
```

### Prompt 4.7: Admin Scraper UI
```
Build src/routes/admin/scrapers.tsx:

1. Overview stats: total, active, success/fail rates
2. Municipality table with scrape status
3. Per-municipality: history, errors, "Scrape Now"
4. Job queue view
5. Add municipality form with auto-detect

Admin-only access.
```

### Prompt 4.8: Cron Jobs
```
Set up convex/crons.ts:

- 6am UTC: scrapeAllDue
- Every 5 min: sendImmediateAlerts
- 8am UTC: sendDailyDigest
- Monday 8am: sendWeeklyDigest
- Monthly: cleanupOldRecords

Verify crons registered correctly.
```

---

## Phase 5: Subscriptions & Alerts (Days 18-22)

### Prompt 5.1: Subscription Functions
```
Implement convex/subscriptions.ts:

Mutations:
- create: With limit check
- update: Filters, frequency
- delete: Cancel pending alerts

Queries:
- listByUser: All subscriptions
- getForMunicipality: Check if subscribed
- getMatchingForSummary: Find matches (internal)
```

### Prompt 5.2: Subscription UI
```
Build subscription UI:

1. SubscribeButton component:
   - On municipality/meeting pages
   - Shows subscribed state
   - Opens modal

2. SubscriptionModal:
   - Topic checkboxes
   - Meeting type checkboxes
   - Frequency select
   - Save/cancel

3. /dashboard/subscriptions page:
   - List all subscriptions
   - Edit/delete each
   - Add new
```

### Prompt 5.3: Alert Generation
```
Implement convex/alerts.ts:

generateAlerts mutation (called after summary):
1. Get summary details
2. Find matching subscriptions:
   - Municipality match
   - Topic overlap
   - Meeting type match
   - Keyword filters
3. Create alert per match
4. Set scheduledFor based on frequency

Update ai.ts to call this.
```

### Prompt 5.4: Email Sending
```
Set up email with Cloudflare Email Sending:

convex/email.ts:
- sendEmail action (Cloudflare Email Sending REST API)
- sendImmediateAlert: Single meeting email
- sendDailyDigest: Grouped email
- sendWeeklyDigest: Weekly summary

Email templates:
- Single alert HTML
- Digest HTML with multiple meetings

Include unsubscribe links.
```

### Prompt 5.5: Alert Crons
```
Implement alert cron jobs:

sendImmediateAlerts action:
- Query pending alerts
- Send each
- Update status

sendDailyDigest action:
- Query queued daily alerts
- Group by user
- Send digest per user
- Update statuses

Similar for weekly.
```

### Prompt 5.6: Dashboard Feed
```
Enhance dashboard for alerts:

1. Header badge: unread count
2. Feed shows subscribed municipalities
3. Highlight new items
4. Mark as read on view
```

---

## Phase 6: Usage & Monetization (Days 23-26)

### Prompt 6.1: Usage Tracking
```
Implement convex/usage.ts:

recordUsage mutation:
- Track action in time windows
- Hour, day, month granularity

checkLimit query:
- Check against tier limits
- Return allowed, limit, current, resetsAt

getUsageStats query:
- User's current usage
- For UI display

Add tracking to: summary view, upload, alerts.
```

### Prompt 6.2: Rate Limits
```
Enforce rate limits:

1. Before summary view: check limit
2. In upload form: check limit
3. Show paywall when exceeded
4. Clear error messages
5. "Upgrade to Pro" CTAs
6. Show reset time
```

### Prompt 6.3: Usage Display
```
Show usage in UI:

1. User menu: quick summary
2. Dashboard widget: progress bars
3. Pricing page: current usage
4. Color coding: green/yellow/red
```

### Prompt 6.4: Stripe Integration
```
Add Stripe:

convex/stripe.ts:
- createCheckoutSession
- createPortalSession
- handleWebhook

Webhooks:
- checkout.session.completed → upgrade
- subscription.updated → update period
- subscription.deleted → downgrade

src/routes/api/webhooks/stripe.ts:
- Verify signature
- Route to handler
```

### Prompt 6.5: Pricing Page
```
Build src/routes/pricing.tsx:

1. Free / Pro / Enterprise cards
2. Feature comparison table
3. FAQ accordion
4. Dynamic: show current tier
5. Upgrade/manage buttons
```

---

## Phase 7: Polish & Launch (Days 27-30)

### Prompt 7.1: Error Handling
```
Add error handling:

1. Error boundaries (root, page, component)
2. Error pages (404, 500, rate limit, auth)
3. Failed states with retry
4. Toast notifications (success, error)
```

### Prompt 7.2: Loading States
```
Add loading everywhere:

1. Page skeletons
2. Component skeletons
3. Action spinners
4. Optimistic updates
5. Suspense boundaries
```

### Prompt 7.3: SEO
```
Implement SEO:

1. Per-page meta tags
2. /sitemap.xml route
3. robots.txt
4. JSON-LD structured data
5. Core Web Vitals optimization
```

### Prompt 7.4: Admin Dashboard
```
Complete admin:

/admin overview stats
/admin/municipalities CRUD
/admin/users management
/admin/scrapers (from 4.7)

Add isAdmin check to users.
```

### Prompt 7.5: Testing
```
Full test pass:

1. Auth flows
2. Core flows (browse, view, upload)
3. Subscription flows
4. Payment flows
5. Edge cases
6. Responsive (375, 768, 1280)
7. Performance
```

### Prompt 7.6: Deploy
```
Deploy to production:

1. Production Convex, Clerk, Stripe, Cloudflare Email
2. npx convex deploy --prod
3. Cloudflare setup
4. DNS configuration
5. Verify all flows
6. Set up monitoring
```

---

## Maintenance Prompts

### Add Municipality
```
1. Get: name, state, website, meetings URL
2. Detect platform type
3. Configure selectors
4. Test scrape
5. Add to database
6. Verify meetings created
```

### Debug Failed Scrape
```
1. Check job history
2. Review errors
3. Test page manually
4. Update selectors/URL
5. Re-run and verify
```

### Improve AI Quality
```
1. Identify issues
2. Collect examples
3. Update prompt
4. Test improvements
5. Deploy new version
```

### Add Scraper Platform
```
1. Research platform patterns
2. Create scraper module
3. Implement interface
4. Add to registry
5. Test thoroughly
6. Document
```
