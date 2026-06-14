# Authentication Types

This directory contains TypeScript interfaces, types, and enums used throughout the authentication system.

## Overview

The types are organized into several categories:

### User Types
- `User` - Core user interface
- `UserRole` - Enum of available user roles
- `AuthMethod` - Enum of authentication methods

### Token Types
- `AuthTokenPayload` - JWT payload structure
- `AccessToken` - Access token interface
- `RefreshToken` - Refresh token interface
- `AuthTokens` - Combined token response

### Session Types
- `SessionData` - Session information
- `LoginCredentials` - Login request data
- `RegistrationData` - Registration request data

### OAuth Types
- `OAuthProvider` - Enum of OAuth providers
- `OAuthProfile` - OAuth user profile

### Request/Response Types
- `AuthRequest` - Express request with user
- `AuthResponse` - Authentication response data
- `LoginResponse` - Login-specific response

### Error Types
- `AuthErrorType` - Enum of authentication error types
- `AuthError` - Custom authentication error class

## Usage

Import types as needed:

```typescript
import { User, UserRole, AuthRequest, AuthError } from '@server/shared/auth/types';

// Type a function parameter
function getUserProfile(user: User) {
  // ...
}

// Type an Express route handler
router.get('/profile', async (req: AuthRequest, res: Response) => {
  const user = req.user;
  // ...
});

// Throw a typed error
throw new AuthError(AuthErrorType.INVALID_CREDENTIALS, 'Invalid email or password', 401);
```

## Type Safety

All auth operations should use these types to ensure type safety across the application. Avoid using `any` types; prefer proper typing.

## Extension

When adding new authentication features, extend these types as needed. Ensure backwards compatibility when modifying existing types.

## Implementation Status

**Status:** Complete - All core types defined
**Exports:** Available via `index.ts`
