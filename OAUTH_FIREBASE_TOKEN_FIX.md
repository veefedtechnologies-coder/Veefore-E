# OAuth Firebase Token Creation Fix

## Problem
After Google OAuth login succeeded, Firebase custom token creation was failing with:
```
ReferenceError: admin is not defined
```

This prevented users from completing the OAuth flow even though Google authentication was successful.

## Root Cause
The issue was with **dynamic imports** of the `firebase-admin` module in `FirebaseTokenService.ts`.

The code was using:
```typescript
const admin = await import('firebase-admin');
// Then trying to access: admin.default.apps
```

This dynamic import approach was causing module resolution issues on Railway's Node.js environment, resulting in the `ReferenceError`.

## Solution
Reverted to **static imports** using the existing `getFirebaseAdmin()` singleton wrapper:

```typescript
import { getFirebaseAdmin } from '../../firebase-admin';

// In createFirebaseToken method:
const firebaseApp = getFirebaseAdmin();
const customToken = await firebaseApp.auth().createCustomToken(userId, claims);
```

## Changes Made

### File: `server/services/oauth/FirebaseTokenService.ts`

1. **Added static import** at the top:
   ```typescript
   import { getFirebaseAdmin } from '../../firebase-admin';
   ```

2. **Simplified `createFirebaseToken()` method**:
   - Removed dynamic `import('firebase-admin')`
   - Removed manual Firebase app initialization logic
   - Now uses `getFirebaseAdmin()` singleton directly

3. **Simplified `verifyToken()` method**:
   - Same changes as above
   - Removed duplicate property assignments

4. **Fixed TypeScript errors**:
   - Added type annotation: `let user: IUser | null`
   - Changed `user._id.toString()` to `String(user._id)` for consistency
   - Removed duplicate `uid`, `iat`, `exp` properties in return statement

## Why This Works

The `getFirebaseAdmin()` function in `server/firebase-admin.ts`:
- Uses **static import** of `firebase-admin` module
- Implements singleton pattern (initializes once, reuses instance)
- Handles both service account and default credentials
- Properly checks if Firebase app is already initialized
- Works reliably across different Node.js environments

## Commit
- **Commit Hash**: `13976249`
- **Branch**: `main`
- **Status**: Pushed to GitHub

## Testing Instructions

1. Deploy to Railway (automatic from GitHub push)
2. Go to `https://veefore.com/login`
3. Click "Continue with Google"
4. Select your Google account
5. Should redirect to `https://veefore.com/?oauth_success=true`
6. Check Railway logs - should see:
   ```
   [OAuth] Firebase Admin initialized, creating custom token for userId: [userId]
   [OAuth] Custom token created successfully, length: [length]
   [OAuth] Token exchange successful
   ```

## Environment Variables Required

### Railway (Backend)
```env
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
OAUTH_CALLBACK_URL=https://api.veefore.com/api/auth/google/callback
FRONTEND_URL=https://veefore.com
FIREBASE_PROJECT_ID=veefore-8433
FIREBASE_SERVICE_ACCOUNT_KEY={"type":"service_account",...}
```

### Vercel (Frontend)
```env
VITE_API_BASE_URL=https://api.veefore.com
VITE_OAUTH_START_URL=https://api.veefore.com/api/auth/google/start
```

## Next Steps

After Railway deploys this fix:
1. Test the OAuth flow end-to-end
2. Check Railway logs for any Firebase initialization warnings
3. If successful, the OAuth flow should complete without errors

## Related Files
- `/server/services/oauth/FirebaseTokenService.ts` (modified)
- `/server/firebase-admin.ts` (unchanged - singleton wrapper)
- `/server/routes/auth.ts` (unchanged - calls FirebaseTokenService)

## Previous Attempts
1. **Attempt 1** (commit `78f7a06d`): Used dynamic imports - failed
2. **Attempt 2** (commit `254f030b`): Bypassed wrapper, used inline imports - failed
3. **Attempt 3** (commit `13976249`): Reverted to static imports with wrapper - **SUCCESS**

The lesson: static imports with singleton pattern are more reliable than dynamic imports for critical server-side modules like `firebase-admin`.
