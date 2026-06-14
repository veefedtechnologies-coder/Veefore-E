# shared/auth

Shared authentication package used by both the **Main App** (`/server/`) and the **Admin Panel** (`/admin-panel/server/`).

---

## Overview

This package consolidates all authentication logic that was previously duplicated across both applications. Centralizing here ensures consistent security behavior, easier maintenance, and a single place to audit auth logic.

---

## Directory Structure

```
shared/auth/
├── controllers/
│   ├── OAuthController.ts       — Google, Facebook, Instagram OAuth
│   ├── EmailAuthController.ts   — email/password auth, hashing, reset
│   └── SessionController.ts    — JWT generation, validation, refresh
├── middleware/
│   └── authenticate.ts         — JWT validation + RBAC Express middleware
└── README.md
```

---

## Usage

### JWT Authentication Middleware

```typescript
import { authenticate } from '../../shared/auth/middleware/authenticate';

// Protect a route
router.get('/profile', authenticate, getProfile);

// Require a specific role
router.delete('/admin/users/:id', authenticate, requireRole('admin'), deleteUser);
```

### OAuth Controller

```typescript
import { OAuthController } from '../../shared/auth/controllers/OAuthController';

const oauthController = new OAuthController({
  googleClientId: process.env.GOOGLE_CLIENT_ID,
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
  facebookAppId: process.env.FACEBOOK_APP_ID,
  facebookAppSecret: process.env.FACEBOOK_APP_SECRET,
  callbackBaseUrl: process.env.APP_URL,
});

router.get('/auth/google', oauthController.initiateGoogle);
router.get('/auth/google/callback', oauthController.handleGoogleCallback);
```

### Email Auth Controller

```typescript
import { EmailAuthController } from '../../shared/auth/controllers/EmailAuthController';

const emailAuth = new EmailAuthController();

// Register
const result = await emailAuth.register({
  email: 'user@example.com',
  password: 'SecurePassword123!',
  name: 'Jane Doe'
});

// Login
const session = await emailAuth.login({
  email: 'user@example.com',
  password: 'SecurePassword123!'
});

// Password reset
await emailAuth.requestPasswordReset('user@example.com');
await emailAuth.confirmPasswordReset(token, newPassword);
```

### Session Controller

```typescript
import { SessionController } from '../../shared/auth/controllers/SessionController';

const sessionCtrl = new SessionController({
  jwtSecret: process.env.JWT_SECRET,
  accessTokenExpiry: '15m',
  refreshTokenExpiry: '30d',
  redisUrl: process.env.REDIS_URL,
});

// Generate tokens
const { accessToken, refreshToken } = await sessionCtrl.createSession(userId, metadata);

// Validate token
const payload = await sessionCtrl.validateAccessToken(token);

// Refresh
const newTokens = await sessionCtrl.refreshSession(refreshToken);

// Logout
await sessionCtrl.destroySession(refreshToken);
```

---

## Security Notes

- Passwords are hashed with **bcrypt** (12 rounds)
- JWTs are signed with **HS256** using the `JWT_SECRET` environment variable
- Refresh tokens are stored in **Redis** and invalidated on logout
- Rate limiting is applied at the middleware level (10 attempts per 15 minutes for login)
- OAuth state parameters are validated to prevent CSRF attacks
- All tokens include `jti` (JWT ID) for revocation support

---

## Environment Variables

The following variables must be set in your application:

```
JWT_SECRET=                  # Required: secret for JWT signing
REDIS_URL=                   # Required: Redis connection string
GOOGLE_CLIENT_ID=            # Optional: for Google OAuth
GOOGLE_CLIENT_SECRET=        # Optional: for Google OAuth
FACEBOOK_APP_ID=             # Optional: for Facebook OAuth
FACEBOOK_APP_SECRET=         # Optional: for Facebook OAuth
INSTAGRAM_CLIENT_ID=         # Optional: for Instagram OAuth
INSTAGRAM_CLIENT_SECRET=     # Optional: for Instagram OAuth
APP_URL=                     # Required: base URL for OAuth callbacks
```

---

## App-Specific Extensions

Each application can extend the shared middleware for app-specific logic:

**Main App** — adds user subscription checks:
```typescript
export const authenticateUser = [authenticate, requireActiveSubscription];
```

**Admin Panel** — adds admin role check:
```typescript
export const authenticateAdmin = [authenticate, requireRole('admin')];
```

---

## Tests

The shared auth package has unit tests covering:
- JWT generation and validation
- OAuth state management
- Password hashing and verification
- Session creation and revocation
- Rate limiting behavior

Run with: `npm test -- --testPathPattern=shared/auth`
