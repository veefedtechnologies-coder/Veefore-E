# Sign-In and Sign-Up Button Loading State Fix

## Issues Identified

### Issue 1: Both Buttons Showing Loading State
**Problem:** When clicking either the "Sign In" button (email/password) OR the "Continue with Google" button, BOTH buttons would show a loading/buffering state.

**Root Cause:** Both buttons were sharing the same `isEmailLoading` state variable. When one button set it to `true`, both buttons responded to the same state.

**User Impact:** Confusing UX - clicking one button made it appear as if both authentication methods were processing simultaneously.

### Issue 2: Google OAuth Cancellation Gets Stuck
**Problem:** When a user clicks "Continue with Google" and then cancels the Google sign-in (or navigates back), the button remains stuck in "Redirecting to Google..." state indefinitely until page refresh.

**Root Cause:** 
1. When "Continue with Google" is clicked, `setIsEmailLoading(true)` is set
2. The page redirects to Google OAuth (`window.location.href = ...`)
3. If user cancels and returns, the redirect happens but the loading state was never reset
4. The component remounts but the state isn't properly reset on error returns

**User Impact:** Broken UX - users are stuck with a perpetually loading button and can't attempt sign-in again without refreshing the page.

## Solution Implemented

### Separate Loading States
Created two independent loading states:
- `isEmailLoading` - Only for email/password sign-in
- `isGoogleLoading` - Only for Google OAuth sign-in

```tsx
const [isEmailLoading, setIsEmailLoading] = useState(false)
const [isGoogleLoading, setIsGoogleLoading] = useState(false)
```

### Reset Google Loading State on Return
Added logic to reset `isGoogleLoading` when user returns from OAuth:

1. **On OAuth Error:** When `parseOAuthError()` detects an error in URL params, reset Google loading:
```tsx
if (error) {
  setOauthError(error)
  setIsGoogleLoading(false) // ← Reset here
  toast({ ... })
}
```

2. **On OAuth Success:** Set Google loading when starting session exchange:
```tsx
if (checkOAuthSuccess(urlParams)) {
  setShowOAuthSuccess(true)
  setIsGoogleLoading(true) // ← Show loading during token exchange
  // ... session exchange logic
}
```

3. **On Session Exchange Failure:** Reset loading if token exchange fails:
```tsx
catch (error: any) {
  // ... error handling
  setShowOAuthSuccess(false)
  setIsGoogleLoading(false) // ← Reset here
  setOauthError({ ... })
}
```

### Updated All Button References
Changed all Google OAuth button logic to use `isGoogleLoading`:

**Google OAuth Button:**
```tsx
<button
  onClick={() => {
    preserveFormData(formData)
    setIsGoogleLoading(true) // ← Changed from isEmailLoading
    window.location.href = ...
  }}
  disabled={isGoogleLoading || showOAuthSuccess} // ← Changed from isEmailLoading
>
  {isGoogleLoading ? ( // ← Changed from isEmailLoading
    <><Loader2 /> Redirecting to Google...</>
  ) : (
    <>Continue with Google</>
  )}
</button>
```

**OAuth Retry Button:**
```tsx
<button
  onClick={handleOAuthRetry}
  disabled={isGoogleLoading} // ← Changed from isEmailLoading
>
  {isGoogleLoading ? 'Retrying...' : 'Try Again'} // ← Changed from isEmailLoading
</button>
```

**Email Sign-In Button (unchanged):**
```tsx
<button
  type="submit"
  disabled={isEmailLoading} // ← Still uses isEmailLoading
>
  {isEmailLoading ? <><Loader2 /> Signing in...</> : "Sign In"}
</button>
```

## Testing Checklist

### Sign-In Page Tests

✅ **Test 1:** Click "Sign In" button (email/password)
- Only the email button shows loading state
- Google button remains in normal state

✅ **Test 2:** Click "Continue with Google" button
- Only the Google button shows loading state
- Email button remains in normal state

✅ **Test 3:** Click Google button, then cancel/go back on Google consent screen
- When returning to sign-in page, Google button resets to normal state
- Error message displays properly
- User can click Google button again

✅ **Test 4:** Click Google button, complete sign-in successfully
- Google button shows "Redirecting to Google..." during OAuth
- Shows success message during token exchange
- Redirects to dashboard after completion

✅ **Test 5:** Click Google button, session exchange fails
- Loading state resets
- Error message displays
- Retry button is available and functional

### Sign-Up Page Tests

✅ **Test 1:** Click "Send Verification Code" button
- Only the email verification button shows loading state
- Google button remains in normal state

✅ **Test 2:** Click "Continue with Google" button on signup
- Only the Google button shows loading state
- Email verification button remains in normal state

✅ **Test 3:** Click Google button on signup, then cancel/go back on Google consent screen
- When returning to signup page, Google button resets to normal state
- Error message displays properly
- User can click Google button again

✅ **Test 4:** Click Google button on signup, complete signup successfully
- Google button shows "Redirecting to Google..." during OAuth
- Shows success message
- Redirects to dashboard/onboarding after completion

✅ **Test 5:** Click Google button on signup, OAuth fails
- Loading state resets
- Error message displays
- Retry button is available and uses correct loading state

✅ **Test 6:** In verification step, click "Resend code"
- Only the resend button shows loading state
- Does not affect Google button (if visible elsewhere)

## Files Modified

- `/Users/arpitchoudhary/Documents/Veefore_v4/Veefore-E/client/src/pages/SignIn.tsx`
- `/Users/arpitchoudhary/Documents/Veefore_v4/Veefore-E/client/src/pages/SignUpIntegrated.tsx`

## Changes Summary

### SignIn.tsx
- Added separate `isGoogleLoading` state for Google OAuth button
- Kept `isEmailLoading` state for email/password sign-in button
- Updated all Google OAuth button logic to use `isGoogleLoading`
- Added `setIsGoogleLoading(false)` on OAuth error return
- Added `setIsGoogleLoading(true)` during successful OAuth token exchange
- Added `setIsGoogleLoading(false)` on session exchange failure

### SignUpIntegrated.tsx
- Added separate `isGoogleLoading` state for Google OAuth button
- Kept `isResending` state for email verification code button
- Kept `isVerifying` state for OTP verification
- Updated Google OAuth button to use `isGoogleLoading` instead of `isResending`
- Updated OAuth retry button to use `isGoogleLoading` instead of `isLoading`
- Added `setIsGoogleLoading(false)` on OAuth error return
- Added `setIsGoogleLoading(true)` during successful OAuth completion

## Impact

- ✅ Clear visual feedback - only the clicked button shows loading
- ✅ No more stuck loading states after Google OAuth cancellation
- ✅ Better UX - users can retry authentication without page refresh
- ✅ Proper error recovery flow

## Date Fixed
June 12, 2026
