# Claude Code Development Prompts

This file contains a sequence of prompts to use with Claude Code to build Civic Pulse from the reference AITA repository. Execute these in order, one at a time.

---

## Phase 0: Project Setup

### Prompt 0.1: Initialize Project from Template
```
Clone the structure from https://github.com/jessewalberg/aita but rename everything for our new project "Civic Pulse" - a municipal meeting summarizer.

1. Read the CLAUDE.md and ARCHITECTURE.md files in this directory to understand the project
2. Copy the project structure (convex/, src/, config files) from the reference
3. Update package.json with new name "civic-pulse" and description
4. Keep the same dependencies: TanStack Start, Convex, WorkOS, shadcn/ui, Tailwind v4, Biome
5. Update any branding/naming throughout

Do NOT implement features yet - just set up the skeleton with the auth flow working.
```

### Prompt 0.2: Configure Environment
```
Set up the environment configuration:

1. Create .env.example with all required variables:
   - CONVEX_DEPLOYMENT
   - VITE_CONVEX_URL
   - WORKOS_CLIENT_ID, WORKOS_API_KEY, WORKOS_REDIRECT_URI, WORKOS_COOKIE_PASSWORD
   - VITE_WORKOS_CLIENT_ID, VITE_WORKOS_REDIRECT_URI
   - ANTHROPIC_API_KEY (for AI summarization)

2. Update vite.config.ts if needed for our project
3. Ensure Cloudflare Workers deployment config (wrangler.jsonc) is set up
4. Verify biome.json has sensible defaults

The structure should match what's in CLAUDE.md.
```

### Prompt 0.3: Set Up Design System
```
Configure the design system following CLAUDE.md specifications:

1. Install fonts (Fraunces, DM Sans, JetBrains Mono) via Google Fonts in the root layout
2. Set up Tailwind v4 CSS-first config with our brand colors:
   - Primary: #FF6B4A (coral/orange)
   - Background dark: #0A0A0B
   - Surface: #141416
   - Text: #FAFAFA
3. Configure shadcn/ui with our theme (dark mode default)
4. Create src/styles/globals.css with CSS variables
5. Add base components: Button, Card, Badge, Input from shadcn

Focus on the foundation - we'll build custom components later.
```

---

## Phase 1: Database & Auth

### Prompt 1.1: Implement Convex Schema
```
Implement the complete Convex schema from ARCHITECTURE.md:

1. Create convex/schema.ts with all tables:
   - users (synced from WorkOS)
   - municipalities
   - meetings
   - summaries
   - subscriptions
   - alerts
   - scrapeJobs
   - usageRecords

2. Include all indexes as specified
3. Run `npx convex dev` to generate types

Ensure the schema matches ARCHITECTURE.md exactly.
```

### Prompt 1.2: Implement Auth Functions
```
Create the authentication layer:

1. convex/auth.ts with:
   - `users.upsert` mutation - create/update user from WorkOS data
   - `users.getByWorkosId` query - fetch user by WorkOS ID
   - `users.getCurrentUser` query - get current authenticated user

2. src/lib/auth.ts with:
   - Helper functions for WorkOS integration
   - `getAuth()` server function for loaders
   - `useAuth()` hook for client components

3. src/routes/api/auth/callback.ts:
   - Handle WorkOS OAuth callback
   - Exchange code for tokens
   - Upsert user in Convex
   - Set session cookie
   - Redirect to dashboard

Follow the pattern from the AITA reference repo.
```

### Prompt 1.3: Implement Auth UI
```
Create the authentication UI components:

1. src/components/auth/SignInButton.tsx - redirects to WorkOS
2. src/components/auth/UserMenu.tsx - dropdown with user info and sign out
3. src/components/auth/AuthGuard.tsx - wrapper for protected routes

4. Update src/routes/__root.tsx to:
   - Check auth state
   - Provide auth context
   - Show appropriate header state

Test that sign in and sign out flows work correctly.
```

---

## Phase 2: Core Layout & Landing

### Prompt 2.1: Create Root Layout
```
Build the root layout following our design system:

1. src/routes/__root.tsx:
   - Dark mode by default
   - Load fonts from Google Fonts
   - Global styles
   - Header component slot
   - Main content area with Outlet
   - Footer component slot

2. src/components/layout/Header.tsx:
   - Logo (create a simple text logo for now)
   - Navigation links: Explore, Pricing, (Dashboard if logged in)
   - Search bar (UI only, functionality later)
   - Auth buttons or user menu

3. src/components/layout/Footer.tsx:
   - Simple footer with links
   - Copyright

Use the editorial/magazine aesthetic from CLAUDE.md. NOT generic civic tech blue.
```

### Prompt 2.2: Build Landing Page
```
Create a stunning landing page at src/routes/index.tsx:

DESIGN DIRECTION: Editorial, bold, high-contrast. Think Bloomberg/Politico meets modern SaaS.

Sections:
1. Hero:
   - Bold headline: "Your Local Government, Decoded"
   - Subhead explaining the value prop
   - CTA buttons: "Explore Meetings" and "Sign Up Free"
   - Background: subtle gradient mesh or animated particles

2. Feature Grid (3 columns):
   - "AI Summaries" - instant meeting summaries
   - "Topic Alerts" - get notified about issues you care about
   - "Decision Tracking" - follow votes and outcomes

3. Recent Meetings Preview:
   - Show 3-4 sample meeting cards (use mock data for now)
   - Each card shows: municipality, date, key topics, quick summary

4. Social Proof/Stats:
   - "1,000+ meetings summarized" (placeholder)
   - "50+ municipalities tracked"

5. CTA Section:
   - "Stay Informed. Stay Engaged."
   - Sign up form or button

Use Motion library for scroll animations and micro-interactions.
Make it visually MEMORABLE - not another boring civic tech site.
```

### Prompt 2.3: Build Pricing Page
```
Create src/routes/pricing.tsx:

Design a clear, attractive pricing page with 3 tiers:

1. Free Tier:
   - 5 summaries/day
   - 3 municipalities
   - Basic features
   - "Get Started" button

2. Pro Tier ($15/mo):
   - Unlimited summaries
   - Unlimited municipalities
   - Email alerts
   - API access
   - "Start Pro Trial" button (most prominent)

3. Enterprise:
   - Custom pricing
   - Bulk API access
   - Custom integrations
   - "Contact Us" button

Include:
- Feature comparison table
- FAQ section (accordion)
- Trust badges if any

Keep the same bold design language.
```

---

## Phase 3: Municipality & Meeting Views

### Prompt 3.1: Municipality Functions
```
Implement municipality Convex functions:

1. convex/municipalities.ts:
   - `list` query: Get all active municipalities, with optional state filter
   - `get` query: Get single municipality by ID
   - `getBySlug` query: Get by URL-friendly slug
   - `create` mutation: Add new municipality (admin only)
   - `update` mutation: Update municipality details
   - `search` query: Full-text search on name

2. Add some seed data:
   - Create a convex/seed.ts script
   - Add 5-10 sample municipalities (mix of states)
   - Include realistic data: name, state, population, website

Run the seed script to populate dev database.
```

### Prompt 3.2: Explore Page
```
Create the municipality exploration page at src/routes/explore/index.tsx:

1. Search/Filter Bar:
   - Text search input
   - State dropdown filter
   - Meeting type filter

2. Results Grid:
   - MunicipalityCard components
   - Card shows: name, state, population, recent meeting count
   - Hover effect with subtle animation
   - Click to go to /explore/[municipalityId]

3. Optional Map View:
   - Toggle between grid and map
   - Use a simple US map (static SVG is fine)
   - Dot markers for municipalities

4. Empty State:
   - Friendly message when no results
   - Suggest broadening search

Make it feel like exploring a curated directory, not a government database.
```

### Prompt 3.3: Municipality Detail Page
```
Build src/routes/explore/$municipalityId.tsx:

1. Header Section:
   - Municipality name (large)
   - State, county, population
   - External link to official website
   - Subscribe button (for alerts)

2. Meetings List:
   - Filter by meeting type
   - Sort by date
   - MeetingCard for each meeting
   - Load more / pagination

3. MeetingCard Component (src/components/meetings/MeetingCard.tsx):
   - Meeting type badge
   - Date
   - Title
   - Topic tags (if summarized)
   - Quick summary preview (first 100 chars)
   - Click to view full meeting

4. Sidebar (on larger screens):
   - Quick stats: total meetings, last updated
   - Alert subscription form
   - Related municipalities (same state)

Use SSR with TanStack loader for initial data.
```

### Prompt 3.4: Meeting Detail Page
```
Create src/routes/meeting/$meetingId.tsx - this is a KEY page:

1. Meeting Header:
   - Municipality name (link back)
   - Meeting type + date
   - Topic badges (TopicBadge component)
   - Share button, subscribe button

2. Executive Summary Section:
   - Large, readable text
   - The main AI-generated summary
   - Highlight key takeaways

3. Key Decisions Section:
   - DecisionCard for each decision
   - Show vote results (VoteDisplay component)
   - Yes/No/Abstain with visual bar
   - Topics for each decision

4. Discussion Topics:
   - Grouped by category
   - Expandable sections
   - Each topic has summary text

5. Public Comments Summary:
   - If available
   - Count, themes, general sentiment

6. Upcoming Items:
   - List of items to watch
   - Expected dates if known

7. Raw Content Toggle:
   - Button to show/hide original document
   - Scrollable container for raw text

8. Related Meetings:
   - Previous/next meeting in this municipality
   - Similar meetings (same topics)

This page should feel like reading a well-designed news article.
```

---

## Phase 4: AI Summarization

### Prompt 4.1: Summarization Action
```
Create the AI summarization pipeline:

1. convex/ai.ts:
   - `summarizeMeeting` action:
     - Takes meetingId
     - Fetches raw content from meeting record
     - Calls Claude API with structured prompt
     - Parses response into our summary schema
     - Saves summary to database
     - Updates meeting status

2. Create the prompt template:
   - System prompt explaining the task
   - Output format: JSON matching our schema
   - Examples of good summaries
   - Guidelines for topic extraction

3. Error handling:
   - Retry logic for API failures
   - Fallback for malformed responses
   - Log errors to database

The prompt should be in a separate file for easy iteration: convex/prompts/summarize.ts
```

### Prompt 4.2: Meeting Upload Flow
```
Create a manual meeting upload flow for testing:

1. src/routes/dashboard/upload.tsx (Pro users only):
   - File upload (PDF, DOCX, TXT)
   - Or paste text directly
   - Select municipality
   - Select meeting type
   - Enter meeting date
   - Submit button

2. convex/meetings.ts:
   - `create` mutation: Create meeting record
   - `uploadDocument` action: Store file in Convex storage
   - `triggerSummarization` mutation: Queue for summarization

3. Processing Flow:
   - Upload creates meeting with status "pending"
   - Background job picks it up
   - Extracts text (pdf-parse for PDFs)
   - Calls summarization
   - Updates status to "summarized"

4. Show processing status:
   - Real-time updates as meeting processes
   - Success/error states

This lets us test the full pipeline without scrapers.
```

### Prompt 4.3: Seed Sample Summaries
```
Create sample meeting data with summaries for demonstration:

1. convex/seed.ts - add functions to create:
   - 10-15 sample meetings across different municipalities
   - Full summaries with realistic data
   - Mix of meeting types
   - Various topics

2. The sample data should showcase:
   - Zoning approvals
   - Budget votes
   - Public safety discussions
   - School board decisions
   - Contentious items with split votes

3. Make the data feel real:
   - Realistic names and details
   - Varied vote counts
   - Interesting public comment summaries

This seeds the demo environment so users see value immediately.
```

---

## Phase 5: User Dashboard & Alerts

### Prompt 5.1: User Dashboard
```
Build src/routes/dashboard.tsx:

1. Sidebar:
   - User's subscribed municipalities (quick links)
   - Pending alerts count
   - Account link

2. Main Feed:
   - Recent meetings from subscribed municipalities
   - Filter by: all, unread, topic
   - Sort by: date, municipality
   - MeetingCard list

3. Empty State (no subscriptions):
   - Friendly onboarding message
   - "Explore municipalities" CTA
   - Suggested popular municipalities

4. Quick Actions:
   - Search meetings
   - Upload meeting (Pro)
   - Manage alerts

Make it feel like a personalized news feed, not a dashboard.
```

### Prompt 5.2: Alert Subscription System
```
Implement the alert/subscription system:

1. convex/subscriptions.ts:
   - `create` mutation: Subscribe to municipality
   - `update` mutation: Update filters/frequency
   - `delete` mutation: Unsubscribe
   - `listByUser` query: Get user's subscriptions

2. src/components/alerts/AlertForm.tsx:
   - Municipality selector (if not pre-selected)
   - Topic filter checkboxes
   - Frequency: immediate, daily, weekly
   - Submit/cancel buttons

3. src/components/alerts/AlertList.tsx:
   - List of current subscriptions
   - Edit/delete actions
   - Toggle enabled/disabled

4. src/routes/alerts/index.tsx:
   - Full page alert management
   - Add new subscription
   - List existing subscriptions
   - Notification preferences

5. Integration:
   - Add subscribe button to municipality pages
   - Add subscribe button to meeting pages (for that municipality)
```

### Prompt 5.3: Email Notification System
```
Set up email notifications (using Resend or similar):

1. convex/email.ts:
   - `sendAlert` action: Send single meeting alert
   - `sendDailyDigest` action: Send daily summary
   - `sendWeeklyDigest` action: Send weekly summary

2. Email templates:
   - Single meeting alert (new summary available)
   - Daily digest (list of new meetings)
   - Weekly digest (summary of week's activity)

3. convex/crons.ts:
   - Schedule daily digest (8am user timezone)
   - Schedule weekly digest (Monday 8am)

4. convex/alerts.ts:
   - `checkNewMeetings` query: Find meetings needing alerts
   - `markAsSent` mutation: Update alert status
   - `processImmediateAlerts` action: Send immediate notifications

For now, log emails to console in dev. We'll connect Resend later.
```

---

## Phase 6: Polish & Production

### Prompt 6.1: Search Implementation
```
Implement global search:

1. convex/search.ts:
   - `searchMeetings` query: Full-text search on meetings
   - `searchMunicipalities` query: Search municipality names
   - Combined search with result types

2. src/components/search/SearchCommand.tsx:
   - Command palette style (like Spotlight/Alfred)
   - Keyboard shortcut: Cmd+K
   - Shows recent searches
   - Grouped results: Municipalities, Meetings, Topics

3. src/components/layout/Header.tsx:
   - Update search bar to open command palette
   - Show recent/suggested searches on focus

4. Search result page (src/routes/search.tsx):
   - For users who want full results
   - Filter by type, date range, municipality
   - Paginated results
```

### Prompt 6.2: Sharing & SEO
```
Add sharing functionality and SEO:

1. Meeting Share Page:
   - src/routes/meeting/$meetingId/share.tsx
   - Public, no auth required
   - Clean summary view for sharing
   - Open Graph meta tags

2. SEO:
   - Dynamic meta tags on all pages
   - Structured data (JSON-LD) for meetings
   - Sitemap generation
   - robots.txt

3. Social Sharing:
   - Share button with copy link
   - Twitter share with pre-filled text
   - LinkedIn share
   - Email share

4. Open Graph Images:
   - Generate OG images for meetings
   - Show municipality, date, key topics
   - Use Satori or similar for generation
```

### Prompt 6.3: Rate Limiting & Usage Tracking
```
Implement rate limiting:

1. convex/usage.ts:
   - `trackUsage` mutation: Record usage event
   - `checkLimit` query: Check if user is within limits
   - `getUsageStats` query: Get user's usage stats

2. Rate limit middleware:
   - Create helper function to check limits
   - Apply to relevant queries/mutations
   - Return appropriate errors when exceeded

3. Usage display:
   - Show usage stats in user menu
   - Warning when approaching limits
   - Upgrade prompt when exceeded

4. Anonymous user handling:
   - Track by IP hash (privacy-friendly)
   - Lower limits for anonymous users
```

### Prompt 6.4: Error Handling & Loading States
```
Add comprehensive error handling:

1. Error Boundaries:
   - Root error boundary
   - Page-level error boundaries
   - Component-level for data fetching

2. Error Pages:
   - 404 Not Found
   - 500 Server Error
   - Rate Limited page
   - Offline page

3. Loading States:
   - Skeleton loaders for cards
   - Loading spinners for actions
   - Optimistic updates where appropriate

4. Toast Notifications:
   - Success messages
   - Error messages
   - Action confirmations

Use consistent patterns throughout the app.
```

### Prompt 6.5: Performance Optimization
```
Optimize for production:

1. Code Splitting:
   - Lazy load routes
   - Dynamic imports for heavy components
   - Prefetch on hover for links

2. Image Optimization:
   - Use next-gen formats (WebP)
   - Lazy load images
   - Placeholder blurs

3. Caching:
   - Set appropriate cache headers
   - Use Convex query caching
   - Client-side query deduplication

4. Bundle Analysis:
   - Analyze bundle size
   - Remove unused dependencies
   - Tree shake where possible

5. Monitoring:
   - Add basic analytics events
   - Error logging
   - Performance metrics
```

---

## Phase 7: Deployment

### Prompt 7.1: Production Deployment
```
Prepare for production deployment:

1. Environment Configuration:
   - Set up production environment variables
   - Configure Convex production deployment
   - Set up WorkOS production credentials

2. Cloudflare Workers:
   - Update wrangler.jsonc for production
   - Configure custom domain
   - Set up SSL

3. Database:
   - Run final schema migrations
   - Seed production data (municipalities only)
   - Set up backups

4. Testing:
   - Run full test suite
   - Manual QA of critical flows
   - Load testing

5. Launch Checklist:
   - Verify auth flows
   - Test payment flows (if implemented)
   - Check email delivery
   - Verify rate limiting
   - Test sharing/OG images
```

---

## Usage Instructions

1. Start with Phase 0 prompts to set up the project structure
2. Execute each prompt one at a time
3. Test after each prompt before moving on
4. Modify prompts as needed based on your specific needs
5. Reference CLAUDE.md and ARCHITECTURE.md throughout

Each prompt is designed to be self-contained but builds on previous work.
