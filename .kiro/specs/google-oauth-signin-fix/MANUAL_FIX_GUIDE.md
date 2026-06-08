# Google OAuth Sign-In - Manual Fix Guide

## Problem
Google OAuth shows "Signing in..." then navigates to "page not found" in production.

## Root Cause
OAuth redirect URL misconfiguration between Firebase Console, Google Cloud Console, and your production application.

---

## Step 1: Check Your Production Domain

Your production app uses: **`https://veefore.com`** (NOT app.veefore.com)

- ✅ Production: `veefore.com`
- ✅ Development/Local: `app.veefore.com` or `localhost`

✅ **Action**: Verify your production site is deployed at `veefore.com`

---

## Step 2: Firebase Console Configuration

### 2.1 Open Firebase Console
1. Go to: https://console.firebase.google.com/
2. Select project: **`veefore-b84c8`**
3. Click ⚙️ (Settings) → **Project settings**

### 2.2 Check Authorized Domains
1. Scroll to **"Authorized domains"** section
2. Verify these domains are listed:
   - ✅ `veefore.com` (PRODUCTION - REQUIRED)
   - ✅ `app.veefore.com` (for local/dev testing only)
   - ✅ `localhost` (for development)

**If missing**: Click **"Add domain"** and add the required domains

**Note**: `veefore.com` is your production domain. `app.veefore.com` is only for development/testing.

### 2.3 Verify OAuth Configuration
1. In Firebase Console sidebar, click **"Authentication"**
2. Click **"Sign-in method"** tab
3. Find **"Google"** provider
4. Ensure status is **"Enabled"**
5. Click on "Google" to edit

### 2.4 Critical: Check OAuth Redirect URIs
Firebase automatically configures these redirect URIs:
- `https://veefore-b84c8.firebaseapp.com/__/auth/handler`
- `https://veefore.com/__/auth/handler` (PRODUCTION - REQUIRED)
- `https://app.veefore.com/__/auth/handler` (dev/local only)

✅ **What you need**: The `https://veefore.com/__/auth/handler` URI must be present for production

---

## Step 3: Google Cloud Console OAuth Configuration

### 3.1 Find Your OAuth Client ID
From Firebase Console (Authentication → Sign-in method → Google):
- Note down the **"Web client ID"** (looks like: `xxxxx.apps.googleusercontent.com`)
- Note down the **"Web client secret"**

### 3.2 Open Google Cloud Console
1. Go to: https://console.cloud.google.com/
2. Select project: **`veefore-b84c8`** (or the project linked to Firebase)
3. Navigate to: **"APIs & Services"** → **"Credentials"**

### 3.3 Find Your OAuth 2.0 Client
1. Under **"OAuth 2.0 Client IDs"**, find the one matching your Web client ID from Firebase
2. Click on it to edit

### 3.4 Configure Authorized JavaScript Origins
Add these origins:
```
https://veefore.com
https://app.veefore.com
http://localhost:5173
```

**Note**: `veefore.com` is for production, `app.veefore.com` is for dev/local testing only.

### 3.5 Configure Authorized Redirect URIs
**THIS IS CRITICAL** - Add these EXACT URIs:
```
https://veefore.com/__/auth/handler
https://veefore-b84c8.firebaseapp.com/__/auth/handler
https://app.veefore.com/__/auth/handler
http://localhost:5173/__/auth/handler
```

⚠️ **Important**: 
- `https://veefore.com/__/auth/handler` is REQUIRED for production
- `app.veefore.com` is only for dev/local testing
- URIs must be EXACT (no trailing slashes)
- Must use `https://` for production
- Must match what Firebase expects

### 3.6 Save Configuration
1. Click **"Save"** at the bottom
2. Wait 5-10 minutes for changes to propagate

---

## Step 4: Verify Environment Variables

Check your production environment (Vercel/Railway) has these variables:

```bash
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_PROJECT_ID=veefore-b84c8
VITE_FIREBASE_APP_ID=your_app_id
```

✅ **Action**: Open your deployment platform (Vercel/Railway) and verify these are set

---

## Step 5: Test Configuration

### 5.1 Local Test Script
Create this test file: `.kiro/specs/google-oauth-signin-fix/test-oauth-config.html`

```html
<!DOCTYPE html>
<html>
<head>
  <title>OAuth Test</title>
</head>
<body>
  <h1>Google OAuth Configuration Test</h1>
  <p>Current Domain: <span id="domain"></span></p>
  <p>Expected Redirect URI: <span id="redirect"></span></p>
  
  <h2>Checklist:</h2>
  <ul>
    <li>✅ Firebase Console → Authorized domains includes this domain</li>
    <li>✅ Google Cloud Console → Authorized redirect URIs includes the URI below</li>
    <li>✅ Production environment variables are set</li>
  </ul>
  
  <script>
    const domain = window.location.origin;
    const redirectUri = `${domain}/__/auth/handler`;
    document.getElementById('domain').textContent = domain;
    document.getElementById('redirect').textContent = redirectUri;
    
    console.log('Test your configuration:');
    console.log('1. Domain:', domain);
    console.log('2. Expected redirect URI:', redirectUri);
    console.log('3. Check if this URI is in Google Cloud Console → Credentials → Your OAuth Client');
  </script>
</body>
</html>
```

### 5.2 Production Test
1. Deploy your application
2. Open production site: `https://veefore.com` (or your domain)
3. Open browser DevTools (F12) → Console tab
4. Click "Continue with Google"
5. Watch the console for errors

**Expected flow**:
1. Redirect to Google sign-in
2. Redirect back to `https://veefore.com/__/auth/handler`
3. Redirect back to sign-in page
4. Console shows: `[AUTH] Redirect result found, processing...`

**If you see**:
- ❌ `redirect_uri_mismatch` error → Check Step 3.5 (Authorized Redirect URIs)
- ❌ `origin_mismatch` error → Check Step 3.4 (Authorized JavaScript Origins)
- ❌ Page not found → Check Step 6 below

---

## Step 6: Fix Client-Side Error Handling (If Needed)

If OAuth succeeds but shows "page not found" after returning:

### 6.1 The Issue
In `client/src/pages/SignIn.tsx` line 221, this code might navigate away:
```typescript
window.history.replaceState({}, document.title, window.location.pathname)
```

### 6.2 The Fix
The code should preserve the sign-in page URL. Current implementation is correct, but verify the sign-in page route is properly configured.

### 6.3 Check Routes
In your React router configuration, ensure these routes exist:
- `/signin` or `/sign-in` → SignIn component
- `/` → Home/Dashboard (requires authentication)

---

## Step 7: Common Issues & Solutions

### Issue: "redirect_uri_mismatch"
**Cause**: Redirect URI in Google Cloud Console doesn't match what Firebase sends  
**Solution**: 
1. Copy the EXACT redirect URI from the error message
2. Add it to Google Cloud Console → Credentials → Your OAuth Client → Authorized redirect URIs
3. Save and wait 5-10 minutes

### Issue: "origin_mismatch"
**Cause**: JavaScript origin not authorized  
**Solution**: Add your production domain to "Authorized JavaScript origins" in Step 3.4

### Issue: OAuth succeeds but shows "page not found"
**Cause**: Early access validation failed (user not on waitlist)  
**Solution**: 
1. Check server logs for: `[EARLY ACCESS] Access denied for {email}`
2. Verify user email in your waitlist database
3. Ensure status is `early_access` (not `pending`, `waitlisted`, or `rejected`)

### Issue: Stuck on "Signing in..." forever
**Cause**: OAuth redirect completed but `getRedirectResult` not processing  
**Solution**:
1. Check browser console for JavaScript errors
2. Verify Firebase SDK loaded correctly
3. Check network tab for failed `/api/auth/link-firebase` requests

---

## Step 8: Verify the Fix

### 8.1 Test with Approved Email
1. Ensure test email has `status: 'early_access'` in waitlist database
2. Clear browser cache and cookies
3. Go to production sign-in page
4. Click "Continue with Google"
5. Sign in with approved email
6. Should redirect to dashboard (or onboarding if new user)

### 8.2 Test with Unapproved Email
1. Use email NOT on waitlist
2. Click "Continue with Google"
3. Should show error: "🚫 Access Denied - This email isn't registered for early access"
4. Should stay on sign-in page (NOT "page not found")

---

## Verification Checklist

After completing all steps, verify:

- [ ] Firebase Console → Authorized domains includes production domain
- [ ] Firebase Console → Google sign-in is enabled
- [ ] Google Cloud Console → Authorized JavaScript origins includes production domain
- [ ] Google Cloud Console → Authorized redirect URIs includes `https://your-domain/__/auth/handler`
- [ ] Production environment variables are set (VITE_FIREBASE_*)
- [ ] OAuth works with approved early access email
- [ ] OAuth shows clear error (not "page not found") with unapproved email
- [ ] No stuck "Signing in..." state

---

## Quick Reference: Required URLs

**Production Domain**: `veefore.com` (NOT app.veefore.com)

**Firebase Authorized Domains**:
- `veefore.com` (PRODUCTION)
- `app.veefore.com` (dev/local only)

**Google Cloud Authorized JavaScript Origins**:
- `https://veefore.com` (PRODUCTION)
- `https://app.veefore.com` (dev/local only)

**Google Cloud Authorized Redirect URIs**:
- `https://veefore.com/__/auth/handler` (PRODUCTION - REQUIRED)
- `https://veefore-b84c8.firebaseapp.com/__/auth/handler`
- `https://app.veefore.com/__/auth/handler` (dev/local only)

---

## Need Help?

If you're still stuck after following this guide:

1. **Check server logs** in your deployment platform for `[EARLY ACCESS]` and `[AUTH]` messages
2. **Check browser console** for JavaScript errors during OAuth flow
3. **Check network tab** for failed API requests to `/api/auth/link-firebase`
4. **Test the endpoint directly**:
   ```bash
   curl https://veefore.com/api/auth/check-early-access \
     -X POST \
     -H "Content-Type: application/json" \
     -d '{"email":"your-test-email@example.com"}'
   ```

5. **Share the following debugging info**:
   - Browser console errors (screenshot)
   - Network tab showing OAuth redirect flow
   - Server logs during OAuth attempt
   - Response from the curl command above

---

## Next Steps After Fix

Once OAuth is working:

1. **Test thoroughly** with multiple email addresses (approved and unapproved)
2. **Document the configuration** in your team wiki
3. **Add automated tests** to prevent regression
4. **Consider adding** a health check endpoint that verifies OAuth configuration

---

**Last Updated**: Based on investigation of production issue (2024)
**Files Referenced**:
- `client/src/lib/firebase.ts` (Firebase configuration)
- `client/src/pages/SignIn.tsx` (OAuth implementation)
- `server/controllers/AuthController.ts` (Early access validation)
- `server/routes/v1/auth.routes.ts` (API endpoints)
