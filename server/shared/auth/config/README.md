# Authentication Configuration

This directory contains configuration files for the authentication system.

## Files

- `auth.config.ts` - Main authentication configuration

## Configuration Structure

The auth configuration includes:

### JWT Configuration
- Access token secret and expiry
- Refresh token secret and expiry
- Token issuer and audience

### Session Configuration
- Session max age
- Cookie settings (secure, httpOnly, sameSite)
- Cookie name

### OAuth Configuration
- Google OAuth settings
- Facebook OAuth settings
- Instagram OAuth settings
- Each provider includes: clientId, clientSecret, callbackUrl, scope

### Rate Limiting Configuration
- Window duration
- Max requests per window
- Skip successful/failed requests flags

### Password Configuration
- Salt rounds for bcrypt
- Password requirements (min length, complexity)

### Feature Flags
- Email verification enabled/disabled
- Two-factor authentication enabled/disabled

## Usage

Import and use the configuration:

```typescript
import { authConfig, validateAuthConfig } from '@server/shared/auth/config';

// Validate configuration at startup
validateAuthConfig();

// Access configuration values
const accessTokenExpiry = authConfig.jwt.accessTokenExpiry;
const googleClientId = authConfig.oauth.google.clientId;
```

## Environment Variables

All configuration values can be overridden via environment variables:

### JWT Settings
- `JWT_ACCESS_SECRET` - Secret for signing access tokens (required)
- `JWT_REFRESH_SECRET` - Secret for signing refresh tokens (required)
- `JWT_ACCESS_EXPIRY` - Access token expiry (default: '15m')
- `JWT_REFRESH_EXPIRY` - Refresh token expiry (default: '7d')
- `JWT_ISSUER` - Token issuer (default: 'veefore-auth')
- `JWT_AUDIENCE` - Token audience (default: 'veefore-api')

### Session Settings
- `SESSION_MAX_AGE` - Session duration in milliseconds (default: 604800000 = 7 days)
- `SESSION_SECRET` - Session secret for signing

### OAuth Settings

**Google:**
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_CALLBACK_URL`
- `ENABLE_GOOGLE_AUTH` - Set to 'true' to enable

**Facebook:**
- `FACEBOOK_APP_ID`
- `FACEBOOK_APP_SECRET`
- `FACEBOOK_CALLBACK_URL`
- `ENABLE_FACEBOOK_AUTH` - Set to 'true' to enable

**Instagram:**
- `INSTAGRAM_CLIENT_ID`
- `INSTAGRAM_CLIENT_SECRET`
- `INSTAGRAM_CALLBACK_URL`

### Rate Limiting Settings
- `RATE_LIMIT_WINDOW_MS` - Window duration (default: 900000 = 15 min)
- `RATE_LIMIT_MAX_REQUESTS` - Max requests (default: 100)

### Password Settings
- `PASSWORD_SALT_ROUNDS` - Bcrypt salt rounds (default: 12)
- `PASSWORD_MIN_LENGTH` - Minimum password length (default: 8)
- `PASSWORD_REQUIRE_UPPERCASE` - Require uppercase (default: true)
- `PASSWORD_REQUIRE_LOWERCASE` - Require lowercase (default: true)
- `PASSWORD_REQUIRE_NUMBERS` - Require numbers (default: true)
- `PASSWORD_REQUIRE_SPECIAL` - Require special chars (default: true)

### Feature Flags
- `ENABLE_EMAIL_VERIFICATION` - Enable email verification (default: true)
- `ENABLE_TWO_FACTOR` - Enable 2FA (default: false)
- `TOKEN_REFRESH_THRESHOLD` - Seconds before expiry to allow refresh (default: 300)

## Configuration Validation

The `validateAuthConfig()` function checks for required configuration values and throws descriptive errors if any are missing. Call this during application startup:

```typescript
import { validateAuthConfig } from '@server/shared/auth/config';

// In your main server file
try {
  validateAuthConfig();
  console.log('Auth configuration validated successfully');
} catch (error) {
  console.error('Auth configuration error:', error.message);
  process.exit(1);
}
```

## Helper Functions

### `getOAuthConfig(provider)`
Get OAuth configuration for a specific provider:

```typescript
import { getOAuthConfig } from '@server/shared/auth/config';

const googleConfig = getOAuthConfig('google');
```

### `isOAuthProviderEnabled(provider)`
Check if an OAuth provider is enabled:

```typescript
import { isOAuthProviderEnabled } from '@server/shared/auth/config';

if (isOAuthProviderEnabled('google')) {
  // Setup Google OAuth routes
}
```

## Security Best Practices

1. **Never commit secrets** - Use environment variables for all sensitive data
2. **Use strong secrets** - JWT secrets should be long, random strings
3. **Different secrets** - Use different secrets for access and refresh tokens
4. **Production settings** - Ensure `secure: true` for cookies in production
5. **Rate limiting** - Enable rate limiting on auth endpoints
6. **Password requirements** - Enforce strong password policies

## Implementation Status

**Status:** Complete
**Exports:** Available via `index.ts`
