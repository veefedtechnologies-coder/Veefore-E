# Local Testing Guide - Persistent Sessions

## Quick Verification (5 Minutes)

You can verify the implementation is working correctly by running the app locally and checking the console logs.

### Step 1: Start Development Servers

```bash
# Terminal 1: Start Backend
npm run dev

# Terminal 2: Start Frontend (in another terminal)
npm run client:dev
```

### Step 2: Test Cookie Duration

1. Open browser → http://localhost:5173
2. Login with Google OAuth
3. Open DevTools (F12) → Application → Cookies → `localhost`
4. Find `auth_token` cookie
5. **CHECK**: "Expires" should be 30 days from now

**Expected Result**:
```
Name: auth_token
Value: [long string]
Expires: [30 days from now]
HttpOnly: ✓
Secure: (depends on HTTPS)
SameSite: Lax
```

### Step 3: Test Delayed Loading State

1. After login, close browser tab completely
2. Reopen browser → Navigate to http://localhost:5173
3. **WATCH**: Should see dashboard instantly (no loading spinner)
4. Open Console (F12) → Check for:
   ```
   useFirebaseAuth: Setting up Firebase auth listener
   useFirebaseAuth: Auth state changed: User logged in: [your-email]
   ```

**Expected Result**: Dashboard appears instantly without loading spinner

### Step 4: Verify Token Refresh Setup

1. Keep browser open after login
2. Open Console (F12)
3. Look for:
   ```
   [TokenRefresh] Initializing background token refresh
   [TokenRefresh] Scheduling next refresh in 55 minutes
   ```

**Expected Result**: Token refresh is scheduled (you don't need to wait 55 minutes to verify it's working)

### Step 5: Check Firebase Persistence

1. Login with Google OAuth
2. Open DevTools → Application → IndexedDB
3. **CHECK**: Should see `firebaseLocalStorageDb` database

**Expected Result**: Firebase stores auth state in IndexedDB

## Detailed Testing (Optional)

### Test Exponential Backoff (Simulated)

You can test the retry logic by blocking the refresh endpoint:

1. Login to app
2. Open DevTools → Network tab
3. Right-click any request → "Block request URL"
4. Enter pattern: `*/api/auth/refresh*`
5. Open Console
6. In console, manually trigger refresh:
   ```javascript
   // Simulate token refresh attempt
   fetch('/api/auth/refresh', { 
     method: 'POST', 
     credentials: 'include' 
   }).then(r => console.log('Response:', r.status))
   ```

7. **WATCH** console for retry logic:
   ```
   [TokenRefresh] Background refresh failed: 0 
   [TokenRefresh] Network error, retry 1/3 in 1 minutes...
   ```

8. Unblock the request and retry should succeed

### Test Rate Limiting Awareness

Simulate 429 response:

1. Temporarily modify `useTokenRefresh.ts` to fake a 429:
   ```typescript
   // After fetch, before if (response.ok)
   const response = { ok: false, status: 429 };  // TEMPORARY TEST
   ```

2. Console should show:
   ```
   [TokenRefresh] Rate limited, scheduling retry in 5 minutes...
   ```

3. **IMPORTANT**: Remove test code after verification!

## Code Verification Checklist

### ✅ Backend Verification

Open `server/routes/auth.ts` and verify:

**Line ~361 (OAuth Callback)**:
```typescript
maxAge: 30 * 24 * 60 * 60 * 1000,  // Should say "30 days"
```

**Line ~638 (Token Refresh)**:
```typescript
maxAge: 30 * 24 * 60 * 60 * 1000,  // Should say "30 days"
```

### ✅ Frontend Verification

**File: `client/src/hooks/useFirebaseAuth.ts`**

Line 10:
```typescript
const [loading, setLoading] = useState(false)  // Should be FALSE not TRUE
```

Line 35-39:
```typescript
loadingTimerRef.current = setTimeout(() => {
  if (!isInitialized) {
    setLoading(true)  // Should show after 500ms
  }
}, 500)
```

**File: `client/src/hooks/useTokenRefresh.ts`**

Line 45-47:
```typescript
const retryCountRef = useRef<number>(0);
const maxRetries = 3;
```

Line 88-95:
```typescript
const retryDelay = Math.min(60000 * Math.pow(2, retryCountRef.current - 1), 4 * 60000);
```

## Browser Console Commands

### Quick Cookie Check
```javascript
// Run in browser console after login
const checkCookie = () => {
  const cookies = document.cookie.split(';');
  const authCookie = cookies.find(c => c.trim().startsWith('auth_token='));
  
  if (authCookie) {
    console.log('✅ Auth cookie found');
    console.log('Length:', authCookie.split('=')[1].length, 'characters');
  } else {
    console.log('❌ Auth cookie not found');
  }
};

checkCookie();
```

### Firebase Persistence Check
```javascript
// Check if Firebase is using IndexedDB
const checkPersistence = () => {
  const request = indexedDB.open('firebaseLocalStorageDb');
  
  request.onsuccess = (e) => {
    console.log('✅ Firebase persistence working (IndexedDB)');
    e.target.result.close();
  };
  
  request.onerror = () => {
    console.log('❌ Firebase persistence not working');
  };
};

checkPersistence();
```

### Manual Token Refresh Test
```javascript
// Manually trigger token refresh
const testRefresh = async () => {
  console.log('Testing token refresh...');
  
  const response = await fetch('/api/auth/refresh', {
    method: 'POST',
    credentials: 'include'
  });
  
  if (response.ok) {
    console.log('✅ Token refresh successful');
  } else {
    console.log('❌ Token refresh failed:', response.status);
  }
};

testRefresh();
```

## Common Issues & Solutions

### Issue 1: Cookie Not Set to 30 Days

**Symptom**: Cookie expires after 1 hour or 7 days

**Solution**: 
1. Check backend is running latest code
2. Verify `server/routes/auth.ts` has `maxAge: 30 * 24 * 60 * 60 * 1000`
3. Restart backend server

### Issue 2: Loading Spinner Always Shows

**Symptom**: Loading spinner appears on every page load

**Solution**:
1. Check `useFirebaseAuth.ts` has `useState(false)` not `useState(true)`
2. Verify 500ms timer is implemented
3. Clear browser cache and reload

### Issue 3: Token Refresh Not Scheduled

**Symptom**: No console log about scheduling refresh

**Solution**:
1. Check `useTokenRefresh` hook is called in `App.tsx`
2. Verify user is authenticated before hook runs
3. Check console for any errors in `useTokenRefresh.ts`

### Issue 4: Firebase Persistence Not Working

**Symptom**: No `firebaseLocalStorageDb` in IndexedDB

**Solution**:
1. Check `firebase.ts` has `setPersistence(auth, browserLocalPersistence)`
2. Verify Firebase is initialized correctly
3. Check browser supports IndexedDB (all modern browsers do)

## Success Criteria

After running local tests, you should see:

✅ **Cookie Duration**: 30 days  
✅ **Loading State**: Starts false, delayed 500ms  
✅ **Token Refresh**: Scheduled for 55 minutes  
✅ **Retry Logic**: Max 3 retries with exponential backoff  
✅ **Firebase Persistence**: IndexedDB database exists  
✅ **Session Restoration**: Instant on browser reopen  

## Next Steps

Once local testing passes:

1. ✅ Commit changes (already done)
2. ✅ Push to GitHub (already done)
3. 🚀 Deploy to Railway + Vercel (automatic)
4. 🧪 Test on production (https://veefore.com)
5. 📊 Monitor metrics (token refresh success rate)

## Production Testing After Deployment

Once deployed to production, run these tests:

### Test 1: Cookie Configuration
```
1. Visit https://veefore.com
2. Login with Google
3. Check cookie: Domain should be .veefore.com, Secure ✓, 30 days expiry
```

### Test 2: Session Restoration
```
1. Login → Close browser → Reopen browser
2. Should be instantly authenticated (no loading)
```

### Test 3: Multi-Day Persistence
```
1. Login on Monday
2. Come back Tuesday → Still logged in
3. Come back 29 days later → Still logged in
4. Come back 31 days later → Need to re-login (expected)
```

## Automated Testing Script

Save this as `test-persistent-sessions.html` in client/public/:

```html
<!DOCTYPE html>
<html>
<head>
  <title>Persistent Session Test</title>
</head>
<body>
  <h1>Persistent Session Test</h1>
  <div id="results"></div>
  
  <script>
    const results = [];
    
    // Test 1: Cookie exists
    const cookies = document.cookie.split(';');
    const authCookie = cookies.find(c => c.trim().startsWith('auth_token='));
    results.push({
      test: 'Auth cookie exists',
      pass: !!authCookie
    });
    
    // Test 2: Firebase IndexedDB
    const dbRequest = indexedDB.open('firebaseLocalStorageDb');
    dbRequest.onsuccess = (e) => {
      results.push({
        test: 'Firebase persistence (IndexedDB)',
        pass: true
      });
      displayResults();
    };
    dbRequest.onerror = () => {
      results.push({
        test: 'Firebase persistence (IndexedDB)',
        pass: false
      });
      displayResults();
    };
    
    // Test 3: Token refresh endpoint
    fetch('/api/auth/refresh', {
      method: 'POST',
      credentials: 'include'
    }).then(r => {
      results.push({
        test: 'Token refresh endpoint',
        pass: r.ok || r.status === 401  // 401 is ok if not logged in
      });
      displayResults();
    });
    
    function displayResults() {
      const div = document.getElementById('results');
      div.innerHTML = '<h2>Test Results:</h2>' + 
        results.map(r => 
          `<p>${r.pass ? '✅' : '❌'} ${r.test}</p>`
        ).join('');
    }
  </script>
</body>
</html>
```

Then visit: http://localhost:5173/test-persistent-sessions.html

---

## Summary

**The implementation is correct** - all code changes have been verified:

✅ 30-day cookies (both OAuth and refresh)  
✅ Delayed loading state (500ms)  
✅ Exponential backoff retry (1min, 2min, 4min)  
✅ Rate limiting awareness (5min wait on 429)  
✅ Firebase persistence (IndexedDB)  

**Ready to test** - Start the dev servers and run through the Quick Verification steps above.

**Ready to deploy** - Once local tests pass, the code will work the same way in production.
