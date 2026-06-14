# Authentication Middleware

This directory contains Express middleware functions for protecting routes and enforcing authentication policies.

## Structure

Middleware files are organized by function:

- `authenticate.middleware.ts` - JWT validation and user attachment
- `require-auth.middleware.ts` - Ensure user is authenticated
- `require-role.middleware.ts` - Role-based access control
- `rate-limiter.middleware.ts` - Request rate limiting
- `email-verified.middleware.ts` - Ensure email is verified
- `two-factor.middleware.ts` - 2FA enforcement
- `optional-auth.middleware.ts` - Optional authentication

## Middleware Responsibilities

Middleware should:
- Validate authentication state
- Enforce authorization policies
- Attach user/session data to request
- Return appropriate HTTP errors (401, 403, 429)
- Call `next()` to continue or `next(error)` to handle errors

## Example Middleware Pattern

```typescript
import { Response, NextFunction } from 'express';
import { AuthRequest, AuthError, AuthErrorType } from '../types';
import { TokenService } from '../services';
import { extractToken, createAuthError } from '../utils';

export const authenticate = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const token = extractToken(req);
    
    if (!token) {
      throw createAuthError(AuthErrorType.UNAUTHORIZED);
    }
    
    const payload = await TokenService.validateToken(token);
    
    if (!payload.valid) {
      throw createAuthError(
        payload.expired ? AuthErrorType.TOKEN_EXPIRED : AuthErrorType.TOKEN_INVALID
      );
    }
    
    // Attach user to request
    req.user = await UserRepository.findById(payload.userId);
    req.token = token;
    
    next();
  } catch (error) {
    next(error);
  }
};
```

## Usage Examples

### Protect a Route

```typescript
import { authenticate, requireAuth } from '@server/shared/auth/middleware';

router.get('/api/profile', authenticate, requireAuth, ProfileController.getProfile);
```

### Role-Based Protection

```typescript
import { authenticate, requireRole } from '@server/shared/auth/middleware';

router.delete(
  '/api/admin/users/:id',
  authenticate,
  requireRole(['admin', 'super_admin']),
  AdminController.deleteUser
);
```

### Rate Limiting

```typescript
import { rateLimiter } from '@server/shared/auth/middleware';

router.post(
  '/api/auth/login',
  rateLimiter({ windowMs: 15 * 60 * 1000, maxRequests: 5 }),
  AuthController.login
);
```

## Implementation Status

**Status:** Placeholder implementations created (with warnings)
**Next Steps:** Implement individual middleware files in subsequent refactoring tasks
