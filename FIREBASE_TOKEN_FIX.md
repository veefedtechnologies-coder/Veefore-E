# Firebase Token Authentication Fix

## Problem Identified

The authentication system had a critical mismatch between token types:

### The Bug
1. **Server created Custom Tokens** → Stored them in cookies
2. **Client received Custom Tokens** → Used them in API requests
3. **Server tried to verify as ID Tokens** → ❌ **FAILED!**

### Why This Failed
Firebase has two distinct token types:
- **Custom Token**: Created by Firebase Admin SDK, used for authentication
- **ID Token**: Created by Firebase Client SDK after signing in, used for verification

The server was creating Custom Tokens but trying to verify them with `verifyIdToken()`, which only works with ID Tokens.

### Symptoms
- Token refresh failing with "Invalid or expired authentication token"
- 401 errors every 55 minutes when background refresh ran
- Users seeing "no_valid_session" errors despite being logged in

## Solution Implemented

### New Token Flow

#### 1. Initial OAuth Login
```
User → Google OAuth → Server creates Custom Token → Cookie stores Custom Token
                                                  ↓
Client calls /api/auth/session → Gets Custom Token
                                ↓
Client: signInWithCustomToken() → Firebase returns ID Token
                                ↓
Client: POST /api/auth/update-token → Cookie updated with ID Token ✅
```

#### 2. Token Refresh (Every 55 Minutes)
```
Client → POST /api/auth/refresh → Server verifies ID Token ✅
                                ↓
                    Server creates new Custom Token
                                ↓
                    Returns Custom Token to client
                                ↓
Client: signInWithCustomToken() → Firebase returns new ID Token
                                ↓
Client: POST /api/auth/update-token → Cookie updated with new ID Token ✅
```

## Changes Made

### Server-Side Changes

#### 1. New Endpoint: `/api/auth/update-token`
**File**: `server/routes/auth.ts`

New POST endpoint that:
- Accepts an ID token from the client
- Verifies the ID token is valid
- Updates the `auth_token` cookie with the ID token
- Ensures cookie contains ID tokens (not custom tokens)

#### 2. Updated `/api/auth/refresh` Endpoint
**File**: `server/routes/auth.ts`

Changes:
- Now returns the custom token in the response body
- Client is responsible for exchanging it to ID token
- Removed direct cookie update (client handles it now)

### Client-Side Changes

#### 1. Updated `useFirebaseAuth` Hook
**File**: `client/src/hooks/useFirebaseAuth.ts`

Changes:
- After receiving custom token from `/api/auth/session`
- Calls `signInWithCustomToken()` to get ID token
- Sends ID token back to server via `/api/auth/update-token`
- Ensures cookie is updated with proper ID token

#### 2. Updated `useTokenRefresh` Hook
**File**: `client/src/hooks/useTokenRefresh.ts`

Changes:
- Added Firebase imports for token exchange
- After successful refresh, extracts custom token from response
- Exchanges custom token for ID token via `signInWithCustomToken()`
- Updates server cookie with ID token via `/api/auth/update-token`

#### 3. Updated `queryClient.ts` API Request Handler
**File**: `client/src/lib/queryClient.ts`

Changes:
- On 401 error, calls `/api/auth/refresh`
- Extracts custom token from refresh response
- Exchanges for ID token and updates cookie
- Retries original request with new ID token

## Token Lifetimes

| Item | Duration | Purpose |
|------|----------|---------|
| **Cookie Expiry** | 30 days | Instagram-style persistent session |
| **ID Token Expiry** | 60 minutes | Firebase default token lifetime |
| **Refresh Interval** | 55 minutes | Proactive refresh before expiry |

## Benefits of This Fix

✅ **Proper Token Type**: Server now verifies ID tokens (correct type)
✅ **Security**: Uses Firebase's intended authentication pattern
✅ **Reliability**: Eliminates "Invalid token" errors during refresh
✅ **Seamless UX**: Users stay logged in for 30 days with automatic refresh
✅ **Standards Compliance**: Follows Firebase best practices

## Testing the Fix

### 1. Test Initial Login
```bash
# Login via Google OAuth
# Check browser DevTools → Application → Cookies → auth_token
# Should contain an ID token (longer than custom token)
```

### 2. Test Token Refresh
```bash
# Wait 55 minutes or trigger manually in DevTools console:
window.dispatchEvent(new Event('visibilitychange'))

# Check console logs for:
# "[TokenRefresh] Token exchange complete, cookie updated"
```

### 3. Test API Requests After Refresh
```bash
# Make any API request after token refresh
# Should succeed without 401 errors
```

## Rollback Plan

If issues occur, revert these files:
1. `server/routes/auth.ts` (remove `/api/auth/update-token`, revert `/api/auth/refresh`)
2. `client/src/hooks/useFirebaseAuth.ts`
3. `client/src/hooks/useTokenRefresh.ts`
4. `client/src/lib/queryClient.ts`

## Future Improvements

- [ ] Add metrics tracking for token exchanges
- [ ] Add retry logic for failed token exchanges
- [ ] Consider caching ID tokens on client side to reduce exchanges
- [ ] Add unit tests for token exchange flow

---

**Fixed**: June 13, 2026
**Severity**: High (Authentication system broken)
**Impact**: All users experiencing token refresh failures
