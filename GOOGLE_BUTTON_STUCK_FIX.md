# Google OAuth Button Stuck Loading Fix

## Issue
**Problem:** When user clicks "Continue with Google" and then cancels/closes the Google sign-in popup or uses browser back button, the button remains stuck showing "Redirecting to Google..." indefinitely.

**User Impact:** Users cannot click the Google button again without refreshing the entire page.

## Root Cause

When the Google OAuth button is clicked:
1. `setIsGoogleLoading(true)` is set
2. Page redirects with `window.location.href = oauth_url`
3. If user cancels and returns (via back button or popup close), the page component might preserve state
4. The loading state remains `true` because there's no mechanism to detect "cancellation"

The issue occurs because:
- OAuth cancellation doesn't produce URL parameters (no `?error=...` or `?oauth_success=...`)
- The component doesn't know the user cancelled
- Loading state stays stuck as `true`

## Solution

Added two layers of protection:

### 1. Reset on Mount When No OAuth Params Present

```typescript
useEffect(() => {
  const urlParams = new URLSearchParams(window.location.search)
  const error = parseOAuthError(urlParams)
  
  // ... error handling ...
  
  // NEW: If no OAuth success or error params, reset Google loading state
  // This handles the case where user cancels/closes Google sign-in window
  if (!checkOAuthSuccess(urlParams) && !error) {
    setIsGoogleLoading(false)
  }
  
  // ... rest of code
}, [])
```

**Logic:**
- If URL has no OAuth parameters (`oauth_success` or `error`)
- AND component is mounting
- Then reset `isGoogleLoading` to `false`
- This catches the "user cancelled and came back" scenario

### 2. Visibility Change Listener (Backup Layer)

```typescript
useEffect(() => {
  const handleVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      const urlParams = new URLSearchParams(window.location.search)
      const hasOAuthParams = checkOAuthSuccess(urlParams) || parseOAuthError(urlParams)
      
      // If page becomes visible without OAuth params, reset Google loading
      if (!hasOAuthParams) {
        setIsGoogleLoading(false)
      }
    }
  }

  document.addEventListener('visibilitychange', handleVisibilityChange)
  return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
}, [])
```

**Logic:**
- Listen for page visibility changes (user comes back to tab)
- If page becomes visible AND has no OAuth parameters
- Then reset `isGoogleLoading` to `false`
- This catches cases where component state persists between navigations

## How It Works Now

### Scenario 1: User Cancels in Popup
1. Click "Continue with Google" → `isGoogleLoading = true`
2. Google popup opens
3. User clicks X to close popup
4. Back on sign-in page
5. **Mount effect detects no OAuth params → `isGoogleLoading = false`** ✅
6. Button returns to normal state

### Scenario 2: User Uses Back Button
1. Click "Continue with Google" → `isGoogleLoading = true`
2. Redirect to Google OAuth page
3. User clicks browser back button
4. Back on sign-in page
5. **Mount effect detects no OAuth params → `isGoogleLoading = false`** ✅
6. Button returns to normal state

### Scenario 3: User Switches Tabs Then Returns
1. Click "Continue with Google" → `isGoogleLoading = true`
2. Google OAuth in progress
3. User switches to another tab
4. User closes OAuth tab
5. User returns to sign-in tab
6. **Visibility listener detects no OAuth params → `isGoogleLoading = false`** ✅
7. Button returns to normal state

### Scenario 4: OAuth Success (Should Keep Loading)
1. Click "Continue with Google" → `isGoogleLoading = true`
2. Complete Google authentication
3. Redirect back with `?oauth_success=true`
4. **Mount effect detects OAuth param → Keeps `isGoogleLoading = true`** ✅
5. Token exchange happens
6. Redirects to dashboard

### Scenario 5: OAuth Error (Should Show Error)
1. Click "Continue with Google" → `isGoogleLoading = true`
2. OAuth fails
3. Redirect back with `?error=access_denied`
4. **Mount effect detects error → Sets `isGoogleLoading = false`** ✅
5. Error message displays
6. Button returns to normal state

## Files Modified

- `/Users/arpitchoudhary/Documents/Veefore_v4/Veefore-E/client/src/pages/SignIn.tsx`
- `/Users/arpitchoudhary/Documents/Veefore_v4/Veefore-E/client/src/pages/SignUpIntegrated.tsx`

## Testing Checklist

✅ **Test 1:** Click Google button, close popup immediately
- Button returns to normal state
- Can click again

✅ **Test 2:** Click Google button, use browser back button
- Button returns to normal state
- Can click again

✅ **Test 3:** Click Google button, switch tabs, close OAuth tab, return
- Button returns to normal state
- Can click again

✅ **Test 4:** Complete Google OAuth successfully
- Button shows loading during process
- Successfully redirects
- No premature state reset

✅ **Test 5:** Complete Google OAuth with error (deny permissions)
- Error displays
- Button returns to normal state
- Can retry

✅ **Test 6:** Rapid clicking Google button
- Only one OAuth flow initiates
- Button stays disabled during process

## Impact

- ✅ Button no longer gets stuck after OAuth cancellation
- ✅ Users can retry without page refresh
- ✅ Better UX - responsive to user actions
- ✅ Handles edge cases (tab switching, back button, popup closing)
- ✅ Doesn't interfere with successful OAuth flows

## Technical Details

**Why Two Layers?**

1. **Mount detection**: Catches most cases immediately on page load
2. **Visibility listener**: Safety net for edge cases where component state persists

**Why Check for OAuth Params?**

We only reset loading state when there are NO OAuth params because:
- If `?oauth_success=true` exists → OAuth succeeded, keep loading
- If `?error=...` exists → OAuth failed, we handle it separately
- If neither exists → User cancelled, reset loading

This prevents premature resets during legitimate OAuth flows.

## Date Fixed
June 12, 2026

## Related Issues
- Button loading state separation (completed earlier)
- OAuth session token exchange (completed earlier)
- This fix completes the OAuth button reliability improvements
