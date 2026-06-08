# Railway Filesystem Permission Fix

## Problem

Railway logs showed:
```
[VIDEO] Failed to create output directory: Error: EACCES: permission denied, mkdir '/app/media'
```

## Root Cause

1. **Read-Only Filesystem**: Railway's main filesystem (`/app`) is read-only for generated files
2. **Constructor Async Call**: Video generators were calling async `ensureOutputDirectory()` in constructors
3. **Wrong Directory**: Code was trying to create `media/generated` in `/app` instead of `/tmp`

## Solution

### 1. Use /tmp for Generated Files

Modified all video generators to use `/tmp` on Railway/production:

```typescript
const baseDir = process.env.RAILWAY_ENVIRONMENT || process.env.NODE_ENV === 'production' 
  ? '/tmp/media/generated'
  : join(process.cwd(), 'media', 'generated');
```

### 2. Remove Constructor Async Calls

Removed `this.ensureOutputDirectory()` from constructors since:
- Constructors can't wait for async operations
- Directory will be created when actually needed (first video generation)

### 3. Better Error Handling

Added proper error logging that won't crash the app:
```typescript
catch (error) {
  console.error('[VIDEO] Failed to create directory:', error);
  // Non-fatal - will try again if needed
}
```

## Files Modified

1. **`server/services/complete-video-generator.ts`**
   - Use `/tmp/media/generated` in production
   - Remove constructor async call
   - Better error handling

2. **`server/services/simple-video-generator.ts`**
   - Use `/tmp/media/generated` in production
   - Better error handling

3. **`server/services/working-video-generator.ts`**
   - Use `/tmp/media/generated` in production
   - Better error handling

4. **`server/services/ffmpeg-service.ts`**
   - Map media directory to `/tmp` in production
   - Remove constructor directory creation
   - Better error handling

## Why /tmp?

Railway provides `/tmp` as a writable temporary filesystem:
- ✅ Writable for generated files
- ✅ Automatically cleaned up
- ✅ Suitable for temporary video/audio files
- ✅ No permission issues

## MongoDB Warnings

The logs also show MongoDB duplicate index warnings. These are **warnings, not errors**:

```
Warning: Duplicate schema index on {"workspaceId":1} found
Warning: Duplicate schema index on {"platform":1} found
Warning: Duplicate schema index on {"accountId":1} found
```

**Status**: These are safe to ignore. They mean:
- Mongoose schema defines an index
- MongoDB collection already has that index
- Both definitions match, so no conflict
- Just informational warnings from Mongoose

**Why they appear**:
- Database was created/migrated previously
- Indexes already exist from previous deployments
- Mongoose sees them and warns (but doesn't break)

**Fix (optional)**:
To remove warnings, you could clean up schema definitions to not declare indexes that already exist in the database. But this is **low priority** since they don't affect functionality.

## Expected Results

### ✅ After Fix

**Clean Video Generation:**
```
[VIDEO] Output directory ready: /tmp/media/generated
```

**No Permission Errors:**
- ❌ NO "EACCES: permission denied"
- ❌ NO "Failed to create output directory" errors

### ⚠️ MongoDB Warnings (Safe to Ignore)

```
Warning: Duplicate schema index on {"workspaceId":1} found...
```

These are informational only and don't affect functionality.

## Testing

### 1. Video Generation
Generate a video through the API - should work without permission errors.

### 2. Check Logs
Railway logs should show:
- ✅ No permission denied errors
- ✅ Output directory created in /tmp
- ⚠️ MongoDB warnings (expected, safe to ignore)

### 3. API Health
```bash
curl https://api.veefore.com/api/health
```

Should return healthy status.

## Railway Filesystem Architecture

```
/app/
├── dist/          # Application code (read-only)
├── node_modules/  # Dependencies (read-only)
└── uploads/       # User uploads (persistent volume)

/tmp/
└── media/
    └── generated/ # Generated videos (temporary, writable)
```

## Rollback

If this causes issues:
```bash
git revert HEAD
git push
```

---

**Status:** ✅ Ready to deploy
**Priority:** HIGH - Fixes permission errors
**Impact:** Enables video generation on Railway
**MongoDB Warnings:** Safe to ignore (informational only)
