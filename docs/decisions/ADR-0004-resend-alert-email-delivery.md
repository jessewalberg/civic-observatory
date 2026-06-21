# ADR-0004: Resend Alert Email Delivery

## Status

Accepted

## Context

Civic Observatory alert candidates need a launch-ready transactional email
provider so pending alerts can move to explicit `sent` or `failed` states
without live credentials in tests. Alert email also needs retry-safe delivery
calls, source links, app links, and visible failure behavior when provider
configuration is missing.

The codebase previously had a Cloudflare Email Sending boundary. THE-300
standardizes alert delivery on Resend instead, matching the current work item
and avoiding a split between generated alert candidates and the provider used
to send them.

## Decision

- Use Resend's transactional email API for alert delivery.
- Configure delivery with `RESEND_API_KEY`; missing configuration is a visible
  send failure and moves the candidate to `failed`.
- Send alert emails with an HTML part and generated plain-text fallback.
- Use Resend idempotency keys for immediate alerts and digest batches to reduce
  duplicate sends across retries.
- Include manage/unsubscribe links, the Civic Observatory meeting URL, and a
  source URL when the meeting or summary has a safe HTTP(S) source.
- Enable immediate, daily, and weekly alert delivery crons.

## Consequences

- Resend domain/API-key setup is now required before enabling production alert
  delivery.
- Provider failures are observable in `deliveryError` instead of silently
  dropping candidates.
- Config and provider failures currently mark candidates `failed`; a future
  retry/requeue path should distinguish retryable provider outages from
  permanent delivery errors.
- Email provider tests can run without live credentials by mocking the Resend
  HTTP boundary.
