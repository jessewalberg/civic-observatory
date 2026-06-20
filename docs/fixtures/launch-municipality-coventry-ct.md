# Launch Municipality Fixture: Coventry, Connecticut

Verified: 2026-06-20

## Decision

Use Coventry, Connecticut as the canonical launch municipality for the
scrape -> meeting persistence -> summary loop.

Coventry is a good pilot because it is already present in seeded municipality
data, uses a CivicPlus AgendaCenter source, publishes HTML agenda views and
PDF/packet downloads, and has recent Town Council meetings with enough text
content to exercise summarization without requiring OCR as the first blocker.

## Municipality Record

- Name: Coventry
- State: Connecticut
- County: Tolland
- Population: 12435
- Timezone: `America/New_York`
- Website: `https://www.coventry-ct.gov`
- Meetings page: `https://www.coventry-ct.gov/AgendaCenter`
- Primary board for fixtures: Town Council
- Town Council category: `https://www.coventry-ct.gov/AgendaCenter/Town-Council-20`
- Platform: `civicplus`

The seeded record already exists in
`convex/data/states/connecticut.ts`.

## Source Model

Coventry's AgendaCenter page lists boards and commissions, while the Town
Council category page lists dated entries with:

- HTML agenda links.
- PDF agenda links.
- Packet links with `?packet=true`.
- Minutes/media indicators when available.
- Video-on-demand references at `https://coventryct.viebit.com/?folder=ALL`.

Keep the stored platform as `civicplus`. URL pattern detection alone does not
classify `https://www.coventry-ct.gov/AgendaCenter` as CivicPlus, but the
CivicPlus scraper explicitly supports AgendaCenter paths when selected by the
municipality platform.

## Expected Fixtures

Use these as the first deterministic fixtures for THE-294 and THE-295.

1. Coventry Town Council Meeting and Public Hearing, June 15, 2026, 7:00 PM
   - HTML: `https://www.coventry-ct.gov/AgendaCenter/ViewFile/Agenda/_06152026-4545?html=true`
   - PDF: `https://www.coventry-ct.gov/AgendaCenter/ViewFile/Agenda/_06152026-4545`
   - Packet: `https://www.coventry-ct.gov/AgendaCenter/ViewFile/Agenda/_06152026-4545?packet=true`
   - Expected topics include Neighborhood Assistance Act, FY 2026/27 budget,
     FY 2025 audit, budget transfers, reserve funds, acting deputy town
     manager, and Assistance for Fire Fighters Grant authorization.

2. Coventry Town Council Meeting, June 1, 2026, 7:00 PM
   - HTML: `https://www.coventry-ct.gov/AgendaCenter/ViewFile/Agenda/_06012026-4529?html=true`
   - PDF: `https://www.coventry-ct.gov/AgendaCenter/ViewFile/Agenda/_06012026-4529`
   - Packet: `https://www.coventry-ct.gov/AgendaCenter/ViewFile/Agenda/_06012026-4529?packet=true`
   - Expected topics include acceptance of May 12 and May 18 minutes,
     Conservation Commission and CRCOG appointments, Finance Committee reports,
     and Town Council correspondence.

3. Coventry Town Council Meeting, May 18, 2026, 7:00 PM
   - HTML: `https://www.coventry-ct.gov/AgendaCenter/ViewFile/Agenda/_05182026-4514?html=true`
   - PDF: `https://www.coventry-ct.gov/AgendaCenter/ViewFile/Agenda/_05182026-4514`
   - Packet: `https://www.coventry-ct.gov/AgendaCenter/ViewFile/Agenda/_05182026-4514?packet=true`
   - Expected topics include Daffodil Beautification Project recognition,
     Charles Beecher recognition, May 4 minutes, Charter Revision Commission
     recommendations, auditor appointment, salt-purchase funding, and
     correspondence.

Fallback fixture if a current link changes:

- Coventry Town Council Meeting, April 20, 2026, 7:00 PM
  - HTML: `https://www.coventry-ct.gov/AgendaCenter/ViewFile/Agenda/_04202026-4479?html=true`
  - PDF: `https://www.coventry-ct.gov/AgendaCenter/ViewFile/Agenda/_04202026-4479`
  - Packet: `https://www.coventry-ct.gov/AgendaCenter/ViewFile/Agenda/_04202026-4479?packet=true`

## Scraper Constraints

- The all-boards AgendaCenter page can produce broad results; prefer the Town
  Council category when validating exact expected fixtures.
- Agenda PDFs and packet PDFs are text-extractable for the sampled fixtures.
- OCR/image-only PDF support is not P0 for this municipality. Defer OCR unless
  a selected packet enclosure is essential and has no extractable text.
- Minutes may appear after approval and may lag agenda publication. Do not
  make minutes availability a P0 success criterion for the first scrape loop.
- Video URLs are useful references but not P0 for scrape persistence or summary
  generation.

## Verification Checklist

- Confirm the municipality row uses `platform: "civicplus"` and
  `timezone: "America/New_York"`.
- Scrape the Town Council category or AgendaCenter source and verify at least
  the three expected meeting dates are discoverable.
- Persist each meeting with a stable `sourceUrl`, `contentHash`,
  `meetingDate`, `meetingType`, `sourceType: "scraped"`, and scrape job ID.
- Keep agenda/packet source URLs in meeting metadata or raw content references
  where the schema allows it.
- For summary generation, use the HTML agenda or text-extractable PDF/packet
  content before considering OCR.
