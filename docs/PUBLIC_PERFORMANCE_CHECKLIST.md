# Public Page Performance Checklist

Use this checklist for SEO-facing performance passes after deploys that affect
public routes, layout, fonts, media, or bundle shape.

## Pages

- `/`
- `/explore`
- `/pricing`
- One indexable municipality page, for example `/explore/{municipality-slug}`
- One indexable meeting page, for example `/meeting/{meeting-slug}`

## Local Build Checks

1. Run `pnpm test`.
2. Run `pnpm check`.
3. Run `pnpm build`.
4. Review build output for chunks over 500 KB.
5. Confirm production root code does not statically import devtools:
   `pnpm vitest run src/lib/performanceGuards.test.ts`.

## Field/Lab Measurement

For each public page above:

1. Run Lighthouse or PageSpeed for mobile and desktop.
2. Record LCP, INP, CLS, FCP, TBT, Speed Index, and TTFB.
3. Capture top Lighthouse diagnostics with estimated savings.
4. Check whether Google Fonts, CSS, or JS are render-blocking.
5. Check whether landing-page motion contributes to main-thread work or layout
   instability on mobile.

Recommended Lighthouse CLI commands:

```sh
pnpm dlx lighthouse "$URL" \
  --output=json \
  --output-path="/tmp/civic-observatory-lighthouse/${SLUG}-mobile.json" \
  --quiet \
  --chrome-flags="--headless --no-sandbox"

pnpm dlx lighthouse "$URL" \
  --preset=desktop \
  --output=json \
  --output-path="/tmp/civic-observatory-lighthouse/${SLUG}-desktop.json" \
  --quiet \
  --chrome-flags="--headless --no-sandbox"
```

Use a deployed production or preview URL when local `vite preview` cannot render
SSR routes because Worker secrets such as `CLERK_SECRET_KEY` are intentionally
absent from local generated vars.

## Thresholds

- LCP: good under 2.5s.
- INP: good under 200ms.
- CLS: good under 0.1.
- TTFB: good under 800ms.
- TBT: good under 200ms.

## Recording

Add before/after metrics to the Linear issue or project update. Include:

- Environment: production, preview, or local.
- Device mode: mobile or desktop.
- Network/CPU throttling setting.
- Commit SHA.
- Page URL.
