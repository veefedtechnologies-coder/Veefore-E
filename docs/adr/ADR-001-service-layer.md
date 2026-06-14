# ADR-001: Service Layer Architecture

**Status:** Accepted  
**Date:** 2025-01-01  
**Deciders:** Engineering Team  
**Phase:** 3 — Service Layer Architecture Implementation

---

## Context

The Veefore-E server codebase had business logic embedded directly in route handlers. Files like `ai.routes.ts` (2,369 lines) and `storage.ts` (1,992 lines) mixed HTTP request handling, business rules, database queries, and external API calls in the same functions.

This created several problems:
- Route files were untestable without standing up a full HTTP server
- Business logic changes required modifying large, complex files
- Database queries were scattered throughout the codebase
- Impossible to reuse logic across different route handlers
- No clear ownership — unclear which layer was responsible for what

---

## Decision

Implement a three-layer service architecture for all server-side features:

```
Controller  →  Service  →  Repository
```

**Layer Responsibilities:**

| Layer | Responsibility | Must NOT |
|-------|---------------|---------|
| Controller | Parse HTTP request, validate input shape, call service, format HTTP response | Contain business logic or DB queries |
| Service | Business rules, orchestration, error handling, transactions | Handle HTTP concerns |
| Repository | Data access abstraction (MongoDB, Redis, external APIs) | Contain business logic |

**Implementation Pattern:**

```typescript
// Controller — only HTTP
export const generateCaption = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { prompt, platform } = req.body;
    const result = await aiManager.analyzeCaption(prompt, { platform });
    res.json(result);
  } catch (error) {
    next(error);
  }
};

// Service — only business logic
export class AIServiceManager {
  async analyzeCaption(text: string, options: CaptionOptions): Promise<CaptionResult> {
    const provider = this.selectProvider('caption');
    const raw = await provider.analyzeCaption(text, options);
    return this.formatCaptionResult(raw);
  }
}

// Repository — only data access
export class InstagramRepository implements IInstagramRepository {
  async getAccessToken(userId: string): Promise<AccessToken | null> {
    return this.db.collection('tokens').findOne({ userId });
  }
}
```

---

## Consequences

### Positive
- Services are fully unit-testable without HTTP infrastructure
- Business logic changes are isolated to service files
- Controllers are thin and consistent across all features
- Repository abstraction makes it easy to swap storage backends
- Clear code ownership and single responsibility per file

### Negative
- More files per feature (3+ files instead of 1)
- Slight increase in boilerplate for simple CRUD operations
- Developers must understand the layer pattern to contribute

### Neutral
- No performance impact — same operations, just organized differently
- Backward compatible — API endpoints and response shapes unchanged

---

## Alternatives Considered

### Option A: Keep logic in route handlers (status quo)
Rejected — the cause of the maintainability problems, not viable.

### Option B: Two-layer (Controller + Repository, no Service)
Rejected — complex business logic with multiple data sources needs an intermediate layer for orchestration.

### Option C: Domain Model pattern (rich domain objects)
Deferred — would be an appropriate evolution after service layer is established, but scope was too large for this refactoring cycle.

---

## Related ADRs
- [ADR-002: Code Consolidation](./ADR-002-code-consolidation.md)
- [ADR-003: Bundle Optimization](./ADR-003-bundle-optimization.md)
