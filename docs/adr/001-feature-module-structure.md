# ADR-001: Feature Module Structure

**Status:** Accepted  
**Date:** 2025-01-01  
**Deciders:** Engineering Team  
**Phase:** 1 — Critical File Decomposition

---

## Context

The Veefore-E client codebase was organized by file type ("components/", "hooks/", "utils/"), which caused several critical problems as the application grew:

- Large monolithic files: `AutomationStepByStep.tsx` (4,352 lines), `VideoGeneratorAdvanced.tsx` (3,125 lines), `VeeGPT.tsx` (2,365 lines), `SettingsTabs.tsx` (2,302 lines)
- Files for unrelated features lived in the same flat directory, making navigation difficult
- A change to one feature required searching through shared directories containing hundreds of unrelated files
- Testing was difficult because a component's logic, presentation, state management, and utilities were all mixed into one file
- Onboarding new developers required understanding the entire components/ directory before working on any single feature

The layered ("horizontal") folder organization worked at small scale but became a liability with 30+ critical files exceeding 1,000 lines.

---

## Decision

Reorganize the client codebase around **feature modules** ("vertical slicing"):

```
client/src/
├── features/
│   ├── automation/
│   │   ├── components/    — UI components for automation feature
│   │   ├── hooks/         — Custom React hooks
│   │   ├── utils/         — Feature-specific utility functions
│   │   └── index.ts       — Public API for the module
│   ├── video-generator/
│   │   ├── components/
│   │   ├── hooks/
│   │   └── index.ts
│   ├── chat/
│   ├── auth/
│   ├── settings/
│   └── landing/
├── shared/                — Truly shared cross-feature code
│   ├── components/        — Generic UI primitives
│   ├── hooks/             — Generic hooks (useDebounce, useLocalStorage)
│   ├── services/          — Shared services (MobileOptimizationService)
│   └── types/             — Shared TypeScript types
└── pages/                 — Route-level entry points (thin wrappers)
```

**Rules for placing code:**
1. If code is used by exactly one feature → put it in `features/<name>/`
2. If code is used by two or more features → put it in `shared/`
3. Pages (`/pages/`) are thin orchestrators that import from features, not vice versa

---

## Consequences

### Positive
- Each feature directory contains everything needed for that feature: no treasure hunt across the codebase
- Files are small and focused by construction — a component directory can only contain component files
- Deleting a feature means deleting one directory — clean and complete
- Onboarding: a developer working on automation only needs to understand `features/automation/`
- Bundle splitting aligns naturally with feature modules (one chunk per feature route)

### Negative
- More directories — the file tree is deeper
- Deciding where to put shared code requires judgment (a feature util vs. a shared util)
- Refactoring required touching many import paths across the codebase

### Neutral
- Application behavior is identical — this is a structural change only
- The `shared/` directory still uses the old horizontal structure, which is appropriate for truly generic code

---

## Alternatives Considered

### Option A: Flat components/ directory (status quo)
Rejected — caused the 4,000+ line files we were trying to fix. Does not scale.

### Option B: Domain-driven design (bounded contexts)
Considered — appropriate for a microservices split, but too heavy for a monorepo client application. Feature modules provide 80% of the benefit with less overhead.

### Option C: Atomic design (atoms/molecules/organisms/templates/pages)
Rejected — works well for pure component libraries but does not accommodate hooks, utilities, and business logic that belong to a feature.

---

## Related ADRs
- [ADR-002: Service Layer Architecture](./ADR-002-service-layer-architecture.md)
- [ADR-003: Bundle Optimization Strategy](./ADR-003-bundle-optimization-strategy.md)
- [ADR-001 (original): Service Layer](./ADR-001-service-layer.md)
