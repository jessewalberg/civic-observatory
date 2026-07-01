# ADR-0003: SEO Structured Data Model

## Status

Accepted

## Context

Civic Observatory public pages need JSON-LD that accurately describes what is
visible on the page. Search engines recommend JSON-LD, and Schema.org types
should not be stretched to chase rich result eligibility.

The prior model had two risks:

- Meeting summary pages used `GovernmentService`, even though the page is a
  generated summary/report about a meeting, not a government-provided service.
- Municipality pages represented population as `numberOfEmployees`, which is
  misleading for a government organization.

## Decision

- Homepage JSON-LD uses an `@graph` with `Organization`, `WebSite`, and
  `SoftwareApplication`.
- Pricing JSON-LD uses `WebPage` with `mainEntity` set to the Civic
  Observatory `SoftwareApplication` and its visible Free/Pro offers.
- Municipality pages use `GovernmentOrganization` with `PostalAddress` and
  `areaServed` as an `AdministrativeArea`. Population stays in visible page
  copy, not structured data.
- Meeting pages use `Report` about an `Event`, with Civic Observatory as the
  publisher and the municipality as the event organizer.
- Breadcrumb JSON-LD remains available for pages that render visible
  breadcrumb navigation.

## Consequences

- The schema is more accurate and less likely to produce misleading rich-result
  warnings.
- Meeting summaries may not qualify for every article/news rich result, but the
  markup now matches the actual product surface.
- New public content routes should add tests that parse route JSON-LD and assert
  the intended Schema.org shape.
