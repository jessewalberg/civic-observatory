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
