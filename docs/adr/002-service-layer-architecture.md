# ADR-002: Service Layer Architecture (Server)

**Status:** Accepted  
**Date:** 2025-01-01  
**Deciders:** Engineering Team  
**Phase:** 3 — Service Layer Architecture Implementation

---

## Context

Server-side code in Veefore-E had business logic embedded directly in route handlers and MongoDB model files. The most critical examples:

- `ai.routes.ts` — 2,369 lines combining routing, AI provider selection, prompt processing, and error handling
- `storage.ts` — 1,992 lines mixing file upload, image resizing, S3 operations, and database writes
- `mongodb-storage.ts` — 1,779 lines of mixed business logic and data access
- `permissions.ts` — 1,020 lines combining permission definitions, checking logic, and Express middleware

This "fat route" pattern created significant maintenance problems:
- Unit testing required mocking HTTP request/response objects and database connections simultaneously
- Business logic changes required navigating thousands of lines to find the right place
- The same logic (e.g., token validation) was copy-pasted across multiple route files
- No clear ownership — any developer could add business logic anywhere in the file

---

## Decision

Implement a strict three-layer architecture for all server features:

```
HTTP Layer         Business Logic Layer    Data Access Layer
─────────────      ─────────────────────   ─────────────────
Controller    →    Service              →  Repository
(request/          (business rules,        (MongoDB, Redis,
 response)          orchestration)          external APIs)
```

### Layer Responsibilities

**Controller** (`/server/features/<domain>/controllers/`)
- Parse and validate HTTP request shape
- Call one or more service methods
- Format and return the HTTP response
- Handle `next(error)` for unhandled errors
- Maximum ~150 lines per controller file

**Service** (`/server/features/<domain>/services/`)
- Implement all business rules and logic
- Orchestrate calls across repositories and external services
- Throw typed errors (`ValidationError`, `AuthenticationError`, `NotFoundError`)
- No HTTP knowledge (no `req`, `res`, `next`)
- Maximum ~400 lines per service file

**Repository** (`/server/features/<domain>/repositories/`)
- Abstract all database interactions
- Implement interfaces (`IInstagramRepository`, `IStorageRepository`)
- Return domain objects, not raw MongoDB documents
- No business logic — only data transformation to/from storage format
- Maximum ~250 lines per repository file

### Enforced Directory Structure

```
server/features/
├── ai/
│   ├── controllers/
│   │   ├── text-generation.controller.ts
│   │   ├── image-generation.controller.ts
│   │   └── caption-analysis.controller.ts
│   ├── services/
│   │   ├── ai-manager.service.ts
│   │   ├── openai.service.ts
│   │   ├── gemini.service.ts
│   │   └── perplexity.service.ts
│   └── utils/
│       ├── promptProcessing.ts
│       └── contentGeneration.ts
├── instagram/
│   ├── controllers/
│   ├── services/
│   ├── repositories/
│   └── webhooks/
└── storage/
    ├── controllers/
    ├── services/
    └── repositories/
```

---

## Consequences

### Positive
- Services are 100% unit testable without HTTP or database infrastructure
- Controllers are thin and consistent — easy to audit for security
- Repository interfaces allow switching storage backends (e.g., PostgreSQL for some data) without touching business logic
- Typed error classes enable consistent error response formatting in the global error handler
- New developers can implement a feature by following the same three-file pattern

### Negative
- 3× more files per feature (controller, service, repository) vs. one route file
- Dependency injection boilerplate for services that depend on multiple repositories
- Simple CRUD endpoints feel over-engineered — but the pattern scales correctly when complexity grows

### Neutral
- All existing API contracts are preserved — response shapes and status codes are unchanged
- No performance impact from the additional layer — same operations, different organization

---

## Alternatives Considered

### Option A: Thin controllers + fat models (Active Record)
Rejected — moves business logic into Mongoose models, which become untestable and tightly coupled to MongoDB.

### Option B: CQRS (Command/Query Responsibility Segregation)
Deferred — appropriate for high-scale read/write separation, but adds significant complexity that is not yet justified by traffic patterns.

### Option C: Single service file per feature (no repository separation)
Partially adopted — for simple features, service and repository may be combined initially, with separation added when data access grows complex.

---

## Related ADRs
- [ADR-001: Feature Module Structure](./001-feature-module-structure.md)
- [ADR-003: Bundle Optimization Strategy](./003-bundle-optimization-strategy.md)
- [ADR-001 (original): Service Layer](./ADR-001-service-layer.md)
