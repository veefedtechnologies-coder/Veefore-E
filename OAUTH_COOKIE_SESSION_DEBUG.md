# OAuth Cookie & Session Debugging Guide

## Current Status

✅ **Backend OAuth Flow**: Working! Firebase custom token is created successfully.
✅ **Cookie Set**: The `auth_token` cookie is being set by the backend.
✅ **Redirect**: User is redirected to `/?oauth_success=true`
❌ **Frontend Login**: User stays on landing page instead of AuthenticatedApp

## The Issue

The frontend's `useFirebaseAuth` hook calls `/api/auth/session` to exchange the `auth_token` cookie for a Firebase custom token. However, the cookie might not be accessible due to domain mismatch.

## Cookie Configuration

**Railway Backend Sets Cookie With:**
- `domain`: `.veefore.com` (works for both `veefore.com` and `www.veefore.com`)
- `secure`: `true` (HTTPS only)
- `sameSite`: `lax` (allows cross-site on navigation)
- `httpOnly`: `true` (prevents JavaScript access)
- `path`: `/`
- `maxAge`: 3600000 (1 hour)

## Possible Issues

### 1. WWW vs Non-WWW Domain

**Problem**: User accesses `https://www.veefore.com` but `FRONTEND_URL=https://veefore.com`

**Solution**: Ensure Railway `ALLOWED_ORIGINS` includes both:
```
ALLOWED_ORIGINS=https://veefore.com,https://www.veefore.com
```

Also, consider redirecting `www.veefore.com` → `veefore.com` in Vercel config.

### 2. Cookie Domain Not Set Correctly on Railway

**Check Railway Environment Variables:**
```
COOKIE_DOMAIN=.veefore.com
```

The leading dot (`.`) is important - it allows the cookie to work on all subdomains.

### 3. Vercel Rewrites Not Forwarding Cookies

**Check `/vercel.json` rewrites:**
```json
{
  "rewrites": [
    {
      "source": "/api/:path*",
      "destination": "https://api.veefore.com/api/:path*"
    }
  ]
}
```

Vercel rewrites should forward cookies, but verify this is configured.

## Testing Steps

### 1. Check Railway Logs After OAuth

After you complete OAuth and land on `/?oauth_success=true`, check Railway logs for:

```
[OAuth] Set auth_token cookie: {
  correlationId: '...',
  cookieDomain: '.veefore.com',
  cookieSecure: true,
  cookieSameSite: 'lax',
  tokenLength: 187
}
```

This confirms the cookie was set with correct settings.

### 2. Check Browser DevTools

1. Complete OAuth flow
2. Land on `/?oauth_success=true`
3. Open DevTools → Application → Cookies
4. Look for `auth_token` cookie under `https://veefore.com` or `https://www.veefore.com`

**If cookie exists**:
- ✅ Cookie is set correctly
- Issue is with frontend calling `/api/auth/session`

**If cookie doesn't exist**:
- ❌ Cookie domain mismatch
- Need to fix `COOKIE_DOMAIN` on Railway

### 3. Check Network Tab

1. Stay on `/?oauth_success=true` page
2. Open DevTools → Network tab
3. Look for request to `/api/auth/session`

**If request exists**:
- Check response status
- If 401: Cookie not being sent
- If 200: Frontend should log in

**If request doesn't exist**:
- Frontend's `useFirebaseAuth` not running
- Check console for errors

### 4. Check Browser Console

Look for these log messages:

```
useFirebaseAuth: Setting up Firebase auth listener
useFirebaseAuth: No Firebase user, attempting session restore from server cookie...
useFirebaseAuth: Got custom token from server, signing in with Firebase...
```

**If you see**:
```
useFirebaseAuth: Session restore failed: [error]
```

This tells you exactly what went wrong.

## Quick Fixes

### Fix 1: Update Railway ALLOWED_ORIGINS

```bash
ALLOWED_ORIGINS=https://veefore.com,https://www.veefore.com
```

### Fix 2: Redirect WWW to Non-WWW in Vercel

Add to `vercel.json`:
```json
{
  "redirects": [
    {
      "source": "/:path*",
      "has": [
        {
          "type": "host",
          "value": "www.veefore.com"
        }
      ],
      "destination": "https://veefore.com/:path*",
      "permanent": true
    }
  ]
}
```

### Fix 3: Test Cookie Manually

Use browser console:
```javascript
// Check if cookie exists
document.cookie.split(';').find(c => c.trim().startsWith('auth_token='))

// Manually call session endpoint
fetch('/api/auth/session', { credentials: 'include' })
  .then(r => r.json())
  .then(console.log)
```

## Expected Flow

1. **User clicks "Continue with Google"** → Frontend redirects to `https://api.veefore.com/api/auth/google/start`
2. **Backend redirects to Google** → User authenticates
3. **Google redirects to callback** → `https://api.veefore.com/api/auth/google/callback`
4. **Backend creates Firebase token** → Stores in `auth_token` cookie
5. **Backend redirects to frontend** → `https://veefore.com/?oauth_success=true` (with cookie)
6. **Frontend loads** → `useFirebaseAuth` hook runs
7. **Hook checks Firebase auth** → No user found
8. **Hook calls `/api/auth/session`** → Sends `auth_token` cookie
9. **Backend returns custom token** → Frontend calls `signInWithCustomToken()`
10. **Firebase auth completes** → User logged in, AuthenticatedApp loads

## Current Step: Step 8

The flow is failing at Step 8 - either:
- Cookie not being sent to `/api/auth/session`, OR
- `/api/auth/session` not being called at all

## Debugging Commands

### Check Railway Logs for Cookie Setting

```bash
# Search for cookie debug log
railway logs | grep "Set auth_token cookie"
```

### Check if Session Endpoint is Being Called

```bash
# Search for session endpoint logs
railway logs | grep "/api/auth/session"
```

## Next Steps

1. **Deploy the latest changes** (already pushed to GitHub)
2. **Try OAuth flow again**
3. **Check Railway logs** for the new cookie debug information
4. **Check browser DevTools** for cookie and network requests
5. **Share screenshots** of:
   - Railway logs showing cookie settings
   - Browser DevTools → Application → Cookies
   - Browser DevTools → Network tab showing `/api/auth/session` request (if any)
   - Browser Console showing `useFirebaseAuth` logs

This will help identify exactly where the flow is breaking.
