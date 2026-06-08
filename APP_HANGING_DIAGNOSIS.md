# App Hanging/Not Loading - Diagnosis Guide

## Problem

The app loads but hangs on the landing page without showing animations or transitioning to the dashboard.

## Likely Causes

### 1. Missing Environment Variables ⚠️ MOST LIKELY
The frontend can't connect to the backend because environment variables aren't set in Vercel.

**Check:**
- Go to Vercel Dashboard → Your Project → Settings → Environment Variables
- Verify ALL variables from `VERCEL_ENV_VARIABLES.txt` are present
- Especially critical: `VITE_API_BASE_URL`, `VITE_APP_URL`, `VITE_FIREBASE_*`

### 2. Backend Not Running
The Railway backend might not be deployed or running.

**Check:**
```bash
curl https://api.veefore.com/api/health
```

Should return: `{"status":"ok","timestamp":"..."}`

If it fails, the backend isn't running.

### 3. CORS Issues
Frontend can't make requests to backend due to CORS restrictions.

**Check Browser Console:**
Look for errors like:
```
Access to fetch at 'https://api.veefore.com' from origin 'https://veefore.com' has been blocked by CORS
```

### 4. Firebase Configuration Missing
Authentication can't initialize without Firebase credentials.

**Check Browser Console:**
Look for errors like:
```
Firebase: Error (auth/invalid-api-key)
```

## Diagnostic Steps

### Step 1: Open Browser Console

1. Visit https://veefore.com
2. Press F12 (or Cmd+Option+I on Mac)
3. Go to "Console" tab
4. Look for red error messages

### Step 2: Check Network Tab

1. In DevTools, go to "Network" tab
2. Refresh the page
3. Look for failed requests (shown in red)
4. Check if API calls to `api.veefore.com` are failing

### Step 3: Check Environment Variables

**In Vercel Dashboard:**
1. Go to Settings → Environment Variables
2. Verify these are set for **Production** environment:

```
VITE_API_BASE_URL=https://api.veefore.com
VITE_APP_URL=https://veefore.com
VITE_SOCKET_URL=https://api.veefore.com
VITE_FIREBASE_API_KEY=AIzaSyABXnYreK-ZA8pRAK2t352bUpDaUwJoWzE
VITE_FIREBASE_APP_ID=1:309418074269:web:7b2a61fe3f40fc11343474
VITE_FIREBASE_PROJECT_ID=veefore-b84c8
VITE_STRIPE_PUBLISHABLE_KEY=pk_live_51QmVDuBcIkAZvZICbXI7PxZ0o9l9gwq4yLsezGp6yHCXXNbuwXEXKDGqQF3WKQ9OFDJWe7uyTi9dSPZGTCmXzSdP00hL6ufyYp
VITE_RAZORPAY_KEY_ID=rzp_test_demo1234567890
VITE_SENTRY_DSN=https://e5f2471204ae21aeb356a140cbd0bb37@o4510475111759872.ingest.us.sentry.io/4510475596922880
VITE_META_PHASE_1_REVIEW_MODE=true
```

### Step 4: Test Backend

```bash
# Test backend health
curl https://api.veefore.com/api/health

# If backend is down, check Railway:
# 1. Go to Railway Dashboard
# 2. Check if service is running
# 3. Check deployment logs for errors
```

## Quick Fixes

### Fix 1: Add Missing Environment Variables

1. Open `VERCEL_ENV_VARIABLES.txt`
2. Go to Vercel Dashboard → Settings → Environment Variables
3. Add EACH variable for **Production** environment
4. **Important:** After adding variables, redeploy:
   - Go to Deployments tab
   - Click "..." on latest deployment
   - Click "Redeploy"

### Fix 2: Start Railway Backend

If backend isn't running:
1. Go to Railway Dashboard
2. Check service status
3. Add environment variables from `RAILWAY_ENV_VARIABLES.txt`
4. Trigger a deployment

### Fix 3: Force Vercel Redeploy

After adding environment variables:
```bash
# Make a small change and push
git commit --allow-empty -m "Trigger Vercel redeploy with env vars"
git push
```

## Common Error Messages

### "Failed to fetch" or "Network Error"
- **Cause:** Backend isn't running or VITE_API_BASE_URL is wrong
- **Fix:** Check backend is running, verify environment variable

### "Firebase: Error (auth/invalid-api-key)"
- **Cause:** Firebase environment variables missing or incorrect
- **Fix:** Add all VITE_FIREBASE_* variables

### "Uncaught (in promise) TypeError"
- **Cause:** Environment variables not loaded, app trying to use undefined values
- **Fix:** Add all VITE_ variables and redeploy

### App stuck on landing page, no errors
- **Cause:** Environment variables added but Vercel hasn't rebuilt
- **Fix:** Force redeploy after adding variables

## Verification Checklist

After fixes, verify:

- [ ] All VITE_ environment variables are in Vercel (Production)
- [ ] Backend responds: `curl https://api.veefore.com/api/health`
- [ ] Browser console shows no red errors
- [ ] Network tab shows successful API calls
- [ ] App loads and shows content (not just landing page)

## If Still Hanging

1. **Share console errors** - Take screenshot of browser console
2. **Share network tab** - Show failed requests
3. **Verify backend logs** - Check Railway logs for errors

---

**Most Common Issue:** Environment variables not set in Vercel. Add them, then redeploy!
