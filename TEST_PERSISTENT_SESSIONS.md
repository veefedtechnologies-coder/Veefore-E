# Testing Instagram-Style Persistent Sessions

## Code Verification ✅

I've verified all the code changes are correctly implemented:

### 1. ✅ Backend Cookie Duration (30 Days)
**File**: `server/routes/auth.ts`

**OAuth Callback (Line 361)**:
```typescript
maxAge: 30 * 24 * 60 * 60 * 1000,  // 30 days (Instagram-style persistent session)
```
✅ **VERIFIED**: Cookie set to 30 days = 2,592,000,000 milliseconds

**Token Refresh (Line 638)**:
```typescript
maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days (Instagram-style persistent session)
```
✅ **VERIFIED**: Cookie set to 30 days = 2,592,000,000 milliseconds

### 2. ✅ Frontend Delayed Loading State
**File**: `client/src/hooks/useFirebaseAuth.ts`

**Initial State (Line 10)**:
```typescript
const [loading, setLoading] = useState(false)  // Changed from true
```
✅ **VERIFIED**: Starts with loading=false

**Delayed Timer (Line 35-39)**:
```typescript
loadingTimerRef.current = setTimeout(() => {
  if (!isInitialized) {
    setLoading(true)
  }
}, 500)
```
✅ **VERIFIED**: Loading only shown after 500ms delay

**Timer Cleanup (All auth state branches)**:
```typescript
if (loadingTimerRef.current) {
  clearTimeout(loadingTimerRef.current)
  loadingTimerRef.current = null
}
```
✅ **VERIFIED**: Timer cleared in all code paths (success, error, no session)

### 3. ✅ Token Refresh with Exponential Backoff
**File**: `client/src/hooks/useTokenRefresh.ts`

**Retry Logic (Line 45-47)**:
```typescript
const retryCountRef = useRef<number>(0);
const maxRetries = 3;
```
✅ **VERIFIED**: Max 3 retries configured

**Exponential Backoff (Line 88-95)**:
```typescript
retryCountRef.current += 1;

if (retryCountRef.current <= maxRetries) {
  // Exponential backoff: 1min, 2min, 4min
  const retryDelay = Math.min(60000 * Math.pow(2, retryCountRef.current - 1), 4 * 60000);
  console.log(`[TokenRefresh] Retry ${retryCountRef.current}/${maxRetries} in ${retryDelay/60000} minutes...`);
  refreshTimerRef.current = setTimeout(performBackgroundRefresh, retryDelay);
}
```
✅ **VERIFIED**: 
- Retry 1: 60000 * 2^0 = 60000ms = 1 minute
- Retry 2: 60000 * 2^1 = 120000ms = 2 minutes
- Retry 3: 60000 * 2^2 = 240000ms = 4 minutes

**Rate Limiting Handling (Line 81-84)**:
```typescript
} else if (response.status === 429) {
  console.log('[TokenRefresh] Rate limited, scheduling retry in 5 minutes...');
  refreshTimerRef.current = setTimeout(performBackgroundRefresh, 5 * 60000);
}
```
✅ **VERIFIED**: 5-minute wait on 429 errors

### 4. ✅ Proactive Token Refresh Schedule
**File**: `client/src/hooks/useTokenRefresh.ts`

**Refresh Interval (Line 123-124)**:
```typescript
const refreshInterval = 55 * 60 * 1000; // 55 minutes in milliseconds
```
✅ **VERIFIED**: Refreshes 55 minutes after last refresh (5 minutes before 60-minute expiry)

### 5. ✅ Firebase Persistence
**File**: `client/src/lib/firebase.ts`

**Persistence Configuration (Line 59-61)**:
```typescript
setPersistence(auth, browserLocalPersistence).catch((err) => {
  console.error('Firebase persistence error:', err)
});
```
✅ **VERIFIED**: Using browserLocalPersistence (IndexedDB storage)

## Manual Testing Steps

### Test 1: Cookie Duration Verification
1. Start local dev server
2. Login with Google OAuth
3. Open browser DevTools → Application → Cookies
4. Find `auth_token` cookie
5. Check "Expires" field

**Expected**: Expires 30 days from now

### Test 2: Delayed Loading State
1. Login and complete OAuth flow
2. Close browser tab
3. Reopen browser → Navigate to app
4. Watch for loading spinner

**Expected**: 
- Fast connection: No loading spinner (instant)
- Slow connection: Loading appears after 500ms

### Test 3: Token Refresh Scheduling
1. Login with Google OAuth
2. Open browser console
3. Wait 55 minutes
4. Watch for "[TokenRefresh] Performing background token refresh (silent)..."

**Expected**: Refresh happens automatically at 55 minutes

### Test 4: Exponential Backoff Retry
1. Login with Google OAuth
2. Open browser console
3. Go to DevTools → Network tab
4. Right-click on requests → "Block request URL" for `/api/auth/refresh`
5. Wait 55 minutes for refresh attempt
6. Watch console logs

**Expected Console Logs**:
```
[TokenRefresh] Performing background token refresh (silent)...
[TokenRefresh] Background refresh error: [error details]
[TokenRefresh] Network error, retry 1/3 in 1 minutes...
[wait 1 minute]
[TokenRefresh] Network error, retry 2/3 in 2 minutes...
[wait 2 minutes]
[TokenRefresh] Network error, retry 3/3 in 4 minutes...
[wait 4 minutes]
[TokenRefresh] Max retries reached after network errors, giving up
```

### Test 5: Firebase Persistence
1. Login with Google OAuth
2. Open browser DevTools → Application → IndexedDB
3. Find `firebaseLocalStorageDb`
4. Check for Firebase auth state

**Expected**: Firebase stores auth state in IndexedDB

## Automated Verification Script

Run this in browser console after login:

```javascript
// Cookie verification
const cookies = document.cookie.split(';');
const authCookie = cookies.find(c => c.trim().startsWith('auth_token='));
console.log('Auth cookie exists:', !!authCookie);

// Calculate cookie expiry (should be ~30 days)
const cookieStr = document.cookie;
console.log('All cookies:', cookieStr);

// Check Firebase persistence
const checkFirebase = async () => {
  const db = indexedDB.open('firebaseLocalStorageDb');
  db.onsuccess = (event) => {
    console.log('✅ Firebase IndexedDB exists');
  };
  db.onerror = () => {
    console.log('❌ Firebase IndexedDB not found');
  };
};
checkFirebase();

// Check if loading state is delayed
console.log('Loading state should be false initially');
console.log('Should only show after 500ms if session restore is slow');
```

## Production Testing Checklist

### After Deployment to Railway + Vercel

#### 1. Cookie Configuration
- [ ] Login via https://veefore.com
- [ ] Open DevTools → Application → Cookies
- [ ] Verify `auth_token` cookie:
  - [ ] `Domain`: `.veefore.com`
  - [ ] `Secure`: ✓ (checked)
  - [ ] `HttpOnly`: ✓ (checked)
  - [ ] `SameSite`: `Lax`
  - [ ] `Expires`: 30 days from now

#### 2. Session Restoration
- [ ] Login to https://veefore.com
- [ ] Close browser completely
- [ ] Open browser → Go to https://veefore.com
- [ ] Verify: Dashboard loads instantly without loading spinner
- [ ] Open console → Verify: No error messages

#### 3. Background Token Refresh
- [ ] Login to https://veefore.com
- [ ] Keep tab open
- [ ] Open console
- [ ] Wait ~55 minutes
- [ ] Verify: Console shows "[TokenRefresh] Background refresh successful (silent)"
- [ ] Verify: No loading spinners or UI changes during refresh

#### 4. Multi-Day Persistence
- [ ] Login to https://veefore.com on Monday
- [ ] Close browser
- [ ] Open browser on Tuesday → Still logged in
- [ ] Open browser on Friday → Still logged in
- [ ] Open browser 29 days later → Still logged in
- [ ] Open browser 31 days later → Redirected to login (expected)

#### 5. Network Error Handling
- [ ] Login to https://veefore.com
- [ ] Open console
- [ ] Wait ~55 minutes for token refresh
- [ ] Disconnect internet during refresh
- [ ] Verify: Console shows retry messages
- [ ] Reconnect internet
- [ ] Verify: Refresh eventually succeeds

## Known Behaviors (Expected)

### ✅ These Are NORMAL:

1. **First visit after deployment**: Loading spinner shows briefly while Firebase initializes
2. **Very slow networks**: Loading spinner appears after 500ms (intentional delay)
3. **Cookie expires after 30 days**: User needs to re-authenticate (expected security measure)
4. **Manual logout**: Cookie cleared immediately, user logged out (expected)
5. **Session invalidation**: Backend can force logout via sessionVersion increment (security feature)

### ❌ These Are PROBLEMS:

1. **Loading spinner on every browser reopen**: Loading should be instant after first login
2. **Cookie expires after 1 hour**: Check Railway deployment - cookie should be 30 days
3. **Token refresh visible to user**: Refresh should be silent (no loading states)
4. **Logout loop after 7 days**: Check cookie duration - should be 30 days not 7
5. **Firebase IndexedDB not created**: Persistence not working - check Firebase config

## Debugging Commands

### Check Cookie in Browser Console
```javascript
// Get auth_token cookie
const getAuthCookie = () => {
  const cookies = document.cookie.split(';');
  const authCookie = cookies.find(c => c.trim().startsWith('auth_token='));
  if (authCookie) {
    console.log('✅ Auth cookie exists');
    console.log('Cookie value length:', authCookie.split('=')[1].length);
  } else {
    console.log('❌ No auth cookie found');
  }
};
getAuthCookie();
```

### Check Firebase Persistence
```javascript
// Check if Firebase is using IndexedDB
const checkFirebasePersistence = () => {
  const request = indexedDB.open('firebaseLocalStorageDb');
  
  request.onsuccess = (event) => {
    const db = event.target.result;
    console.log('✅ Firebase IndexedDB database exists');
    console.log('Version:', db.version);
    console.log('Object Stores:', Array.from(db.objectStoreNames));
    db.close();
  };
  
  request.onerror = (event) => {
    console.log('❌ Firebase IndexedDB not found');
  };
};
checkFirebasePersistence();
```

### Monitor Token Refresh
```javascript
// Monitor token refresh in real-time
const monitorTokenRefresh = () => {
  let lastRefresh = Date.now();
  
  setInterval(() => {
    const elapsed = Math.floor((Date.now() - lastRefresh) / 60000);
    console.log(`Time since last refresh: ${elapsed} minutes`);
    
    if (elapsed >= 55) {
      console.log('⚠️ Token refresh should happen soon...');
    }
  }, 60000); // Check every minute
};
monitorTokenRefresh();
```

## Issue Resolution

### If Users Report "Being Logged Out"

1. **Check Cookie Duration**
   - Login → DevTools → Cookies → auth_token
   - Verify "Expires" is 30 days from now
   - If expires in 1 hour → Backend not deployed correctly

2. **Check Token Refresh**
   - Open console
   - Wait 55 minutes
   - Look for "[TokenRefresh] Background refresh successful"
   - If no message → Token refresh not working

3. **Check Firebase Persistence**
   - DevTools → Application → IndexedDB
   - Look for `firebaseLocalStorageDb`
   - If missing → Firebase persistence failed

### If "Loading Spinner Always Shows"

1. **Check Initial Loading State**
   - Should start with `loading=false`
   - Should only show after 500ms
   - Verify useFirebaseAuth changes deployed

2. **Check Firebase Restore Speed**
   - Open console
   - Look for "Firebase sign-in successful" timing
   - Should be <200ms on fast connections

3. **Check Network Speed**
   - On slow networks, 500ms delay is intentional
   - Loading spinner should appear if restore >500ms

## Verification Results

### ✅ Code Review: PASS
- [x] Backend cookies set to 30 days (both endpoints)
- [x] Frontend loading starts at false
- [x] Loading delayed 500ms
- [x] Timer cleanup in all paths
- [x] Exponential backoff implemented correctly
- [x] Rate limiting handled
- [x] Firebase persistence configured

### 🧪 Manual Testing: Required
- [ ] Test on local dev server
- [ ] Test cookie duration
- [ ] Test delayed loading
- [ ] Test token refresh
- [ ] Test retry logic

### 🚀 Production Testing: Required After Deployment
- [ ] Test on https://veefore.com
- [ ] Test session restoration
- [ ] Test multi-day persistence
- [ ] Monitor token refresh
- [ ] Verify no user reports of logout

## Conclusion

**Code Implementation**: ✅ **VERIFIED CORRECT**

All code changes are properly implemented:
1. ✅ 30-day cookies (both OAuth and refresh)
2. ✅ Delayed loading state (500ms)
3. ✅ Exponential backoff retry (1min, 2min, 4min)
4. ✅ Rate limiting awareness (5min on 429)
5. ✅ Firebase persistence (IndexedDB)

**Next Step**: Deploy to production and run manual tests to verify behavior in real environment.

---

**Status**: Code verification complete ✅  
**Confidence**: High (all code changes verified correct)  
**Ready for**: Production deployment and testing
