# Authentication Services

This directory contains business logic for authentication operations.

## Structure

Services are organized by functional area:

- `auth.service.ts` - Core authentication operations
- `token.service.ts` - JWT token management
- `session.service.ts` - Session creation and validation
- `oauth.service.ts` - OAuth provider integrations
- `password.service.ts` - Password operations
- `verification.service.ts` - Email verification logic
- `two-factor.service.ts` - 2FA operations

## Service Responsibilities

Services should:
- Contain business logic
- Interact with repositories for data access
- Handle transactions and orchestration
- Validate business rules
- NOT handle HTTP concerns (delegate to controllers)

## Example Service Pattern

```typescript
import { TokenService } from './token.service';
import { UserRepository } from '../../repositories';
import { LoginCredentials, AuthResponse } from '../types';
import { verifyPassword, createAuthError, AuthErrorType } from '../utils';

export class AuthService {
  static async login(credentials: LoginCredentials): Promise<AuthResponse> {
    const user = await UserRepository.findByEmail(credentials.email);
    
    if (!user) {
      throw createAuthError(AuthErrorType.INVALID_CREDENTIALS);
    }
    
    const isValid = await verifyPassword(credentials.password, user.passwordHash);
    
    if (!isValid) {
      throw createAuthError(AuthErrorType.INVALID_CREDENTIALS);
    }
    
    const tokens = await TokenService.generateTokenPair(user);
    const session = await SessionService.create(user.id);
    
    return {
      user: sanitizeUser(user),
      tokens,
      session
    };
  }
}
```

## Implementation Status

**Status:** Placeholder implementations created
**Next Steps:** Implement individual service files in subsequent refactoring tasks
