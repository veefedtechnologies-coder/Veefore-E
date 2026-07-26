# Implementation Plan: Pixel-Perfect Skeleton Loading

## Overview

This plan converts the consolidated skeleton-loading design into incremental coding steps for the Veefore web client (`client/src`). It follows the design's four-layer architecture plus tooling, and the migration strategy: build the new variant-based primitive and global CSS first, then the accessibility context, then the pure conditional-rendering/state-resolution logic, then the shared `Component_Skeleton` library, then the per-route `Page_Skeleton` library, then wire everything into `AuthenticatedApp.tsx`, then remove all legacy/duplicate skeletons and generic loaders, then add the build guard, and finally produce the audit report and per-page verification.

Implementation language: **TypeScript / React** (matches the existing client). Testing uses the repo's existing tooling: `vitest` 4, `@testing-library/react`, `happy-dom`, and `fast-check` 4 for property-based tests (min 100 iterations, tagged). CLS/visual/responsive verification uses Lighthouse (`.lighthouserc.json` already present) and Playwright where DOM-measurement assertions are insufficient.

All correctness properties (Properties 1–17) from the design map to property-based test sub-tasks placed next to the implementation they validate. The conditional-rendering-parity logic (the user's key concern, e.g. the Dashboard "Optimal Posting Time" widget) is implemented and tested explicitly in tasks 3 and 6.

## Tasks

- [x] 1. Foundation: global shimmer CSS, theme variables, and reduced-motion handling
  - [x] 1.1 Add global shimmer keyframes, `.vf-skeleton` class, and per-theme CSS variables to `index.css`
    - Define `@keyframes vf-shimmer` animating only `background-position` (GPU-compositable) in `client/src/index.css`
    - Add the `.vf-skeleton` class: base color from `rgb(var(--vf-skeleton-base))`, 90deg linear-gradient sweep using base/highlight, `background-size: 200% 100%`, `animation: vf-shimmer 1.6s linear infinite`, `will-change: background-position`
    - Define `--vf-skeleton-base` / `--vf-skeleton-highlight` for `:root` (light) and `.dark`, `.dark-blue`, `.dark-black`, `.dark-gray` (and their `html.*` selectors) per the design's theme color model
    - Add a `@media (prefers-reduced-motion: reduce)` block that sets `.vf-skeleton { animation: none; background-image: none; }` (static base fill) — CSS-driven reduced motion, no JS hook required
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 7.1, 7.2, 7.6_

  - [x] 1.2 Write property test for theme color contrast thresholds
    - **Property 6: Theme placeholder and shimmer colors meet contrast thresholds**
    - **Validates: Requirements 7.1, 7.2**
    - Parse the theme variable values into a shared exported color table; assert base-vs-background ≥ 1.2:1 and highlight-vs-base ≥ 1.1:1 for all five themes (fast-check over the theme set, min 100 iterations, tagged)

  - [x] 1.3 Write property test for unsupported-theme color fallback
    - **Property 7: Unsupported theme resolves to light placeholder colors**
    - **Validates: Requirements 7.6**
    - fast-check over arbitrary non-member theme identifiers; assert the resolved base/highlight equal the `light` values (min 100 iterations, tagged)

- [x] 2. Foundation: the variant-based Skeleton primitive
  - [x] 2.1 Rewrite the Skeleton primitive at `components/ui/skeleton.tsx`
    - Define the frozen `SKELETON_VARIANTS` nine-member set, `DEFAULT_VARIANT = 'rectangle'`, `VARIANT_BASE_CLASS` map, and `normalizeVariant(v: unknown)` per the design data model
    - Implement `Skeleton({ variant, className, ...props })`: merge classes as `cn(BASE_SHIMMER_CLASS 'vf-skeleton', VARIANT_BASE_CLASS[normalizeVariant(variant)], className)` so consumer `className` wins (tailwind-merge last-wins)
    - Always set `aria-hidden="true"`; never emit an inline `<style>` or inline `animation` style; drop any `children` so painted output has zero text glyphs
    - Export `SkeletonVariant`, `SkeletonProps`, `Skeleton`, and `normalizeVariant` from this single documented module (`@/components/ui/skeleton`)
    - Temporarily keep legacy exports importable to avoid breaking the app build until task 7 (do not delete `SkeletonPageLoader` yet)
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 2.1, 2.5, 11.2_

  - [x] 2.2 Write property test for supported-variant base shape class
    - **Property 1: Supported variant applies its base shape class**
    - **Validates: Requirements 1.2, 1.3**
    - fast-check over the nine variants; assert rendered class list includes that variant's base shape/border-radius class (min 100 iterations, tagged)

  - [x] 2.3 Write property test for invalid-variant fallback
    - **Property 2: Invalid variant falls back to rectangle and still renders a visible block**
    - **Validates: Requirements 1.4, 1.5**
    - fast-check over arbitrary strings, numbers, null, undefined, objects; assert `normalizeVariant` returns `rectangle` and the rendered element carries rectangle base + `vf-skeleton` classes (min 100 iterations, tagged)

  - [x] 2.4 Write property test for className override precedence
    - **Property 3: Custom className overrides variant base styling for conflicting properties**
    - **Validates: Requirements 1.6**
    - fast-check over (variant × conflicting dimension/border-radius utility); assert merged classes resolve to the custom class while retaining `vf-skeleton` (min 100 iterations, tagged)

  - [x] 2.5 Write property test for primitive render invariants
    - **Property 4: Primitive render invariants (shimmer class, aria-hidden, no inline animation)**
    - **Validates: Requirements 1.7, 6.1, 11.2**
    - fast-check over (variant × arbitrary HTML props); assert `vf-skeleton` class present, `aria-hidden="true"`, no inline `<style>` and no inline `animation` declaration (min 100 iterations, tagged)

  - [x] 2.6 Write property test for zero final-component text glyphs
    - **Property 5: Placeholder renders no final-component text glyphs**
    - **Validates: Requirements 1.8, 1.9**
    - fast-check over arbitrary children text; assert rendered `textContent` is empty (min 100 iterations, tagged)

- [x] 3. Foundation: loading-state resolver, conditional-knowledge model, and bounded list helper
  - [x] 3.1 Implement `resolveRenderState`, the conditional-knowledge model, and the clamped count helper
    - Create `client/src/components/skeletons/render-state.ts` (or co-located util) exporting `RenderState`, `resolveRenderState(q, isEmpty)` exactly per the design (error → loading → unresolved → empty-while-fetching → empty/populated)
    - Export the `ConditionalKnowledge` type (`known-absent` | `known-present` | `unknown`) and a helper that maps gating flags to which sections render (omit `known-absent`, populated-variant-only for `unknown`/`known-present`)
    - Export `clampListCount(count, { default, min: 3, max: 10 })` returning `clamp(count ?? default, 3, 10)`
    - _Requirements: 4.6, 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8_

  - [x] 3.2 Write property test for loading-state resolution / hand-off
    - **Property 11: Loading-state resolution hands off correctly**
    - **Validates: Requirements 4.6, 9.3, 9.4, 9.5**
    - fast-check over arbitrary (`isLoading`, `isFetching`, `isError`, data, emptiness predicate); assert `loading` iff in-flight/unresolved, `error` whenever failed, else `populated`/`empty` — never a populated placeholder after resolve/fail (min 100 iterations, tagged)

  - [x] 3.3 Write property test for bounded list placeholder count
    - **Property 12: Variable lists render a bounded placeholder count**
    - **Validates: Requirements 9.8**
    - fast-check over `undefined`, zero, negatives, and very large counts; assert result equals `clamp(count ?? default, 3, 10)` and lies in [3, 10] (min 100 iterations, tagged)

- [x] 4. Accessibility: LoadingStatusProvider + hooks
  - [x] 4.1 Implement `LoadingStatusProvider`, `useLoadingStatus`, and `useRegisterSkeleton`
    - Create `client/src/components/skeletons/LoadingStatusProvider.tsx` with a ref-counted set of active skeleton ids
    - Render exactly one `aria-live="polite"` region showing "Loading…" while count > 0, cleared within 500ms after count reaches 0; expose `isPageLoading` and set `aria-busy` on the page content wrapper
    - Implement `useRegisterSkeleton(active)` to register on mount / unregister on unmount, and `beginLoading(id)` returning an unregister fn
    - _Requirements: 11.1, 11.3, 11.4, 11.5_

  - [x] 4.2 Write property test for single aggregate loading status
    - **Property 15: At most one aggregate loading status per page**
    - **Validates: Requirements 11.1, 11.4, 11.5**
    - fast-check over N ≥ 1 simultaneous registrations; assert exactly one polite region exists, wrapper `aria-busy="true"` while any active, and `aria-busy="false"` + cleared text once all removed (min 100 iterations, tagged)

- [x] 5. Checkpoint - foundation verified
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Shared Component_Skeleton library (`components/skeletons/`)
  - [x] 6.1 Implement card/metric and form component skeletons
    - Create `KpiCardSkeleton`, `PerformanceScoreSkeleton`, `SocialAccountCardSkeleton`, `NotificationCardSkeleton`, `FormSkeleton` composing the primitive, each `React.memo` and pure
    - Match outer container, grid/flex structure, and fixed dimensions (e.g. KPI `min-h-[200px]`) of their final components
    - _Requirements: 4.2, 5.1, 5.2, 5.4, 10.2, 10.3, 10.4_

  - [x] 6.2 Implement chart, table, and list component skeletons
    - Create `ChartSkeleton` (reserves fixed `h-[280px]`, `variant="chart"`), `TableSkeleton` (header row + clamped body rows via `clampListCount`), `ConversationListItemSkeleton`, `PostCardSkeleton`
    - Use `clampListCount` for all variable row/item counts (default 5 lists, 3 card grids)
    - _Requirements: 4.2, 5.1, 5.2, 5.4, 9.8, 10.2, 10.5_

  - [x] 6.3 Implement layout and chat component skeletons
    - Create `SidebarSkeleton` (w-24 icon rail), `HeaderSkeleton` (logo + actions), `ChatBubbleSkeleton` (avatar + variable-width lines)
    - _Requirements: 4.2, 5.1, 5.2, 5.4, 10.2_

  - [x] 6.4 Implement `BestTimeWidgetSkeleton` mirroring the data-card (populated) variant
    - Create `BestTimeWidgetSkeleton` that mirrors the `BestTimeWidget` **data card** layout (main stat + 2x mini-stats grid + action button), NOT the "Gathering Data" empty card — canonical `unknown`-knowledge case
    - Wire it to the conditional-knowledge model so it renders only the populated variant during loading; this replaces the legacy co-located skeleton (removed in task 9)
    - _Requirements: 4.3, 5.1, 5.4, 9.2, 9.6_

  - [x] 6.5 Write property test for conditional-section omission (known-absent)
    - **Property 9: Known-absent conditional sections are omitted with no reserved space**
    - **Validates: Requirements 9.1**
    - Use a representative composed skeleton (e.g. dashboard section group) that accepts gating flags; fast-check over flag sets marking sections known-absent; assert zero placeholder nodes and no reserved grid/flex slot for them (min 100 iterations, tagged)

  - [x] 6.6 Write property test for unknown-section populated-variant-only rendering
    - **Property 10: Unknown conditional sections render only the populated variant**
    - **Validates: Requirements 9.2**
    - fast-check using `BestTimeWidgetSkeleton`/section under `unknown` knowledge; assert exactly the populated variant renders and neither the empty variant nor multiple variants appear (min 100 iterations, tagged)

  - [x] 6.7 Write property test for component-skeleton purity/determinism
    - **Property 13: Component skeletons are pure and deterministic**
    - **Validates: Requirements 10.2**
    - fast-check over props for each shared skeleton; assert two renders produce identical serialized DOM (min 100 iterations, tagged)

  - [x] 6.8 Write property test for unmount removing element / stopping animation
    - **Property 14: Unmounting removes the skeleton element and stops its animation**
    - **Validates: Requirements 10.7**
    - fast-check over the shared skeletons; mount then unmount; assert the placeholder element is absent from the DOM afterward (min 100 iterations, tagged)

- [x] 7. Page_Skeleton library (`components/skeletons/pages/`)
  - [x] 7.1 Implement dashboard and best-time page skeletons
    - Create `DashboardSkeleton` (KPI grid + performance score + get-started + best-time + recommendations + social-accounts sections, reusing exact wrapper grid classes) and `BestTimeSkeleton`
    - Compose shared skeletons inside the same outer container/grid the real pages use (zero-shift slot parity)
    - _Requirements: 4.1, 5.1, 5.2, 5.3, 8.2, 8.3, 10.1_

  - [x] 7.2 Implement posts-family and calendar page skeletons
    - Create `PostsSkeleton`, `ScheduledPostsSkeleton`, `DraftsSkeleton`, `PublishedPostsSkeleton`, `CreatePostSkeleton`, `PlanSkeleton` (calendar grid)
    - _Requirements: 4.1, 5.1, 5.2, 5.3, 8.2, 8.3, 10.1_

  - [x] 7.3 Implement analytics, VeeGPT, and automation page skeletons
    - Create `AnalyticsSkeleton`, `PostAnalyticsSkeleton`, `VeeGPTSkeleton` (chat bubbles + composer), `AutomationSkeleton`
    - _Requirements: 4.1, 5.1, 5.2, 5.3, 8.2, 8.3, 10.1_

  - [x] 7.4 Implement remaining authenticated-route page skeletons
    - Create `VideoGeneratorSkeleton`, `ProfileSkeleton`, `SettingsSkeleton`, `SocialListeningSkeleton`, `SecurityDashboardSkeleton`, `AdminPanelSkeleton`, plus skeletons for any additional routes found in the audit (`TestFixtures`, `EncryptionHealth`, `Inbox`, content/dm-automation tabs)
    - _Requirements: 4.1, 5.1, 5.2, 5.3, 8.2, 8.3, 10.1_

- [x] 8. Checkpoint - skeleton libraries verified
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. App integration: wire skeletons into AuthenticatedApp and in-page swaps
  - [x] 9.1 Replace Suspense fallbacks in `AuthenticatedApp.tsx`
    - Replace every `fallback={<SkeletonPageLoader type="..." />}` with the matching `Page_Skeleton` (e.g. `<DashboardSkeleton />`); replace `SkeletonSidebarLayout` composition with `SidebarSkeleton` + the relevant page skeleton
    - _Requirements: 4.1, 4.6, 10.1, 10.6_

  - [x] 9.2 Mount `LoadingStatusProvider` around the authenticated shell
    - Wrap the `<main>` content region in `AuthenticatedApp`'s layouts so every route participates in the single aggregate loading status and page-level `aria-busy`
    - _Requirements: 11.1, 11.5_

  - [x] 9.3 Migrate in-page data-loading swaps to `resolveRenderState` + component skeletons
    - Convert components that early-return a spinner/`animate-pulse`/"Loading..." on `isLoading` to use `resolveRenderState` and their `Component_Skeleton`, including the dashboard sections (KPI cards, performance score, recommendations, social accounts)
    - Ensure `BestTimeWidget` keeps its self-managed loading swap but uses the new `BestTimeWidgetSkeleton` (Property 10 case); do not force an outer skeleton over it
    - _Requirements: 3.1, 4.6, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7_

  - [x] 9.4 Preserve the pre-auth boot exception and status-dot allow-list
    - Keep `App.tsx`'s pre-auth `<LoadingSpinner type="dashboard" />` as the single allowed brand loader; mark it so the guard/audit recognize the exception
    - Identify and preserve non-loading `animate-pulse` usages (e.g. live status-indicator dots) for the allow-list
    - _Requirements: 3.4, 3.5, 3.6_

- [x] 10. Removal and consolidation of legacy skeletons and generic loaders
  - [x] 10.1 Delete the duplicate `Skeleton` export in `LoadingSpinner.tsx`
    - Remove the `Skeleton` export from `client/src/components/LoadingSpinner.tsx`; retain `LoadingSpinner` only for the recorded pre-auth boot exception; update any importers to `@/components/ui/skeleton`
    - _Requirements: 2.2, 2.4, 3.5_

  - [x] 10.2 Remove `SkeletonPageLoader`, the ~18 ad-hoc composed skeletons, and `SkeletonSidebarLayout`
    - Delete `SkeletonPageLoader`, `SkeletonCard`, `SkeletonWorkspaceCard`, `SkeletonIntegrationCard`, `SkeletonAutomationCard`, `SkeletonDashboardStats`, `SkeletonTable`, `SkeletonPageHeader`, `SkeletonProfileCard`, `SkeletonSidebarLayout`, etc. from `components/ui/skeleton.tsx`, leaving only the variant primitive
    - Update every remaining reference to the corresponding new `Component_Skeleton`/`Page_Skeleton`
    - _Requirements: 2.3, 2.4_

  - [x] 10.3 Remove co-located legacy skeletons and remaining generic loaders
    - Remove the legacy co-located `BestTimeWidgetSkeleton` and any other component-local legacy skeletons; remove standalone `animate-pulse` placeholder divs and "Loading..." primary indicators that map to a renderable structure (outside the allow-list)
    - _Requirements: 2.4, 3.2, 3.3, 3.4_

- [x] 11. Build guard tooling
  - [x] 11.1 Implement `scripts/skeleton-guard.mjs` and wire into build/CI
    - Scan `client/src` and fail the build if: more than one module defines a `Skeleton` primitive (R2.6), any `Skeleton` export remains in `LoadingSpinner.tsx`, any `SkeletonPageLoader` reference remains, or any banned generic-loader pattern (`animate-spin`, standalone placeholder `animate-pulse`, "Loading..." primary indicator) exists outside the audit allow-list
    - Add the guard to the `client:build`/`build` pipeline and a CI workflow step
    - _Requirements: 2.2, 2.3, 2.6, 3.2, 3.3, 3.4_

  - [x] 11.2 Write unit tests for the build-guard scanner
    - Test fixtures that trigger each failure condition and a clean fixture that passes; assert correct pass/fail and that duplicate-definition errors identify the offending files
    - _Requirements: 2.6_

- [x] 12. Audit report generator and report deliverable
  - [x] 12.1 Implement the audit scanner and report builder
    - Build a script that enumerates every page/route, component with a loading state, generic loader, and legacy skeleton in `client/src`, recording each item's source file path
    - Build the report model with categories (pages scanned, components scanned, skeletons created, generic loaders removed, legacy skeletons removed, CLS issues fixed, missing skeletons), deriving each integer count from its itemized list length; include the documented primitive import path and recorded exceptions/preserved usages
    - _Requirements: 2.5, 3.5, 3.6, 4.4, 4.5, 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7_

  - [x] 12.2 Write property test for audit count/list invariant
    - **Property 16: Audit category count equals its itemized list length**
    - **Validates: Requirements 12.7**
    - fast-check over arbitrary category maps; assert the validator passes iff every count equals its list length, and the builder always derives counts from list lengths (min 100 iterations, tagged)

  - [x] 12.3 Generate and commit `client/SKELETON_AUDIT.md`
    - Run the generator to produce the version-controlled `client/SKELETON_AUDIT.md` with all categories, itemized lists, recorded exceptions, and the representative data state used per verified component; ensure missing-skeletons count is zero or each remaining item has a written justification
    - _Requirements: 4.4, 5.6, 12.2, 12.4, 12.6_

- [x] 13. Per-page quality verification
  - [x] 13.1 Implement the per-page verification recorder and status derivation
    - Implement logic that records, per verified page, the pass/fail outcome of checks 1–6 and derives overall "production ready" iff all six pass; on any failure, record the failing checks and observed values
    - _Requirements: 13.7, 13.8_

  - [x] 13.2 Write property test for per-page production-ready derivation
    - **Property 17: Per-page production-ready status derivation**
    - **Validates: Requirements 13.7, 13.8**
    - fast-check over arbitrary 6-check outcome tuples; assert "production ready" iff all six pass, else not-ready with failing checks recorded (min 100 iterations, tagged)

  - [x] 13.3 Write DOM-measurement and breakpoint verification tests
    - Render each page skeleton vs its final component in the representative data state; assert outer-height within 8px and placeholder dimensions/gaps within 4px (R5); assert responsive column/flex/visibility parity at sm/md/lg/xl/2xl (R5.3, R13.1, R13.2)
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 13.1, 13.2_

  - [x] 13.4 Write theme, shimmer, reduced-motion, and conditional-parity verification tests
    - Assert correct rendering in `light` + at least one dark variant (R13.3); shimmer present while mounted and static fill under reduced motion (R13.5); conditional-rendering parity per Requirement 9 including the dashboard optimal-time widget (R13.6)
    - Assert theme change keeps the same mounted skeleton DOM node (**Property 8: Theme change preserves the mounted skeleton DOM node — Validates: Requirements 7.5**)
    - _Requirements: 7.5, 13.3, 13.5, 13.6_

  - [x] 13.5 Write CLS verification via Lighthouse/Playwright
    - Measure route-level CLS from skeleton mount until layout settles at each tested breakpoint; assert ≤ 0.1 for migrated routes; record results into the audit (R8.4, R13.4)
    - _Requirements: 8.1, 8.4, 8.5, 13.4_

  - [x] 13.6 Record verification results into the audit report
    - Write each verified page's check outcomes and production-ready status into `client/SKELETON_AUDIT.md`
    - _Requirements: 13.7, 13.8_

- [x] 14. Final checkpoint - all tests pass and audit complete
  - Ensure all tests pass, the build guard succeeds, and the audit report shows zero missing skeletons (or justified exceptions). Ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional test sub-tasks and can be skipped for a faster MVP; core implementation tasks are never optional.
- Each task references specific requirement sub-clauses for traceability; property-test tasks reference the design's correctness property number and the requirements it validates.
- Property-based tests use `fast-check` with a minimum of 100 iterations and are tagged so they can be filtered.
- Pixel/CLS/responsive/theme verification (Properties not expressible as pure logic) uses DOM-measurement tests, Lighthouse, and Playwright per the design's testing strategy.
- The conditional-rendering-parity concern (Properties 9–11, dashboard optimal-time widget) is implemented in tasks 3 and 6.4 and wired in task 9.3.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3", "2.1", "3.1", "4.1"] },
    { "id": 2, "tasks": ["2.2", "2.3", "2.4", "2.5", "2.6", "3.2", "3.3", "4.2"] },
    { "id": 3, "tasks": ["6.1", "6.2", "6.3", "6.4"] },
    { "id": 4, "tasks": ["6.5", "6.6", "6.7", "6.8", "7.1", "7.2", "7.3", "7.4"] },
    { "id": 5, "tasks": ["9.1", "9.2", "9.3", "9.4"] },
    { "id": 6, "tasks": ["10.1", "10.2", "10.3"] },
    { "id": 7, "tasks": ["11.1", "12.1", "13.1"] },
    { "id": 8, "tasks": ["11.2", "12.2", "13.2"] },
    { "id": 9, "tasks": ["12.3", "13.3", "13.4", "13.5"] },
    { "id": 10, "tasks": ["13.6"] }
  ]
}
```
