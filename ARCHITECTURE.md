# Civic Pulse Architecture

## System Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         FRONTEND                                 │
│  TanStack Start (React + SSR)                                   │
│  Routes: /, /explore, /meeting/:id, /dashboard, /admin          │
└────────────────────────────────┬────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                      CONVEX BACKEND                              │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐           │
│  │ Queries  │ │Mutations │ │ Actions  │ │  Crons   │           │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘           │
│  ┌────────────────────────────────────────────────────┐        │
│  │ Database: users, municipalities, meetings,          │        │
│  │           summaries, subscriptions, alerts,         │        │
│  │           scrapeJobs, usageRecords                  │        │
│  └────────────────────────────────────────────────────┘        │
└────────────────────────────────┬────────────────────────────────┘
                                 │
         ┌───────────────────────┼───────────────────────┐
         ▼                       ▼                       ▼
┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐
│     WorkOS      │   │     Claude      │   │  CF Email Send  │
│     (Auth)      │   │      (AI)       │   │    (Email)      │
└─────────────────┘   └─────────────────┘   └─────────────────┘
                              │
                              ▼
               ┌──────────────────────────┐
               │   Municipal Websites     │
               │  Granicus, CivicPlus...  │
               └──────────────────────────┘
```

## Database Schema

```typescript
// convex/schema.ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  
  // ═══════════════════════════════════════════════════════════════
  // USERS - Synced from WorkOS
  // ═══════════════════════════════════════════════════════════════
  users: defineTable({
    workosUserId: v.string(),
    email: v.string(),
    name: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    tier: v.union(v.literal("free"), v.literal("pro")),
    stripeCustomerId: v.optional(v.string()),
    stripeSubscriptionId: v.optional(v.string()),
    stripeCurrentPeriodEnd: v.optional(v.number()),
    isAdmin: v.optional(v.boolean()),
    createdAt: v.number(),
    lastLoginAt: v.number(),
  })
    .index("by_workos_id", ["workosUserId"])
    .index("by_email", ["email"])
    .index("by_stripe_customer", ["stripeCustomerId"]),

  // ═══════════════════════════════════════════════════════════════
  // MUNICIPALITIES - Places we track
  // ═══════════════════════════════════════════════════════════════
  municipalities: defineTable({
    name: v.string(),
    state: v.string(),
    county: v.optional(v.string()),
    population: v.optional(v.number()),
    timezone: v.optional(v.string()),
    websiteUrl: v.optional(v.string()),
    meetingsPageUrl: v.optional(v.string()),
    
    // Scraper config
    platform: v.union(
      v.literal("granicus"),
      v.literal("civicplus"),
      v.literal("generic"),
      v.literal("manual")
    ),
    scrapeConfig: v.optional(v.object({
      meetingListSelector: v.optional(v.string()),
      meetingLinkSelector: v.optional(v.string()),
      dateSelector: v.optional(v.string()),
      dateFormat: v.optional(v.string()),
      contentSelector: v.optional(v.string()),
      frequencyHours: v.number(),
    })),
    
    // Scrape status
    lastScrapedAt: v.optional(v.number()),
    lastScrapeStatus: v.optional(v.union(
      v.literal("success"),
      v.literal("failed"),
      v.literal("partial")
    )),
    lastScrapeError: v.optional(v.string()),
    
    isActive: v.boolean(),
    isVerified: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_state", ["state"])
    .index("by_platform", ["platform"])
    .index("by_active", ["isActive"])
    .searchIndex("search_name", { searchField: "name" }),

  // ═══════════════════════════════════════════════════════════════
  // MEETINGS - Raw documents
  // ═══════════════════════════════════════════════════════════════
  meetings: defineTable({
    municipalityId: v.id("municipalities"),
    title: v.string(),
    meetingType: v.union(
      v.literal("city_council"),
      v.literal("school_board"),
      v.literal("planning_commission"),
      v.literal("zoning_board"),
      v.literal("budget_committee"),
      v.literal("other")
    ),
    meetingDate: v.number(),
    
    sourceUrl: v.optional(v.string()),
    sourceType: v.union(
      v.literal("scraped"),
      v.literal("uploaded"),
      v.literal("manual_entry")
    ),
    
    rawContent: v.optional(v.string()),
    documentStorageId: v.optional(v.id("_storage")),
    contentHash: v.optional(v.string()),
    
    status: v.union(
      v.literal("pending"),
      v.literal("processing"),
      v.literal("summarized"),
      v.literal("failed"),
      v.literal("skipped")
    ),
    processingError: v.optional(v.string()),
    processingAttempts: v.optional(v.number()),
    
    scrapeJobId: v.optional(v.id("scrapeJobs")),
    uploadedByUserId: v.optional(v.id("users")),
    
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_municipality", ["municipalityId"])
    .index("by_municipality_date", ["municipalityId", "meetingDate"])
    .index("by_date", ["meetingDate"])
    .index("by_status", ["status"])
    .index("by_content_hash", ["contentHash"]),

  // ═══════════════════════════════════════════════════════════════
  // SUMMARIES - AI output
  // ═══════════════════════════════════════════════════════════════
  summaries: defineTable({
    meetingId: v.id("meetings"),
    version: v.number(),
    
    executiveSummary: v.string(),
    
    keyDecisions: v.array(v.object({
      title: v.string(),
      description: v.string(),
      voteResult: v.optional(v.object({
        yes: v.number(),
        no: v.number(),
        abstain: v.number(),
        passed: v.boolean(),
      })),
      topics: v.array(v.string()),
      importance: v.optional(v.union(
        v.literal("high"),
        v.literal("medium"),
        v.literal("low")
      )),
    })),
    
    discussionTopics: v.array(v.object({
      topic: v.string(),
      summary: v.string(),
      category: v.string(),
    })),
    
    publicComments: v.optional(v.object({
      count: v.number(),
      summary: v.string(),
      themes: v.array(v.string()),
      sentiment: v.optional(v.union(
        v.literal("positive"),
        v.literal("negative"),
        v.literal("mixed"),
        v.literal("neutral")
      )),
    })),
    
    upcomingItems: v.array(v.object({
      title: v.string(),
      expectedDate: v.optional(v.string()),
    })),
    
    topics: v.array(v.string()),
    sentiment: v.optional(v.union(
      v.literal("routine"),
      v.literal("contentious"),
      v.literal("celebratory"),
      v.literal("urgent")
    )),
    
    modelUsed: v.string(),
    promptVersion: v.string(),
    processingTimeMs: v.number(),
    
    createdAt: v.number(),
  })
    .index("by_meeting", ["meetingId"]),

  // ═══════════════════════════════════════════════════════════════
  // SUBSCRIPTIONS - User alert preferences
  // ═══════════════════════════════════════════════════════════════
  subscriptions: defineTable({
    userId: v.id("users"),
    municipalityId: v.id("municipalities"),
    
    topicFilters: v.optional(v.array(v.string())),
    meetingTypes: v.optional(v.array(v.string())),
    keywordsInclude: v.optional(v.array(v.string())),
    keywordsExclude: v.optional(v.array(v.string())),
    
    alertFrequency: v.union(
      v.literal("immediate"),
      v.literal("daily"),
      v.literal("weekly")
    ),
    emailEnabled: v.boolean(),
    isActive: v.boolean(),
    
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_municipality", ["municipalityId"])
    .index("by_user_municipality", ["userId", "municipalityId"]),

  // ═══════════════════════════════════════════════════════════════
  // ALERTS - Notification instances
  // ═══════════════════════════════════════════════════════════════
  alerts: defineTable({
    userId: v.id("users"),
    subscriptionId: v.id("subscriptions"),
    meetingId: v.id("meetings"),
    summaryId: v.id("summaries"),
    
    matchedTopics: v.array(v.string()),
    matchedKeywords: v.optional(v.array(v.string())),
    
    status: v.union(
      v.literal("pending"),
      v.literal("queued"),
      v.literal("sent"),
      v.literal("failed"),
      v.literal("skipped")
    ),
    
    scheduledFor: v.optional(v.number()),
    sentAt: v.optional(v.number()),
    deliveryError: v.optional(v.string()),
    
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_status", ["status"])
    .index("by_scheduled", ["status", "scheduledFor"]),

  // ═══════════════════════════════════════════════════════════════
  // SCRAPE JOBS - Scraper run history
  // ═══════════════════════════════════════════════════════════════
  scrapeJobs: defineTable({
    municipalityId: v.id("municipalities"),
    
    status: v.union(
      v.literal("pending"),
      v.literal("running"),
      v.literal("completed"),
      v.literal("failed"),
      v.literal("partial")
    ),
    
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    
    meetingsFound: v.optional(v.number()),
    meetingsCreated: v.optional(v.number()),
    meetingsSkipped: v.optional(v.number()),
    meetingsFailed: v.optional(v.number()),
    
    errors: v.optional(v.array(v.object({
      message: v.string(),
      url: v.optional(v.string()),
      timestamp: v.number(),
    }))),
    
    triggeredBy: v.union(
      v.literal("cron"),
      v.literal("manual"),
      v.literal("webhook")
    ),
    triggeredByUserId: v.optional(v.id("users")),
    
    createdAt: v.number(),
  })
    .index("by_municipality", ["municipalityId"])
    .index("by_status", ["status"])
    .index("by_created", ["createdAt"]),

  // ═══════════════════════════════════════════════════════════════
  // USAGE RECORDS - Rate limiting
  // ═══════════════════════════════════════════════════════════════
  usageRecords: defineTable({
    userId: v.optional(v.id("users")),
    ipHash: v.optional(v.string()),
    
    action: v.union(
      v.literal("summary_view"),
      v.literal("meeting_upload"),
      v.literal("api_request"),
      v.literal("alert_sent")
    ),
    
    windowStart: v.number(),
    windowType: v.union(
      v.literal("hour"),
      v.literal("day"),
      v.literal("month")
    ),
    
    count: v.number(),
  })
    .index("by_user_action_window", ["userId", "action", "windowType", "windowStart"])
    .index("by_ip_action_window", ["ipHash", "action", "windowType", "windowStart"]),
});
```

## Scraper Architecture

### Types

```typescript
// convex/scrapers/types.ts

export interface ScrapedMeeting {
  title: string;
  meetingType: string;
  meetingDate: number;
  sourceUrl: string;
  documentUrl?: string;
  documentType?: "pdf" | "html";
  rawContent?: string;
}

export interface ScraperResult {
  success: boolean;
  meetings: ScrapedMeeting[];
  errors: Array<{ message: string; url?: string }>;
}

export interface ScraperConfig {
  meetingsPageUrl: string;
  selectors: {
    meetingList?: string;
    meetingLink?: string;
    meetingDate?: string;
    documentLink?: string;
  };
  dateFormat?: string;
}

export interface Scraper {
  name: string;
  canHandle: (url: string) => boolean;
  scrape: (config: ScraperConfig) => Promise<ScraperResult>;
  extractContent: (url: string, type: string) => Promise<string>;
}
```

### Registry

```typescript
// convex/scrapers/registry.ts

import { granicusScraper } from "./granicus";
import { civicplusScraper } from "./civicplus";
import { genericScraper } from "./generic";

const scrapers = {
  granicus: granicusScraper,
  civicplus: civicplusScraper,
  generic: genericScraper,
};

export function getScraper(platform: string) {
  return scrapers[platform] || genericScraper;
}

export function detectPlatform(url: string): string | null {
  for (const [name, scraper] of Object.entries(scrapers)) {
    if (scraper.canHandle(url)) return name;
  }
  return null;
}
```

### Orchestration Flow

```
scrapeAllDue (cron)
  │
  ├─► Get municipalities where:
  │     - isActive = true
  │     - lastScrapedAt < (now - frequencyHours)
  │
  └─► For each, schedule runScraper with delay
      │
      runScraper (action)
        │
        ├─► Create scrapeJob (status: running)
        │
        ├─► Get scraper for platform
        │
        ├─► scraper.scrape(config)
        │     │
        │     └─► Returns: meetings[], errors[]
        │
        ├─► For each meeting:
        │     ├─► Check duplicate (contentHash)
        │     ├─► Extract content if needed
        │     ├─► Create meeting record
        │     └─► Schedule ai.summarize
        │
        └─► Update scrapeJob with results
```

## Alert Generation Flow

```
ai.summarize completes
  │
  └─► Call generateAlerts(summaryId, meetingId)
        │
        ├─► Get summary and meeting
        │
        ├─► Query subscriptions for municipality
        │
        └─► For each subscription:
              │
              ├─► Check topic match
              │     - If topicFilters set: must overlap
              │     - If empty: all topics match
              │
              ├─► Check meeting type match
              │
              ├─► Check keyword filters
              │
              └─► If match:
                    │
                    ├─► immediate → status: "pending"
                    └─► daily/weekly → status: "queued"
                          scheduledFor: next digest time
```

## Rate Limiting

```typescript
const LIMITS = {
  anonymous: {
    summary_view: { day: 10 },
  },
  free: {
    summary_view: { day: 50 },
    meeting_upload: { month: 3 },
  },
  pro: {
    summary_view: { day: Infinity },
    meeting_upload: { month: 20 },
    api_request: { day: 1000 },
  },
};
```

## Cron Jobs

```typescript
// convex/crons.ts
import { cronJobs } from "convex/server";

const crons = cronJobs();

// Daily scrape at 6am UTC
crons.daily("scrape", { hourUTC: 6, minuteUTC: 0 }, 
  internal.scrapers.scrapeAllDue);

// Immediate alerts every 5 min
crons.interval("immediate-alerts", { minutes: 5 },
  internal.alerts.sendImmediateAlerts);

// Daily digest at 1pm UTC (8am EST)
crons.daily("daily-digest", { hourUTC: 13, minuteUTC: 0 },
  internal.alerts.sendDailyDigest);

// Weekly digest Monday 1pm UTC
crons.weekly("weekly-digest", 
  { dayOfWeek: "monday", hourUTC: 13, minuteUTC: 0 },
  internal.alerts.sendWeeklyDigest);

export default crons;
```

## Component Hierarchy

```
App
├── RootLayout
│   ├── Header (Logo, Nav, Auth)
│   └── Footer
│
├── / (Landing)
│   ├── Hero
│   ├── RecentMeetings
│   └── CTA
│
├── /explore
│   ├── SearchBar
│   ├── StateFilter
│   └── MunicipalityGrid
│
├── /explore/:id
│   ├── MunicipalityHeader
│   └── MeetingList
│
├── /meeting/:id  ← KEY PAGE
│   ├── ProcessingState
│   ├── MeetingHeader
│   ├── ExecutiveSummary
│   ├── KeyDecisions
│   ├── DiscussionTopics
│   ├── PublicComments
│   └── RawContentToggle
│
├── /dashboard
│   ├── Sidebar (subscriptions)
│   └── Feed (meetings)
│
├── /dashboard/subscriptions
│   ├── SubscriptionList
│   └── AddSubscription
│
├── /dashboard/upload
│   └── UploadForm
│
├── /admin
│   ├── Overview
│   ├── Municipalities
│   ├── Scrapers
│   └── Users
│
└── /pricing
    └── TierCards
```

## Topic Categories

```
housing           - Development, affordable housing
public_safety     - Police, fire, emergency
education         - Schools, curriculum
environment       - Climate, sustainability
transportation    - Roads, transit
budget            - Taxes, spending
utilities         - Water, sewer, electric
parks             - Recreation
zoning            - Land use, permits
economic_dev      - Business, jobs
infrastructure    - Construction
healthcare        - Public health
elections         - Voting
other             - Everything else
```
