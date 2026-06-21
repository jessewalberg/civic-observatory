# Operator Coverage Launch Playbook

Use this playbook to bring a new municipality, state, or region online without
mixing scraper activation with public coverage publication.

## Operator Surfaces

- `/admin/municipalities`: create or edit municipality metadata, source URLs,
  scraper platform, scraper frequency, and raw scraper active state.
- `/admin/scrapers`: run scraper validation, trigger initial scrapes, retry
  failed jobs, and inspect recent scraper jobs.
- `/admin/coverage`: inspect coverage health, onboarding checklist state, and
  publish, pause, or unpublish public coverage.
- Convex internal actions:
  - `internal.functions.municipalities.discovery.discoverOne`
  - `internal.functions.municipalities.discovery.discoverByState`
  - `internal.functions.municipalities.probe.probeOne`
  - `internal.functions.municipalities.probe.probeByState`

## State Model

- `isActive` controls scraper scheduling only.
- `coverageStatus` controls public visibility:
  - `unpublished`: internal setup only.
  - `paused`: temporarily hidden from public/search/subscription/alert surfaces.
  - `published`: visible publicly and eligible for subscriptions and alerts.
- Publishing requires a successful scraper validation that found meetings, or an
  explicit operator override reason.

## Single Municipality Workflow

1. Create or confirm the municipality in `/admin/municipalities`.
   - Add the official website URL when known.
   - Keep public coverage unpublished until validation and first scrape are
     checked.
2. Discover a meetings source if one is not known.
   - Run `discoverOne` with `{ "municipalityId": "<id>" }`.
   - Confirm `meetingsPageUrl` and `platform` were filled in.
3. Probe the scraper without activation.
   - Run `probeOne` with `{ "municipalityId": "<id>", "activate": false }`.
   - If the probe fails, inspect the returned error and `/admin/coverage`
     health row before trying another source.
4. Validate the scraper in `/admin/scrapers`.
   - Select the municipality or paste the source URL.
   - Confirm platform detection, source reachability, meeting extraction, and
     document readiness.
5. Activate scraper scheduling only after the source is verified.
   - Use `/admin/municipalities` to set the scraper active flag, or run
     `probeOne` with `{ "municipalityId": "<id>", "activate": true }` after a
     successful probe.
6. Trigger the initial scrape from `/admin/scrapers`.
   - Use Scrape Now for the municipality.
   - Wait for the scrape job to complete and inspect meetings found/created.
7. Confirm at least one summary exists.
   - Use `/admin/coverage` onboarding checklist and coverage health.
   - Requeue or investigate failed meetings before publishing.
8. Publish from `/admin/coverage`.
   - Use Publish when validation passed and found meetings.
   - If publishing with an override, write a concrete reason that explains what
     evidence was manually checked.

## State or Region Workflow

1. Pick a small first batch.
   - Start with one county, metro area, or 5-10 municipalities, not a full state.
2. Seed or create municipality records with official websites.
3. Run discovery for the selected state:
   - `discoverByState` with `{ "state": "Connecticut", "delayBetweenMs": 5000 }`.
4. Review discovered sources.
   - Spot-check source URLs in a browser.
   - Correct obvious platform mistakes before probing.
5. Probe without activation:
   - `probeByState` with `{ "state": "Connecticut", "activate": false, "delayBetweenMs": 5000 }`.
6. Activate only working sources.
   - For a small verified batch, rerun `probeOne` with `activate: true`, or edit
     active state in `/admin/municipalities`.
7. Run validation and initial scrape from `/admin/scrapers`.
   - Use validation first for high-risk or unfamiliar platforms.
   - Use batch scrape only after spot checks pass.
8. Publish municipality-by-municipality from `/admin/coverage`.
   - Do not bulk-publish a state.
   - Use pause instead of unpublish when the issue is temporary and historical
     data should remain ready to restore.

## Failure Handling

- Discovery failed:
  - Confirm the official website URL.
  - Try likely agenda/minutes paths manually.
  - Leave the row unpublished and record the source gap in the municipality
    notes or Linear follow-up.
- Probe found no meetings:
  - Check whether the page requires JavaScript, pagination, PDFs, or a newer
    scraper capability.
  - Keep `isActive` false unless there is another verified source.
- Validation failed:
  - Treat platform detection and meeting extraction failures as blockers.
  - Document any override reason before publishing manual coverage.
- Scrape failed:
  - Use `/admin/scrapers` recent jobs and `/admin/coverage` failure diagnostics.
  - Retry only after confirming the source URL still points to agenda/minutes
    content.
- Published coverage becomes unreliable:
  - Pause coverage from `/admin/coverage`.
  - Pausing hides public/search/subscription/alert and digest-send surfaces while
    preserving scraper config, meetings, summaries, and subscriptions.

## Done Criteria

A municipality is ready to stay published when:

- Source URL and platform are configured.
- Validation passed or has a documented override.
- Initial scrape created meetings.
- At least one meeting has a summary.
- Coverage health has no active blocking failure.
- `coverageStatus` is `published` and the publish event has a reason or
  validation reference.
