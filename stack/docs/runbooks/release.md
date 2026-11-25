# Release runbook: reads, preview, launch, sign-up, rollback

How the docket is put on `civicobservatory.com`, loaded, checked and taken back. **This file authorizes nothing.** A step
that a visitor could notice waits for the owner's yes on the release card, for exactly what the card says. This repository
is public: no account, zone, database, token, attachment or rule ID, no address of a person and no `workers.dev` subdomain
belongs in this file, in a commit, in a pull request or in a run's output.

| Name | What it is |
| --- | --- |
| `civic-observatory` | The old app's Worker. It stays untouched as the way back. This repository also used the names `civic-pulse`, `civic-observatory-stack-staging` and `civic-observatory-stack-local`; none is used here. |
| `civic-docket-production` | The docket's Worker, stage `production` of `alchemy.run.ts`. |
| `civic-docket-preview` | The docket's Worker, stage `preview`, behind Cloudflare Access. |
| `civic-docket-Database-<stage>-…` | The stage's D1 database, as Alchemy names it. |
| `civicobservatory.com` | The one hostname. `www` does not resolve. It moves between the two Workers; its DNS record never changes. |
| The block | The zone answers 403 to any path that starts with `/_serverFn`, the old app's function path. The docket's functions are under `/_fn`, so it needs nothing of the block, and **nothing here reads or writes it through an API**: it is asked from outside, as a visitor would meet it. It stays as it is before, during and after. |
| The load | `bun run load <file> --stage <stage>`: an operator puts a release of the data into D1. Never part of a code release. |
| The switch | `settings.signup_open`, one row. Closed as released. |

Run everything from `stack/`, in a clean checkout of the commit it is about. The operator keeps two environment files on
their own machine and starts the commands through them (for example with a secret manager's `run --env-file`). They are
not in this repository, because they would say where the secrets are kept. Each provides one secret:

| File | Provides | Used for |
| --- | --- | --- |
| preview | `CLOUDFLARE_API_TOKEN` that may write Workers Scripts, D1, Secrets Store, and Access applications and service tokens of the account | `plan:preview`, `deploy:preview`, `--stage preview`, the reads that say "wider token" |
| production | `CLOUDFLARE_API_TOKEN`: the deploy token of section 1, step 2 | `plan:production`, `--stage production`, the reads |

The commands set the stage, the profile and `APP_RELEASE` themselves. In a shell started that way (`curl` reads the token
from a file descriptor, never from its arguments):

```sh
cf() { curl -sS "https://api.cloudflare.com/client/v4$1" -H @<(printf 'Authorization: Bearer %s' "$CLOUDFLARE_API_TOKEN") -H "Content-Type: application/json" "${@:2}"; }
ACCOUNT=$(cf "/accounts?per_page=2" | jq -r '.result | if length == 1 then .[0].id else error("not one account") end')
ZONE=$(cf "/zones?name=civicobservatory.com" | jq -r '.result | if length == 1 then .[0].id else error("not one zone") end')
```

The one read that says where the cutover stands. It changes nothing:

```sh
GITHUB_REPOSITORY=jessewalberg/civic-observatory GITHUB_TOKEN=$(gh auth token) bun scripts/production-domain.ts inspect
```

| Line | What it can say |
| --- | --- |
| `before: civicobservatory.com -> …` | The Worker that holds the domain: one of the two above, `no Worker`, or `a Worker this file does not know` |
| `the block on /_serverFn: …` | `on`, `gone` or `unread` (nobody answered, or this machine is challenged) |
| `cutover: …` | `the first one; …` · `the first one did not finish; …` · `unknown; …` · `finished; …` · `finished, and the domain was given back by hand since` · `unread` (without the two GitHub variables, or before the launch merge) |
| `run …, attempt … may still write the domain: no run goes on before …` | Only while that is so (section 3) |

## 1. Before the card

1. **The branch.** CI is green on the head and its review is closed. On that head, in a clean checkout:
   `bun install --frozen-lockfile`, `bun run check`, `bun run build`, `bun audit --prod --audit-level=high`, `check:docket`,
   `check:signup`, `check:pages`, `check:limits`, `check:load`, `check:release`, `unshare -rn bun run check:guard`.
2. **The deploy token.** An account-owned token of its own, with an end date, kept by the operator and as the secret
   `CLOUDFLARE_PRODUCTION_DEPLOY_TOKEN` of the GitHub environment `production`, whose only branch is `main`. Permission
   groups, and no other:

   | Resource | Group | Why |
   | --- | --- | --- |
   | Account | Workers Scripts Write | The Worker, and the domain's move |
   | Account | D1 Write | The database and its migrations, and the load |
   | Account | Secrets Store Write | Alchemy binds its state store's token on every run, and binding needs Write |
   | Zone `civicobservatory.com` | Zone Read | The zone's ID for the move |

   Nothing that can read or change a firewall rule, DNS, a zone setting or Access. Prove it, with the token:

   | Read | Expect |
   | --- | --- |
   | `cf "/accounts/$ACCOUNT/tokens/verify" \| jq .result.status` | `active` |
   | `cf "/zones/$ZONE/rulesets" \| jq .success` and `cf "/zones/$ZONE/dns_records" \| jq .success` | `false`, twice |
   | `cf "/zones/$ZONE/rulesets" --data '{}' \| jq '.errors[0].code'` | 10000 (denied). The empty ruleset is refused either way; a token that may write is told that it is invalid, and then **stop** |

   Older secrets of that environment stay for the old app's way back; `production.yml` reads none of them.
3. **Reads** (the production file, unless it says "wider token"). None of them changes anything.

   | Read | Expect |
   | --- | --- |
   | The read above, without the two GitHub variables | `civicobservatory.com -> Worker civic-observatory`; the block `on`; `cutover: unread`. That listing holds Custom Domains only, the one kind the move call takes |
   | Wider token: `cf "/zones/$ZONE/workers/routes" \| jq '[.result[] \| {pattern, script}]'` | No route of `civicobservatory.com`. If the old Worker holds the hostname by a **route**, stop: the move would not take it, and a route would go on serving the old Worker after a Custom Domain is attached. The way then is a decision of its own, on the card |
   | Wider token: the zone's custom firewall rules (dashboard: the zone, Security, Custom rules) | One that blocks paths that start with `/_serverFn`, enabled |
   | `curl -so /dev/null -w '%{http_code}' https://civicobservatory.com/_serverFn/x` and `…/_fn/x` | 403, and not 403 |
   | `for s in production preview; do cf "/accounts/$ACCOUNT/workers/scripts/civic-docket-$s/settings" \| jq '.errors[0].code'; done` | 10007 twice: neither name is taken (after the rehearsal, only `production`'s) |
   | `cf "/accounts/$ACCOUNT/workers/scripts" \| jq '[.result[].id \| select(startswith("civic-docket"))]'` | None; after the rehearsal the preview's alone. `civic-docket-load` is never among them (section 6) |
   | `cf "/accounts/$ACCOUNT/d1/database?per_page=100" \| jq '[.result[].name \| select(startswith("civic-docket"))]'` | No production database |
   | Every Worker's settings, `bindings[] \| select(.type == "ratelimit")` | None uses namespace 860301 or 860311 (two bindings with one ID share their counts) |
   | **Workers Builds** of `civic-observatory` (dashboard: the Worker, Settings, Builds; the API wants a user's token) | Not connected. A connected repository deploys `main` by itself. If it is, its disconnect is a step of the card. `vite.config.ts` here refuses to build in it |
   | Wider token: `cf "/zones/$ZONE/settings/rum" \| jq .result.value`, or the zone's Web Analytics page | It is on: the page-speed script is added to pages asked for with `Accept: text/html`. The docket's pages say `no-transform`, which forbids it, and the release check asks that way and fails on it. Turn nothing on |
   | The zone's AI Labyrinth (Security, Settings, Bot traffic) | On 2026-11-25 one anonymous page of the old site carried its hidden link (`/cdn-cgi/content?id=…`, to a plain `curl`, not to a browser and not to the release check). It loads and runs nothing. The release check lets exactly that link pass and says how many pages had it |
   | `bun run plan:production`, and again with `PRODUCTION_DOMAIN=unmanaged` | 3 to create (`Database`, `SignupClientKey`, `Website`) with their bindings; no update, replace or delete, no Access application. With the domain managed it is declared; unmanaged it is not |
   | GitHub Actions: the environment `production` allows `main` only; Settings, Actions: a pull request of a fork needs approval and gets no secret | As said |

   `plan` changes nothing of the stage, but like every Alchemy run it uploads a temporary edge preview to read its state
   store's token.
4. **The contact address** receives mail that somebody reads (section 11).
5. **The preview rehearsal** (section 2) passed on the head the card is about.
6. **The data** to load is fresh and reviewed (C3), and its file is on the operator's machine.
7. **The card** says, in this order: the merge makes a new Worker and an empty database beside the old site; an operator then
   loads the data, for which the run waits up to an hour, and meanwhile the docket can be read on its own `workers.dev`
   address; it is checked there, the address moves, and it is checked again; if anything fails, the address goes back by
   itself, except if the zone's block is gone, and then the run says so and changes nothing more; a run that gave back or whose
   machine died may be run again, an hour later if a domain call of it was not confirmed; no step can change a firewall rule or
   DNS; the contact address's mail records (section 11), which are made before; sign-up stays closed until its own decision;
   the old Worker and its data stay 14 days; and that **each later merge that changes `stack/` or the workflow releases
   production and its card says so**.

## 2. The preview rehearsal

Systems-only staging. It never binds a domain and never touches `production`. `<subdomain>` is the account's own, which
no public text says.

1. **Names free:** section 1, step 3, for `preview`.
2. **The window.** The provider uploads the Worker and turns `workers.dev` on before it makes the Access application. So
   first make a temporary self-hosted Access application for `*civic-docket-preview.<subdomain>.workers.dev` whose only
   policy denies everyone (wider token, or the dashboard).
3. `bun run plan:preview`. It may create only `Database`, `SignupClientKey`, `Verifier`, `Website` with its bindings, and
   `Website/Access`; never a domain, a route, an update or a delete.
4. `bun run deploy:preview`. The first time the migration meets D1 itself.
5. **The door.** Anonymous requests for `https://civic-docket-preview.<subdomain>.workers.dev/`, `/api/health`,
   `/robots.txt` and a version preview URL are refused (403, or a redirect to Access), before and after the temporary
   application is deleted. Delete it and ask again. For up to two minutes a new name can answer as nobody's (404 without
   `x-commit-sha`): not the Worker; ask again. Then rotate the verifier's secret
   (`POST /accounts/{account}/access/service_tokens/{id}/rotate`), keep both values in the shell's memory, and export them
   as `CF_ACCESS_CLIENT_ID` and `CF_ACCESS_CLIENT_SECRET`, never typed into a command. A wrong secret is refused.
6. **The load, and that it is one transaction** (section 6). Each command prints `Stage: preview` first.

   | Do | Expect |
   | --- | --- |
   | `bun run load <a refused file> --stage preview`, for a truncated file, a file with a field called `owner`, and one with a meeting of a board its town does not list | Refused before any call; `/api/health` still says `"docket":null` |
   | `bun run load <file> --stage preview` | `Release 1: …` with the file's counts; `/api/health` names release 1, its items and towns |
   | The same command again | `Release 1 is this file already; nothing was written.` |
   | A file with fewer than 80% of the items, without and then with `--shrink "<why>"` | Refused; then loaded, with the reason in `releases`. Load the real file again |
   | Kill: start a load of a changed file and `kill -9` its process group 0.5, 1, 2, 3 and 5 seconds after `Loading …` | After each, `/api/health` and `bun run report --stage preview` name the old release whole or the new one whole. Run the same command again: it loads, or says that it is there already |
   | Two at once: two changed files, started together | One loads; the other fails whole (`UNIQUE constraint failed: releases.seq`), and says which release is there |
   | `bun run load <file> --stage production` with the preview file's token | Refused: no `--production-approved` |
   | `bun run load <file> --stage production --production-approved $(git rev-parse HEAD)`, before production exists | Refused: no such Worker |

7. `APP_RELEASE=$(git rev-parse HEAD) bun run check:production https://civic-docket-preview.<subdomain>.workers.dev preview`
   is green.
8. **Sign-up.** Only with made-up addresses at `example.com`.

   | Do | Expect |
   | --- | --- |
   | `bun run signup --stage preview open` | Reads back `open`; the page shows the form (Access lets the verifier in: a browser needs both headers) |
   | Sign up six times from one machine within an hour | Five stored, the sixth 429 with `Retry-After` |
   | 61 calls of one function in a minute, one after another | A 429 (the limit is approximate: say at which call) |
   | "Tell me when paid …", then "Remove my address" | Recorded once; the row is gone |
   | `bun run report --stage preview` | Counts only |
   | `bun run signup --stage preview closed` | Reads back `closed`; the page says that sign-up is not open, and a kept call is refused (403) |

   Then delete what is left: `signups` and `signup_attempts` of the preview are empty (`report` says 0).
9. **Withdrawal at the edge.** Ask for two items as a browser does, twice each. Load a file without them (above 80%). Both
   answer 410 at the next request, from two networks, with no `cf-cache-status: HIT` before or after and
   `must-revalidate` on every page. Load the whole file again: 200.
10. **Headers at the edge.** The stylesheet, a script and `/favicon.svg` carry every header of `public/_headers`; a page asked
    for with `Accept: text/html` says `no-transform` and holds no script of anybody else's. (`check:production` reads both.
    The preview's host is not in the zone; the domain is read again at the launch.)
11. **The cost of reading.** Crawl every sitemap URL with the verifier's headers (at most four at a time; 0 errors), then read
    what it cost, per kind of page, and write it into the record:

    ```sh
    cf "/accounts/$ACCOUNT/analytics_engine/sql" --data "SELECT blob3 AS route, sum(_sample_interval) AS n, quantileWeighted(0.5)(double4, _sample_interval) AS rows_p50, max(double4) AS rows_max, quantileWeighted(0.95)(double2, _sample_interval) AS ms_p95 FROM civic_docket_requests WHERE blob1 = 'preview' AND timestamp > NOW() - INTERVAL '1' HOUR GROUP BY route"
    ```

    CPU per request: the Worker's Metrics page, or the GraphQL Analytics API's `workersInvocationsAdaptive`
    (`quantiles { cpuTimeP50 cpuTimeP99 }`).
12. **The logs.** The Worker's log lines are our records and nothing else: no URL, query, address or email. Invocation logs
    are off (`cf "/accounts/$ACCOUNT/workers/scripts/civic-docket-preview/settings" | jq .result.observability`).
13. No temporary application is left; anonymous and wrong-secret requests are refused on both forms of the address.

## 3. The launch

The owner's yes merges the launch pull request (section 12) into `main`, and `production.yml` starts. It is the only way
production is deployed; the guard refuses it anywhere else.

| Step in the run | What it does | If it fails |
| --- | --- | --- |
| Install, audit, Biome, build, the four checks | On the exact commit, with no credential | Nothing happened |
| Inspect (read only) | Who holds the domain; by GitHub's record of earlier runs, whether one finished the cutover or moved the domain, and that no domain call of theirs may still land; that the block is on. What it cannot tell, it refuses | Nothing happened |
| This runner can read the live site | A challenge would fail the last check after the move | Nothing happened |
| Deploy, domain unmanaged | Alchemy makes the database, the sign-up key and the Worker, on workers.dev alone | The domain never moved |
| **Wait for the load** | Asks the new Worker's `/api/health` every 20 seconds, for up to 60 minutes, until this commit names a release with at least 300 items | The domain never moved. Run it again |
| Check it on workers.dev | `scripts/check-production.ts workers.dev cutover`, against the release the wait saw | The domain never moved |
| Move the domain | Asks for the block once more; then one call that takes the hostname from the old Worker without detaching it; then reads it back | **The domain back** |
| Deploy, domain declared | Alchemy applies the stage again; workers.dev goes off | The domain back |
| Check `https://civicobservatory.com` | The same list on the domain, and the block from outside | The domain back, unless the block is gone |
| Give back | Only after a failure or a cancelled run, only while no run has finished the cutover, and only what this run, or the run it carries on, has moved. It asks for the block first: **if that is gone, the domain stays on the new Worker**, which does not need it, and the step says so | Section 7 |

**The operator's part** is in the middle. When the run is at "Wait for the load":

```sh
bun run load <file> --stage production --production-approved <the merge commit>
```

It refuses unless the Worker that is deployed says that very commit. Load once, and nothing more until the run is over: the
checks compare what they read with the release the wait saw, and another release fails the run.

From the first apply until the second, the docket can be read by whoever knows its `workers.dev` address, with sign-up closed.
A release check reads about 30 pages whole, up to a few times while it settles, and those count as page requests in the
report; the rest of the sitemap is asked for by its head, which is not counted. Leave the day of a release out of a count of
readers.

**A run that did not finish.** A run whose machine died after the move leaves the domain on the new Worker and no
give-back. Run it again (`gh run rerun <run id>`) once the hour below is over, or let the next push do it: it does not move
the domain or wait for data; it deploys and checks the live site. Red, and the domain goes back. Green, and that run is the
record that the cutover is finished. It carries on only what GitHub shows an earlier run to have moved; where GitHub shows
neither that nor a finished run, or its list is not whole, it refuses before it changes anything.

**A domain call nobody confirmed** may still be carried out after the run that made it is over. So where an earlier
attempt's move or give-back step failed or was cancelled, or its runner was lost, every run refuses until 60 minutes after
that attempt ended. Its log, and the read at the top, say from when one may go on. After that the Worker that holds the
domain, as read, is the truth. The hour is a rule of ours; Cloudflare publishes no bound. Sooner, a person can only give the
domain back (`bun scripts/production-domain.ts restore`); never move it forward by hand.

GitHub's own records decide whether the cutover is finished, not a row of ours: a run ends successfully exactly when it
ended without a give-back, so "finished" and "given back" can never both be recorded. GitHub ends a cancelled job five
minutes after the cancel ([reference](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-cancellation),
read 2026-11-24), so the give-back has that long.

**After a finished cutover**, a push runs everything down to the inspection, the second deploy and the last check only. It
never touches the domain, the data or the switch, and gives nothing back: a failed check leaves the new version serving and
the run red.

**What the run prints is public.** No step prints an ID of the account, the zone, the database, the attachment or a token,
an email address or the `workers.dev` subdomain. The subdomain travels between steps as an output and is masked
(`::add-mask::`) before it is written; Alchemy's own output passes through a filter (`scripts/public-log.ts`). `check:release`
runs every step, green and in each failure, against stand-ins that answer with recognizable ones, and reads all of it.

## 4. After the merge

The run is green and the domain is on the new Worker. Read, and record:

1. `gh run view` of that run: every step, and that the give-back step was skipped. Read its whole log once as a stranger
   would.
2. The read at the top: `-> Worker civic-docket-production`; the block `on`; `cutover: finished; …`.
3. `APP_RELEASE=<merge commit> bun run check:production https://civicobservatory.com release` from another machine.
4. The Worker's bindings (`cf "/accounts/$ACCOUNT/workers/scripts/civic-docket-production/settings" | jq '.result.bindings[] | {name, type, namespace_id, simple}'`):
   `DB`, `REQUEST_RECORDS`, `SIGNUP_CLIENT_KEY` (`secret_text`), `LIMIT_CALLS` (860301, 60 in 60 s), `APP_ENV`, `APP_RELEASE` and
   nothing else. `…/subdomain` says both `false`.
5. `bun run report --stage production`: sign-up closed, 0 sign-ups.
6. A browser: home, a filter, an item, its town, method, privacy: no console error. A phone.
7. The log lines and `civic_docket_requests`: no URL, query, address, email.
8. `https://civicobservatory.com/_serverFn/x` is 403.

The old Worker and its data stay as they are for 14 days (section 10).

## 5. Sign-up, open and closed

The switch is a row in production's D1; no deploy turns it. Opening it is its own decision of the owner, after the launch:

```sh
bun run signup --stage production open --production-approved <the deployed commit>
bun run signup --stage production closed --production-approved <the deployed commit>
```

One statement, then a read back that is printed. Closing takes effect at the next call. `bun run report --stage production`
prints counts only. Before opening: the contact address answers, `SIGNUP_CLIENT_KEY` is bound (section 4), and `check:production
… release` is green.

## 6. The load

`bun run load <file> [--shrink "<why>"] [--stage preview|production [--production-approved <commit>]]`. Its first line says
the stage. Without `--stage` it is the local database.

1. The whole file is read and refused on this machine first (`README.md`, "Data"), before any call.
2. The stage's Worker is asked for what it is: its `APP_ENV` is the stage, its `DB` is one D1 database, and that database's
   name is the one Alchemy gives this app's database of this stage. For production its `APP_RELEASE` must be the commit of
   `--production-approved`. Anything else is refused.
3. A connection to that one database is opened, its tables are compared with this app's, and the load is **one `DB.batch()`
   of the D1 binding**, which [is one transaction](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch) (read
   2026-11-25).
4. If the answer is lost, the current release is read again and said. A killed client: run the same command again.
5. **Nothing acts later than ten minutes.** The batch holds the time it was asked for, and the database refuses the whole of it
   if it arrives more than ten minutes away from that, however it was delayed. The connection's own Worker answers nothing after
   the same ten minutes, so a preview that a killed client left behind can do nothing. A message about an uncertain outcome
   names the time; after it, what the database says is what is there. The switch (section 5) is held to the same. A machine
   whose clock is off by ten minutes cannot load.

**How it connects, and why.** Read 2026-11-25:

| Way | One transaction | What it exposes | Taken |
| --- | --- | --- | --- |
| [Remote bindings](https://developers.cloudflare.com/workers/local-development/#remote-bindings): a local Worker whose `DB` is the remote database, through Wrangler's own remote proxy (what `startRemoteProxySession` starts, with a deadline in front of it: `scripts/remote-proxy.ts`) | Yes. The binding sends a batch as one request, and Wrangler's proxy passes that request on to the same D1 service unchanged (`check:load` runs that proxy and counts) | Nothing is deployed. While the command runs: a proxy on this machine's loopback, without a password, that can run any statement on this one database; and an edge preview of the proxy, which answers only with the session's token. Measured on the edge, 2026-11-25, with such a preview of a name that is not deployed: it answers with its token at once and 404 without, and the name stays undeployed. The loopback one ends with the command, the preview at the latest after ten minutes, and nothing has to be deleted | **Yes** |
| A one-off operator Worker, deployed, used once with a one-time secret, deleted | Yes | A public address bound to the production database for seconds to minutes, and for as long as it takes if the client is killed before it deletes it. It is a deploy past the guard | No |
| D1's REST API | Its reference says nothing of a rollback | Nothing new | No |
| `wrangler d1 execute --file` ([import](https://developers.cloudflare.com/d1/best-practices/import-export-data/)) | A file's statements, not this batch with its bound values and its two guards; what a failed import leaves is not what one transaction leaves | Nothing new | No |

So run it on a machine nobody else uses at that moment. Reads and writes cost what D1 always costs; the load says how many
rows it wrote. Limits that matter ([limits](https://developers.cloudflare.com/d1/platform/limits/), read
2026-11-25): a statement of the batch is under 100 KB and a bound value under 2 MB (pieces are 80 KB), and each statement
under 30 seconds.

**Cloudflare Access.** If Access covers the whole account's `workers.dev` names, the pinned Wrangler cannot pass it without a
person ([as documented](https://developers.cloudflare.com/workers/local-development/#connect-to-access-protected-workers)),
and the session fails before anything is read or written. The rehearsal (section 2, step 6) shows which it is. Nothing is
named `civic-docket-load` in the account: it is the name of the edge preview alone, and is never deployed.

## 7. Rollback

The owner's call, except the automatic give-back. **The old Worker is given the domain only while the block is on.**
`scripts/production-domain.ts restore` asks for it first and refuses if it is gone. Never run the old app's own deploy while
the docket is live.

**Before the move** nothing needs rolling back: the old site never stopped. Run the job again when its cause is known. What
it made (Worker, database, a load) stays and is used again.

**The first cutover's run died.** Run it again an hour after it ended. If nobody will, or sooner is needed, the read at the
top says what to do:

| Domain | `cutover:` | The block | Do |
| --- | --- | --- | --- |
| old | `the first one; …` | on | Nothing is owed. Run the job again when the cause is known |
| new | `the first one did not finish; …` | on, or unread | Run it again, once no domain call may land; or `check:production … release` from another machine. Red: `restore`, then read again. Green: run it again, so that the cutover is recorded |
| new | `unknown; …` | on, or unread | Read the runs (`gh run list --workflow production.yml --branch main --event push`). One succeeded: GitHub's list was late; read again. None moved the domain: somebody did by hand. `restore`, and the next run does the whole cutover |
| any | `Refusing: GitHub …` | any | Read again in some minutes, or when the run that goes on has ended. If it stays, a run was deleted, at the beginning of the list, in it, or a successful one: a pull request sets `CUTOVER_SINCE` to a time after it and `FIRST_RUN` to the number of the run after it, and the domain goes back by hand first if the new Worker has it. Never delete a run of this workflow |
| new | `finished; …` | on | Nothing is owed |
| old | `finished, and the domain was given back by hand since` | on | Nothing is owed. "Going forward again", below |
| old | any | gone | Put the block back at once, in the dashboard |
| new | any | gone | The docket does not need it, and `restore` refuses. Put it back first, then this table again. Until then each release run ends red |

**After the cutover**, by hand: the switch closed (section 5); `gh workflow disable production.yml`; end any run that goes on
(`gh run list --workflow production.yml --limit 5`, `gh run cancel <id>`, wait until it has ended) and go on only when the
read at the top names no run that may still write the domain; `bun scripts/production-domain.ts restore`; then read at the top
again, and as a visitor: the old site answers, `/_serverFn/x` is 403. The docket's database keeps its sign-ups.

**A bad later release** does not need the old site: disable the workflow, end any run, and roll the Worker back to the version
before (`VERSION` from the first command):

```sh
SCRIPT="/accounts/$ACCOUNT/workers/scripts/civic-docket-production"
cf "$SCRIPT/deployments" | jq -c '.result.deployments[:6][] | {created_on, versions}'
cf "$SCRIPT/deployments" --data "{\"strategy\":\"percentage\",\"versions\":[{\"percentage\":100,\"version_id\":\"$VERSION\"}]}" | jq -c '.success, .errors'
```

Migrations and data are not rolled back. **Bad data** is replaced by loading the earlier file again (`--shrink` if it is much
smaller); D1's [Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/) is the last resort, because it takes
sign-ups back too.

**Going forward again** after the domain was given back by hand from a finished cutover: a push, or a re-run of a finished
run, refuses to move it. Enable the workflow, and merge a pull request that sets `CUTOVER_SINCE` (`scripts/production-domain.ts`)
to a time after the give-back, and `FIRST_RUN` to the number its own run will have; its card says that it moves the domain. After an automatic give-back nothing is needed.

**The domain is on no Worker.** The run refuses. Attach it to the Worker that should serve
(`PUT /accounts/{account}/workers/domains` with `hostname`, `service`, `zone_id`), then read it back.

## 8. Later releases

One pull request, one card that says the merge releases production, one run: checks, apply, check. A migration is applied
before the new version serves, so it must be safe for the version still running. Never edit an applied migration.

## 9. Rotations

- **Deploy token,** before its end date: mint a fresh one with the same groups, write it over the operator's copy and the
  environment's secret, then delete the old one.
- **The verifier's secret** is rotated whenever it is used (section 2, step 5).
- **The sign-up key** (`SignupClientKey`) lives in Alchemy's encrypted state. Renaming that logical ID mints another; callers'
  counts of the current hour start again, and nothing else changes.

## 10. Retiring the old Worker

Not before 14 days after the launch, on a card of its own, because it deletes things: the old Worker, its data, its sign-in and
payment vendors' projects, and the environment's older secrets. Its pull request first takes the cutover's steps and the
give-back out of `production.yml` and `production-domain.ts`, so that no later run can name a Worker that is gone (GitHub does
not keep run records for ever). The block goes last, if at all; whoever removes it also changes `check-production.ts`, which
expects 403 on the domain.

## 11. The contact address

`hello@civicobservatory.com` is on every page, and receives nothing: the zone has no MX record (public DNS, 2026-11-25).
Before the card can say that the site is ready:

1. [Email Routing](https://developers.cloudflare.com/email-routing/get-started/enable-email-routing/) (read 2026-11-25), in the
   dashboard: onboard `civicobservatory.com`. It adds MX, SPF and DKIM records to the zone, which are shown before they are
   made. This is the one change to the zone's DNS, it is a step of the card, and no release touches it.
2. Add the owner's mailbox as a destination address. Cloudflare sends it a message, and the owner follows its link.
3. A rule: `hello@civicobservatory.com` to that destination. No catch-all.
4. Send a real message from another provider's mailbox, and one that a visitor's reply would be. Both arrive in the inbox, not
   in spam; the owner answers one. Write the date into the record, never the mailbox.

## 12. Turning it on (the launch pull request, C4)

`production.yml` is in this branch and starts on a push to `main`, so nothing starts it until its file is on `main`: GitHub
reads a push's workflows from the commit that was pushed. This branch is never pushed to `main`. The launch pull request:

- merges the docket's branch into `main`, with `stack/` and `.github/workflows/production.yml` in it. Its own merge commit
  is the first push that carries the workflow, and it changes `stack/`, so it starts the first run;
- leaves `CUTOVER_SINCE` at a time before the merge and `FIRST_RUN` at 1: the workflow is new, so GitHub numbers its runs from 1
  (`gh run list --workflow production.yml` lists none before the merge);
- changes the root `README.md`, which still says that no merge deploys.

`production.yml` starts only for pushes that change `stack/**` or the workflow itself
([path filters](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onpushpull_requestpull_request_targetpathspaths-ignore),
read 2026-11-25). It leaves out all of the root app (`src/`, `server/`, `scripts/`, `migrations/`, `public/`, `wrangler.jsonc`, the
root `package.json` and `bun.lock`), `docs/` and `deploy.yml`. So after a merge that changes only those, production rightly
serves an older commit than `main`'s head: compare the live commit with the last commit that touched the two paths
(`git log -1 --format=%H main -- stack .github/workflows/production.yml`). `deploy.yml` keeps its two jobs for pull requests and
`main`; it has no secret and deploys nothing. The root app is deployed by nothing any more.

## 13. Record

Fill one row per read. Times, counts and commits only.

| Check | Result |
| --- | --- |
| Head, CI, the checks of section 1, step 1 | |
| Deploy token: groups, end date, what it cannot read | |
| Reads of section 1, step 3 | |
| Contact address: a message received | |
| Preview: plan, deploy, the door before and after | |
| Preview: load, refusals, kill, two at once | |
| Preview: release check; sign-up; withdrawal; headers | |
| Preview: rows read, ms and CPU per kind of page | |
| Launch: run, commit, minutes, the load's line | |
| After: holder, block, bindings, report, browser, log | |
