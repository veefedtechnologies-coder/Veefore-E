# Railway Backend Deployment Fixes

## Issues Fixed

### 1. ❌ Static File Serving Error
**Problem:** Server was trying to serve static files from `/app/dist/public` which doesn't exist on Railway.

**Root Cause:** Railway only builds the backend (`npm run server:build`), not the client. The `dist/public` directory is created by `npm run client:build` which runs on Vercel.

**Solution:** Modified `server/index.ts` to:
- Only check for static files in development mode
- Skip static file serving in production (Railway)
- Log that static assets are served by Vercel

```typescript
// PRODUCTION NOTE: Static assets are served by Vercel (frontend)
// Railway only serves the API backend - no dist/public directory needed
if (isDevelopment) {
  // Only check for static files in development mode
  const distPublicPath = path.join(process.cwd(), 'dist/public');
  if (fs.existsSync(distPublicPath)) {
    // ... serve static files
  }
} else {
  console.log('[PRODUCTION] Static assets served by Vercel - Railway handles API only');
}
```

### 2. ❌ Distributed Lock Conflicts
**Problem:** Multiple Railway instances were competing for Instagram polling locks, causing errors:
```
[DISTRIBUTED LOCK] ❌ Lock 'instagram_polling' held by another instance: 92702-17808502...
[LEADER ELECTION] Failed to acquire polling lock (and not in dev force mode)
```

**Root Cause:** When Railway scales horizontally or restarts, multiple instances try to acquire the same lock. The old code would:
- Log errors for normal behavior (only one leader should exist)
- Try to force-release locks in production (dangerous)
- Start fallback polling even when locks failed (creates duplicates)

**Solution:** Modified `server/infrastructure/leader-election.ts` to:
- Accept that follower instances are normal in production
- Only force-release locks in development mode
- Not start fallback polling in production if locks fail
- Improve logging to show this is expected behavior

```typescript
const shouldForceRelease = process.env.NODE_ENV !== 'production' || process.env.FORCE_LEADER === 'true';

if (!hasPollingLock && shouldForceRelease) {
  // Only in dev: try to clear ghost locks
} else if (!hasPollingLock) {
  console.log('[LEADER ELECTION] ⏸️ Polling lock held by another instance - this instance is a FOLLOWER');
  console.log('[SMART POLLING] ℹ️ This is normal behavior for horizontal scaling');
}
```

### 3. ⚠️ Token Re-encryption Interval Warning
**Problem:** Log showed warning about interval exceeding Node.js limit:
```
⚠️ P2-2: Interval 30 days exceeds Node.js limit. Capping at 24 days.
```

**Root Cause:** Node.js `setInterval()` max value is 2,147,483,647 ms (≈24.8 days). The code was calculating 30 days = 2,592,000,000 ms which exceeds this limit.

**Solution:** Modified `server/security/token-migration.ts` to:
- Define clear constants for max safe interval
- Fix capping logic to use 24 days consistently
- Improve logging to show actual interval used
- Skip scheduling in development mode

```typescript
const MAX_SAFE_INTERVAL_DAYS = 24;
const MAX_SAFE_INTERVAL_MS = MAX_SAFE_INTERVAL_DAYS * 24 * 60 * 60 * 1000;

if (intervalMs > MAX_SAFE_INTERVAL_MS || intervalMs > 2147483647) {
  console.warn(`⚠️ P2-2: Interval ${intervalDays} days exceeds Node.js limit. Capping at ${MAX_SAFE_INTERVAL_DAYS} days.`);
  intervalMs = MAX_SAFE_INTERVAL_MS;
}
```

## Files Modified

1. **`server/index.ts`**
   - Conditional static file serving (dev only)
   - Added production logging

2. **`server/infrastructure/leader-election.ts`**
   - Improved lock acquisition logic
   - Better follower instance handling
   - Production-safe fallback behavior

3. **`server/security/token-migration.ts`**
   - Fixed interval capping logic
   - Improved constant definitions
   - Better logging

## Expected Behavior After Fix

### Development Mode
- Static files served from `dist/public` if available
- Force-releases ghost locks for easier local development
- Starts fallback polling if lock acquisition fails

### Production Mode (Railway)
- No static file serving (logged that Vercel handles it)
- Accepts follower status gracefully (no errors for normal behavior)
- Only one leader instance runs polling
- Follower instances log they're waiting for leader
- Token re-encryption capped at 24 days

## Verification

After deployment, Railway logs should show:

### Leader Instance (One Instance)
```
[PRODUCTION] Static assets served by Vercel - Railway handles API only
[LEADER ELECTION] ✅ This instance is the LEADER for Instagram polling
[SMART POLLING] 🚀 Activating hybrid system - webhooks + smart polling
🔐 P2-2: Scheduled token re-encryption interval: 24 days
```

### Follower Instances (All Other Instances)
```
[PRODUCTION] Static assets served by Vercel - Railway handles API only
[LEADER ELECTION] ⏸️ Polling lock held by another instance - this instance is a FOLLOWER
[SMART POLLING] ℹ️ Polling will be handled by the leader instance
[SMART POLLING] ℹ️ This is normal behavior for horizontal scaling
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         FRONTEND                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │            Vercel (veefore.com)                       │  │
│  │  - Serves React app (dist/public)                     │  │
│  │  - Static assets (/assets/*)                          │  │
│  │  - Client-side routing                                │  │
│  └───────────────────────────────────────────────────────┘  │
└──────────────────────────┬──────────────────────────────────┘
                           │ API Calls
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                         BACKEND                              │
│  ┌───────────────────────────────────────────────────────┐  │
│  │        Railway (api.veefore.com) - API Only           │  │
│  │                                                        │  │
│  │  Leader Instance (1):                                 │  │
│  │  - API endpoints (/api/*)                             │  │
│  │  - Instagram polling (holds lock)                     │  │
│  │  - Token re-encryption                                │  │
│  │  - Background workers                                 │  │
│  │                                                        │  │
│  │  Follower Instances (N):                              │  │
│  │  - API endpoints (/api/*)                             │  │
│  │  - Background workers                                 │  │
│  │  - No polling (waiting for leader)                    │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Deployment

### Railway Environment Variables
All environment variables are already set correctly. No changes needed.

### Deployment Steps
```bash
# Add changes
git add server/index.ts
git add server/infrastructure/leader-election.ts
git add server/security/token-migration.ts
git add RAILWAY_BACKEND_FIX.md

# Commit
git commit -m "Fix Railway backend: remove static serving, improve leader election, fix interval warning"

# Push to trigger Railway deployment
git push
```

### After Deployment
1. Wait 2-3 minutes for Railway to deploy
2. Check Railway logs for:
   - ✅ No static file serving errors
   - ✅ Clean leader election (one leader, others followers)
   - ✅ No interval warning (or shows 24 days)
3. Test API health: `curl https://api.veefore.com/api/health`

## Why These Changes Are Safe

1. **Static File Removal:** Safe because Vercel already serves all static assets. Railway never needed to serve them.

2. **Leader Election:** Safe because only one instance should run polling. Multiple instances doing polling would create duplicate API calls to Instagram.

3. **Interval Capping:** Safe because 24 days is still frequent enough for token re-encryption security requirements.

## Related Files

- `railway.toml` - Railway configuration (no changes needed)
- `RAILWAY_ENV_VARIABLES.txt` - Environment variables (no changes needed)
- `vercel.json` - Vercel configuration (no changes needed)

---

**Status:** ✅ Ready to deploy
**Testing:** Required after deployment
**Rollback:** Revert commit if issues occur (unlikely)
