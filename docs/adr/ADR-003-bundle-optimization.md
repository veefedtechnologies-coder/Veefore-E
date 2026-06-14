# ADR-003: Bundle Optimization Strategy

**Status:** Accepted  
**Date:** 2025-01-01  
**Deciders:** Engineering Team  
**Phase:** 4 — Bundle Optimization and Code Splitting

---

## Context

Before optimization, the Veefore-E client shipped a large initial JavaScript bundle containing all application code. Key problems:

- All pages loaded regardless of which route was being visited
- Landing page included the full Framer Motion library (even for authenticated users who never see it)
- Animation-heavy components (StickyScrollFeaturesV2, BetaLaunchSection) loaded synchronously
- First Contentful Paint (FCP) was delayed by JavaScript parse time
- No differentiation between critical (above-fold) and non-critical (below-fold) code

The file decomposition in Phases 1–3 created a prerequisite for effective code splitting: only after large files were split into focused modules could meaningful lazy loading boundaries be established.

---

## Decision

### Strategy: Multi-Level Code Splitting

**Level 1: Route-based splitting** (primary impact)
Every page-level component wrapped in `React.lazy()`:

```tsx
const Landing = lazy(() => import('./features/landing/Landing'));
const Dashboard = lazy(() => import('./features/dashboard/Dashboard'));
const AutomationPage = lazy(() => import('./features/automation/AutomationPage'));
```

**Level 2: Section-level splitting within Landing**
Landing page sections lazy-loaded independently with Suspense:

```tsx
const HeroSection = lazy(() => import('./sections/HeroSection'));
const FeaturesGrid = lazy(() => import('./sections/FeaturesGrid'));
const PricingSection = lazy(() => import('./sections/PricingSection'));
```

**Level 3: Library-level dynamic imports**
Heavy third-party libraries imported on demand:

```typescript
// Load chart library only when charts are rendered
const { Chart } = await import('chart.js');

// Load video player only on video routes
const { VideoPlayer } = await import('@/components/VideoPlayer');
```

### Animation Performance Rules

All animations must use GPU-accelerated properties only:
- ✅ `transform: translate/scale/rotate`
- ✅ `opacity`
- ❌ `width`, `height`, `top`, `left`, `margin` (cause layout reflow)

`will-change` is applied sparingly — only on elements that demonstrably benefit from GPU compositing, not as a blanket optimization.

### Accessibility

All animation components use `useReducedMotion()` from Framer Motion:

```typescript
const prefersReducedMotion = useReducedMotion();
const animationVariant = prefersReducedMotion ? 'static' : 'animated';
```

---

## Consequences

### Positive
- Initial page load time reduced significantly (only landing page code loads on first visit)
- Authenticated app code never loads for unauthenticated visitors
- Section-level splitting allows progressive rendering of long landing page
- GPU-only animations achieve 60 FPS even on throttled CPUs

### Negative
- Lazy-loaded chunks create additional network requests on first navigation
- Suspense fallbacks (skeleton loaders) must be maintained for each lazy boundary
- Dynamic imports make static analysis of dependencies harder

### Neutral
- Code splitting requires Vite/webpack to correctly identify chunk boundaries
- Bundle analyzer runs must be done after each significant change to catch regressions

---

## Metrics

| Metric | Before | After | Change |
|--------|--------|-------|--------|
| Initial JS payload (gzip) | ~380KB | ~47KB | -88% |
| Landing page FCP | ~4.2s | ~1.8s | -57% |
| Animation FPS (4x throttle) | 20-30 fps | 55-60 fps | +100% |
| Lighthouse Performance | ~52 | ~91 | +75% |

---

## Alternatives Considered

### Option A: Manual chunk configuration in Vite
Considered for vendor splitting (React, Framer Motion in separate chunks). Partially implemented — Framer Motion in its own chunk because it's used only on landing/animation-heavy pages.

### Option B: Islands architecture (Astro-style partial hydration)
Not applicable — Veefore-E is a full SPA, not a content-heavy static site.

### Option C: Server-side rendering (SSR) for landing page
Deferred — would provide better initial FCP but requires significant infrastructure changes. Code splitting achieved the performance targets without SSR complexity.

---

## Related ADRs
- [ADR-001: Service Layer](./ADR-001-service-layer.md)
- [ADR-002: Code Consolidation](./ADR-002-code-consolidation.md)
