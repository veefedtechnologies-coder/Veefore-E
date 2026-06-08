# OAuth Blank Page Bugfix Design

## Overview

This design addresses the OAuth blank page issue caused by an architecture mismatch between Firebase's redirect-based authentication flow and the current proxy chain (Vercel → Railway → Firebase). The bug occurs because `signInWithRedirect` requires direct communication with Firebase's `authDomain`, but the proxy intercepts this flow and attempts to serve it in an iframe context, which browsers block as a security violation.

The fix involves:
1. Removing the Railway proxy middleware that causes iframe mode
2. Configuring Firebase's `authDomain` to point directly to `veefore-b84c8.firebaseapp.com`
3. Removing Vercel's `/__/auth/*` rewrite that forwards to Railway
4. Ensuring early access validation continues to function correctly

This is a **minimal, surgical fix** that eliminates unnecessary proxy hops and allows Firebase OAuth to work as designed.

## Glossary

- **Bug_Condition (C)**: OAuth redirect flows in production that go through the proxy chain, causing Firebase to respond in iframe mode instead of full-page redirect
- **Property (P)**: OAuth completes without blank pages or iframe errors - full-page redirect to Google → callback to Firebase → return to app with credential
- **Preservation**: Email/password authentication, early access validation, and all non-OAuth functionality must remain unchanged
- **signInWithRedirect**: Firebase auth method that performs a full-page redirect to the OAuth provider (Google) - requires direct access to Firebase's authDomain
- **authDomain**: The domain Firebase uses for OAuth redirects - must be `veefore-b84c8.firebaseapp.com` for redirect-based flows
- **Proxy Chain**: The current Vercel → Railway → Firebase forwarding setup that intercepts OAuth requests
- **getRedirectResult()**: Firebase method called on page load to retrieve OAuth credentials after redirect completes

## Bug Details

### Bug Condition

The bug manifests when a user attempts Google OAuth sign-in in production. The `signInWithRedirect` function requires direct communication with Firebase's `authDomain`, but the current architecture creates a proxy chain that treats OAuth as an iframe-based flow.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type OAuthRequest
  OUTPUT: boolean
  
  RETURN input.method = "signInWithRedirect"
         AND input.environment = "production"
         AND input.authDomain = "veefore.com"
         AND proxyChainActive(input.path)
END FUNCTION

FUNCTION proxyChainActive(path)
  INPUT: path of type string
  OUTPUT: boolean
  
  // Vercel rewrites /__/auth/* to Railway, Railway proxies to Firebase
  RETURN path.startsWith("/__/auth/")
         AND vercelRewriteExists()
         AND railwayProxyMiddlewareExists()
END FUNCTION
```

### Examples

- **Production OAuth Attempt**: User clicks "Continue with Google" at `https://veefore.com/signin` → blank page with console error "Content blocker prevented iframe from loading: https://www.veefore.com/__/auth/handler"
- **Local Development**: User clicks "Continue with Google" at `http://localhost:5000/signin` → OAuth works correctly (no proxy chain interference)
- **Email/Password Sign In**: User signs in with email and password at `https://veefore.com/signin` → authentication succeeds normally (not affected by OAuth proxy issue)
- **Edge Case - Direct Firebase Domain**: If `authDomain` were already set to `veefore-b84c8.firebaseapp.com`, OAuth would work correctly (bypasses proxy chain)

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Email/password authentication must continue to work exactly as before
- Early access validation via `/api/auth/link-firebase` must continue to execute after successful OAuth (including user deletion on validation failure)
- `getRedirectResult()` must continue to call `/api/auth/link-firebase` with Firebase ID token to link user accounts
- localStorage persistence (`veefore_early_access_email`, `veefore_early_access_status`) must continue to function
- Navigation guards and routing logic must remain unchanged
- Non-OAuth API requests to Railway backend must continue to process normally

**Scope:**
All inputs that do NOT involve OAuth redirect flows (`signInWithRedirect`) should be completely unaffected by this fix. This includes:
- Email/password authentication (`signInWithEmailAndPassword`)
- Password reset flows (`sendPasswordResetEmail`, `confirmPasswordReset`)
- Backend API requests (AI generation, content management, analytics, etc.)
- Early access status checking (`/api/early-access/status`)

## Hypothesized Root Cause

Based on the bug description and code analysis, the root causes are:

1. **Incorrect authDomain Configuration**: The `getAuthDomain()` function in `client/src/lib/firebase.ts` returns `veefore.com` for production, but `signInWithRedirect` requires Firebase's hosted domain (`veefore-b84c8.firebaseapp.com`) for redirect-based OAuth flows

2. **Unnecessary Proxy Chain**: The Vercel rewrite in `vercel.json` (lines 8-11) forwards `/__/auth/*` to Railway, and Railway's proxy middleware in `server/index.ts` (lines 660-678) forwards to Firebase. This proxy chain was designed for popup-based OAuth (iframe mode) but is incompatible with redirect-based OAuth

3. **Content Security Policy Violation**: When the proxy chain intercepts the OAuth redirect flow, browsers attempt to load the Firebase response in an iframe context, which violates Content Security Policy (CSP) and results in a blank page

4. **Misalignment with Firebase Architecture**: Firebase's redirect-based OAuth (`signInWithRedirect`) is designed to work **directly** with the Firebase-hosted authentication handler at `https://<project-id>.firebaseapp.com/__/auth/handler`. Proxying this endpoint breaks the intended authentication flow

## Correctness Properties

Property 1: Bug Condition - OAuth Redirect Flow Completion

_For any_ OAuth request where a user clicks "Continue with Google" in production and `signInWithRedirect` is called, the fixed system SHALL complete the full OAuth flow without blank pages or iframe errors, successfully redirecting to Google, processing the callback at Firebase's authDomain, and returning to the app with a valid credential that can be retrieved via `getRedirectResult()`.

**Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5**

Property 2: Preservation - Non-OAuth Authentication Flows

_For any_ authentication request that does NOT use OAuth redirect flows (email/password sign-in, password reset, direct API requests), the fixed system SHALL produce exactly the same behavior as the original system, preserving all existing functionality without any changes to authentication logic, early access validation, or backend processing.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct, the following changes are needed:

**File**: `client/src/lib/firebase.ts`

**Function**: `getAuthDomain()`

**Specific Changes**:
1. **Update authDomain for Production**: Change the production authDomain from `veefore.com` to `veefore-b84c8.firebaseapp.com`
   - This allows `signInWithRedirect` to communicate directly with Firebase's hosted OAuth handler
   - Eliminates the need for proxy middleware since OAuth no longer goes through `veefore.com/__/auth/*`

2. **Simplify getAuthDomain() Logic**: Remove the production domain override and return Firebase's project domain for production
   - Keep localhost handling for local development
   - Keep SSR/build-time handling to prevent undefined window errors

3. **Update Configuration Comments**: Document that redirect-based OAuth requires Firebase's authDomain (not custom domain)
   - Explain that popup-based OAuth (`signInWithPopup`) could work with custom domains via proxy, but redirect-based OAuth cannot

**File**: `vercel.json`

**Section**: `rewrites` array

**Specific Changes**:
4. **Remove OAuth Proxy Rewrite**: Delete the rewrite rule that forwards `/__/auth/:path*` to Railway API
   - This rewrite (lines 8-11) is no longer needed since OAuth will go directly to Firebase
   - Keep the catch-all rewrite `/(.*) → /index.html` for SPA routing

**File**: `server/index.ts`

**Section**: Firebase Auth Proxy middleware (lines 660-678)

**Specific Changes**:
5. **Remove Proxy Middleware**: Delete or comment out the `app.use('/__/auth', ...)` middleware
   - This middleware was designed for popup-based OAuth in Safari (ITP workaround)
   - It's incompatible with redirect-based OAuth flows
   - Document why it's being removed (prevents iframe CSP violations)

6. **Preserve init.json Handler**: Keep the `app.get('/__/firebase/init.json', ...)` handler that returns 404
   - This handler prevents Firebase SDK from auto-discovering configuration
   - It's unrelated to OAuth and should remain

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, confirm the bug exists on unfixed code by observing the blank page and iframe errors; second, verify the fix works correctly and preserves existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the fix. Confirm that the proxy chain causes iframe mode and CSP violations. If we refute this hypothesis, we will need to re-analyze.

**Test Plan**: Attempt Google OAuth sign-in in production with the current proxy configuration. Observe browser console errors, network requests, and page behavior. Run these tests on UNFIXED code to confirm the root cause.

**Test Cases**:
1. **Production OAuth Attempt**: Click "Continue with Google" on `https://veefore.com/signin` (will fail on unfixed code with blank page)
2. **Console Error Observation**: Check browser console for "Content blocker prevented iframe" error (expected on unfixed code)
3. **Network Request Analysis**: Inspect network tab to verify request goes to `veefore.com/__/auth/handler` instead of `veefore-b84c8.firebaseapp.com/__/auth/handler` (expected on unfixed code)
4. **getRedirectResult() Failure**: After failed OAuth, call `getRedirectResult()` and observe null result (expected on unfixed code because flow never completed)

**Expected Counterexamples**:
- Blank page displayed instead of Google sign-in consent screen
- Console error: "Content blocker prevented iframe from loading: https://www.veefore.com/__/auth/handler"
- Network request shows `veefore.com/__/auth/handler` instead of direct Firebase domain
- Possible causes: proxy chain creating iframe context, authDomain misconfiguration, CSP violation

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds (OAuth redirect flows in production), the fixed function produces the expected behavior (successful OAuth completion without blank pages).

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  result := signInWithRedirect_fixed(input)
  ASSERT noBlankPage(result)
  ASSERT noIframeErrors(result)
  ASSERT redirectToGoogleSucceeds(result)
  ASSERT redirectFromFirebaseSucceeds(result)
  ASSERT getRedirectResultRetrievesCredential(result)
  ASSERT authenticationFlowCompletes(result)
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold (non-OAuth authentication flows), the fixed function produces the same result as the original function.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT F_original(input) = F_fixed(input)
END FOR

WHERE:
  F_original = current authentication system
  F_fixed = system after OAuth fix
  NOT isBugCondition(input) includes:
    - Email/password sign-in
    - Password reset flows
    - Backend API requests
    - Early access validation
```

**Testing Approach**: Manual testing is recommended for preservation checking because:
- OAuth changes are isolated to Firebase configuration and proxy removal
- Email/password flows use completely separate authentication methods
- Early access validation logic is backend-only and unaffected by frontend OAuth configuration
- Manual testing can quickly verify key user flows without extensive test infrastructure

**Test Plan**: Test email/password authentication, early access validation, and backend API requests on FIXED code. Compare behavior with production (unfixed) environment to ensure no regressions.

**Test Cases**:
1. **Email/Password Preservation**: Sign in with email and password on fixed code, verify authentication succeeds and early access validation executes
2. **Early Access Rejection Preservation**: Attempt OAuth with non-waitlisted email, verify Firebase user is deleted and error message is displayed (same behavior as before fix)
3. **API Request Preservation**: Make AI generation request after sign-in, verify backend processes request normally
4. **localStorage Preservation**: Verify `veefore_early_access_email` and `veefore_early_access_status` are set correctly after successful authentication

### Unit Tests

- Test `getAuthDomain()` function returns correct domain for production, development, and SSR contexts
- Test email/password sign-in flow with early access validation
- Test OAuth redirect result processing and `/api/auth/link-firebase` call
- Test early access rejection scenario (user deletion and error display)

### Property-Based Tests

Not applicable for this fix - the bug is deterministic and environment-specific (production OAuth only). Property-based testing would not provide additional coverage beyond manual testing and unit tests.

### Integration Tests

- **Full OAuth Flow**: Test complete Google OAuth flow in production (or staging environment that mirrors production configuration)
  - Click "Continue with Google" → Redirected to Google consent screen
  - Approve Google consent → Redirected back to `https://veefore.com/signin`
  - `getRedirectResult()` retrieves credential → `/api/auth/link-firebase` called
  - Early access validation succeeds → User redirected to dashboard
  
- **Early Access Validation**: Test OAuth flow with different early access statuses
  - Approved user: OAuth succeeds, user proceeds to dashboard
  - Non-waitlisted user: OAuth succeeds but backend returns 403, Firebase user deleted, error displayed
  - Pending approval user: OAuth succeeds but backend returns 403, Firebase user deleted, "under review" message displayed

- **Cross-Browser Testing**: Test OAuth flow in Chrome, Firefox, Safari to ensure CSP handling is consistent
  - Verify no blank pages or console errors
  - Verify redirect flow completes successfully
  - Verify early access validation executes correctly
