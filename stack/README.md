# The development docket

A small app that serves the development docket of Tolland County, Connecticut: the planning, zoning, appeals, wetlands,
conservation and land-use items on the public agendas and minutes of the county's 13 towns, each with its outcome, the
source document's own words and a link to that document.

It is TanStack Start on Cloudflare Workers with one D1 database, in a folder of its own with its own lockfile. Nothing
here is deployed yet. Two stages are declared (`alchemy.run.ts`), and `production.yml` deploys one of them once its file
is on `main`; how, and everything before and after it, is [the release runbook](docs/runbooks/release.md). The app in the
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
| `/api/health` | The commit, whether the database is reachable, the current release (its number, when it was made, its items and towns) and whether sign-up is open, which it is only when the row says so and the Worker has its sign-up key. Counts only. 503 when D1 cannot answer. |

**Upcoming** means that the meeting's date is today or later in Connecticut and the item is not cancelled, decided when
the page is asked for. An item the data calls upcoming, whose date has passed, says that its outcome is not collected
yet.

## Data

`bun run load <file>` loads one `docket-v1` bundle (one JSON document: `window`, `towns`, `sources`, `meetings`, `items`)
into the local D1, and with `--stage` into a stage's ([how it connects, and why](docs/runbooks/release.md#6-the-load)). The
whole file is refused, and nothing is written, for any of these:

- another `schema_version`, a missing field, a field of the wrong type, or any field this app does not know;
- a raw name field (`applicant`, `owner` or `name`), at any depth: only the display fields are ever stored, and in them
  the bundle has a role where the document names an individual;
- a duplicate town, board, meeting or item, or a reference to one that is not in the file;
- a meeting of a board that is not in its town's list of boards, by the exact label, so that what is and is not collected
  is stated for every board that has a meeting or an item;
- an item without an `https:` link to its source document or without its quote;
- a meeting or an item dated outside the window, or a window that is not in order;
- fewer items than 80% of the current release, unless `--shrink "<why>"` says why (the reason is stored with the release).

What passes replaces the content in one D1 batch, which is one transaction: either the whole release is there or the
whole old one still is. The batch's first statement takes the next release number, so of two loads that started from the
same release only one can finish. Its last compares the stored items with the file's count. Loading the release that is
already there writes nothing, and counts what is stored before it says so: where that is not the file's, the stored release is
damaged, and the command says that and ends with 1. A client that was killed may not know whether its load finished: the
current release's digest says.

Item ids are stable. `releases` keeps one row for each load; `withdrawn_items` keeps what an item's address needs once
the item itself is gone. An id that a later release brings back is an item again.

**Private homes.** Where a town's document is about one, the docket shows its address: a permit for a house, a variance,
an order about one property. A person's name is replaced with a role there, in the display fields and in the quotes, but
an address can still point to whoever lives at it, so this is not anonymity and no page says that it is. The loader
refuses a field for a raw name; it cannot see a name in a sentence. What is in scope is the data release's decision, not
the app's: the app shows what the release holds, and withdraws what a later one drops.

## Sign-up

| What | How |
| --- | --- |
| Open or closed | `settings.signup_open`, one row. Closed as released. Opening it is an operator's statement, not a deploy: `bun run signup open`, with `--stage` for a stage's. |
| A sign-up | Every submission is its own row: email (lowercased), towns, role, the hash of its own token, and its own paid intent. The same email may be there several times. No row, token or intent of one submission is ever attached to another's, so no answer, alone or after any other, says whether an address was there before. |
| Limits | 5 submissions an hour for one client and 60 an hour in all, both rolling. One conditional `INSERT … SELECT … WHERE` takes the place and counts, so concurrent submissions cannot pass it; the sign-up's other statements run only if it took a place, in the same batch. Past a limit: 429 with `Retry-After`, and nothing stored. |
| The client | `HMAC-SHA-256(SIGNUP_CLIENT_KEY, "docket-signup-client:v1:" + address)`, where an IPv6 address counts as its /64. The address is never stored or logged. The hash is deleted with the next page request after its hour. Without the secret, sign-up answers as closed, and the page and `/api/health` say that it is; locally a random key is made for each run. |
| Tokens | 256 random bits, kept in the browser; D1 holds the SHA-256. A token reaches the submission it came from and no other. |
| Paid intent | "Tell me when paid instant alerts launch, $29 a month" marks the token's own submission, once. |
| Remove my address | Deletes the submission this browser's token made, with its intent, and nothing else. |

No email is sent, and the page says so. `bun run report` prints counts only: page requests by kind of page and UTC day
(`requests_by_utc_day`: what is asked after 7 or 8 in a Connecticut evening counts under the next day), and
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

## Stages and release

`preview` and `production`, and no other, each with its own Worker, D1 database, sign-up key and rate-limit counter, under
the same logical IDs (`Database`, `SignupClientKey`, `RequestRecords`, `Website`; `preview` also `Verifier`).

| | `preview` | `production` |
| --- | --- | --- |
| Worker | `civic-docket-preview`, on workers.dev behind Cloudflare Access, which admits the stage's own service token and nobody else | `civic-docket-production`, on `civicobservatory.com` alone; on workers.dev alone during the first cutover's first apply |
| Indexing | Disallowed, `noindex` | Allowed |
| Database | Replaced or dropped with its declaration | Retained, whatever happens to its declaration |
| Rate limit | 60 calls in 60 s, namespace 860311 | 60 calls in 60 s, namespace 860301 |
| Applied by | An operator, through the guard | `production.yml` after a push to `main`, and nothing else |

Both have `SIGNUP_CLIENT_KEY` (32 random bytes that Alchemy mints once and keeps in its encrypted state), `APP_ENV`, `APP_RELEASE`,
`REQUEST_RECORDS` (dataset `civic_docket_requests`), the Worker first for `/robots.txt`, and no invocation logs or traces, which
hold URLs and addresses. No cron, bucket, email, model or `LOCAL_TODAY`.

`scripts/infra.ts` is the one door to Alchemy: `alchemy.run.ts` calls its checks before anything is built or asked, so Alchemy's
own command line meets them too. It refuses an unknown stage, an apply from a dirty tree or with another `APP_RELEASE` than
`HEAD`, a production apply anywhere but in `production.yml`'s job, and, for both stages and in that job itself, every command of
Alchemy's but `plan` and `deploy`: `destroy`, `dev`, `drift`, `state …`, and `unsafe nuke`, which deletes across the account
whatever the stage. It is a convenience, and cannot stop a command that never loads this stack file. The boundary is where the
deploy token is kept, which is the operator's machine and the main-only GitHub environment `production`.

**The zone's block.** The zone answers 403 to every path under `/_serverFn`. No command, token or step here reads or writes it
through an API. The release asks for it from outside: a block that is gone stops a run before the domain moves, and after
that turns the run red without any change of its own.

**This repository is public**, and so are its runs: a run prints a closed vocabulary of this repository's own and no provider's
word. What that is, and how it is proven, is in the runbook (section 3).

`alchemy`, `@alchemy.run/cloudflare`, `@effect/platform-bun` and `@effect/platform-node` are development tools, like Vite and
Wrangler: nothing of them is in the Worker or in a page.

## Commands

Run from `stack/` with Bun 1.4.4. `vite`, `tsc` and `wrangler` run on Node 24.

| Command | What it does |
| --- | --- |
| `bun install --frozen-lockfile` | Install exactly what `bun.lock` records. |
| `bun run check`, `bun run typecheck`, `bun run build` | Biome; `tsc`; the build with local bindings, then `tsc`. |
| `bun run db:local` | Apply the migrations to the local D1. |
| `bun run load <file>` | Load a bundle into the local D1, or a stage's with `--stage`. `bun fixtures/docket.ts` prints the made-up one. |
| `bun run dev` | The app on port 3000. |
| `bun run report`, `bun run signup open\|closed` | The counts, and the sign-up's switch, of the local D1 or a stage's (`--stage`). |
| `bun run plan:preview`, `deploy:preview`, `plan:production` | Through the guard, with the operator's own token ([runbook](docs/runbooks/release.md)). |
| `bun run check:docket` | Loads a bundle (`DOCKET_BUNDLE=<file>`, or the fixture) and reads every page of it from the built Worker; every refusal; releases that drop, change and add items; loads that are interrupted. |
| `bun run check:signup` | The limits under 50 concurrent submissions, tokens, removal, the closed row, hostile input, what records and D1 hold, and that no order of calls answers differently for an address that was there before. |
| `bun run check:pages` | Every kind of page over HTTP and in Chromium: status, head, headers, hosts, console, width, keyboard, no script, weight. |
| `bun run check:limits` | The rate limit, the body limit, the headers, the old function path, the stages' robots and https. |
| `unshare -rn bun run check:guard` | What each stage declares, and every way to fall short of the production job: the guard, Alchemy's own command line, the domain and the operator's scripts. Refuses to run with a network. |
| `bun run check:load` | The remote load, the report and the switch against stand-ins: every refusal, Wrangler's own proxy, lost answers, kills, two loads at once. |
| `bun run check:release` | `check:production` against the Worker as Alchemy builds it, green and red for each thing; the workflow as data; its own steps against stand-ins, green and in each failure, with every line of their output read for what must not be public. |
| `bun run check:production <address> <mode>` | What a release run asks of the deployed site: `reachable`, `preview`, `cutover`, `release`. Public requests only. |
| `bun run check:breaks` | Breaks the app on purpose, one way at a time, in a scratch copy, and expects the checks above to fail. Slow; not in CI. |
| `bun run screenshots <folder>` | Pictures of the pages, for a person to look at. |

The checks run the built Worker in local workerd, with a D1 of their own that is deleted afterwards. They call no cloud
account and need no secret. Ports: `STACK_DOCKET_PORT`, `STACK_SIGNUP_PORT`, `STACK_PAGES_PORT`, `STACK_LIMITS_PORT`,
`STACK_SHOTS_PORT`; `check:guard`, `check:load` and `check:release` take free ones. Chromium: `bunx playwright install chromium-headless-shell`, or set `CHROMIUM_PATH`.

There are no unit tests (Jesse, 2026-10-09).

Two lines outside this folder keep the root app as it was: `!stack` in the root `biome.json`, which would otherwise
refuse the configuration here, and `@source not "../stack"` in the root stylesheet, which would otherwise gain rules from
words here.

## Not proven here

Everything above runs locally; no cloud account was asked anything. Before the docket is public, these must be shown:

On the preview, by an operator, from the runbook (section 2):

- **The stages themselves:** that Alchemy applies what is declared, that Access refuses everybody without the token, that the
  rate limit, the key and the records are bound.
- **The headers at the edge:** that static files get `public/_headers`, and on the domain that `no-transform` keeps the zone's
  page-speed script out of a page asked for with `Accept: text/html`.
- **The remote load on remote D1:** the same refusals, the same kills and the same two loads at once. Here it is shown as far
  as Wrangler's own proxy Worker in local workerd; Cloudflare's edge preview, and the database behind it, are not.
- **Withdrawal at the edge:** that nothing between the Worker and a reader keeps a page past a release that withdrew its
  item. The Worker's own answers are right, and say `must-revalidate`; a browser's back button and a copy someone saved
  are out of reach.
- **The cost of reading:** pages are not limited, and each reads D1.

Before the launch:

- **The contact address:** `hello@civicobservatory.com` does not exist yet. The method, privacy and terms pages and every
  item send corrections and removals there, so it must receive mail that somebody reads before the docket is public.
- **The move:** the call that takes the hostname from the old Worker is Wrangler's, not in the public API reference.

Fresh data (C3):

- **Rows read as the dataset grows:** a list counts every item that matches and skips the earlier pages with `OFFSET`, the
  sitemap reads every id, and the method page every board. At 363 items that is small. It grows with every release, and
  nothing caps a release's size.
- **The words:** that each quote is in its document is checked where the bundle is built, not by this loader, which checks
  that a quote and a link are there.

## Pins

Every dependency is pinned exactly, at the versions the reference stack runs, and `bunfig.toml` refuses versions younger
than 14 days when the lockfile changes. Two are ahead of it: `wrangler` 4.72.0, the first that can open a session on the edge
today, and `miniflare` of the same day ([why](docs/runbooks/release.md#6-the-load)). The Vite plugin brings its own older
copies, which only the local build uses. `seroval` and `seroval-plugins` are overridden to `~1.6.12`.
