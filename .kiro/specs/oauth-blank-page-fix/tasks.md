# Implementation Plan

## Overview

This plan implements the fix for the OAuth blank page issue caused by an architecture mismatch between Firebase's redirect-based authentication and the current proxy chain. The fix involves removing the proxy middleware, updating Firebase's authDomain configuration, and removing the Vercel rewrite - allowing OAuth to work directly with Firebase's hosted domain.

---

## Tasks

- [x] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - OAuth Redirect Flow Blank Page
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the bug exists
  - **Scoped PBT Approach**: For this deterministic bug, scope the property to the concrete failing case: production OAuth sign-in with current proxy configuration
  - Test implementation details from Bug Condition in design:
    - Navigate to `https://veefore.com/signin` in production environment
    - Click "Continue with Google" button to trigger `signInWithRedirect`
    - Assert that the OAuth flow redirects to Google's consent screen (NOT a blank page)
    - Assert that no iframe blocking errors appear in browser console
    - Assert that the redirect URL uses Firebase's authDomain (`veefore-b84c8.firebaseapp.com/__/auth/handler`)
    - After Google approval, assert that user is redirected back to `/signin` with OAuth credential
    - Assert that `getRedirectResult()` successfully retrieves the credential
  - The test assertions should match the Expected Behavior Properties from design:
    - Property 1: OAuth Redirect Flow Completion (no blank page, no iframe errors, successful redirect chain)
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS (this is correct - it proves the bug exists)
  - Document counterexamples found to understand root cause:
    - Blank page displayed instead of Google sign-in screen
    - Console error: "Content blocker prevented iframe from loading"
    - Request goes to `veefore.com/__/auth/handler` instead of `veefore-b84c8.firebaseapp.com/__/auth/handler`
    - `getRedirectResult()` returns null because flow never completed
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Non-OAuth Authentication Flows
  - **IMPORTANT**: Follow observation-first methodology
  - Observe behavior on UNFIXED code for non-buggy inputs:
    - Test email/password sign-in flow (`signInWithEmailAndPassword`)
    - Observe that authentication succeeds and early access validation executes
    - Test early access rejection scenario (non-waitlisted email)
    - Observe that Firebase user is deleted and error message is displayed
    - Test backend API requests (e.g., AI generation)
    - Observe that Railway backend processes requests normally
    - Test localStorage persistence
    - Observe that `veefore_early_access_email` and `veefore_early_access_status` are set correctly
  - Write property-based tests capturing observed behavior patterns from Preservation Requirements:
    - For all email/password authentication attempts, authentication succeeds with same logic
    - For all early access validation requests, backend processes with same validation rules
    - For all non-OAuth API requests, backend processes without any OAuth-related changes
    - For all localStorage operations, data persists with same keys and values
  - Property-based testing generates many test cases for stronger guarantees
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

- [x] 3. Fix OAuth blank page issue

  - [x] 3.1 Update Firebase authDomain configuration
    - Open `client/src/lib/firebase.ts`
    - Locate `getAuthDomain()` function
    - Change production authDomain from `veefore.com` to `veefore-b84c8.firebaseapp.com`
    - Simplify logic: remove production domain override, return Firebase project domain
    - Keep localhost handling for local development
    - Keep SSR/build-time handling to prevent undefined window errors
    - Update comments: document that redirect-based OAuth requires Firebase's authDomain
    - Explain that popup-based OAuth (`signInWithPopup`) could work with custom domains via proxy, but redirect-based OAuth cannot
    - _Bug_Condition: isBugCondition(input) where input.method = "signInWithRedirect" AND input.environment = "production" AND input.authDomain = "veefore.com" AND proxyChainActive(input.path)_
    - _Expected_Behavior: Full-page redirect to Google → callback to Firebase authDomain → return to app with credential (Requirements 2.1, 2.2, 2.3, 2.4, 2.5)_
    - _Preservation: Email/password authentication, early access validation, and all non-OAuth functionality remain unchanged (Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6)_
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

  - [x] 3.2 Remove Vercel OAuth proxy rewrite
    - Open `vercel.json`
    - Locate `rewrites` array
    - Remove the rewrite rule that forwards `/__/auth/:path*` to Railway API (lines 8-11)
    - Keep the catch-all rewrite `/(.*) → /index.html` for SPA routing
    - Document in commit message: "Remove OAuth proxy rewrite - OAuth now goes directly to Firebase"
    - _Bug_Condition: Vercel rewrite intercepts `/__/auth/*` requests and forwards to Railway proxy_
    - _Expected_Behavior: OAuth requests go directly to Firebase's authDomain without Vercel interception_
    - _Preservation: SPA routing continues to work via catch-all rewrite_
    - _Requirements: 2.1, 2.2, 3.6_

  - [x] 3.3 Remove Railway proxy middleware
    - Open `server/index.ts`
    - Locate Firebase Auth Proxy middleware (lines 660-678): `app.use('/__/auth', ...)`
    - Delete or comment out the entire middleware block
    - Document why it's being removed: "Proxy middleware designed for popup-based OAuth (iframe mode) is incompatible with redirect-based OAuth flows - causes CSP violations and blank pages"
    - Preserve `app.get('/__/firebase/init.json', ...)` handler (line 680+)
    - This handler prevents Firebase SDK from auto-discovering configuration and is unrelated to OAuth
    - _Bug_Condition: Railway proxy middleware treats OAuth as iframe-based flow, causing CSP violations_
    - _Expected_Behavior: OAuth bypasses proxy middleware and communicates directly with Firebase_
    - _Preservation: Non-OAuth API requests to Railway backend continue to process normally_
    - _Requirements: 2.2, 2.3, 3.6_

  - [x] 3.4 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - OAuth Redirect Flow Completion
    - **IMPORTANT**: Re-run the SAME test from task 1 - do NOT write a new test
    - The test from task 1 encodes the expected behavior
    - When this test passes, it confirms the expected behavior is satisfied
    - Run bug condition exploration test from step 1:
      - Navigate to `https://veefore.com/signin` in production
      - Click "Continue with Google"
      - Verify redirect to Google's consent screen (no blank page)
      - Verify no iframe blocking errors in console
      - Verify redirect URL uses `veefore-b84c8.firebaseapp.com/__/auth/handler`
      - After Google approval, verify redirect back to `/signin` with credential
      - Verify `getRedirectResult()` retrieves the credential successfully
    - **EXPECTED OUTCOME**: Test PASSES (confirms bug is fixed)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [x] 3.5 Verify preservation tests still pass
    - **Property 2: Preservation** - Non-OAuth Authentication Flows
    - **IMPORTANT**: Re-run the SAME tests from task 2 - do NOT write new tests
    - Run preservation property tests from step 2:
      - Test email/password sign-in flow - verify authentication succeeds
      - Test early access rejection scenario - verify user deletion and error display
      - Test backend API requests - verify normal processing
      - Test localStorage persistence - verify correct data storage
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)
    - Confirm all tests still pass after fix (no regressions to email/password auth, early access validation, or backend processing)
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

- [x] 4. Checkpoint - Ensure all tests pass
  - Verify bug condition test passes (OAuth completes without blank page)
  - Verify preservation tests pass (email/password auth, early access validation, backend API requests all work correctly)
  - If any failures occur, investigate root cause and address before proceeding
  - Ask the user if questions arise or if additional testing is needed

---

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1", "2"] },
    { "id": 1, "tasks": ["3.1", "3.2", "3.3"] },
    { "id": 2, "tasks": ["3.4", "3.5"] },
    { "id": 3, "tasks": ["4"] }
  ]
}
```

**Dependency Explanation**:
- **Wave 0**: Tasks 1 and 2 are independent and can run in parallel (both are pre-implementation tests)
- **Wave 1**: Subtasks 3.1, 3.2, and 3.3 can be executed in parallel after Wave 0 completes (independent configuration changes)
- **Wave 2**: Tasks 3.4 and 3.5 (verification tasks) can run in parallel after Wave 1 completes
- **Wave 3**: Task 4 (Checkpoint) runs after all verification is complete

---

## Notes

### Testing Strategy

**Manual Testing Recommended**: This fix requires manual browser testing because:
- OAuth flows involve full-page redirects and third-party authentication (Google)
- Browser console errors and CSP violations must be observed in real browser environments
- Cross-browser testing (Chrome, Firefox, Safari) is needed to verify consistent behavior
- Early access validation involves backend integration and user flow testing

**Test Environments**:
- **Production**: `https://veefore.com` (primary test environment for bug verification)
- **Local Development**: `http://localhost:5000` (should continue working as before)
- **Staging** (if available): Mirror production configuration to test fix before deploying

**Test Data Requirements**:
- Waitlisted Google account email for successful OAuth test
- Non-waitlisted Google account email for early access rejection test
- Email/password test account for preservation testing

### Deployment Strategy

1. **Deploy in Order**:
   - Deploy backend changes first (remove Railway proxy middleware)
   - Deploy Vercel configuration next (remove OAuth rewrite)
   - Deploy frontend last (update Firebase authDomain)

2. **Rollback Plan**:
   - If OAuth fails after deployment, revert all three changes
   - Monitor production logs for any unexpected errors
   - Keep previous configuration in version control for quick rollback

3. **Monitoring**:
   - Watch for console errors in browser (use browser error tracking if available)
   - Monitor backend logs for `/api/auth/link-firebase` calls
   - Track successful OAuth completions vs failures

### Related Files

- `client/src/lib/firebase.ts` - Firebase configuration and authDomain logic
- `vercel.json` - Vercel routing configuration (OAuth rewrite removal)
- `server/index.ts` - Railway proxy middleware (OAuth proxy removal)
- `client/src/pages/SignIn.tsx` - OAuth sign-in UI and `getRedirectResult()` handling
- `server/routes/auth.ts` - Early access validation via `/api/auth/link-firebase`
