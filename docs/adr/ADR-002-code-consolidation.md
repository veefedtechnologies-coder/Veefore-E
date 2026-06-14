# ADR-002: Code Consolidation Strategy

**Status:** Accepted  
**Date:** 2025-01-01  
**Deciders:** Engineering Team  
**Phase:** 2 — Code Duplication Elimination

---

## Context

Analysis of the codebase revealed significant code duplication across multiple file pairs and groups:

1. **Instagram API** — `instagramApi.ts` (995 lines) and `instagram-api.ts` (780 lines) with ~60% overlapping functionality
2. **Mobile Libraries** — `mobile-excellence.ts` (714 lines), `mobile-optimization.ts` (665 lines), `mobile-performance.ts` (640 lines) with device detection, breakpoints, and touch handling duplicated across all three
3. **Authentication** — Main App and Admin Panel each maintained separate auth middleware, JWT handling, and OAuth flows

Each instance of duplication introduced divergence risk: when one copy was updated, the other(s) often were not, leading to subtle behavioral differences and bugs.

---

## Decision

### Strategy: Canonical Source + Migration

For each duplication group:
1. Identify or create a **canonical implementation** (the authoritative version)
2. Migrate all consumers to use the canonical version
3. Delete the deprecated copies only after all consumers are migrated and tested

### Shared Package Locations

| Concern | Canonical Location |
|---------|-------------------|
| Authentication | `/shared/auth/` (accessible to both Main App and Admin Panel) |
| Instagram API | `/server/features/instagram/services/instagram.service.ts` |
| Mobile utilities | `/client/src/shared/services/MobileOptimizationService.ts` |

### Interface-First Design

For each consolidated module, define an interface before implementing:

```typescript
// /server/features/instagram/services/instagram.service.ts
interface IInstagramService {
  publishMedia(userId: string, media: MediaPayload): Promise<PublishResult>;
  processWebhook(event: InstagramWebhookEvent): Promise<void>;
  sendDirectMessage(userId: string, recipientId: string, message: string): Promise<void>;
  automateComments(userId: string, config: CommentAutomationConfig): Promise<void>;
}
```

This ensures the consolidated module covers all use cases from both original implementations.

### Deduplication Targets

| Group | Before | After | Reduction |
|-------|--------|-------|-----------|
| Instagram | 1,775 lines (2 files) | ~600 lines (1 service) | 66% |
| Mobile | 2,019 lines (3 files) | ~850 lines (1 service + 3 util files) | 58% |
| Auth | ~1,000 lines (duplicated) | ~900 lines (shared + app-specific extensions) | 40% |

---

## Consequences

### Positive
- Single source of truth for Instagram API, mobile utilities, and authentication
- Bug fixes and improvements propagate to all consumers automatically
- Easier to test — one set of tests covers all usage patterns
- Reduced total codebase size

### Negative
- Large upfront migration effort (updating all import paths)
- Shared auth package must be carefully versioned if it ever becomes a separate npm package
- Breaking changes in shared modules affect all consumers simultaneously

### Neutral
- Feature flags allowed gradual migration without a big-bang cutover
- Old files were retained until migration was complete (temporary duplication)

---

## Alternatives Considered

### Option A: Wrapper Pattern (keep old files, wrap new implementation)
Considered but rejected — creates ongoing maintenance burden of keeping wrappers in sync, and still results in duplicate code.

### Option B: Monorepo packages (npm workspaces)
Considered for the shared auth package — deferred. The current import-path approach works and can be migrated to proper packages later with less disruption.

### Option C: Copy-paste the best implementation everywhere
Rejected — this is the source of the original problem.

---

## Related ADRs
- [ADR-001: Service Layer](./ADR-001-service-layer.md)
- [ADR-003: Bundle Optimization](./ADR-003-bundle-optimization.md)
