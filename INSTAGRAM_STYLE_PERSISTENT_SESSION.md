# Instagram-Style Persistent Session Implementation

## Overview

This document describes the implementation of Instagram-style persistent sessions for Veefore, providing users with a seamless authentication experience where they login once and stay logged in for 30 days without visible logout/login cycles or loading states.

## User Experience Goals

### What Users Experience
- **Login once, stay logged in**: Users authenticate once and remain logged in for 30 days
- **Seamless session restoration**: When reopening the browser, authentication happens instantly without loading spinners
- **Background token refresh**: Tokens refresh automatically in the background without user awareness
- **No logout/login cycles**: No visible authentication interruptions during normal usage

### Instagram-Like Behavior
Just like Instagram, users should:
1. Login once on a device
2. Close and reopen the app/browser → Already logged in (no loading)
3. Use the app over days/weeks → Stay logged in seamlessly
4. Only need to re-login after 30 days of inactivity OR manual logout

## Technical Implementation

### 1. Cookie Configuration (30-Day Persistence)

**Location**: `server/routes/auth.ts`

#### OAuth Callback Cookie (Line ~362)
```typescript
res.cookie('auth_token', firebaseResult.customToken, {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/',
  maxAge: 30 * 24 * 60 * 60 * 1000,  // 30 days
  domain: process.env.NODE_ENV === 'production' 
    ? process.env.COOKIE_DOMAIN 
    : undefined,
});
```

#### Token Refresh Cookie (Line ~634)
```typescript
res.cookie('auth_token', customToken, {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/',
  maxAge: 30 * 24 * 60 * 60 * 1000,  // 30 days
  domain: process.env.NODE_ENV === 'production' 
    ? process.env.COOKIE_DOMAIN 
    : undefined,
});
```

**Why 30 days?**
- Industry standard for persistent sessions (Instagram, Facebook, Twitter)
- Balance between convenience and security
- Users approve this duration explicitly

### 2. Seamless Session Restoration (Delayed Loading State)

**Location**: `client/src/hooks/useFirebaseAuth.ts`

#### Implementation Strategy
```typescript
// Start with loading=false for instant feel
const [loading, setLoading] = useState(false)

// Delay showing loading state for 500ms
loadingTimerRef.current = setTimeout(() => {
  if (!isInitialized) {
    setLoading(true)
  }
}, 500)
```

**Why Delayed Loading?**
- Firebase persistence (IndexedDB) usually restores sessions in <200ms
- Showing loading spinner immediately creates perceived delay
- 500ms delay means most users never see loading state
- If session restore takes >500ms, then show loading (slower networks)

**User Impact**:
- **Fast devices/networks**: No loading spinner, instant authentication ✅
- **Slow devices/networks**: Loading spinner appears after 500ms to indicate progress
- Mimics Instagram's instant session restoration behavior

### 3. Proactive Silent Token Refresh

**Location**: `client/src/hooks/useTokenRefresh.ts`

#### Firebase Token Expiration
- Firebase custom tokens expire after **60 minutes**
- Without refresh, users would be logged out after 1 hour

#### Proactive Refresh Schedule
```typescript
// Schedule refresh 55 minutes from now (5 minutes before 60-minute expiry)
const refreshInterval = 55 * 60 * 1000; // 55 minutes
```

**Why 55 minutes?**
- Refreshes **5 minutes before** token expires
- Prevents "just-in-time" failures if network is slow
- Ensures users never experience expiration

#### Silent Refresh (No Loading States)
```typescript
// Refresh happens in background - NO loading spinner shown
const response = await fetch('/api/auth/refresh', {
  method: 'POST',
  credentials: 'include',
});

if (response.ok) {
  console.log('[TokenRefresh] Background refresh successful (silent)');
  // No user-visible indication - completely silent
}
```

**User Impact**:
- User continues browsing without interruption
- No loading spinners during refresh
- No indication that refresh happened (unless checking console)
- Seamless like Instagram

### 4. Exponential Backoff Retry Logic

**Location**: `client/src/hooks/useTokenRefresh.ts`

#### Retry Strategy
```typescript
const maxRetries = 3;

// Exponential backoff: 1min, 2min, 4min
const retryDelay = Math.min(60000 * Math.pow(2, retryCountRef.current - 1), 4 * 60000);
```

#### Retry Scenarios

| Scenario | Behavior |
|----------|----------|
| **Success** | Reset retry count, schedule next refresh in 55 minutes |
| **Network error** | Retry 1: Wait 1 minute → Retry 2: Wait 2 minutes → Retry 3: Wait 4 minutes → Give up |
| **401 Unauthorized** | Stop retrying, user needs to re-authenticate (cookie expired) |
| **429 Rate Limited** | Wait 5 minutes before retry (respect server rate limits) |
| **Other errors** | Use exponential backoff (1min, 2min, 4min) |

**Why Exponential Backoff?**
- Prevents hammering server with failed requests
- Gives network/server time to recover
- Industry standard for retry logic
- Respects rate limiting

### 5. Firebase Persistence Configuration

**Location**: `client/src/lib/firebase.ts`

#### Browser Local Persistence
```typescript
import { setPersistence, browserLocalPersistence } from 'firebase/auth';

// Keep users signed in across browser restarts
setPersistence(auth, browserLocalPersistence).catch((err) => {
  console.error('Firebase persistence error:', err)
});
```

**What This Does**:
- Stores Firebase authentication state in **IndexedDB** (browser local storage)
- Survives browser close/reopen
- Survives tab close/reopen
- Survives computer restart (as long as browser preserves IndexedDB)

**Why IndexedDB?**
- More storage space than cookies (important for Firebase tokens)
- Survives longer than session storage
- Standard for modern web apps (Instagram, Facebook use similar)

## Complete Authentication Flow

### Initial Login (OAuth)
1. User clicks "Continue with Google"
2. Backend OAuth flow completes successfully
3. Server sets `auth_token` cookie (30-day expiration)
4. Frontend receives `?oauth_success=true` redirect
5. `useFirebaseAuth` calls `/api/auth/session` to get custom token
6. Firebase signs in with custom token
7. Firebase stores session in IndexedDB
8. User sees dashboard **without loading spinner** (if <500ms)

### Browser Reopen (Session Restoration)
1. User reopens browser after 1 week
2. `useFirebaseAuth` initializes
3. Firebase checks IndexedDB → Finds stored session
4. `onAuthStateChanged` fires immediately with user
5. User sees dashboard **instantly** (no loading spinner)
6. No API calls needed - Firebase handles it locally ✅

### Token Refresh (Background, Silent)
1. User has been logged in for 55 minutes
2. `useTokenRefresh` timer fires
3. Calls `/api/auth/refresh` in background
4. Backend creates new Firebase custom token
5. Updates `auth_token` cookie (resets 30-day timer)
6. Returns success
7. Next scheduled refresh: 55 minutes from now
8. **User sees nothing** - completely silent ✅

### Session Expiration (After 30 Days)
1. User hasn't visited app in 30 days
2. `auth_token` cookie expired
3. User reopens app
4. `useFirebaseAuth` tries to restore session
5. `/api/auth/session` returns 401 (no cookie)
6. User redirected to login page
7. **Expected behavior** - user re-authenticates

## Testing Scenarios

### ✅ Test 1: Instant Reopening
1. Login to Veefore
2. Close browser tab
3. Reopen browser → Go to veefore.com
4. **Expected**: Dashboard loads instantly without loading spinner

### ✅ Test 2: Next Day Access
1. Login to Veefore on Monday
2. Close browser
3. Open browser on Tuesday → Go to veefore.com
4. **Expected**: Still logged in, no re-authentication needed

### ✅ Test 3: Background Token Refresh
1. Login to Veefore
2. Keep tab open for 60+ minutes
3. Browse around the app
4. **Expected**: No logout, no loading states, seamless experience

### ✅ Test 4: Network Interruption During Refresh
1. Login to Veefore
2. Wait ~55 minutes for token refresh
3. Disconnect internet before refresh happens
4. **Expected**: Automatic retry when network returns (exponential backoff)

### ✅ Test 5: 30-Day Session Expiration
1. Login to Veefore
2. Don't visit app for 31 days
3. Try to access veefore.com
4. **Expected**: Redirected to login page (cookie expired)

## Security Considerations

### Why 30 Days is Secure
1. **HTTP-only cookies**: JavaScript cannot access tokens (XSS protection)
2. **Secure flag**: Cookies only sent over HTTPS in production
3. **SameSite=lax**: Prevents CSRF attacks
4. **Domain scoping**: Cookie only sent to veefore.com domains
5. **Session invalidation**: Logout endpoint clears cookies immediately
6. **Refresh token encryption**: Backend refresh tokens encrypted with AES-256-GCM
7. **Rate limiting**: Prevents brute force refresh attempts

### Manual Logout Still Works
- User can logout anytime via logout button
- Clears `auth_token` cookie immediately
- Clears Firebase session
- Forces re-authentication

### Session Invalidation
- Backend can invalidate sessions via `sessionVersion` increment
- User model includes `sessionVersion` field
- Token refresh checks session version
- Mismatched version → Force re-authentication

## Comparison with Previous Implementation

| Feature | Before (7-Day) | After (30-Day Instagram-Style) |
|---------|---------------|--------------------------------|
| **Session Duration** | 7 days | 30 days |
| **Session Restoration** | Loading spinner always shown | Loading delayed 500ms (usually instant) |
| **Token Refresh** | Silent but simple retry | Exponential backoff retry with rate limit awareness |
| **User Experience** | Visible loading during restore | Seamless, no visible loading |
| **Retry Logic** | Single 1-minute retry | Smart exponential backoff (1min, 2min, 4min) |
| **Rate Limiting** | Not handled | 5-minute backoff on 429 errors |
| **Browser Reopen** | Shows loading spinner | Instant (Firebase IndexedDB) |

## Monitoring and Debugging

### Console Logs (Development)
```javascript
// Session restoration
'[useFirebaseAuth] Setting up Firebase auth listener'
'[useFirebaseAuth] Auth state changed: User logged in: user@example.com'

// Background token refresh
'[TokenRefresh] Performing background token refresh (silent)...'
'[TokenRefresh] Background refresh successful (silent)'

// Retry logic
'[TokenRefresh] Retry 1/3 in 1 minutes...'
'[TokenRefresh] Retry 2/3 in 2 minutes...'
```

### Production Monitoring
- Monitor `/api/auth/refresh` endpoint success rate
- Alert if refresh failure rate >5%
- Track session duration metrics
- Monitor retry exhaustion (users hitting max retries)

## Environment Variables

No new environment variables needed. Existing OAuth configuration supports 30-day sessions:

```bash
# Cookie domain for production
COOKIE_DOMAIN=.veefore.com

# Frontend URL for redirects
FRONTEND_URL=https://veefore.com

# Firebase configuration
FIREBASE_PROJECT_ID=veefore-8433
FIREBASE_SERVICE_ACCOUNT_KEY=<json-key>

# Google OAuth credentials
GOOGLE_CLIENT_ID=<client-id>
GOOGLE_CLIENT_SECRET=<client-secret>
OAUTH_CALLBACK_URL=https://api.veefore.com/api/auth/google/callback
```

## Files Modified

1. **`server/routes/auth.ts`** (Lines ~362, ~634)
   - Changed cookie `maxAge` from 7 days to 30 days
   - Both OAuth callback and token refresh endpoints

2. **`client/src/hooks/useFirebaseAuth.ts`**
   - Changed initial loading state from `true` to `false`
   - Added 500ms delayed loading timer
   - Clear loading timer in all code paths

3. **`client/src/hooks/useTokenRefresh.ts`**
   - Added exponential backoff retry logic
   - Added rate limiting awareness (429 handling)
   - Enhanced logging for silent refresh operations
   - Max 3 retries with 1min, 2min, 4min delays

4. **`client/src/lib/firebase.ts`** (No changes - already using browserLocalPersistence)
   - Firebase persistence already configured ✅

## Deployment Checklist

### Pre-Deployment
- [x] Update cookie duration to 30 days
- [x] Implement delayed loading state
- [x] Add exponential backoff retry
- [x] Test session restoration locally
- [x] Test token refresh locally
- [x] Commit changes

### Deployment
- [ ] Deploy backend to Railway
- [ ] Deploy frontend to Vercel
- [ ] Verify environment variables
- [ ] Monitor error rates
- [ ] Test OAuth flow in production

### Post-Deployment Testing
- [ ] Test login → Close browser → Reopen (should be instant)
- [ ] Test 30-day persistence (set system clock forward)
- [ ] Monitor token refresh success rate
- [ ] Check retry logic in production logs
- [ ] Verify no loading spinners during session restoration

## Success Metrics

### User Experience Metrics
- **Session Restoration Time**: <500ms average (no loading spinner)
- **Token Refresh Success Rate**: >99%
- **User Session Duration**: 30 days average
- **Logout/Login Cycles**: 0 (unless manual logout or 30-day expiration)

### Technical Metrics
- **Background Refresh Failures**: <1% of attempts
- **Retry Success Rate**: >95% after first retry
- **Rate Limit Errors**: <0.1% of refresh attempts

## Conclusion

This implementation provides Instagram-style persistent sessions where users:
1. ✅ Login once and stay logged in for 30 days
2. ✅ Experience instant session restoration (no loading)
3. ✅ Never see logout/login cycles during normal usage
4. ✅ Have tokens refreshed silently in background
5. ✅ Get seamless authentication experience

The user experience matches modern social media apps (Instagram, Facebook, Twitter) with enterprise-grade security.

---

**Last Updated**: December 2024  
**Status**: Implemented ✅  
**Commit**: `4e180476` - "feat: Implement Instagram-style persistent 30-day sessions with seamless UX"
