# server/shared

Shared server-side modules used across all feature domains in the Veefore-E server.

---

## Overview

This directory contains cross-cutting concerns that are not specific to any single feature. Code here is used by two or more feature modules (`/server/features/ai/`, `/server/features/instagram/`, `/server/features/storage/`, etc.).

---

## Directory Structure

```
server/shared/
├── errors/           — Typed error classes for consistent error handling
│   ├── AppError.ts              — Base error class
│   ├── ValidationError.ts       — 400 input validation errors
│   ├── AuthenticationError.ts   — 401 auth failures
│   ├── NotFoundError.ts         — 404 resource not found
│   ├── ExternalServiceError.ts  — 502/503 third-party API failures
│   └── index.ts                 — Re-exports all error classes
│
├── middleware/       — Express middleware applied globally
│   ├── errorHandler.ts          — Global error handler (must be last middleware)
│   ├── auth.middleware.ts        — JWT validation + RBAC
│   ├── auth.middleware.test.ts   — Unit tests for auth middleware
│   └── index.ts                 — Re-exports all middleware
│
└── auth/             — Shared authentication logic (see auth/README.md)
    ├── controllers/
    ├── middleware/
    ├── services/
    ├── types/
    └── README.md
```

---

## `errors/` — Typed Error Classes

All application errors extend `AppError`. Throwing a typed error from any service automatically produces the correct HTTP status code and structured JSON response via the global error handler.

### Available Error Classes

```typescript
import {
  AppError,
  ValidationError,
  AuthenticationError,
  NotFoundError,
  ExternalServiceError,
} from '../shared/errors';
```

| Class | HTTP Status | When to Use |
|-------|-------------|-------------|
| `ValidationError` | 400 | Invalid request input (bad field values, missing required fields) |
| `AuthenticationError` | 401 | Missing token, expired token, invalid credentials |
| `NotFoundError` | 404 | Resource does not exist in the database |
| `ExternalServiceError` | 502 | Third-party API (Instagram, OpenAI, S3) returned an error |
| `AppError` | 500 | Generic unexpected server error (base class) |

### Usage Example

```typescript
// In a service:
import { NotFoundError, ValidationError } from '../../shared/errors';

async function getUser(userId: string): Promise<User> {
  if (!userId) {
    throw new ValidationError('userId is required');
  }
  const user = await userRepo.findById(userId);
  if (!user) {
    throw new NotFoundError(`User ${userId} not found`);
  }
  return user;
}
```

The global error handler in `middleware/errorHandler.ts` catches these and returns:

```json
{
  "error": {
    "type": "NotFoundError",
    "message": "User abc123 not found",
    "statusCode": 404,
    "requestId": "req-uuid-here"
  }
}
```

---

## `middleware/` — Express Middleware

### Global Error Handler

Register as the **last middleware** in your Express app:

```typescript
import { errorHandler } from '../shared/middleware';

// All routes registered above...
app.use('/api', apiRouter);

// Error handler must be last
app.use(errorHandler);
```

The error handler:
- Catches all errors passed to `next(error)`
- Formats `AppError` subclasses into structured JSON responses
- Logs unexpected errors with request context (requestId, userId, stack trace)
- Returns a generic 500 response for unhandled error types (no stack trace in production)

### Auth Middleware

```typescript
import { authenticate, requireRole } from '../shared/middleware';

// Require any authenticated user
router.get('/profile', authenticate, getProfile);

// Require a specific role
router.delete('/admin/users/:id', authenticate, requireRole('admin'), deleteUser);
```

See `auth/README.md` for full authentication documentation.

---

## `auth/` — Shared Authentication

See the dedicated **[auth/README.md](./auth/README.md)** for complete documentation on:
- OAuth controller (Google, Facebook, Instagram)
- Email auth controller (login, register, password reset)
- Session controller (JWT generation, validation, refresh)
- Authentication middleware

---

## Adding New Shared Code

Before adding to `server/shared/`, confirm the code meets the criteria:

1. **Used by 2+ feature modules** — if only one feature uses it, keep it in that feature's directory
2. **No feature-specific business logic** — shared modules must be generic
3. **Well-typed** — all exports must have explicit TypeScript types
4. **Tested** — add unit tests alongside the file (`.test.ts` suffix)

For truly application-wide utilities (not feature-specific, not HTTP-specific), see also `/shared/` at the repository root.
