# CLAUDE.md — Civic Pulse

> Auto-read by Claude Code for project context.

## Project Overview

**Civic Pulse** — AI-powered municipal meeting summarizer that extracts key decisions, action items, and public sentiment from local government meetings.

*"Stay informed about your community in minutes, not hours."*

## Tech Stack

| Layer | Tech |
|-------|------|
| Framework | TanStack Start |
| Backend | Convex |
| Auth | WorkOS AuthKit |
| UI | shadcn/ui |
| LLM | OpenRouter |
| Validation | Zod |
| Package Manager | PNPM |

## Meeting Types

| Type | Description |
|------|-------------|
| city_council | City/Town Council meetings |
| school_board | School Board meetings |
| planning_commission | Planning/Zoning Commission |
| county_board | County Board of Supervisors |
| special_district | Water, Fire, Transit districts |

## Output Structure

| Section | Content |
|---------|---------|
| Summary | High-level overview of meeting |
| Key Decisions | Major votes and resolutions |
| Action Items | Tasks assigned with deadlines |
| Public Comments | Themes and sentiment analysis |
| Voting Record | How members voted on each item |

## Architecture

### Key Folders
```
convex/
  functions/
    summaries/actions.ts   # generateSummary
    users/mutations.ts     # upsertOnLogin
    rateLimit/             # Usage tracking
  lib/
    permissions/           # Role-based access
    constants/             # Rate limits

src/
  routes/
    index.tsx              # Home page
    api/auth/              # Auth callbacks
  components/
    Header.tsx             # Navigation
    ConvexClientProvider   # Convex setup
  authkit/                 # WorkOS integration
```

### Summary Flow
```
User submits transcript
    │
    ├──► Validate input
    ├──► Check rate limit
    ├──► Call LLM for analysis
    └──► Store & return summary
```

## Commands

```bash
pnpm dev              # Start dev server (port 3000)
pnpm build            # Build for production
npx convex dev        # Convex dev mode
npx convex deploy     # Deploy Convex backend
```

## Environment Variables

### Required
```
# Convex
CONVEX_DEPLOYMENT=
VITE_CONVEX_URL=

# WorkOS AuthKit (Server)
WORKOS_CLIENT_ID=
WORKOS_API_KEY=
WORKOS_REDIRECT_URI=
WORKOS_COOKIE_PASSWORD=     # Must be 32+ characters

# WorkOS AuthKit (Client - exposed to browser)
VITE_WORKOS_CLIENT_ID=
VITE_WORKOS_REDIRECT_URI=

# AI (OpenRouter - multi-model gateway)
OPENROUTER_API_KEY=
```

### Optional
```
WORKOS_COOKIE_NAME=wos-session
WORKOS_API_HOSTNAME=api.workos.com
```

## Current Phase

Phase: DESIGN SYSTEM COMPLETE
Completed: Project structure, auth flow, design system, base UI components
Next: Implement summary generation feature

## Key Decisions

- Single summary mode initially (no panel of AI judges)
- Focus on extracting structured data from transcripts
- Public comments get sentiment analysis
- Voting records extracted when available
- Rate limiting: 3/day signed in, 2/day anonymous

## Design System

### Colors
| Token | Value | Usage |
|-------|-------|-------|
| Primary | #FF6B4A | Brand coral/orange - CTAs, highlights |
| Background | #0A0A0B | Page background |
| Surface/Card | #141416 | Cards, elevated surfaces |
| Muted | #1F1F23 | Secondary backgrounds |
| Foreground | #FAFAFA | Primary text |
| Muted-fg | #A0A0A0 | Secondary text |

### Typography
| Font | Usage |
|------|-------|
| Fraunces | Display headings (h1, h2, h3) |
| DM Sans | Body text, UI elements |
| JetBrains Mono | Code, monospace, badges |

### Components (shadcn/ui)
```
src/components/ui/
  button.tsx    # Primary, secondary, ghost, outline variants
  card.tsx      # Card, CardHeader, CardTitle, CardContent, CardFooter
  badge.tsx     # Default, secondary, outline, success, warning, info
  input.tsx     # Text input with focus states
  textarea.tsx  # Multi-line text input
  label.tsx     # Form labels
```

## Design Principles

- Clean, civic-focused aesthetic
- Coral/orange primary with dark background
- Mobile-first responsive design
- Accessible and fast
- Privacy-conscious (no transcript storage by default)
