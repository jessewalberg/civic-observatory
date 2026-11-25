# The development docket

A small app that serves the development docket of Tolland County, Connecticut: the planning, zoning, appeals, wetlands,
conservation and land-use items on the public agendas and minutes of the county's 13 towns, each with its outcome, the
source document's own words and a link to that document.

It is TanStack Start on Cloudflare Workers with one D1 database, in a folder of its own with its own lockfile. Nothing
here is deployed yet: every command below is local, and no workflow deploys, plans or reads a secret. The app in the
repository root is not used by it and is not changed by it.

## Decisions

1. **The data is in D1, not in the build.** A refresh is an operator's load (`scripts/load-docket.ts`) and never a code
   release. Only a made-up fixture is committed (`fixtures/`, towns that do not exist).
2. **No accounts, uploads, summaries on request, alerts, billing, email, cron, storage bucket, model, third party or
   cookie.** One thing is stored in a visitor's browser, after they sign up: the sign-up's token, in `localStorage`.
3. **Server functions are under `/_fn`.** A firewall rule blocks TanStack Start's default path, `/_serverFn`, for the
   whole zone, and must never need to change. Anything under `/_serverFn` gets a 404 from this Worker. The option is
   `serverFns: { base }` of the Start plugin (`vite.config.ts`, `src/lib/site.ts`).
4. **Links are ordinary links.** Every navigation is a document, so the docket reads the same without a script, a screen
   reader announces each page, and a page request is counted once. Scripts run only the sign-up.
5. **No structured data.** No Schema.org type says exactly what a docket item is, so none is used.
6. **Towns and boards come from the data.** The code names no town.

## Pages

| Path | What it is |
| --- | --- |
| `/` | The sign-up, then the items, newest meeting first, 25 a page. `?town=`, `?board=`, `?kind=` and `?upcoming=1` filter the whole dataset before it is paged; `?page=` pages it. A filtered list is `noindex, follow`. A page past the last one is a 404. |
| `/item/<id>` | One item. An item a later release dropped answers 410 and says when it was withdrawn; its content is deleted, and only its town, board and meeting date stay. |
| `/town/<slug>` | One town: what is and is not collected of each board, its items, and, on the first of its pages only, the meetings with nothing on the docket, which no later page reads or sends. A town that is not collected says so and why. |
| `/method` | What is included, the scope rule, how quotes are checked, what is missing, corrections. |
| `/privacy`, `/terms` | Short and plain. |
| `/explore*`, `/pricing`, `/search`, `/topics/*`, `/meeting/*`, `/dashboard*`, `/admin*`, `/sign-in*`, `/sign-up*`, `/reset-password` | Paths of the old app: 410 with a plain page. |
| `/sitemap.xml`, `/robots.txt` | The pages above that answer 200, without lists past the first. Only production allows robots; every other stage disallows everything and sends `X-Robots-Tag: noindex`. |
| `/api/health` | The commit, the current release and whether sign-up is open. 503 when D1 cannot answer. |

**Upcoming** means that the meeting's date is today or later in Connecticut and the item is not cancelled, decided when
the page is asked for. An item the data calls upcoming, whose date has passed, says that its outcome is not collected
yet.

## Data

`bun run load <file>` loads one `docket-v1` bundle (one JSON document: `window`, `towns`, `sources`, `meetings`, `items`)
into the local D1. The whole file is refused, and nothing is written, for any of these:

- another `schema_version`, a missing field, a field of the wrong type, or any field this app does not know;
- a raw name field (`applicant`, `owner` or `name`), at any depth: only the display fields, which hold no individual's
  name, are ever stored;
- a duplicate town, board, meeting or item, or a reference to one that is not in the file;
- a meeting of a board that is not in its town's list of boards, by the exact label, so that what is and is not collected
  is stated for every board that has a meeting or an item;
- an item without an `https:` link to its source document or without its quote;
- a meeting or an item dated outside the window, or a window that is not in order;
- fewer items than 80% of the current release, unless `--shrink "<why>"` says why (the reason is stored with the release).

What passes replaces the content in one D1 batch, which is one transaction: either the whole release is there or the
whole old one still is. The batch's first statement takes the next release number, so of two loads that started from the
same release only one can finish. Its last compares the stored items with the file's count. No statement is longer than
D1 accepts, so the same statements can go through another transport. Loading the release that is already there writes
nothing.

Item ids are stable. `releases` keeps one row for each load; `withdrawn_items` keeps what an item's address needs once
the item itself is gone. An id that a later release brings back is an item again.

## Sign-up

| What | How |
| --- | --- |
| Open or closed | `settings.signup_open`, one row. Closed as released. Opening it is an operator's statement, not a deploy: `UPDATE settings SET signup_open = 1`. |
| A sign-up | Every submission is its own row: email (lowercased), towns, role, the hash of its own token, and its own paid intent. The same email may be there several times. No row, token or intent of one submission is ever attached to another's, so no answer, alone or after any other, says whether an address was there before. |
| Limits | 5 submissions an hour for one client and 60 an hour in all, both rolling. One conditional `INSERT … SELECT … WHERE` takes the place and counts, so concurrent submissions cannot pass it; the sign-up's other statements run only if it took a place, in the same batch. Past a limit: 429 with `Retry-After`, and nothing stored. |
| The client | `HMAC-SHA-256(SIGNUP_CLIENT_KEY, "docket-signup-client:v1:" + address)`, where an IPv6 address counts as its /64. The address is never stored or logged. The hash is deleted with the next page request after its hour. Without the secret, sign-up answers as closed; locally a random key is made for each run. |
| Tokens | 256 random bits, kept in the browser; D1 holds the SHA-256. A token reaches the submission it came from and no other. |
| Paid intent | "Tell me when paid instant alerts launch, $29 a month" marks the token's own submission, once. |
| Remove my address | Deletes the submission this browser's token made, with its intent, and nothing else. |

No email is sent, and the page says so. `bun run report` prints counts only: page requests by kind of page and day, and
sign-ups. It counts each email once: the earliest row that is there gives its role and towns, and a paid intent counts
once for an email, whichever of its rows has it. Page requests are requests, not people; they count answers of 200 to a
`GET` of a page.

An address is not proven to belong to whoever typed it.

## Limits and headers

- `src/lib/limits.ts`: one Workers rate limit, every server function call, 60 a minute for one address, counted at one
  Cloudflare location and [approximate by design](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)
  (read 2026-11-24). A stage that does not bind it has the limits of the table above and no other. Pages are not limited.
- A server function's body is at most 4 KiB; more is a 413 before anything is parsed.
- `src/server/security.ts`: the same security headers on every answer, and a Content-Security-Policy with a new nonce
  each time that admits this site's own files and nothing else. `public/_headers` says the same for static files, which
  Cloudflare serves without the Worker.
- Every HTML answer says `no-transform`. Cloudflare may add its page-speed script to the pages of a proxied zone, with the
  page's own nonce on it, and [`no-transform` forbids it](https://developers.cloudflare.com/web-analytics/get-started/)
  (read 2026-11-24). A page says `public, max-age=0, must-revalidate, no-transform`, so whoever kept one asks again before
  showing it and learns that an item was withdrawn; so does the sitemap. An answer to a call, and a page that could not be
  read, is `no-store`. Static files keep their own (`public/_headers`).
- `src/server/observability.ts`: one record for each request, of allowlisted values only: route, method, status, time, D1
  counts, release. Never a URL, a query, an address, an email, a header or a body.
- The framework prints the errors it catches, and a parser's message quotes what it could not read. So a call that is not
  a JSON object is a 400 before the framework reads it, and on a stage the console prints the class of a caught error and
  no more (`src/server/log.ts`). A page that cannot read D1 is a 503 that says nothing of the inside.

## Commands

Run from `stack/` with Bun 1.4.4. `vite`, `tsc` and `wrangler` run on Node 24.

| Command | What it does |
| --- | --- |
| `bun install --frozen-lockfile` | Install exactly what `bun.lock` records. |
| `bun run check`, `bun run typecheck`, `bun run build` | Biome; `tsc`; the build with local bindings, then `tsc`. |
| `bun run db:local` | Apply the migrations to the local D1. |
| `bun run load <file>` | Load a bundle into the local D1. `bun fixtures/docket.ts` prints the made-up one. |
| `bun run dev` | The app on port 3000. |
| `bun run report` | The counts, from the local D1. |
| `bun run check:docket` | Loads a bundle (`DOCKET_BUNDLE=<file>`, or the fixture) and reads every page of it from the built Worker; every refusal; releases that drop, change and add items; loads that are interrupted. |
| `bun run check:signup` | The limits under 50 concurrent submissions, tokens, removal, the closed row, hostile input, what records and D1 hold, and that no order of calls answers differently for an address that was there before. |
| `bun run check:pages` | Every kind of page over HTTP and in Chromium: status, head, headers, hosts, console, width, keyboard, no script, weight. |
| `bun run check:limits` | The rate limit, the body limit, the headers, the old function path, the stages' robots and https. |
| `bun run check:breaks` | Breaks the app on purpose, one way at a time, in a scratch copy, and expects the checks above to fail. Slow; not in CI. |
| `bun run screenshots <folder>` | Pictures of the pages, for a person to look at. |

The checks run the built Worker in local workerd, with a D1 of their own that is deleted afterwards. They call no cloud
account and need no secret. Ports: `STACK_DOCKET_PORT`, `STACK_SIGNUP_PORT`, `STACK_PAGES_PORT`, `STACK_LIMITS_PORT`,
`STACK_SHOTS_PORT`. Chromium: `bunx playwright install chromium-headless-shell`, or set `CHROMIUM_PATH`.

There are no unit tests (Jesse, 2026-10-09).

Two lines outside this folder keep the root app as it was: `!stack` in the root `biome.json`, which would otherwise
refuse the configuration here, and `@source not "../stack"` in the root stylesheet, which would otherwise gain rules from
words here.

## Pins

Every dependency is pinned exactly, at the versions the reference stack runs, and `bunfig.toml` refuses versions younger
than 14 days when the lockfile changes. `seroval` and `seroval-plugins` are overridden to `~1.6.12`.
