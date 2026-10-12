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
   - Meeting URLs should use `/meeting/{slug}` for summarized rows with slugs.
5. Keep old ID URLs working. The public loaders resolve IDs and redirect to
   slug URLs when a slug exists.

## Collision Rule

If a generated slug is already used, append `-2`, `-3`, and so on. Slugs are
stable after creation; admin updates only fill missing slugs and do not rename
existing published URLs.

## Search indexing

Public town and meeting pages, sitemap behavior, and verification steps are
documented in `docs/plans/2026-10-12-indexable-meeting-pages.md` (slice 1:
SSR town summary links, real 404 vs Convex 5xx, meeting `noindex` hygiene, and
the lightweight `listSitemapEntries` query).
