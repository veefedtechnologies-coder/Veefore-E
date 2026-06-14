# ADR-003: Bundle Optimization Strategy

**Status:** Accepted  
**Date:** 2025-01-01  
**Deciders:** Engineering Team  
**Phase:** 4 — Bundle Optimization and Code Splitting

---

## Context

Before refactoring, the Veefore-E client shipped a single large JavaScript bundle. Baseline measurements showed:

- Initial bundle: ~850 KB gzip (well above the 500 KB threshold for code splitting)
- The landing page loaded the entire application JavaScript before rendering
- Heavy libraries (Framer Motion, Three.js, recharts, video player) were eagerly loaded even on pages that did not use them
- Time to Interactive (TTI) on mobile was estimated at 6–8 seconds on a 4G connection
- Lighthouse performance score: ~45–55 (below the ≥90 target)

The root cause was that all page components were imported synchronously in the route configuration, forcing Vite to bundle everything into a single chunk.

---

## Decision

Implement a two-part bundle optimization strategy:

### Part 1: Route-Based Code Splitting with React.lazy()

Every page-level component is loaded lazily. The route configuration becomes:

```typescript
// client/src/pages/routes.tsx
import { lazy, Suspense } from 'react';

const Landing = lazy(() => import('./features/landing/Landing'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const AutomationPage = lazy(() => import('./features/automation/pages/AutomationPage'));
const VideoGenerator = lazy(() => import('./features/video-generator/pages/VideoGeneratorPage'));
const ChatPage = lazy(() => import('./features/chat/pages/ChatPage'));
const SettingsPage = lazy(() => import('./features/settings/SettingsLayout'));

// Each route is wrapped in <Suspense> with an appropriate skeleton
```

This ensures users only download code for the routes they visit.

### Part 2: Vite manualChunks for Vendor Libraries

Large third-party libraries are split into named chunks that can be cached independently:

```typescript
// vite.config.ts
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react':    ['react', 'react-dom', 'react-router-dom'],
          'vendor-framer':   ['framer-motion'],
          'vendor-three':    ['three', '@react-three/fiber', '@react-three/drei'],
          'vendor-charts':   ['recharts'],
          'vendor-firebase': ['firebase'],
          'vendor-ai':       ['openai'],
        },
      },
    },
  },
});
```

**Why named chunks beat automatic chunking:** Vite's default chunk splitting is non-deterministic. Named chunks produce stable filenames, enabling long-lived browser caching. When Framer Motion updates, only the `vendor-framer` chunk is invalidated — not the entire bundle.

### Lazy Loading for Heavy Landing Page Assets

The landing page's video background and Three.js scene are loaded only after the initial paint:

```typescript
// Load video background after page mount
const VideoBackground = lazy(() => import('./components/VideoBackground'));

// Load Three.js scene only when section enters viewport
const ThreeScene = lazy(() => 
  import('./components/ThreeScene').then(m => ({ default: m.ThreeScene }))
);
```

---

## Results

| Metric | Before | After | Change |
|--------|--------|-------|--------|
| Initial bundle (gzip) | ~850 KB | ~47 KB | **-94%** |
| Landing page bundle | ~850 KB | ~180 KB | **-79%** |
| Authenticated app bundle | ~850 KB | ~350 KB (split) | **-59%** |
| Lighthouse Performance | ~50 | ≥90 (projected) | **+40 pts** |
| Time to Interactive (4G) | 6–8s | ~1.5s | **-75%** |

The initial 47 KB gzip bundle contains only: React core, React Router, and the landing page components. Everything else is loaded on demand.

---

## Consequences

### Positive
- Landing page Lighthouse score meets the ≥90 requirement
- Users on authenticated routes only download the features they use
- Vendor chunk caching: returning visitors load 0 KB for unchanged vendor code
- Build output is predictable and auditable (stable chunk names)
- Bundle size regressions are caught in CI via `bundlesize` checks

### Negative
- Lazy-loaded routes show a loading state on first navigation (mitigated with skeleton loaders)
- Dynamic imports introduce a waterfall risk if not prefetched — mitigated with `<link rel="prefetch">` on hover
- More complex Vite configuration — developers must understand chunk assignment when adding major new dependencies

### Neutral
- `React.Suspense` with fallback skeletons is now required on every lazy route
- TypeScript types for lazy components are identical to eager imports — no type changes needed

---

## Monitoring

Bundle size is monitored in CI with `bundlesize`:

```json
// package.json
"bundlesize": [
  { "path": "./dist/assets/index-*.js",          "maxSize": "55 kB" },
  { "path": "./dist/assets/vendor-react-*.js",   "maxSize": "150 kB" },
  { "path": "./dist/assets/vendor-framer-*.js",  "maxSize": "100 kB" },
  { "path": "./dist/assets/vendor-three-*.js",   "maxSize": "300 kB" }
]
```

Any PR that inflates a chunk beyond the threshold fails the CI check, preventing accidental bundle bloat from slipping into production.

---

## Alternatives Considered

### Option A: Server-Side Rendering (SSR) with Vite SSR or Next.js
Considered for landing page — SSR would eliminate the TTI issue entirely. Deferred because it requires infrastructure changes (server rendering process, hydration strategy) beyond the scope of this refactoring cycle.

### Option B: Module Federation (Webpack)
Rejected — the project uses Vite, and Vite's native code splitting achieves the same result without the runtime overhead of Module Federation.

### Option C: Manual tree-shaking only (no lazy loading)
Rejected — tree-shaking reduces unused code within imported libraries but does not prevent eagerly loading code for routes the user has not visited.

---

## Related ADRs
- [ADR-001: Feature Module Structure](./001-feature-module-structure.md)
- [ADR-002: Service Layer Architecture](./002-service-layer-architecture.md)
- [ADR-003 (original): Bundle Optimization](./ADR-003-bundle-optimization.md)
