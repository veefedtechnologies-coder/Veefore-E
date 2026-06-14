# Authentication Utilities

This directory contains helper functions and utilities for authentication operations.

## Available Utilities

### Token Utilities
- `extractToken(req)` - Extract JWT from Authorization header or cookies
- `generateRandomToken(length)` - Generate cryptographically secure random token
- `generateVerificationToken()` - Generate email verification token
- `generatePasswordResetToken()` - Generate password reset token
- `generateSessionId()` - Generate unique session identifier

### Password Utilities
- `hashPassword(password)` - Hash password using bcrypt
- `verifyPassword(password, hash)` - Verify password against hash
- `validatePassword(password)` - Validate password strength

### Validation Utilities
- `validateEmail(email)` - Validate email format
- `normalizeEmail(email)` - Normalize email (lowercase, trim)

### Date/Time Utilities
- `parseExpiry(expiry)` - Parse JWT expiry string to milliseconds
- `calculateExpiryDate(expiryString)` - Calculate expiry date from string
- `isTokenExpired(expiryDate)` - Check if token is expired
- `shouldRefreshToken(expiryDate)` - Check if token should be refreshed

### Request Utilities
- `getClientIp(req)` - Get client IP address from request
- `getUserAgent(req)` - Get user agent from request

### Data Utilities
- `sanitizeUser(user)` - Remove sensitive fields from user object
- `maskEmail(email)` - Mask email for display
- `generateBackupCodes(count)` - Generate 2FA backup codes

### Error Utilities
- `createAuthError(type, message, statusCode)` - Create typed auth error

## Usage Examples

### Password Hashing

```typescript
import { hashPassword, verifyPassword } from '@server/shared/auth/utils';

// Hash password during registration
const hashedPassword = await hashPassword(userPassword);

// Verify password during login
const isValid = await verifyPassword(inputPassword, storedHash);
```

### Token Extraction

```typescript
import { extractToken } from '@server/shared/auth/utils';

const token = extractToken(req);
if (!token) {
  throw new Error('No token provided');
}
```

### Email Validation

```typescript
import { validateEmail, normalizeEmail } from '@server/shared/auth/utils';

if (!validateEmail(email)) {
  throw new Error('Invalid email format');
}

const normalizedEmail = normalizeEmail(email);
```

### Error Creation

```typescript
import { createAuthError, AuthErrorType } from '@server/shared/auth/utils';

throw createAuthError(AuthErrorType.INVALID_CREDENTIALS);
```

## Security Considerations

- All password operations use bcrypt with configurable salt rounds
- Random tokens use crypto.randomBytes for cryptographic security
- Email normalization prevents duplicate accounts with case variations
- Token expiry checks prevent replay attacks

## Implementation Status

**Status:** Complete - All core utilities implemented
**Exports:** Available via `index.ts`
