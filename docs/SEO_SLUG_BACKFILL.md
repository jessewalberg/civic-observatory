# SEO Slug Backfill Plan

## Goal

Existing production `municipalities` and `meetings` rows need persisted `slug`
values before the sitemap can emit slug URLs for all public records.

## Rollout

1. Deploy the schema change with optional `slug` fields and `by_slug` indexes.
2. Let new municipality and meeting creates start writing slugs automatically.
3. Backfill existing rows in this order:
   - Municipalities first, using `name + state`.
   - Meetings second, using the municipality slug, meeting date, and title.
4. Validate `/sitemap.xml` after deploy:
   - `X-Sitemap-Source: dynamic` means Convex returned indexable dynamic rows.
   - Municipality URLs should use `/explore/{slug}` for rows with slugs.
   - Meeting URLs should use `/meeting/{slug}` for summarized rows with slugs
     and nonblank final summaries.
5. Keep old ID URLs working. The public loaders resolve IDs and redirect to
   slug URLs when a slug exists.

## Collision Rule

If a generated slug is already used, append `-2`, `-3`, and so on. Slugs are
stable after creation; admin updates only fill missing slugs and do not rename
existing published URLs.

## Search indexing

Slice 1 (2026-10-12): town pages SSR a **Recent summaries** link list;
`/sitemap.xml` uses `meetings/queries:listSitemapEntries`; meeting pages without
a final summary (except future agenda previews) carry `noindex`. Verify with
`pnpm build`, `pnpm preview`, and curl against `/explore/<town>`, `/meeting/<slug>`,
and `/sitemap.xml`.
