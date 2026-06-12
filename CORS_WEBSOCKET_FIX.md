# CORS and WebSocket Configuration Fix

## Issue
After successful OAuth login, users saw "Unable to Load Account" error when accessing from `https://www.veefore.com`

## Root Causes Identified

### 1. CORS Blocking API Requests
**Error in Console:**
```
Access to fetch at 'https://api.veefore.com/api/user' from origin 'https://www.veefore.com' 
has been blocked by CORS policy: The value of the 'Access-Control-Allow-Origin' header 
in the response must not be the wildcard '*' when the request's credentials mode is 'include'
```

**Problem:** 
- Backend CORS middleware didn't include production API domain
- Socket.IO CORS configuration was missing production domains

### 2. WebSocket Connection Failures
**Error in Console:**
```
WebSocket connection to 'wss://api.veefore.com/socket.io/?EIO=4&transport=websocket' failed
```

**Problem:**
- Socket.IO CORS configuration only had development/tunnel URLs
- Missing production domains: `https://veefore.com`, `https://www.veefore.com`, `https://api.veefore.com`

## Fixes Applied

### 1. CORS Middleware Update (`server/middleware/cors-security.ts`)
**Added to production origins:**
```typescript
'https://api.veefore.com',  // Backend API domain
```

### 2. Socket.IO CORS Update (`server/services/realtime.ts`)
**Added to CORS origin array:**
```typescript
"https://veefore.com",
"https://www.veefore.com",
"https://api.veefore.com",
"https://app.veefore.com",
```

### 3. Railway Environment Variables (`RAILWAY_ENV_VARIABLES.txt`)
**Updated ALLOWED_ORIGINS:**
```
ALLOWED_ORIGINS=https://veefore.com,https://www.veefore.com,https://api.veefore.com
```

## Deployment Instructions

### Railway (Backend)
1. Go to Railway Dashboard → Your Service → Variables Tab
2. Update or add: `ALLOWED_ORIGINS=https://veefore.com,https://www.veefore.com,https://api.veefore.com`
3. Redeploy the service (or it will auto-deploy on git push)

### Verification Steps
1. Push changes to Railway: `git push`
2. Wait for Railway deployment to complete
3. Test OAuth flow:
   - Go to `https://www.veefore.com`
   - Click "Continue with Google"
   - After OAuth redirect, you should see the app dashboard (not "Unable to Load Account")
4. Check browser console - should see:
   - ✅ OAuth session restored successfully
   - ✅ Firebase sign-in successful
   - ✅ WebSocket connected
   - ✅ User data loaded

## Technical Details

### CORS Configuration
- **Development:** Allows all origins for easy testing
- **Production:** Explicit allowlist only
  - `https://veefore.com` (main domain)
  - `https://www.veefore.com` (www subdomain)
  - `https://api.veefore.com` (backend API)
  - `https://app.veefore.com` (app subdomain)
- **Credentials:** `true` (required for HTTP-only cookies)
- **Methods:** GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD

### WebSocket Configuration
- **Path:** `/socket.io/` (default)
- **Transports:** websocket, polling (with upgrades)
- **Credentials:** `true` (matches CORS)
- **Ping Timeout:** 30 seconds
- **Ping Interval:** 10 seconds

## Files Modified
1. `/server/middleware/cors-security.ts` - Added `api.veefore.com` to production origins
2. `/server/services/realtime.ts` - Added all production domains to Socket.IO CORS
3. `/RAILWAY_ENV_VARIABLES.txt` - Updated ALLOWED_ORIGINS documentation

## Commit
- Commit ID: `1a105ded`
- Message: "Fix CORS and WebSocket configuration for production domains"

## Status
✅ **FIXED** - Ready for deployment to Railway
