# Indexable Town, Board and Meeting Pages

Status: **planned** · Date: 2026-10-12 · Area: SEO / public pages
Asked for: Jesse approved civic-observatory and wants marketing that works
(2026-10-12). Constraint carried: no unit tests (Jesse, 2026-10-09).

Goal: search engines index real Coventry, CT meeting content, served as
server-rendered HTML from the current stack (TanStack Start SSR on the
Cloudflare Worker, Convex for data, Clerk only on authenticated routes).
Pilot municipality: Coventry, CT (`docs/fixtures/launch-municipality-coventry-ct.md`).

## 1. What production serves today (observed 2026-10-12)

Read-only checks against `https://civicobservatory.com` and the public Convex
deployment named in `.env.production`:

| Check | Result |
| --- | --- |
| `GET /sitemap.xml` | 200, header `X-Sitemap-Source: dynamic-empty`; only `/`, `/explore`, `/pricing` listed |
| Convex `municipalities/queries:listByState {activeOnly:true}` | `[]` |
| Convex `municipalities/queries:search {query:"coventry"}` | `[]` |
| Convex `meetings/queries:getRecent {summarizedOnly:true}` | `[]` |
| `GET /explore/coventry-ct` | **200** with `<title>Municipality Not Found` (soft 404) |
| `GET /meeting/does-not-exist-xyz` | 404 (correct) |

Conclusions:

1. **No municipality has `coverageStatus: "published"` in production.** Every
   public query filters on `isCoveragePublic`
   (`convex/functions/municipalities/coveragePublication.ts`), so the sitemap,
   town page and meeting pages have nothing to show. No code change fixes this;
   publishing is an operator step (§3 step 0).
2. Most SEO plumbing already exists and is reused, not rebuilt:
   - `/sitemap.xml` and `/robots.txt` server handlers (`src/lib/seoDiscovery.ts`).
   - Stable slugs: `coventry-ct`, meetings `coventry-ct-YYYY-MM-DD-<title>`
     (`convex/lib/seoSlugs.ts`, `docs/SEO_SLUG_BACKFILL.md`), with 301s from
     legacy ID URLs.
   - Meeting route `/meeting/$meetingId` already has an SSR `loader`, canonical
     link, meta, and `Report` + `Event` JSON-LD (`generateMeetingJsonLd` in
     `src/lib/seo.ts`). Its component falls back to `loaderData` when
     `useQuery` is `undefined` (always on the server), so the summary should be
     in the HTML once the meeting is public. **Unconfirmed**: no public meeting
     exists to fetch.
   - Town route `/explore/$municipalityId` has a loader, canonical link and
     `GovernmentOrganization` JSON-LD.
3. Gaps that keep meeting content out of the HTML or hurt indexing:
   - Town page meeting list comes only from client `useQuery`
     (`listByMunicipality`, `getMeetingTypes`, `countByMunicipality`), so SSR
     HTML has skeletons and **no links to meetings**.
   - `/explore` index has no loader; SSR HTML lists no towns.
   - Unknown or unpublished town returns HTTP 200 instead of 404.
   - Sitemap source calls `meetings/queries:getRecent {limit:500}`, which
     `.collect()`s every meeting in every municipality plus each summary and
     returns full documents including `rawContent`. Read volume grows with all
     seeded data, not with published data; it risks Convex per-query read
     limits and a slow sitemap.
   - Sitemap `lastmod` for meetings is the meeting date, not when the summary
     changed.
   - Meeting pages for `failed`, `skipped`, or past `pending` meetings have no
     summary but carry no `noindex`.
   - Summary sections render inside `motion.div` with `initial={{ opacity: 0 }}`;
     SSR HTML ships them with inline `opacity:0` until hydration. Google renders
     JS, so this is a risk to watch, not a blocker.
   - Town `geo.region` emits `US-Connecticut` (state is stored as the full
     name); should be `US-CT`.
   - No board-level pages exist; "board" today is only `meetings.meetingType`.

## 2. Smallest first slice

**Publish Coventry, then make the town page server-render links to its
summarized meetings, return real 404s, and serve a light sitemap.** That is
the minimum for Google to discover (`/sitemap.xml` + links on
`/explore/coventry-ct`), fetch (SSR meeting HTML), and index real meeting
pages. Board pages, the `/explore` index list and the polish items are slice 2.

Out of slice 1 on purpose: board pages, new schema fields, IndexNow, Event rich
results, pagination UI, and any change to auth, pricing, or usage limits.

## 3. Build steps (slice 1)

Work on a branch; ship through `no-mistakes`. Do not deploy, do not touch
production data, do not contact anyone.

### Step 0 — Operator: publish Coventry (needs Jesse or an admin; not code)

Follow `docs/OPERATOR_COVERAGE_LAUNCH_PLAYBOOK.md` for Coventry only:
validation passed with meetings found, initial scrape done, at least one
summary, then **Publish** in `/admin/coverage`. Admin actions run through Clerk
identity, so a builder sprite cannot do this (see header of
`scripts/rescrape-coventry.mjs`). Whether Coventry has scraped meetings and
summaries in production is **unmeasured**; the `/admin/coverage` onboarding
checklist answers it.

Done when this returns one row:

```sh
curl -sS -X POST https://abundant-starling-365.convex.cloud/api/query \
  -H 'content-type: application/json' \
  -d '{"path":"functions/municipalities/queries:search","args":{"query":"coventry"},"format":"json"}'
```

Steps 1–4 can be built and merged before step 0; they show nothing until it is
done.

### Step 1 — Town page: SSR the meeting list

File: `src/routes/explore/$municipalityId.tsx`.

1. In the existing `loader`, after resolving `municipality`, fetch with the same
   `ConvexHttpClient` in parallel:
   - `api.functions.meetings.queries.listByMunicipality`
     `{ municipalityId: municipality._id, status: "summarized", limit: 20 }`
   - `api.functions.meetings.queries.getMeetingTypes`
     `{ municipalityId: municipality._id }`
   - `api.functions.meetings.queries.countByMunicipality`
     `{ municipalityId: municipality._id }`
   Return them as `initialMeetings`, `initialMeetingTypes`, `initialCount`.
2. In `MunicipalityDetailPage`, use the loader values while the matching
   `useQuery` is `undefined` **and** the user has not changed filters
   (`meetingType === ""` and `cursor === null`). Same fallback pattern the
   file already uses for `municipality`. Live `useQuery` data replaces it after
   hydration.
3. `MeetingCard` already wraps each row in `<a href={meetingPath(...)}>`;
   confirm the SSR HTML shows the title, date and executive-summary excerpt as
   visible text inside it.
4. Unknown or unpublished town: replace `return { municipality: null }` with
   `throw notFound()` (as `/meeting/$meetingId` does), add a
   `notFoundComponent`, and keep the `noindex` meta in the not-found `head`.
   Keep the Convex-unavailable path (missing `VITE_CONVEX_URL` or a thrown
   query error) from being cached as a 404 by search engines: on a thrown
   error, rethrow so the route errors (5xx) instead of returning not-found.
5. Structured data stays as `docs/adr/0003-seo-structured-data-model.md`
   decides: `GovernmentOrganization` (already emitted). Add `BreadcrumbList`
   (existing `generateBreadcrumbJsonLd`) only if the page renders a visible
   breadcrumb; the ADR ties breadcrumb JSON-LD to visible breadcrumbs. The
   ADR's "add tests that parse route JSON-LD" line is superseded by Jesse's
   2026-10-09 no-unit-tests decision; JSON-LD is checked in §5.1 instead.

### Step 2 — Meeting page: indexing hygiene

File: `src/routes/meeting/$meetingId.tsx`.

1. In `head`, add `{ name: "robots", content: NOINDEX_ROBOTS }` when the meeting
   has no summary to show: status `failed`, `skipped`, `processing`, or
   `pending` with `meetingDate` in the past. Future `pending` meetings with
   `rawContent` (the agenda preview) stay indexable.
2. Add `BreadcrumbList` JSON-LD matching the visible `<Breadcrumb>` the page
   already renders: Explore → town (`municipalityPath`) → meeting. Keep the
   existing `Report` about `Event` JSON-LD (ADR-0003).
3. Confirm the summarized view renders, as visible HTML text: title, meeting
   date, board label, executive summary, each key decision (title, description,
   vote result), and the source link (`summary.sourceUrl ?? meeting.sourceUrl`)
   as a plain `<a href>`. Add whichever is missing; do not restyle.
4. Do not change `UsageLimitExceeded` gating. Anonymous visitors (and crawlers)
   skip `checkLimit` today (`isAuthenticated ? … : "skip"`), so crawlers get the
   full summary. Keep it that way.

### Step 3 — Light sitemap query

1. Add a public query `listSitemapEntries` in
   `convex/functions/meetings/queries.ts` (no args) that:
   - reads published municipalities (`by_coverage_status` = `"published"`; also
     include rows with no `coverageStatus` that pass `isCoveragePublic`, to match
     current behavior);
   - for each, reads meetings through `by_municipality_date`, keeps
     `status === "summarized"`, and returns only
     `{ _id, slug, meetingDate, lastmod }` where `lastmod` is the summary's
     `createdAt` (fall back to meeting `updatedAt`);
   - returns `{ municipalities: [{ _id, slug, name, lastmod }], meetings }`.
   No `rawContent`, no summary bodies.
2. Point `createConvexSitemapSource` in `src/lib/seoDiscovery.ts` at the new
   query and use the returned `lastmod` in `generateSitemapXml`. Keep the
   `X-Sitemap-Source` header semantics.
3. No codegen needed: `convex/_generated/api.d.ts` types
   `functions/meetings/queries` as `typeof import(...)`, so a new export in that
   module is typed automatically. `pnpm build` (`tsc --noEmit`) confirms it.
   The query reaches production only when CI runs `convex deploy` after merge.

### Step 4 — Docs

Append a short "Search indexing" section to `docs/SEO_SLUG_BACKFILL.md` or
`README.md` pointing at this plan and the §5 checks. No changelog exists in this
repo; do not create one.

### Testing rule for the builder (Jesse, 2026-10-09)

Do not create, edit, or run unit tests (`vitest`, `pnpm test`, `*.test.ts(x)`).
CI's `gate` job (`.github/workflows/deploy.yml`) still runs `pnpm test`. If it
fails on a unit test that pinned behavior this change alters (likely
candidates: `src/lib/seoDiscovery.test.ts`, `src/lib/routeSeo.test.ts`,
`src/lib/canonicalRoutes.test.ts`, `src/lib/structuredData.test.ts`), delete
that test file rather than update it, and name it in the PR. Removing the CI
test step itself is a separate errand. Checks to run and report: `pnpm build`
(includes `tsc --noEmit`), `pnpm check` (Biome), and the §5.1 real-surface
reproduction. Any check not run is reported as not run.

## 4. Slice 2 (after slice 1 is indexed)

1. **Board pages** `/explore/<town>/<board>`, board slug = `meetingType` with
   `_` → `-` (`city-council`, `planning-commission`, …). Use a non-nested file
   `src/routes/explore/$municipalityId_.$board.tsx` so the existing town route
   needs no `<Outlet>`. Loader: `listByMunicipality` with `meetingType`,
   `status: "summarized"`, `limit: 50`; 404 for unknown board slugs or boards
   with zero summarized meetings. Town page links to each board from
   `getMeetingTypes`. Add board URLs to the sitemap. JSON-LD:
   `GovernmentOrganization` (board) with `parentOrganization` = town, plus
   `BreadcrumbList`.
   Risk: labels come from the coarse enum (`city_council` → "City Council");
   Coventry calls its body "Town Council" (fixture doc). Showing the wrong body
   name on a public page is a trust problem; decide on a per-town label before
   shipping board pages.
2. `/explore` loader: SSR the published town list (`list {activeOnly:true}`)
   as plain links.
3. Fix `geo.region` to `US-<abbr>` using a state-abbreviation helper shared with
   `convex/lib/seoSlugs.ts`.
4. Drop `initial={{ opacity: 0 }}` on summary content if URL Inspection shows
   rendered HTML missing or hidden text.
5. Second town only after Coventry pages show as indexed.

## 5. How to verify indexing

### 5.1 Before merge (builder, read-only against production data)

Production Convex is the only deployment with Coventry data, and public queries
are read-only, so a local production build is a safe real-surface check:

```sh
pnpm build
pnpm preview            # serves the Worker build locally via the Cloudflare plugin
```

Then, with `BASE=http://localhost:<preview port>`:

1. `curl -sS $BASE/explore/coventry-ct` — raw HTML (no JS) contains at least one
   `href="/meeting/coventry-ct-` link and a meeting title. If step 0 is not
   done yet, expect HTTP **404** with `noindex`; record "content check not run:
   Coventry unpublished".
2. `curl -sS -o /dev/null -w '%{http_code}' $BASE/explore/not-a-town` → `404`.
3. Pick one meeting URL from (1): raw HTML contains the executive summary text,
   at least one key decision, the meeting date, the source link, a canonical
   `<link>`, and an `application/ld+json` block that parses as JSON.
4. `curl -sSI $BASE/sitemap.xml` → `X-Sitemap-Source: dynamic` and the body
   lists `/explore/coventry-ct` and each summarized Coventry meeting. Response
   time is noted in the PR.
5. A failed/skipped meeting (if any exists) has `<meta name="robots"
   content="noindex, nofollow">`.

If `pnpm preview` cannot run in the sandbox, report it as not run; do not
substitute a unit test.

### 5.2 After Jesse merges and CI deploys

Repeat 5.1 checks 1–4 against `https://civicobservatory.com`.

### 5.3 Search engines (Jesse's one-time physical action)

1. Verify `civicobservatory.com` as a **Domain** property in Google Search
   Console with the DNS TXT record in Cloudflare DNS. Jesse's Google account;
   no code change needed.
2. Submit `https://civicobservatory.com/sitemap.xml` in Search Console →
   Sitemaps. Optionally import the property into Bing Webmaster Tools from
   Search Console.
3. URL Inspection → **Test live URL** on `/explore/coventry-ct` and one meeting
   URL: rendered HTML contains the summary text; "Page can be indexed".

### 5.4 Sensors (no typing needed)

- **Indexed count**: Search Console → Pages → indexed URLs under
  `/meeting/coventry-ct-`. Success for slice 1 = at least one Coventry meeting
  URL indexed. No time target is set: the indexing delay is unmeasured.
- **Crawl**: Worker observability is on (`wrangler.jsonc`); Googlebot requests
  to `/meeting/*` and `/sitemap.xml` show in Workers Logs with status codes.
- **Sitemap health**: `X-Sitemap-Source` header on `/sitemap.xml`; `dynamic`
  means published content is listed.
- **Clicks/impressions**: Search Console → Performance, filtered to
  `/meeting/` and `/explore/`. This is the number that says marketing works.

## 6. Risks

- **Step 0 is the gate.** Without a published Coventry, every code step ships
  but nothing new is indexable. Whether Coventry has summaries in production
  is unmeasured.
- **AI summaries in public search results.** Wrong decisions or vote counts
  become publicly indexed claims about a real town. Pages must keep the source
  link and the existing `SummaryTrustPanel`; pause coverage
  (`/admin/coverage`) if a summary is found wrong.
- **Thin or duplicate pages.** Many near-empty meeting pages can lower site
  quality. Slice 1 lists only summarized meetings in the sitemap and
  `noindex`es pages without summaries.
- **Convex read limits** on the sitemap query as towns grow; step 3 reads only
  published towns through indexes. Past a few thousand meetings, split into a
  sitemap index per town.
- **Soft 404 → hard 404 transition**: a Convex outage must not turn into 404s
  that drop pages from the index (step 1.4 rethrows errors).
- **Hydration hiding content** (`opacity:0` until JS runs); checked by URL
  Inspection, fixed in slice 2 if needed.
- **Board labels** from the coarse `meetingType` enum may misname bodies
  (slice 2).
- **CI still runs unit tests** while Jesse's 2026-10-09 decision says none;
  tests pinned to old SEO behavior may fail the gate (handling in §3).
