# ADR-0005: Coverage Publication State

## Status

Accepted

## Context

Municipality rows previously used `isActive` for both scraper scheduling and
public visibility. That made it hard to keep raw scraper configuration and
historical meetings available internally while hiding coverage from public
browse, search, subscriptions, and alerts.

THE-311 separates those responsibilities.

## Decision

- `municipalities.isActive` remains the scraper operational flag.
- `municipalities.coverageStatus` is the public visibility flag:
  `published`, `unpublished`, or `paused`.
- Public municipality, meeting, summary, subscription, and alert surfaces only
  expose or act on `published` coverage.
- Admin/operator views can still inspect unpublished and paused rows for setup,
  validation, and debugging.
- Publishing requires a successful scraper validation that found meetings, or an
  explicit operator override reason.
- Coverage status changes write `coveragePublicationEvents` records with
  from/to status, operator, reason, override reason, and the validation run used
  when applicable.

## Consequences

- New municipalities start unpublished even if their scraper is active.
- Legacy rows without `coverageStatus` are interpreted as published only when
  both `isActive` and `isVerified` are true; otherwise they are treated as
  unpublished until an operator sets an explicit status.
- Pausing coverage hides public surfaces and suppresses new alert candidates
  without deleting meetings, summaries, scraper configuration, or subscriptions.
