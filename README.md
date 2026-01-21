# Civic Pulse - Municipal Meeting Summarizer

> AI-powered summaries of local government meetings. Know what matters in your community.

![Civic Pulse](https://via.placeholder.com/1200x600/0A0A0B/FF6B4A?text=Civic+Pulse)

## 🚀 Quick Start

This project is designed to be built with **Claude Code**. The development plan is broken into phases with specific prompts.

### Prerequisites

- Node.js 18+
- pnpm (`npm install -g pnpm`)
- Convex account (free at [convex.dev](https://convex.dev))
- WorkOS account (free at [workos.com](https://workos.com))
- Anthropic API key (for AI summarization)

### Development Approach

1. **Read the documentation first:**
   - `CLAUDE.md` - Project overview, structure, and guidelines
   - `ARCHITECTURE.md` - Technical architecture and database schema
   - `PROMPTS.md` - Step-by-step development prompts for Claude Code

2. **Start with the reference repo:**
   - Base your implementation on [github.com/jessewalberg/aita](https://github.com/jessewalberg/aita)
   - It has working TanStack Start + Convex + WorkOS + shadcn setup

3. **Execute prompts in order:**
   - Each prompt in `PROMPTS.md` builds on the previous
   - Test after each phase before proceeding

### Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | TanStack Start (React + SSR) |
| Backend | Convex (real-time database + serverless) |
| Auth | WorkOS AuthKit |
| UI | shadcn/ui + Tailwind CSS v4 |
| AI | Claude API (Anthropic) |
| Deploy | Cloudflare Workers |
| Linting | Biome |

## 📁 Project Structure

```
civic-pulse/
├── CLAUDE.md           # Main project documentation
├── ARCHITECTURE.md     # Technical architecture
├── PROMPTS.md          # Development prompts
├── convex/             # Backend (Convex functions + schema)
├── src/
│   ├── routes/         # TanStack file-based routing
│   ├── components/     # React components
│   └── lib/            # Utilities
├── prompts/            # AI prompt templates
└── public/             # Static assets
```

## 🎨 Design Philosophy

**NOT** another boring civic tech site. Think:
- Editorial magazine feel (Bloomberg, Politico)
- Dark mode first, high contrast
- Bold typography with Fraunces + DM Sans
- Coral accent (#FF6B4A) against dark backgrounds
- Micro-animations and polished interactions

## 📦 Key Commands

```bash
pnpm dev          # Start development server
pnpm build        # Production build
pnpm lint         # Lint with Biome
pnpm typecheck    # TypeScript check
npx convex dev    # Convex backend (separate terminal)
```

## 🔐 Environment Variables

Copy `.env.example` to `.env.local` and fill in:

```env
# Convex
CONVEX_DEPLOYMENT=
VITE_CONVEX_URL=

# WorkOS
WORKOS_CLIENT_ID=
WORKOS_API_KEY=
WORKOS_REDIRECT_URI=http://localhost:3000/api/auth/callback
WORKOS_COOKIE_PASSWORD=  # 32+ chars

# AI
ANTHROPIC_API_KEY=
```

## 🗺️ Development Phases

| Phase | Focus | Time Estimate |
|-------|-------|---------------|
| 0 | Project setup from template | 1 day |
| 1 | Database schema + auth | 2 days |
| 2 | Layout + landing page | 2 days |
| 3 | Municipality + meeting views | 3 days |
| 4 | AI summarization pipeline | 2 days |
| 5 | Dashboard + alerts | 2 days |
| 6 | Polish (search, SEO, errors) | 2 days |
| 7 | Production deployment | 1 day |

**Total: ~15 days** for MVP

## 📝 License

MIT

---

Built with Claude Code 🤖
