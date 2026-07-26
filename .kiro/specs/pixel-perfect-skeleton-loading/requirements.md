# Requirements Document

## Introduction

This feature delivers a single, production-grade, pixel-perfect skeleton loading system across the entire Veefore web client (`client/src`). The goal is that during any data-loading state, the user perceives the final UI as already rendered with only its content being filled in, comparable to Linear, Notion, Stripe, and YouTube.

The Veefore client currently has an inconsistent loading story: a monolithic `SkeletonPageLoader` (a single `type`-switched component in `components/ui/skeleton.tsx` with ~18 composed skeletons), a duplicate `Skeleton` primitive exported from `LoadingSpinner.tsx`, a full-screen spinner (`LoadingSpinner` / `GlobalLoader`) used for auth-loading, component-local skeletons (e.g. `BestTimeWidgetSkeleton`), and many ad-hoc generic loaders (`animate-pulse` divs, "Loading..." text). The `shimmer` keyframe is injected inline inside `SkeletonPageLoader` rather than defined globally, so bare `Skeleton` usages elsewhere do not reliably animate.

This feature replaces all of the above with one consolidated skeleton system: a single `Skeleton` primitive with variants, dedicated per-component and per-page skeleton components that exactly match final layouts (including conditional rendering), a globally-defined GPU-accelerated shimmer that respects `prefers-reduced-motion`, full multi-theme support, zero layout shift, and an audit report documenting the migration. All pre-existing skeleton and generic-loader implementations are removed so only the new system remains.

This requirements document covers the client-side UI behavior, component contracts, theming, performance, and migration/audit deliverables. It does not specify the exact pixel dimensions of every skeleton inline; instead it requires that each skeleton be derived from and verified against its corresponding final component (see Requirement 4 and Requirement 13).

## Glossary

- **Skeleton_System**: The consolidated set of components, styles, and conventions defined by this feature that render placeholder UI during loading states.
- **Skeleton_Primitive**: The single reusable base component (`Skeleton`) that renders one shimmering placeholder block and supports a defined set of variants.
- **Skeleton_Variant**: A named visual configuration of the Skeleton_Primitive: `text`, `avatar`, `button`, `card`, `chart`, `table`, `circle`, `rectangle`, `pill`.
- **Component_Skeleton**: A dedicated skeleton component that mirrors the layout of one specific application component (e.g. `PostCardSkeleton` for `PostCard`).
- **Page_Skeleton**: A Component_Skeleton that mirrors the layout of a full route/page (e.g. `DashboardSkeleton`).
- **Final_Component**: The real application component that a Component_Skeleton represents once data has loaded.
- **Final_UI**: The fully rendered layout of a Final_Component or page after its data has loaded.
- **Generic_Loader**: Any non-structural loading indicator, including spinners (`LoadingSpinner`, `GlobalLoader`, `animate-spin`), bare "Loading..." text, and standalone `animate-pulse` placeholder divs that do not mirror a specific layout.
- **Legacy_Skeleton**: Any skeleton implementation existing in the codebase before this feature, including the monolithic `SkeletonPageLoader`, the duplicate `Skeleton` in `LoadingSpinner.tsx`, and component-local skeletons such as `BestTimeWidgetSkeleton`.
- **Shimmer_Animation**: The GPU-accelerated animated gradient sweep applied to the Skeleton_Primitive to indicate loading.
- **CLS**: Cumulative Layout Shift, the Core Web Vitals metric measuring unexpected layout movement.
- **Conditional_Section**: A region of a Final_UI that renders only when a specific data condition is met (e.g. the Dashboard "Optimal Posting Time" widget renders a data card, a "No Data" state, or nothing depending on availability).
- **Reduced_Motion**: The user/system preference expressed by the `prefers-reduced-motion: reduce` media query.
- **Audit_Report**: The generated document cataloguing pages scanned, components scanned, skeletons created, Generic_Loaders removed, Legacy_Skeletons removed, CLS issues fixed, and any missing skeletons.
- **Theme**: One of the application's supported visual modes: `light`, `dark`, `dark-blue`, `dark-black`, `dark-gray` (all non-light variants carry the Tailwind `dark` class).

## Requirements

### Requirement 1: Reusable Skeleton Primitive with Variants

**User Story:** As a frontend developer, I want a single reusable Skeleton primitive with named variants, so that I can compose consistent skeletons without re-implementing placeholder styling.

#### Acceptance Criteria

1. THE Skeleton_System SHALL expose exactly one Skeleton_Primitive component as the base building block for all skeletons.
2. THE Skeleton_Primitive SHALL support exactly the nine-member Skeleton_Variant set: `text`, `avatar`, `button`, `card`, `chart`, `table`, `circle`, `rectangle`, and `pill`, and SHALL support no variant names outside this set.
3. WHEN the Skeleton_Primitive is rendered with a specified Skeleton_Variant from the supported set, THE Skeleton_Primitive SHALL apply that variant's default shape and border radius.
4. WHEN the Skeleton_Primitive is rendered without a specified Skeleton_Variant, THE Skeleton_Primitive SHALL apply the `rectangle` variant as its default.
5. IF the Skeleton_Primitive is rendered with a variant value that is not a member of the supported Skeleton_Variant set, THEN THE Skeleton_Primitive SHALL fall back to rendering the `rectangle` variant and SHALL still render a visible placeholder block.
6. WHERE a consumer provides a custom className, THE Skeleton_Primitive SHALL render with both the variant's base styling and the custom className applied, and SHALL give the custom className precedence over the variant base styling for any conflicting style property so that dimensions and spacing are overridden by the custom className.
7. WHEN the Skeleton_Primitive is rendered, THE Skeleton_Primitive SHALL apply the Shimmer_Animation defined in Requirement 6.
8. THE Skeleton_Primitive SHALL render placeholder markup whose visible output contains zero text characters originating from the Final_Component.
9. IF text content is passed to the Skeleton_Primitive as renderable children, THEN THE Skeleton_Primitive SHALL render no visible text glyphs for that content and SHALL display only the placeholder block.

### Requirement 2: Single Consolidated Skeleton System (Remove Duplicates)

**User Story:** As a maintainer, I want exactly one skeleton implementation in the codebase, so that the loading experience is consistent and there is no duplicate or conflicting code.

#### Acceptance Criteria

1. THE Skeleton_System SHALL define the Skeleton_Primitive in exactly one module within `client/src`.
2. WHEN the feature is complete, THE codebase scan of `client/src` SHALL detect zero Skeleton exports from `LoadingSpinner.tsx`.
3. WHEN the feature is complete, THE codebase scan of `client/src` SHALL detect zero references to the monolithic `type`-switched `SkeletonPageLoader`, which SHALL be replaced by dedicated Page_Skeleton components as defined in Requirement 4.
4. IF a Legacy_Skeleton remains referenced anywhere in `client/src` after migration, THEN THE migration SHALL update that reference to use the corresponding new Component_Skeleton or Page_Skeleton.
5. THE Skeleton_System SHALL expose a single documented import path for the Skeleton_Primitive and shared Component_Skeletons, and THE Audit_Report SHALL record that import path.
6. IF the codebase scan required by Requirement 12.1 detects more than one Skeleton_Primitive definition in `client/src`, THEN THE build SHALL fail with an error identifying the duplicate definitions.
7. WHILE the Audit_Report records a Legacy_Skeleton reference count in `client/src` greater than zero, THE migration SHALL NOT be marked complete.

### Requirement 3: Eliminate Generic Loaders

**User Story:** As a user, I want every loading state to show the shape of the content I am waiting for, so that the application never shows a bare spinner or "Loading..." text where a structured skeleton is possible.

#### Acceptance Criteria

1. WHERE a loading state corresponds to a renderable UI structure for which a Component_Skeleton or Page_Skeleton is defined per Requirement 4, THE Skeleton_System SHALL display that skeleton instead of a Generic_Loader.
2. WHEN the migration is complete, THE codebase scan SHALL detect zero standalone `animate-pulse` placeholder divs that substitute for a Component_Skeleton in feature pages, modals, drawers, cards, tables, charts, or forms.
3. WHEN the migration is complete, THE codebase scan SHALL detect zero occurrences of "Loading..." placeholder text used as a primary loading indicator for a renderable UI structure.
4. WHEN the migration is complete, THE codebase scan SHALL detect zero spinner Generic_Loaders (`LoadingSpinner`, `GlobalLoader`, or `animate-spin`) used as a primary loading indicator for a renderable UI structure, except for exceptions recorded under Requirement 3.5.
5. WHERE no UI structure can be rendered for a loading state (for example, the pre-authentication boot screen before any layout is known), THE Skeleton_System MAY display a minimal brand loader consisting of a single brand mark with shimmer and no structured placeholders, and THE migration SHALL record each such exception with its file location and reason in the Audit_Report.
6. WHERE an `animate-pulse` usage indicates a non-loading state (for example a live-status indicator dot) rather than a placeholder for loading content, THE migration SHALL preserve that usage, SHALL NOT treat it as a Generic_Loader, and SHALL record each preserved usage in the Audit_Report.

### Requirement 4: Dedicated Skeletons for Every Page and Reusable Component

**User Story:** As a user, I want every page and reusable component to have its own skeleton, so that each loading state matches the specific layout I am about to see.

#### Acceptance Criteria

1. THE Skeleton_System SHALL provide exactly one dedicated Page_Skeleton, in a one-to-one mapping, for every authenticated route enumerated by the Requirement 12.1 codebase scan of `AuthenticatedApp.tsx`, including the Dashboard, Plan/Calendar, Posts (and Scheduled, Drafts, Published views), Create Post, Analytics (and Post Analytics), VeeGPT, Automation, Video Generator, Profile, Settings, Social Listening, Best Time, Security Dashboard, Admin Panel, and any additional authenticated routes discovered during the audit.
2. THE Skeleton_System SHALL provide exactly one dedicated Component_Skeleton, in a one-to-one mapping, for every reusable component enumerated by the Requirement 12.1 scan that renders content only after an asynchronous data fetch or asynchronously supplied data resolves, including KPI/metric cards, charts, tables, activity/post cards, sidebar, header, forms, chat message bubbles, conversation lists, notification cards, and integration/social-account cards.
3. WHERE a Final_Component already declares a co-located skeleton (for example `BestTimeWidget` with `BestTimeWidgetSkeleton`), THE Skeleton_System SHALL provide an equivalent Component_Skeleton built on the Skeleton_Primitive that matches the Final_Component within the tolerances defined in Requirement 5, and SHALL remove the Legacy_Skeleton.
4. THE Audit_Report SHALL list every page and reusable component scanned with its identifier and the identifier of the corresponding skeleton created, and SHALL list any component intentionally excluded with an explicit exclusion reason linked to Requirement 4.5.
5. WHERE a Final_Component is purely static (renders no content that depends on an asynchronous data fetch or asynchronously supplied data and has no asynchronous loading state), THE Skeleton_System SHALL exclude that component from skeleton creation and SHALL record the exclusion in the Audit_Report.
6. WHEN a Final_Component enters a data-dependent loading state, THE Skeleton_System SHALL display that component's corresponding Component_Skeleton or Page_Skeleton.

### Requirement 5: Pixel-Perfect Layout Matching

**User Story:** As a user, I want each skeleton to match the exact layout of its final component, so that the loading state is visually indistinguishable from the loaded UI except that content is replaced by placeholders.

#### Acceptance Criteria

1. THE Component_Skeleton SHALL reproduce its Final_Component's outer container width, height, padding, margins, and border radius within a tolerance of 4 pixels per dimension, and SHALL reproduce its background treatment (background color or gradient, border, and backdrop blur).
2. THE Component_Skeleton SHALL reproduce its Final_Component's internal layout structure, including grid columns, flex direction, element ordering, and gaps within a tolerance of 4 pixels per gap.
3. THE Component_Skeleton SHALL reproduce its Final_Component's responsive layout at each Tailwind breakpoint used by the Final_Component (sm 640px, md 768px, lg 1024px, xl 1280px, 2xl 1536px), matching the column count, flex direction, and visibility of sections at each breakpoint.
4. THE Component_Skeleton SHALL place Skeleton_Primitive blocks at the positions occupied by the Final_Component's text, media, icons, and controls, using dimensions that match the corresponding final elements within a tolerance of 4 pixels per dimension.
5. WHEN a Component_Skeleton and its Final_Component are rendered in the same container at the same viewport width, THE rendered outer height of the Component_Skeleton SHALL match the rendered outer height of the Final_UI within a tolerance of 8 pixels for the representative data state used during verification.
6. THE representative data state used during verification SHALL be defined as the median quantity or length of content with all Conditional_Sections resolved to their most common variant, and THE Audit_Report SHALL record the representative data state used for each verified component.

### Requirement 6: Premium GPU-Accelerated Shimmer Animation

**User Story:** As a user, I want a smooth, subtle shimmer on loading placeholders, so that the loading state feels premium and responsive without distracting me.

#### Acceptance Criteria

1. THE Skeleton_System SHALL define the Shimmer_Animation keyframes in a single global stylesheet so that every Skeleton_Primitive animates without requiring an inline `<style>` block.
2. THE Shimmer_Animation SHALL animate only GPU-accelerated properties (such as `background-position`, `transform`, or `opacity`) and SHALL NOT animate layout-affecting properties (such as `width`, `height`, `top`, or `left`).
3. WHILE Reduced_Motion is active, THE Skeleton_System SHALL disable the moving shimmer so that no positional or opacity change occurs, and SHALL render a static placeholder fill using the active Theme's base placeholder color that remains visible at the same contrast as the animated placeholder's base (non-sweep) state.
4. WHILE a Skeleton_Primitive is mounted and Reduced_Motion is not active, THE Shimmer_Animation SHALL repeat indefinitely without pausing, completing one full sweep cycle every 1.2 to 2.0 seconds.
5. WHILE any supported Theme is active, THE Shimmer_Animation SHALL render using the placeholder and shimmer colors defined for that Theme in Requirement 7, with the shimmer sweep remaining non-transparent and visually distinguishable from the placeholder base color against that Theme's background.

### Requirement 7: Multi-Theme Compatibility

**User Story:** As a user, I want skeletons to match my selected theme, so that loading placeholders visually belong to the app in light mode, every dark variant, and on glassmorphism surfaces.

#### Acceptance Criteria

1. WHILE the active Theme is `light`, THE Skeleton_Primitive SHALL render its placeholder fill with a luminance contrast ratio of at least 1.2:1 against the light background, and its shimmer highlight with a contrast ratio of at least 1.1:1 against the placeholder fill.
2. WHILE the active Theme is any dark variant (`dark`, `dark-blue`, `dark-black`, `dark-gray`), THE Skeleton_Primitive SHALL render its placeholder fill with a luminance contrast ratio of at least 1.2:1 against that variant's background, and its shimmer highlight with a contrast ratio of at least 1.1:1 against the placeholder fill.
3. WHERE a Final_Component uses a glassmorphism surface (backdrop blur with a translucent background), THE corresponding Component_Skeleton SHALL reproduce that surface's backdrop blur radius and background opacity within a 10% tolerance.
4. WHERE a Final_Component uses a Veefore gradient or space-themed background, THE corresponding Component_Skeleton SHALL reproduce that background's gradient direction, color stops, and space-themed layers.
5. WHEN the active Theme changes while a skeleton is displayed, THE Skeleton_Primitive SHALL preserve the same mounted DOM element without remounting and SHALL complete its color update to the new Theme within 400 milliseconds.
6. IF the active Theme value is not a member of the supported Theme set, THEN THE Skeleton_Primitive SHALL fall back to the `light` Theme placeholder and shimmer colors.

### Requirement 8: Zero Layout Shift

**User Story:** As a user, I want content to appear in place when it loads, so that nothing jumps, resizes, or reflows as the skeleton is replaced by real content.

#### Acceptance Criteria

1. WHEN a Final_Component replaces its Component_Skeleton after data loads, THE surrounding layout SHALL NOT cause any sibling or ancestor element to move more than 8 pixels along either axis, measured at the Final_Component's Tailwind breakpoint viewports.
2. THE Component_Skeleton SHALL occupy the same grid cell or flex slot as its Final_Component so sibling elements do not reposition on swap.
3. WHERE a Final_Component reserves fixed dimensions for media or charts, THE Component_Skeleton SHALL reserve identical dimensions within a tolerance of 4 pixels per dimension.
4. WHEN skeleton-to-content swaps occur across the migrated routes during verification, THE route-level CLS contribution accumulated from skeleton mount until layout settles (no movement for 500 milliseconds) at each tested breakpoint viewport SHALL be at most 0.1.
5. WHEN a Component_Skeleton is replaced by an error state or empty state instead of populated content, THE surrounding layout SHALL satisfy the same 8-pixel no-shift guarantee defined in Requirement 8.1.

### Requirement 9: Conditional Rendering Parity

**User Story:** As a user, I want skeletons to reflect what will actually render, so that the loading state never shows placeholders for sections that will be absent once data loads.

#### Acceptance Criteria

1. IF a Final_UI contains a Conditional_Section that renders only when a data condition is met AND that condition is known to be unmet before the section would render, THEN THE corresponding skeleton SHALL omit the placeholder for that Conditional_Section and SHALL reserve no width, height, grid cell, or flex slot for it.
2. IF the data condition determining a Conditional_Section is not yet known during loading, THEN THE skeleton SHALL render only the populated (data-present) variant of that section and SHALL NOT render the empty variant or multiple variants simultaneously.
3. WHEN a Final_Component has distinct loading, populated, and empty states (as `BestTimeWidget` does), THE Skeleton_System SHALL display the skeleton only while the data request is in flight and SHALL hand off to the Final_Component once the request resolves to either a populated or empty result.
4. WHILE the data request for a Final_Component has not resolved to either a populated result or an empty result, THE Skeleton_System SHALL keep the skeleton active.
5. IF the data request for a Final_Component fails, THEN THE Skeleton_System SHALL stop the skeleton, hand off to the Final_Component's error or empty state, and SHALL NOT leave a populated-variant placeholder displayed.
6. WHERE a Final_Component manages its own loading display, THE Skeleton_System SHALL allow that component to render its own loading state without forcing skeleton activation.
7. THE skeleton SHALL NOT display placeholders for content that the Final_UI would render only after a user interaction that has not occurred.
8. WHERE a list or grid renders a variable number of items, THE corresponding skeleton SHALL render a fixed count of between 3 and 10 placeholder items and SHALL NOT imply the exact final item count.

### Requirement 10: Performance and Rendering Efficiency

**User Story:** As a user, I want skeletons to render instantly and cheaply, so that introducing skeletons does not slow down the app or cause unnecessary re-renders.

#### Acceptance Criteria

1. WHEN a lazily loaded route is requested and its component bundle has not yet finished loading, THE Skeleton_System SHALL render that route's Page_Skeleton as the React `Suspense` fallback until the route component is ready to render.
2. THE Component_Skeleton SHALL be a pure presentational component that produces identical rendered output (identical DOM structure, ordering, and styling) for identical props and SHALL NOT depend on external mutable state for its output.
3. THE Component_Skeleton SHALL NOT perform data fetching, network requests, timers, or other asynchronous side effects during render.
4. WHERE a Component_Skeleton receives no data-dependent props, THE Component_Skeleton SHALL be memoized so that a re-render of its parent that does not change the skeleton's props does not cause the skeleton to re-render.
5. THE Component_Skeleton SHALL render no more DOM nodes than are required to reproduce the Final_UI layout per Requirement 5, and the rendered DOM node count of the Component_Skeleton SHALL NOT exceed the DOM node count of its Final_Component in the representative data state used during verification.
6. WHEN a loading state is entered, THE Skeleton_System SHALL display the corresponding Page_Skeleton or Component_Skeleton within 16 milliseconds (one frame at 60 frames per second) of the loading state being entered.
7. WHEN a Component_Skeleton is unmounted, THE Skeleton_System SHALL remove the skeleton element from the DOM and stop its Shimmer_Animation within the same render commit, so that no Shimmer_Animation continues to run for an unmounted skeleton.

### Requirement 11: Accessibility

**User Story:** As a user relying on assistive technology, I want loading states announced appropriately, so that I understand content is loading without being flooded by placeholder noise.

#### Acceptance Criteria

1. WHEN a Page_Skeleton or Component_Skeleton is displayed, THE Skeleton_System SHALL set `aria-busy="true"` on the skeleton container and SHALL announce a single polite live-region loading status exactly once per display.
2. THE Skeleton_Primitive SHALL set `aria-hidden="true"` so that individual placeholder blocks are removed from the assistive-technology accessibility tree and are not announced.
3. WHILE Reduced_Motion is active, THE Skeleton_System SHALL continue to expose the loading status required by Requirement 11.1 and SHALL satisfy the static-fill behavior required by Requirement 6.3.
4. WHEN a Final_Component replaces its skeleton, THE Skeleton_System SHALL set `aria-busy="false"` and clear the loading status within 500 milliseconds so assistive technology is informed that loading has completed.
5. WHEN multiple Component_Skeletons are displayed simultaneously on a page, THE Skeleton_System SHALL expose at most one aggregate loading status for that page rather than one status per Component_Skeleton.

### Requirement 12: Codebase Audit and Report

**User Story:** As a maintainer, I want an automated audit and a written report of the migration, so that I can verify full coverage and track what changed.

#### Acceptance Criteria

1. THE migration SHALL scan `client/src` to enumerate every page/route, every component with a loading state, every Generic_Loader, and every Legacy_Skeleton, recording the source file path of each enumerated item.
2. THE migration SHALL produce an Audit_Report containing, for each of the categories pages scanned, components scanned, skeletons created, Generic_Loaders removed, Legacy_Skeletons removed, CLS issues fixed, and missing skeletons, a non-negative integer count and an itemized list where each item records its name and source file path.
3. WHERE the audit identifies a page or reusable component with a data-dependent loading state but no corresponding skeleton, THE Audit_Report SHALL list that item under missing skeletons until a skeleton is created, even after the migration has been marked complete.
4. WHEN the migration is complete, THE Audit_Report SHALL show a missing-skeletons count of zero OR SHALL record a written justification of at least one sentence for each remaining missing item.
5. IF the codebase scan required by Requirement 12.1 has not finished enumerating every file in `client/src`, THEN THE migration SHALL NOT be marked complete.
6. THE Audit_Report SHALL be stored as a version-controlled document file committed within the repository.
7. THE Audit_Report SHALL ensure that the integer count for each category in Requirement 12.2 equals the number of items in that category's itemized list.

### Requirement 13: Per-Page Quality Verification

**User Story:** As a maintainer, I want every page verified against a quality checklist, so that I can confirm each skeleton is production ready.

#### Acceptance Criteria

1. FOR every page enumerated in Requirement 4.1 that is verified, THE verification SHALL confirm that the page's Component_Skeletons and Page_Skeleton reproduce element dimensions and spacing within the 4-pixel per-dimension placeholder tolerance and the 8-pixel outer-height tolerance defined in Requirement 5.
2. FOR every page enumerated in Requirement 4.1 that is verified, THE verification SHALL confirm that the page's skeletons reproduce responsive behavior at the same Tailwind breakpoints used by the page's Final_Components per Requirement 5.3.
3. FOR every page enumerated in Requirement 4.1 that is verified, THE verification SHALL confirm correct rendering in the `light` Theme and in at least one dark Theme variant (`dark`, `dark-blue`, `dark-black`, or `dark-gray`) per Requirement 7.
4. FOR every page enumerated in Requirement 4.1 that is verified, THE verification SHALL confirm that the route-level CLS contribution from skeleton-to-content swaps is at most 0.1 per Requirement 8.4.
5. FOR every page enumerated in Requirement 4.1 that is verified, THE verification SHALL confirm that the Shimmer_Animation is present while a skeleton is mounted and that a static placeholder fill is rendered while Reduced_Motion is active, per Requirement 6.
6. FOR every page enumerated in Requirement 4.1 that is verified, THE verification SHALL confirm conditional rendering parity per Requirement 9.
7. WHEN verification of a page completes, THE verification SHALL record in the Audit_Report the page identifier, the pass or fail outcome of each check in criteria 1 through 6, and an overall production-ready status for that page.
8. IF any check in criteria 1 through 6 fails for a page, THEN THE verification SHALL mark that page as not production ready in the Audit_Report and SHALL record the failing check and the observed value that caused the failure.
