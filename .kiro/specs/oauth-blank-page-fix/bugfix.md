# Bugfix Requirements Document

## Introduction

After implementing the Vercel proxy for Firebase OAuth routes, clicking "Continue with Google" now shows a completely blank page instead of the Google sign-in flow. This occurs in production (veefore.com) due to an architecture mismatch: `signInWithRedirect` is a full-page redirect flow that doesn't require any proxying, but the current Vercel → Railway → Firebase proxy chain is treating OAuth as an iframe-based flow, causing the browser to block the iframe due to Content Security Policy violations.

**Root Cause**: The proxy middleware on Railway (lines 660-678 in `server/index.ts`) was designed for popup-based OAuth (iframe mode), but the frontend uses `signInWithRedirect` which expects direct communication with Firebase's `authDomain`. The proxy intercepts the redirect flow and attempts to serve it in an iframe context, which browsers block as a security violation, resulting in a blank page.

**Impact**: Users cannot sign in with Google OAuth in production, blocking access to the application for all Google authentication attempts.

---

## Bug Analysis

### Current Behavior (Defect)

**Section 1: What currently happens when the bug is triggered**

1.1 WHEN a user clicks "Continue with Google" in production THEN the system redirects to a blank page with console errors showing "Content blocker prevented iframe from loading: https://www.veefore.com/__/auth/handler"

1.2 WHEN Firebase OAuth handler attempts to respond to the redirect THEN the system tries to load the response in an iframe context which is blocked by Content Security Policy

1.3 WHEN the browser blocks the iframe THEN the system fails to complete the OAuth flow and leaves the user on a blank page with no error feedback

1.4 WHEN `getRedirectResult()` is called after the failed OAuth attempt THEN the system finds no valid redirect result because the flow never completed

---

### Expected Behavior (Correct)

**Section 2: What should happen instead**

2.1 WHEN a user clicks "Continue with Google" in production THEN the system SHALL perform a full-page redirect directly to Google's OAuth consent screen at `https://accounts.google.com/o/oauth2/v2/auth`

2.2 WHEN the user approves the Google OAuth consent THEN the system SHALL perform a full-page redirect back to Firebase's `authDomain` at `https://veefore-b84c8.firebaseapp.com/__/auth/handler` to process the OAuth callback

2.3 WHEN Firebase completes OAuth processing THEN the system SHALL redirect back to `https://veefore.com/signin` with the authentication credential embedded in the URL fragment

2.4 WHEN `getRedirectResult()` is called on the sign-in page THEN the system SHALL successfully retrieve the OAuth credential and complete the authentication flow without any blank pages or iframe errors

2.5 WHEN the authentication flow completes successfully THEN the system SHALL validate early access status via `/api/auth/link-firebase` and redirect approved users to the dashboard

---

### Unchanged Behavior (Regression Prevention)

**Section 3: Existing behavior that must be preserved**

3.1 WHEN a user signs in with email and password THEN the system SHALL CONTINUE TO authenticate successfully without any changes to the email/password flow

3.2 WHEN early access validation fails during Google OAuth THEN the system SHALL CONTINUE TO delete the Firebase user, display the appropriate error message, and prevent access as designed

3.3 WHEN `getRedirectResult()` processes a successful OAuth response THEN the system SHALL CONTINUE TO call `/api/auth/link-firebase` with the Firebase ID token to link the user account in the backend

3.4 WHEN OAuth authentication completes successfully THEN the system SHALL CONTINUE TO set `veefore_early_access_email` and `veefore_early_access_status` in localStorage to prevent routing guard redirects

3.5 WHEN a user navigates directly to `/signin` without an OAuth redirect THEN the system SHALL CONTINUE TO display the sign-in form normally without triggering any redirect checks

3.6 WHEN the Railway backend receives non-OAuth API requests THEN the system SHALL CONTINUE TO process those requests normally without any impact from OAuth configuration changes

---

## Bug Condition Methodology

### Bug Condition Function

```pascal
FUNCTION isBugCondition(X)
  INPUT: X of type OAuthRequest
  OUTPUT: boolean
  
  // Returns true when the OAuth request goes through the proxy chain
  // causing Firebase to respond in iframe mode instead of full-page redirect
  RETURN (X.method = "signInWithRedirect") 
    AND (X.environment = "production") 
    AND (X.authDomain = "veefore.com")
    AND (proxy_chain_active(X.path))
END FUNCTION

FUNCTION proxy_chain_active(path)
  INPUT: path of type string
  OUTPUT: boolean
  
  // Vercel rewrites /__/auth/* to Railway, Railway proxies to Firebase
  RETURN path.startsWith("/__/auth/")
END FUNCTION
```

### Property Specification (Fix Checking)

```pascal
// Property: OAuth Redirect Flow Completion
FOR ALL X WHERE isBugCondition(X) DO
  result ← signInWithRedirect'(X)
  
  ASSERT no_blank_page(result)
  ASSERT no_iframe_blocking_errors(result)
  ASSERT redirect_to_google_succeeds(result)
  ASSERT redirect_from_google_succeeds(result)
  ASSERT getRedirectResult_retrieves_credential(result)
  ASSERT authentication_flow_completes(result)
END FOR
```

### Preservation Goal (Preservation Checking)

```pascal
// Property: Non-OAuth Flows Unchanged
FOR ALL X WHERE NOT isBugCondition(X) DO
  ASSERT F(X) = F'(X)
END FOR

// Where F is the original function and F' is the fixed function
// Non-buggy inputs include:
// - Email/password authentication (X.method = "signInWithEmailAndPassword")
// - Local development OAuth (X.environment = "development")
// - Non-OAuth API requests (NOT X.path.startsWith("/__/auth/"))
// - Direct Firebase authDomain usage (X.authDomain = "veefore-b84c8.firebaseapp.com")
```

---

## Key Definitions

| Concept | Definition | Example |
|---------|------------|---------|
| **C(X)** | Bug Condition - OAuth redirect flows in production that go through proxy chain | `signInWithRedirect` in prod with `authDomain = "veefore.com"` and Vercel/Railway proxy active |
| **P(result)** | Property - OAuth completes without blank pages or iframe errors | Full-page redirect to Google → callback to Firebase → return to app with credential |
| **¬C(X)** | Non-buggy inputs - should be preserved | Email/password auth, local OAuth, non-OAuth requests |
| **F** | Original (unfixed) function | Current setup: `authDomain: veefore.com` + Vercel proxy + Railway proxy |
| **F'** | Fixed function | Fixed setup: `authDomain: veefore-b84c8.firebaseapp.com` + no proxy interference |
| **Counterexample** | Concrete example demonstrating the bug | Click "Continue with Google" in prod → blank page + console error: "Content blocker prevented iframe" |

---

## Success Criteria

The bugfix is successful when:

1. ✅ Google OAuth redirect flow completes without blank pages
2. ✅ No iframe blocking errors appear in browser console
3. ✅ User is successfully redirected to Google sign-in consent screen
4. ✅ User is successfully redirected back to the app after Google approval
5. ✅ `getRedirectResult()` processes the OAuth response correctly and retrieves the credential
6. ✅ Early access validation executes as expected via `/api/auth/link-firebase`
7. ✅ Email/password authentication continues to work without any changes
8. ✅ Local development OAuth continues to function properly
