# ⚙️ CRITICAL: Add Environment Variable to Railway

## 🚨 Action Required

The fix has been deployed, but you need to add **ONE environment variable** to Railway for it to work.

## Steps

### 1. Go to Railway Dashboard
Visit: https://railway.app/dashboard

### 2. Select Your Service
Click on your VeeFore backend service

### 3. Go to Variables Tab
Click on the "Variables" tab

### 4. Add New Variable
Click "New Variable" or "+ Add Variable"

**Variable Name:**
```
BACKEND_ONLY
```

**Variable Value:**
```
true
```

### 5. Deploy
Railway will automatically redeploy with the new variable

## What This Does

This tells the server:
- ✅ "Don't try to serve static files"
- ✅ "You're the backend, Vercel is the frontend"
- ✅ "Skip all build directory checks"

## Expected Result

After adding this and Railway redeploys (2-3 minutes):

### ✅ Clean Logs
```
[PRODUCTION] Running as backend-only server (Railway)
[PRODUCTION] Static assets are served by Vercel at veefore.com
[PRODUCTION] This instance serves API endpoints only
```

### ✅ No Errors
- ❌ NO "Could not find the build directory"
- ❌ NO "Static serving failed"

## Alternative (Automatic Detection)

If you don't want to add the variable, the code will also detect Railway automatically via `RAILWAY_ENVIRONMENT` which Railway sets automatically. But adding `BACKEND_ONLY=true` is clearer and more explicit.

---

**Time Estimate:** 1 minute to add variable
**Impact:** Fixes all static serving errors
**Required:** YES - the fix won't work without this variable
