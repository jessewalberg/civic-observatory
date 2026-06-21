# ADR-0004: Cloudflare Alert Email Delivery

## Status

Accepted

## Context

Civic Observatory alert candidates need a launch-ready transactional email
provider so pending alerts can move to explicit `sent` or `failed` states
without live credentials in tests. Alert email also needs retry-safe delivery
state transitions, source links, app links, and visible failure behavior when
provider configuration is missing.

The broader technology refactor consolidates transactional infrastructure on
Cloudflare. THE-300 incorrectly named Resend in its ticket wording and PR #32
temporarily encoded that provider choice. THE-366 corrects the provider
boundary back to Cloudflare Email Sending while preserving the useful alert
state-machine and email-content behavior from THE-300.

## Decision

- Use Cloudflare Email Sending's REST API for alert delivery.
- Configure delivery with `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`;
  missing configuration is a visible send failure and moves the candidate to
  `failed`.
- Send alert emails with an HTML part and generated plain-text fallback.
- Include a custom `X-Civic-Delivery-Key` email header for alert/digest
  correlation. Cloudflare Email Sending does not currently expose a
  provider-level idempotency key in the REST API.
- Include manage/unsubscribe links, the Civic Observatory meeting URL, and a
  source URL when the meeting or summary has a safe HTTP(S) source.
- Enable immediate, daily, and weekly alert delivery crons.

## Consequences

- Cloudflare Email Sending domain onboarding and API-token setup are required
  before relying on production alert delivery.
- Provider failures are observable in `deliveryError` instead of silently
  dropping candidates.
- Config and provider failures currently mark candidates `failed`; a future
  retry/requeue path should distinguish retryable provider outages from
  permanent delivery errors.
- Cloudflare Email Sending does not provide provider-level idempotency for this
  REST send path, so alert delivery is at-least-once until application-level
  dedup/retry handling exists. The `X-Civic-Delivery-Key` header is correlation
  metadata only.
- Email provider tests can run without live credentials by mocking the
  Cloudflare HTTP boundary.

## Update 2026-06-21: Application-Level Dedup and Retry

THE-365 adds application-level delivery state around Cloudflare Email Sending:

- Alert rows carry `deliveryKey`, attempt count, last/next attempt timestamps,
  failure kind, and provider message ID metadata.
- Immediate and digest sends reserve pending alert rows before calling
  Cloudflare. A duplicate action that reaches the same alert while it is already
  queued exits without another provider call.
- Missing Cloudflare configuration, network exceptions, 429 responses, and 5xx
  responses are retryable. Validation/provider-envelope failures and permanent
  bounces are permanent.
- Retryable failures return alerts to `pending` with a 15-minute retry delay.
  Delivery stops after three attempts and records a permanent exhausted-retry
  failure.
- Queued reservations older than 30 minutes are recovered before delivery
  processors query pending work. Under the retry budget they return to
  `pending`; at or above the retry budget they fail permanently.

Because the Cloudflare REST API still has no idempotency key, stale reservation
recovery preserves at-least-once delivery rather than exactly-once delivery. In
the rare case where Cloudflare accepted a message but the action died before the
`sent` state transition, recovery can resend after the 30-minute timeout. The
stored delivery key and provider message ID are diagnostics/correlation
metadata, not provider-enforced deduplication.
