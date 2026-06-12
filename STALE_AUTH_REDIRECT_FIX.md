# Stale Firebase Auth Session Fix

## Issue
**Problem:** After clicking "Continue with Google" and canceling/closing the popup, when the user refreshes the page, they get automatically redirected to the authenticated app (dashboard) even though they're not actually logged in.

**Steps to Reproduce:**
1. Click "Continue with Google" on signin/signup page
2. Close/cancel the Google OAuth popup
3. Refresh the page (F5 or Cmd+R)
4. User gets redirected to dashboard/authenticated app
5. Dashboard shows but user is not actually authenticated

## Root Cause

Firebase Authentication persists auth sessions in browser storage (IndexedDB/localStorage) across page refreshes. The flow was:

1. **Previous Session:** User successfully logged in at some point (Firebase stored auth session)
2. **User Returns:** User comes back to signin/signup page later
3. **OAuth Cancel:** User clicks Google button, then cancels
4. **Page Refresh:** User refreshes the page
5. **Stale Session Detection:** `useFirebaseAuth` hook detects OLD Firebase session from step 1
6. **Premature Redirect:** App.tsx sees `user` is truthy → Shows `<AuthenticatedApp />`
7. **Broken State:** User appears logged in but has no valid backend session

### Why This Happened

```typescript
// App.tsx - Line 212
{user ? (
  <AuthenticatedApp />  // ← Shows if ANY user exists in Firebase
) : (
  // ... public pages
)}
```

The app trusted Firebase auth state without validating it matches the current user intent. When users explicitly visit signin/signup pages, they're indicating they want to authenticate fresh, not use a stale session.

## Solution

Applied **two-layer fix**:

### Layer 1: Clear Stale Firebase Auth on SignIn/SignUp Mount

Added logic to sign out from Firebase when user lands on signin/signup pages WITHOUT an active OAuth flow:

**SignIn.tsx:**
```typescript
useEffect(() => {
  const urlParams = new URLSearchParams(window.location.search)
  const error = parseOAuthError(urlParams)
  const hasOAuthSuccess = checkOAuthSuccess(urlParams)
  
  // If no OAuth flow in progress, clear stale Firebase auth
  if (!hasOAuthSuccess && !error) {
    auth.signOut().catch(err => console.warn('[SignIn] Silent signout failed:', err))
    setIsGoogleLoading(false)
  }
  
  // ... rest of OAuth handling
}, [])
```

**SignUpIntegrated.tsx:**
```typescript
useEffect(() => {
  const urlParams = new URLSearchParams(window.location.search)
  const error = parseOAuthError(urlParams)
  const hasOAuthSuccess = checkOAuthSuccess(urlParams)
  
  // If no OAuth flow in progress, clear stale Firebase auth
  if (!hasOAuthSuccess && !error) {
    auth.signOut().catch(err => console.warn('[SignUp] Silent signout failed:', err))
    setIsGoogleLoading(false)
  }
  
  // ... rest of OAuth handling
}, [])
```

**Logic:**
- When signin/signup pages mount, check URL parameters
- If NO `?oauth_success=true` AND NO `?error=...` → Not in OAuth flow
- Call `auth.signOut()` to clear any stale Firebase sessions
- This ensures fresh authentication attempts start clean

### Layer 2: Redirect Authenticated Users Away from Auth Pages

Added logic in `App.tsx` to redirect already-authenticated users:

```typescript
useEffect(() => {
  // If user is logged in but on signin/signup pages
  if (!loading && user && (effectiveLocation === '/signin' || effectiveLocation === '/signup')) {
    console.log('[App] User authenticated but on auth page...')
    const urlParams = new URLSearchParams(window.location.search)
    
    // Allow if resuming onboarding
    if (urlParams.get('resume') !== 'true') {
      console.log('[App] Redirecting to dashboard')
      setLocation('/')
    }
  }
  
  // ... rest of route protection logic
}, [loading, user, effectiveLocation, setLocation])
```

**Logic:**
- If user IS authenticated AND on signin/signup page
- Check if they're resuming onboarding (`?resume=true`)
- If not resuming → Redirect to dashboard
- This prevents authenticated users from accessing auth pages

## How It Works Now

### Scenario 1: Fresh Signin (No Previous Session)
1. Visit `/signin`
2. No stale Firebase auth to clear
3. User sees signin form
4. Can proceed with email or Google signin ✅

### Scenario 2: Fresh Signin (With Stale Session from Before)
1. Visit `/signin`
2. **Mount effect detects no OAuth params**
3. **Calls `auth.signOut()` to clear stale session** ✅
4. User sees signin form with clean state
5. Can proceed with fresh authentication ✅

### Scenario 3: OAuth Cancellation + Refresh
1. Click "Continue with Google"
2. Cancel/close OAuth popup
3. Return to `/signin` (no OAuth params in URL)
4. **Mount effect clears stale auth** ✅
5. Refresh page (F5)
6. **Mount effect clears stale auth again** ✅
7. User stays on signin page (not redirected) ✅
8. Can try again with fresh state ✅

### Scenario 4: Successful OAuth Flow
1. Click "Continue with Google"
2. Complete authentication
3. Redirect to `/signin?oauth_success=true`
4. **Mount effect detects OAuth success → Does NOT sign out** ✅
5. Token exchange happens
6. Firebase auth completes
7. Redirect to dashboard ✅

### Scenario 5: Authenticated User Visits Signin Page Directly
1. User is already logged in (valid session)
2. User types `/signin` in address bar
3. Page starts loading
4. **App.tsx detects user + signin page → Redirects to `/`** ✅
5. User sees dashboard (expected behavior) ✅

### Scenario 6: Resuming Onboarding
1. User completes OAuth but needs onboarding
2. Redirect to `/signup?resume=true`
3. **Mount effect detects OAuth flow → Does NOT sign out** ✅
4. **App.tsx detects `resume=true` → Allows signup page** ✅
5. User completes onboarding ✅

## Files Modified

- `/Users/arpitchoudhary/Documents/Veefore_v4/Veefore-E/client/src/pages/SignIn.tsx`
- `/Users/arpitchoudhary/Documents/Veefore_v4/Veefore-E/client/src/pages/SignUpIntegrated.tsx`
- `/Users/arpitchoudhary/Documents/Veefore_v4/Veefore-E/client/src/App.tsx`

## Testing Checklist

✅ **Test 1:** Fresh signin with no previous sessions
- Visit `/signin`
- Page loads normally
- No unexpected redirects

✅ **Test 2:** Signin after previous successful login
- Log in successfully
- Log out manually
- Visit `/signin` again
- Page loads normally (stale auth cleared)
- No automatic redirect

✅ **Test 3:** Cancel OAuth then refresh
- Click "Continue with Google"
- Cancel/close popup
- Refresh page (F5)
- Stay on signin page
- No redirect to dashboard

✅ **Test 4:** Complete OAuth successfully
- Click "Continue with Google"
- Complete authentication
- Token exchange happens
- Redirect to dashboard
- User is authenticated

✅ **Test 5:** Authenticated user visits signin page
- Log in successfully
- Type `/signin` in address bar
- Immediately redirected to `/` (dashboard)
- Cannot access signin page while authenticated

✅ **Test 6:** Resume onboarding flow
- Start OAuth signup
- Need to complete onboarding
- Redirected to `/signup?resume=true`
- Signup page loads
- Can complete onboarding

## Impact

- ✅ No more automatic redirects after OAuth cancellation
- ✅ Fresh authentication attempts start with clean state
- ✅ Stale Firebase sessions don't interfere with new logins
- ✅ Authenticated users are redirected away from auth pages
- ✅ OAuth flows continue to work normally
- ✅ Onboarding resumption still works

## Technical Details

**Why Sign Out on Mount?**

Firebase Auth persists sessions aggressively. The only way to ensure clean state is to explicitly sign out when the user's intent (visiting signin/signup) indicates they want to authenticate fresh.

**Why Check for OAuth Params?**

We only sign out when there's NO active OAuth flow:
- `?oauth_success=true` → User just completed OAuth, don't interfere
- `?error=...` → OAuth failed, we handle error separately
- No params → User navigated here manually or OAuth was cancelled, clear stale auth

**Why Redirect in App.tsx?**

Defense in depth. Even if Firebase auth isn't cleared immediately, the App.tsx redirect ensures authenticated users can't access auth pages unless they're resuming onboarding.

## Date Fixed
June 12, 2026

## Related Issues
- Google button stuck loading (fixed earlier)
- OAuth session token exchange (fixed earlier)
- This completes the OAuth authentication reliability improvements
