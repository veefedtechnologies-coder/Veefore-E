# OAuth Deployment Checklist

## ✅ Completed Tasks

### 1. Backend (Railway) - Ready to Deploy ✅
All environment variables documented in `RAILWAY_ENV_VARIABLES.txt`:
- ✅ `GOOGLE_CLIENT_ID` - Your Google OAuth client ID
- ✅ `GOOGLE_CLIENT_SECRET` - Your Google OAuth client secret
- ✅ `OAUTH_CALLBACK_URL=https://api.veefore.com/api/auth/google/callback`
- ✅ `FRONTEND_URL=https://veefore.com`
- ✅ `COOKIE_DOMAIN=.veefore.com`
- ✅ `SESSION_SECRET` - For OAuth state/PKCE storage
- ✅ `FIREBASE_SERVICE_ACCOUNT_KEY` - Updated with correct Firebase credentials

### 2. Frontend (Vercel) - Ready to Deploy ✅
All environment variables documented in `VERCEL_ENV_VARIABLES.txt`:
- ✅ `VITE_API_BASE_URL=https://api.veefore.com`
- ✅ `VITE_OAUTH_START_URL=https://api.veefore.com/api/auth/google/start`
- ✅ `VITE_FIREBASE_PROJECT_ID=veefore-8433`
- ✅ Other Firebase and payment gateway variables

### 3. Code Changes - Completed ✅
- ✅ Fixed all OAuth redirect URLs in SignIn.tsx (2 occurrences)
- ✅ Fixed all OAuth redirect URLs in SignUpIntegrated.tsx (2 occurrences)
- ✅ Updated local .env file with correct variables
- ✅ Verified no hardcoded OAuth URLs remain

---

## 🚀 Deployment Steps (Your Action Items)

### Step 1: Deploy Backend to Railway
1. Push your latest code to your Railway-connected repository
2. Go to Railway Dashboard → Your Project
3. Add/verify environment variables from `RAILWAY_ENV_VARIABLES.txt`
4. Ensure the backend is deployed and running at `https://api.veefore.com`

### Step 2: Update Google Cloud Console 🔴 CRITICAL
**This is required before OAuth will work!**

1. Go to: https://console.cloud.google.com/apis/credentials
2. Select your project (should match your GOOGLE_CLIENT_ID)
3. Click on your OAuth 2.0 Client ID
4. Under **Authorized redirect URIs**, add:
   ```
   https://api.veefore.com/api/auth/google/callback
   https://app.veefore.com/api/auth/google/callback
   ```
5. Remove any old redirect URIs pointing to:
   - `www.veefore.com/...`
   - `veefore.com/signup/auth/...`
   - Any other incorrect URLs
6. Click **Save**

### Step 3: Deploy Frontend to Vercel
1. Push your latest code to your Vercel-connected repository
2. Go to Vercel Dashboard → Your Project → Settings → Environment Variables
3. Add/verify environment variables from `VERCEL_ENV_VARIABLES.txt`
4. Redeploy your frontend

### Step 4: Test the OAuth Flow
1. Go to `https://veefore.com/signin`
2. Click "Continue with Google"
3. **Expected behavior:**
   - Should redirect to: `https://api.veefore.com/api/auth/google/start`
   - Should show Google login screen
   - After login, should redirect to: `https://veefore.com/?auth=success`
4. Check that you're logged in successfully

### Step 5: Test Development Environment
1. Go to `https://app.veefore.com/signin`
2. Click "Continue with Google"
3. **Expected behavior:**
   - Should redirect to: `https://app.veefore.com/api/auth/google/start`
   - Should work the same as production

---

## 🔍 Troubleshooting

### Issue: "Page Not Found" on OAuth redirect
**Cause:** Google Cloud Console redirect URIs not updated
**Fix:** Complete Step 2 above

### Issue: "redirect_uri_mismatch" error from Google
**Cause:** The redirect URI in Google Cloud Console doesn't match the one your backend is using
**Fix:** 
1. Check the error message for the exact URI Google is receiving
2. Add that exact URI to Google Cloud Console
3. Ensure it matches `OAUTH_CALLBACK_URL` in Railway

### Issue: OAuth works in development but not production
**Cause:** Vercel environment variables not set correctly
**Fix:** 
1. Verify `VITE_API_BASE_URL=https://api.veefore.com` in Vercel
2. Verify `VITE_OAUTH_START_URL=https://api.veefore.com/api/auth/google/start` in Vercel
3. Redeploy frontend

### Issue: User gets logged in but data is not saved
**Cause:** Backend FRONTEND_URL or COOKIE_DOMAIN incorrect
**Fix:** Verify Railway environment variables:
- `FRONTEND_URL=https://veefore.com`
- `COOKIE_DOMAIN=.veefore.com` (note the leading dot)

---

## 📋 Quick Reference

### Environment Domains
| Environment | Frontend | Backend |
|------------|----------|---------|
| Development | `https://app.veefore.com` | `https://app.veefore.com` |
| Production | `https://veefore.com` | `https://api.veefore.com` |

### OAuth Endpoints
| Endpoint | URL (Production) | URL (Development) |
|----------|------------------|-------------------|
| Start OAuth | `https://api.veefore.com/api/auth/google/start` | `https://app.veefore.com/api/auth/google/start` |
| OAuth Callback | `https://api.veefore.com/api/auth/google/callback` | `https://app.veefore.com/api/auth/google/callback` |

### Key Files
- `RAILWAY_ENV_VARIABLES.txt` - Backend environment variables
- `VERCEL_ENV_VARIABLES.txt` - Frontend environment variables
- `OAUTH_DEPLOYMENT_GUIDE.md` - Complete OAuth implementation guide
- `OAUTH_FRONTEND_FIX.md` - Frontend fix documentation

---

## ✅ Ready to Deploy
All code changes are complete. Follow the deployment steps above to make OAuth work in production!
