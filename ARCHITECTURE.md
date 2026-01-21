# Civic Pulse - Architecture Documentation

> Technical deep-dive into Civic Pulse municipal meeting summarizer

## Overview

**Civic Pulse** is a full-stack application that uses AI to summarize municipal government meetings, extracting key decisions, action items, and public sentiment.

```
"Stay informed about your community in minutes, not hours."
```

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| **Framework** | TanStack Start | Full-stack React with SSR |
| **Routing** | TanStack Router | Type-safe file-based routing |
| **Backend** | Convex | Real-time database + serverless functions |
| **Auth** | WorkOS AuthKit | OAuth authentication (Google, GitHub, etc.) |
| **LLM** | OpenRouter | Multi-model AI gateway |
| **UI** | shadcn/ui + Tailwind v4 | Component library + utility CSS |
| **Edge** | Cloudflare Workers | Global edge deployment |
| **Validation** | Zod | Runtime schema validation |

---

## Database Schema

### summaries
- meetingTitle, meetingDate, meetingType
- sourceUrl (optional)
- summary, keyDecisions, actionItems
- publicComments (with sentiment)
- votingRecord
- shareId, isPublic, userId, visitorId
- latencyMs, createdAt

### users
- workosUserId, email
- tier (free | pro)
- role (user | pro | admin)
- createdAt

### dailyUsage
- identifier, date
- summaryCount

---

## Authentication Flow

1. User clicks "Sign In"
2. Redirect to WorkOS OAuth
3. User authenticates (Google/GitHub/etc)
4. WorkOS redirects to /api/auth/callback
5. Exchange code for tokens
6. Upsert user in Convex
7. Encrypt session cookie
8. Redirect to app

### Session Management

- **Cookie**: `wos-session` (HTTP-only, Secure, SameSite=Lax)
- **Encryption**: `iron-webcrypto` with 32+ character password
- **Duration**: 400 days max

---

## Rate Limiting

| User Type | Daily Limit |
|-----------|-------------|
| Anonymous | 2 summaries |
| Signed-in (Free) | 3 summaries |
| Pro / Admin | Unlimited |

---

## Directory Structure

```
civic-pulse/
├── convex/
│   ├── functions/
│   │   ├── summaries/     # Summary CRUD (TODO)
│   │   ├── users/         # User management
│   │   └── rateLimit/     # Usage tracking
│   ├── lib/
│   │   ├── permissions/   # Role-based access
│   │   └── constants/     # Rate limits
│   └── schema.ts          # Database schema
│
├── src/
│   ├── routes/
│   │   ├── __root.tsx     # Root layout
│   │   ├── index.tsx      # Home page
│   │   └── api/auth/      # Auth callbacks
│   ├── components/        # UI components
│   ├── authkit/           # WorkOS integration
│   ├── hooks/             # React hooks
│   ├── lib/               # Utilities
│   └── styles.css         # Tailwind + theme
│
├── vite.config.ts
├── wrangler.jsonc
├── tsconfig.json
├── biome.json
└── package.json
```

---

## Environment Variables

### Required
- CONVEX_DEPLOYMENT
- VITE_CONVEX_URL
- OPENROUTER_API_KEY
- WORKOS_CLIENT_ID
- WORKOS_API_KEY
- WORKOS_REDIRECT_URI
- WORKOS_COOKIE_PASSWORD (32+ chars)
- VITE_WORKOS_CLIENT_ID (client-side)
- VITE_WORKOS_REDIRECT_URI (client-side)

### Optional
- WORKOS_COOKIE_NAME (default: wos-session)
- WORKOS_API_HOSTNAME (default: api.workos.com)

---

## Deployment

### Convex Backend
```bash
npx convex deploy
```

### Cloudflare Workers
1. Connect GitHub repo to Cloudflare Pages
2. Build command: `npx convex deploy && pnpm run build`
3. Output directory: `dist`
4. Add environment variables

---

## Next Steps (TODO)

1. Implement summary generation with LLM
2. Build summary form UI
3. Create summary display components
4. Add share functionality
5. Recent summaries feed
