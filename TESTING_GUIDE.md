# Testing Guide - Firebase Token Fix

## ✅ Fix Implementation Status

The Firebase token authentication fix has been successfully implemented and deployed. The server is running without errors.

## 🧪 How to Test the Fix

### Option 1: Test with Existing Session (If you're already logged in)

1. **Open the application** in your browser: `http://localhost:5173`
2. **Open DevTools** (F12 or Cmd+Option+I)
3. **Go to Console tab**
4. **Trigger a manual token refresh** by running:
   ```javascript
   window.dispatchEvent(new Event('visibilitychange'))
   ```
5. **Watch the console logs** for:
   - `[TokenRefresh] Performing background token refresh...`
   - `[TokenRefresh] Exchanging custom token for ID token...`
   - `[TokenRefresh] ✅ Token exchange complete, cookie updated`
   
6. **Check Network tab** for these requests:
   - POST `/api/auth/refresh` → Should return 200 with customToken
   - POST `/api/auth/update-token` → Should return 200

### Option 2: Test with Fresh Login

1. **Logout** if currently logged in
2. **Go to** `http://localhost:5173/signin`
3. **Click "Sign in with Google"**
4. **Complete OAuth flow**
5. **Watch Console logs** for:
   - `[useFirebaseAuth] Got custom token, signing in...`
   - `[useFirebaseAuth] Got ID token, updating server cookie...`
   - `[useFirebaseAuth] ✅ Server cookie updated with ID token`
   - `[useFirebaseAuth] ✅ Session restored successfully`

6. **Check Network tab** for:
   - GET `/api/auth/session` → Returns customToken
   - POST `/api/auth/update-token` → Should return 200

7. **Check Application → Cookies**:
   - `auth_token` cookie should exist
   - It should contain a JWT token (long string starting with `eyJ...`)

### Option 3: Test Token Refresh After 55 Minutes

**For impatient testing** (don't wait 55 minutes):

1. **Open Console** in DevTools
2. **Run this code** to check when next refresh is scheduled:
   ```javascript
   // Force a refresh immediately
   window.dispatchEvent(new Event('visibilitychange'))
   ```
3. **Watch for successful token exchange** in console logs

## ✅ Expected Behavior (Fix Working)

### Console Logs You Should See:
```
[TokenRefresh] Performing background token refresh (silent)...
[TokenRefresh] Background refresh successful, exchanging tokens...
[TokenRefresh] Exchanging custom token for ID token...
[TokenRefresh] ✅ Token exchange complete, cookie updated
[TokenRefresh] Scheduling next refresh in 55 minutes
```

### Network Requests You Should See:
```
POST /api/auth/refresh
  Status: 200 OK
  Response: { "success": true, "customToken": "eyJ...", "message": "Token refreshed successfully" }

POST /api/auth/update-token
  Status: 200 OK
  Response: { "success": true, "message": "Token updated successfully" }
```

## ❌ Old Behavior (Bug - Should NOT See)

### Console Errors You Should NOT See:
```
❌ Failed to verify Firebase token
❌ error: 'Invalid or expired authentication token'
❌ [OAuth] Token verification failed
❌ Error: verifyIdToken() expects an ID token, but was given...
```

### Network Errors You Should NOT See:
```
❌ POST /api/auth/refresh → 401 Unauthorized
❌ Response: { "error": "no_valid_session", "message": "Invalid or expired session" }
```

## 📊 Server Logs to Monitor

Watch the server terminal for these logs:

### Successful Token Refresh:
```
[OAuth] Token verification successful
[OAuth] Creating new Firebase custom token
[OAuth] Token refresh successful
```

### Successful Token Update:
```
[OAuth] ID token verified successfully
[OAuth] Updated auth_token cookie with ID token
```

## 🐛 Troubleshooting

### If you see "Invalid or expired authentication token":

1. **Clear cookies**: Application → Cookies → Delete `auth_token`
2. **Logout and login again**
3. **Check Network tab** to ensure `/api/auth/update-token` is being called
4. **Check console** for any JavaScript errors preventing the token exchange

### If token refresh fails:

1. **Check if Firebase Client SDK is loaded**: Run `typeof signInWithCustomToken` in console, should return `"function"`
2. **Check server logs** for any errors during token creation
3. **Verify Firebase config** is correct in `.env` file

### If you see CORS errors:

1. **Make sure** you're accessing the app on `localhost:5173`
2. **Check** that cookies are being sent (`credentials: 'include'`)

## 🔍 What Changed

### Before the Fix:
```
Cookie: Custom Token → Server: verifyIdToken(Custom Token) → ❌ FAIL
```

### After the Fix:
```
Cookie: ID Token → Server: verifyIdToken(ID Token) → ✅ SUCCESS
```

### Key Changes:
1. **New endpoint**: `/api/auth/update-token` - Updates cookie with ID token
2. **Modified**: `/api/auth/refresh` - Returns custom token in response
3. **Client-side**: Exchanges custom tokens for ID tokens automatically
4. **Cookie**: Now stores ID tokens (verifiable) instead of custom tokens

## ✅ Success Criteria

The fix is working correctly if:
- [ ] You can login without errors
- [ ] Token refresh happens every 55 minutes silently
- [ ] No "Invalid or expired token" errors in console
- [ ] Network tab shows successful `/api/auth/update-token` calls
- [ ] Server logs show "Token refresh successful"
- [ ] You stay logged in for 30 days without being kicked out

## 📝 Next Steps

1. **Test the login flow** with a fresh OAuth authentication
2. **Monitor the logs** for 55 minutes to see automatic refresh
3. **Or trigger manual refresh** using the console command above
4. **If everything works**, the fix is confirmed! 🎉

## 🔗 Related Documents

- `FIREBASE_TOKEN_FIX.md` - Detailed explanation of the fix
- `TOKEN_FLOW_DIAGRAM.md` - Visual diagram of token flow
- `test-token-flow.js` - Test script showing expected flow

---

**Server Status**: ✅ Running on http://localhost:3000  
**Client Status**: ✅ Available on http://localhost:5173  
**Fix Applied**: ✅ Yes  
**Ready to Test**: ✅ Yes
