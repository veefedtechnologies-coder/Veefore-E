# E2E CLS verification harness — pixel-perfect-skeleton-loading (task 13.5)

This folder holds the real-browser Cumulative Layout Shift (CLS) verification for
the skeleton-loading migration.

- **`skeleton-cls.pw.ts`** — Playwright test. For every migrated authenticated
  route, at every Tailwind breakpoint (sm/md/lg/xl/2xl), it installs a
  `layout-shift` `PerformanceObserver` before the skeleton mounts, accumulates
  CLS until the layout settles (no shift for 500ms), and asserts route-level
  **CLS ≤ 0.1** (R8.4 / R13.4) plus no single shift > 8px (R8.1). It also covers
  swap-to-empty and swap-to-error hand-offs (R8.5).

## Why this is not part of `npm test`

Measuring CLS requires a **real rendering engine** that emits `layout-shift`
performance entries. `happy-dom` (the vitest environment) does not lay out the
page or produce these entries, so CLS cannot be measured in the unit suite.

The file is named `*.pw.ts` (not `*.spec.ts`/`*.test.ts`) so the vitest
`include` globs never collect it. A lightweight, **runnable** structural proxy
for the zero-layout-shift contract lives in the unit suite instead:

- `client/src/components/skeletons/__tests__/skeleton-cls-contract.client.test.tsx`

That proxy asserts the design's actual CLS-avoidance mechanism (R8.2, R8.3):
each skeleton reserves the **same fixed dimensions / grid wrapper** as the
component it swaps to, so the real browser run is expected to confirm ≤ 0.1.

## Prerequisites to run the real-browser harness

Playwright is **not** installed by default in this repo (no `@playwright/test`
dependency, no `playwright.config`). The migrated routes also live behind auth,
so a logged-in session is required.

1. Install Playwright (one-time):
   ```bash
   npm i -D @playwright/test
   npx playwright install chromium
   ```
2. Build and serve the production app:
   ```bash
   npm run build && npm run start   # http://localhost:5000
   ```
3. Provide an authenticated session (otherwise every route redirects to sign-in
   and no skeleton mounts). Either:
   - Save a Playwright storage state after logging in once and point to it with
     `PW_STORAGE_STATE=./auth.json`, or
   - Supply `PW_AUTH_COOKIE` / `PW_AUTH_TOKEN` consumed by your Playwright
     fixture/config.
4. Run:
   ```bash
   BASE_URL=http://localhost:5000 npx playwright test tests/e2e/skeleton-cls.pw.ts
   ```

The test fails fast with a clear message if it lands on the sign-in page or if
`layout-shift` is unsupported, so a missing prerequisite never reports a
misleading CLS of 0.

## Lighthouse alternative

`.lighthouserc.json` (repo root) runs Lighthouse CI against
`http://localhost:5000/`. Lighthouse reports `cumulative-layout-shift` as a
metric; it can be asserted with an `assertions` entry
(`"cumulative-layout-shift": ["error", {"maxNumericValue": 0.1}]`). Lighthouse
measures the unauthenticated entry URL only, so the Playwright harness above is
the per-route, per-breakpoint, authenticated source of truth for R13.4.
