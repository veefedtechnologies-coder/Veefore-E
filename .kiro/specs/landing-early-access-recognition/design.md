# Landing Early Access Recognition Bugfix Design

## Overview

Users who have been approved for early access and have their credentials stored in localStorage are not being properly recognized when they visit the landing page. The root cause is that the `useEarlyAccessCheck` hook initializes early access state from localStorage but does not automatically verify this status against the backend API when the Landing component mounts. This results in approved users seeing "Join Waitlist" buttons instead of "Get Started" buttons, blocking their access to the platform.

The fix involves ensuring that the Landing component explicitly calls the `checkStatus` function from the hook on mount when an email is present in localStorage, thereby verifying the user's current early access status against the backend API and updating the UI accordingly.

## Glossary

- **Bug_Condition (C)**: The condition that triggers the bug - when a user with stored early access credentials visits the landing page, but their status is not verified against the backend API
- **Property (P)**: The desired behavior - the landing page should automatically verify early access status on mount and display the appropriate UI ("Get Started" for approved users)
- **Preservation**: Existing behavior for non-early-access users (showing "Join Waitlist") and all waitlist modal functionality must remain unchanged
- **useEarlyAccessCheck**: The React hook in `client/src/hooks/useEarlyAccessCheck.ts` that manages early access state and provides the `checkStatus` function
- **Landing.tsx**: The landing page component in `client/src/pages/Landing.tsx` that displays different CTAs based on early access status
- **hasEarlyAccess**: Boolean state from the hook indicating whether the current user has early access approval
- **checkStatus**: Async function from the hook that verifies user status against `/api/early-access/status` endpoint
- **localStorage keys**: `veefore_early_access_email` (stores user's email) and `veefore_early_access_status` (stores 'approved' or removed)

## Bug Details

### Bug Condition

The bug manifests when a user who has been granted early access (with their email stored in localStorage as `veefore_early_access_email`) visits the landing page. The `useEarlyAccessCheck` hook initializes the `hasEarlyAccess` state from localStorage but does not automatically call the `checkStatus` function to verify this status against the backend API. The Landing component simply reads the `hasEarlyAccess` value without triggering a status check, resulting in the UI displaying "Join Waitlist" instead of "Get Started" for approved users.

**Formal Specification:**
```
FUNCTION isBugCondition(pageLoad)
  INPUT: pageLoad of type ComponentMountEvent
  OUTPUT: boolean
  
  RETURN localStorage.getItem('veefore_early_access_email') !== null
         AND localStorage.getItem('veefore_early_access_status') === 'approved'
         AND Landing component mounts
         AND checkStatus function is NOT called on mount
         AND UI displays "Join Waitlist" instead of "Get Started"
END FUNCTION
```

### Examples

- **Example 1 (Bug Triggered)**: User completes waitlist signup, receives approval email, returns to landing page with email stored in localStorage → sees "Join Waitlist" instead of "Get Started"
- **Example 2 (Bug Triggered)**: User with early access closes browser, reopens landing page with cached credentials → sees "Join Waitlist" button, status not re-verified
- **Example 3 (Bug Triggered)**: User navigates away from landing page and back, localStorage intact → sees "Join Waitlist", no API call made to verify current status
- **Edge Case (Expected Behavior)**: User with email in localStorage but status revoked by admin → status check should run and update UI to reflect loss of access

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Users without early access credentials in localStorage must continue to see "Join Waitlist" button
- Clicking "Join Waitlist" for non-approved users must continue to open the waitlist modal
- The waitlist signup flow and form submission must remain unchanged
- localStorage synchronization across tabs via storage events must continue working
- The `checkStatus` function's existing behavior (API call, localStorage update, event dispatch) must remain unchanged

**Scope:**
All inputs that do NOT involve a user with stored early access credentials visiting the landing page should be completely unaffected by this fix. This includes:
- First-time visitors with no localStorage data
- Users who have submitted waitlist requests but not been approved
- Users whose early access has been revoked
- All waitlist modal interactions and form submissions

## Hypothesized Root Cause

Based on the bug description and code analysis, the root cause is:

**Missing Status Verification on Landing Page Mount**: The `Landing.tsx` component imports and uses the `useEarlyAccessCheck` hook, extracting only the `hasEarlyAccess` boolean value. While the hook has a `useEffect` that runs on mount and can call `checkStatus` if a cached email exists, the hook's initialization logic sets the state optimistically from localStorage without guaranteeing an API verification happens immediately on first render.

**Specific Issues:**

1. **No Explicit checkStatus Call**: The Landing component does not explicitly call `checkStatus` when it mounts, relying entirely on the hook's internal `useEffect` to handle verification.

2. **Hook's useEffect Timing**: The hook's `useEffect` runs after the component renders, but the initial state is set synchronously from localStorage in the `useState` initializer. This creates a race condition where the first render shows stale data before the verification completes.

3. **Background Re-verification**: The hook does call `checkStatus` in the background within its `useEffect`, but this happens asynchronously after the initial render, causing the UI to briefly (or persistently, if the API call fails silently) show incorrect state.

4. **No Loading State Handling**: The Landing component does not check the `isLoading` state from the hook, so even when verification is happening, the UI doesn't reflect this intermediate state.

## Correctness Properties

Property 1: Bug Condition - Automatic Status Verification on Mount

_For any_ page load where `veefore_early_access_email` exists in localStorage and the Landing component mounts, the fixed Landing component SHALL call the `checkStatus` function from the `useEarlyAccessCheck` hook with the stored email, triggering an API verification that updates `hasEarlyAccess` based on the current backend status, and SHALL display "Get Started" button if the user has early access or "Join Waitlist" if they do not.

**Validates: Requirements 2.1, 2.2, 2.3, 2.4**

Property 2: Preservation - Non-Early-Access User Experience

_For any_ page load where `veefore_early_access_email` does NOT exist in localStorage or where the user's status is not 'approved', the fixed Landing component SHALL produce exactly the same behavior as the original component, preserving the "Join Waitlist" button display and waitlist modal functionality for all non-approved users.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct:

**File**: `client/src/pages/Landing.tsx`

**Component**: `Landing` (main component)

**Specific Changes**:

1. **Add useEffect Hook for Status Verification**: Add a `useEffect` hook in the Landing component that runs once on mount (empty dependency array) and checks if there's an email in localStorage. If present, explicitly call `checkStatus(email)` to verify the user's current status against the backend API.

2. **Extract checkStatus from Hook**: Update the hook destructuring to include the `checkStatus` function:
   ```typescript
   const { hasEarlyAccess, checkStatus } = useEarlyAccessCheck()
   ```

3. **Implement Mount-Time Verification**:
   ```typescript
   useEffect(() => {
     const email = localStorage.getItem('veefore_early_access_email')
     if (email) {
       checkStatus(email)
     }
   }, [checkStatus])
   ```

4. **Optional: Add isLoading State**: For better UX, extract `isLoading` from the hook and conditionally render a loading state or disable buttons during verification:
   ```typescript
   const { hasEarlyAccess, isLoading, checkStatus } = useEarlyAccessCheck()
   ```

5. **Optional: Handle Loading UI**: Update button rendering to show loading state during verification (prevents flash of incorrect content):
   ```typescript
   {isLoading ? "Verifying..." : (hasEarlyAccess ? "Get Started" : "Join Waitlist")}
   ```

**Note**: The primary fix is steps 1-3. Steps 4-5 are optional enhancements for improved user experience but not strictly required to resolve the bug.

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bug on unfixed code by verifying that the Landing component does not call `checkStatus` on mount, then verify the fix works correctly by ensuring `checkStatus` is called and the UI updates accordingly, while preserving existing behavior for non-early-access users.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the fix. Confirm that the Landing component mounts without calling `checkStatus` when early access credentials are present in localStorage, resulting in incorrect UI display.

**Test Plan**: Write tests that mock localStorage with early access credentials, render the Landing component, and assert that the `checkStatus` function is NOT called and the UI displays "Join Waitlist" instead of "Get Started". Run these tests on the UNFIXED code to observe failures and confirm the root cause.

**Test Cases**:
1. **No checkStatus Call Test**: Mock localStorage with `veefore_early_access_email` and `veefore_early_access_status: 'approved'`, render Landing component, spy on `checkStatus` function, assert it was NOT called on mount (will confirm bug on unfixed code)
2. **Incorrect Button Display Test**: Mock localStorage with early access credentials, render Landing, assert that button text is "Join Waitlist" instead of "Get Started" (will fail on unfixed code, demonstrating the bug)
3. **API Not Called Test**: Mock the fetch API, set localStorage with early access credentials, render Landing, assert that no API call to `/api/early-access/status` is made during initial mount (will confirm bug on unfixed code)
4. **UI Update Timing Test**: Mock localStorage with credentials, render Landing, check if `hasEarlyAccess` is true immediately vs. after async operations (will show timing issue on unfixed code)

**Expected Counterexamples**:
- `checkStatus` function is never called when Landing component mounts with stored credentials
- Button displays "Join Waitlist" even when `hasEarlyAccess` should be true
- Possible causes: Missing useEffect in Landing component, no explicit call to checkStatus, reliance on hook's internal async logic only

### Fix Checking

**Goal**: Verify that for all page loads where the bug condition holds (early access credentials in localStorage), the fixed Landing component calls `checkStatus` on mount and displays the correct UI based on the verified status.

**Pseudocode:**
```
FOR ALL pageLoad WHERE isBugCondition(pageLoad) DO
  email := localStorage.getItem('veefore_early_access_email')
  render(LandingComponent_fixed)
  ASSERT checkStatus WAS called with email
  WAIT for API response
  ASSERT UI displays "Get Started" if API returns hasEarlyAccess: true
  ASSERT UI displays "Join Waitlist" if API returns hasEarlyAccess: false
END FOR
```

**Test Cases**:
1. **checkStatus Called on Mount**: Mock localStorage with early access credentials, render fixed Landing, assert `checkStatus` is called exactly once with the stored email
2. **Approved User Sees Get Started**: Mock API to return `{ hasEarlyAccess: true, status: 'early_access' }`, mock localStorage with credentials, render Landing, wait for async update, assert button text is "Get Started"
3. **Revoked User Sees Join Waitlist**: Mock API to return `{ hasEarlyAccess: false, status: 'revoked' }`, mock localStorage with credentials, render Landing, assert button text updates to "Join Waitlist"
4. **Multiple Mount/Unmount Cycles**: Render Landing, unmount, render again, assert checkStatus is called on each mount with stored credentials

### Preservation Checking

**Goal**: Verify that for all page loads where the bug condition does NOT hold (no early access credentials or user not approved), the fixed Landing component produces the same result as the original component.

**Pseudocode:**
```
FOR ALL pageLoad WHERE NOT isBugCondition(pageLoad) DO
  ASSERT LandingComponent_original(pageLoad) = LandingComponent_fixed(pageLoad)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many test cases automatically across the input domain (different localStorage states, different user states)
- It catches edge cases that manual unit tests might miss (e.g., malformed localStorage data, missing keys)
- It provides strong guarantees that behavior is unchanged for all non-buggy inputs

**Test Plan**: Observe behavior on UNFIXED code first for users without early access credentials (first-time visitors, waitlist pending users), then write property-based tests capturing that behavior and verify it remains identical in the fixed code.

**Test Cases**:
1. **No Credentials Preservation**: Test with empty localStorage, observe that "Join Waitlist" is displayed on unfixed code, write test to verify this continues with fixed code
2. **Waitlist Modal Preservation**: Test clicking "Join Waitlist" button without credentials, observe modal opens on unfixed code, verify this continues with fixed code
3. **Partial Credentials Preservation**: Test with only `veefore_early_access_email` but no `veefore_early_access_status`, observe behavior on unfixed code, verify identical behavior with fixed code
4. **Invalid Status Preservation**: Test with `veefore_early_access_status: 'pending'` or other non-approved values, observe "Join Waitlist" display on unfixed code, verify this continues with fixed code

### Unit Tests

- Test that Landing component calls `checkStatus` when mounted with stored email in localStorage
- Test that Landing component does NOT call `checkStatus` when mounted without stored email
- Test that button text changes from "Join Waitlist" to "Get Started" when `hasEarlyAccess` becomes true
- Test that button onClick handler navigates to signup page when `hasEarlyAccess` is true
- Test that button onClick handler opens waitlist modal when `hasEarlyAccess` is false
- Test loading state is displayed during status verification (if implemented)

### Property-Based Tests

- Generate random localStorage states (email present/absent, status values) and verify Landing component always calls `checkStatus` when and only when email is present
- Generate random API responses (hasEarlyAccess true/false, various status values) and verify UI always reflects the API response correctly
- Generate random sequences of mount/unmount/remount cycles and verify status is always checked on mount when credentials exist
- Test that all non-approved user scenarios (no email, invalid status, API returns false) always show "Join Waitlist" behavior

### Integration Tests

- Test full flow: user completes waitlist → admin approves → user returns to landing page → sees "Get Started" → clicks → navigates to signup
- Test status revocation flow: user has approval → admin revokes → user returns to landing page → status verified → sees "Join Waitlist"
- Test cross-tab synchronization: user logs in on one tab → landing page on another tab updates to show "Get Started" (existing behavior, should preserve)
- Test network failure handling: status check API fails → Landing should gracefully handle and show appropriate UI (should not break page)
