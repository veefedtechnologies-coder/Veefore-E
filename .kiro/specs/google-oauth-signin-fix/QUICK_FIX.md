# Google OAuth Sign-In - Quick Fix

## 🎯 Most Common Issue (95% of cases)

**Google Cloud Console doesn't have your production redirect URI configured.**

## ⚡ Quick Fix (5 minutes)

### Step 1: Go to Google Cloud Console
https://console.cloud.google.com/apis/credentials

### Step 2: Find Your OAuth Client
- Look for the Web client with your Firebase project name
- Click on it to edit

### Step 3: Add These Redirect URIs
```
https://veefore.com/__/auth/handler
https://veefore-b84c8.firebaseapp.com/__/auth/handler
https://app.veefore.com/__/auth/handler
```

**Note**: `veefore.com` is for PRODUCTION. `app.veefore.com` is for dev/local only.

### Step 4: Add These JavaScript Origins
```
https://veefore.com
https://app.veefore.com
```

**Note**: `veefore.com` is for PRODUCTION. `app.veefore.com` is for dev/local only.

### Step 5: Save & Wait
- Click "Save"
- Wait 5-10 minutes for changes to propagate

### Step 6: Test
- Open production site
- Click "Continue with Google"
- Should work now!

---

## 🔍 Still Not Working?

### Check Firebase Console
https://console.firebase.google.com/ → Project Settings → Authorized domains

**Must include**:
- `veefore.com` (PRODUCTION)
- `app.veefore.com` (dev/local only)

### Run Diagnostic Script
```bash
cd /Users/arpitchoudhary/Documents/Veefore_v4/Veefore-E
./.kiro/specs/google-oauth-signin-fix/diagnose-oauth.sh
```

### Check Server Logs
Look for these in your deployment platform (Railway/Vercel):
- `[EARLY ACCESS]` messages
- `[AUTH]` messages
- `linkFirebase` errors

---

## 📋 Common Error Messages

| Error | Cause | Fix |
|-------|-------|-----|
| `redirect_uri_mismatch` | Redirect URI not in Google Cloud Console | Add to Step 3 above |
| `origin_mismatch` | JavaScript origin not authorized | Add to Step 4 above |
| "Page not found" after OAuth | Early access validation failed | Check user is on waitlist with status `early_access` |
| Stuck on "Signing in..." | Firebase config issue | Check environment variables |

---

## 🆘 Need Full Guide?

See: `MANUAL_FIX_GUIDE.md` in this directory

---

## ✅ Quick Test

After configuration, test with:

1. **Approved user** (should sign in successfully):
   - Must be on waitlist with `status: 'early_access'`

2. **Unapproved user** (should show clear error, NOT "page not found"):
   - Should see: "🚫 Access Denied - This email isn't registered for early access"

---

## 🎓 What's Happening Under the Hood

```
User clicks "Continue with Google"
↓
Redirect to Google sign-in
↓
User approves
↓
Google redirects to: https://veefore.com/__/auth/handler
↓
Firebase handles OAuth callback
↓
Firebase redirects back to your app
↓
Your app calls: /api/auth/link-firebase
↓
Backend checks early access status
↓
If approved: redirect to dashboard
If denied: show error message
```

**The "page not found" error happens when**:
- Step 4 fails (redirect URI mismatch)
- Step 7 fails (early access validation)

---

**Last Updated**: 2024
