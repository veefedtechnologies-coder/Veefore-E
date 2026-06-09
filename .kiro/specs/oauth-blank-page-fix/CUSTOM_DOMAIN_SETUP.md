# Using Custom Domain (veefore.com) for Firebase OAuth

## Overview

This guide explains how to use your custom domain (`veefore.com`) with Firebase OAuth **without** requiring a proxy chain that causes blank page issues.

## The Solution: Firebase Authorized Domains

Firebase supports custom domains for OAuth redirect flows when the domain is added to the **Authorized Domains** list in Firebase Console. This allows `signInWithRedirect` to work directly with your custom domain.

---

## Step-by-Step Setup

### Step 1: Add Custom Domain to Firebase Console

1. **Open Firebase Console**
   - Go to: https://console.firebase.google.com/
   
2. **Select Your Project**
   - Click on: **veefore-b84c8**
   
3. **Navigate to Authentication Settings**
   - Left sidebar: Click **Authentication**
   - Top tabs: Click **Settings**
   - Scroll down to: **Authorized domains** section
   
4. **Add Your Custom Domain**
   - Click the **Add domain** button
   - Enter: `veefore.com`
   - Click **Add**
   
5. **Verify Domain is Added**
   - You should see `veefore.com` in the list alongside:
     - `localhost`
     - `veefore-b84c8.firebaseapp.com`
     - `veefore-b84c8.web.app`

### Step 2: Update Firebase Configuration (Already Done)

The code has been updated to use `veefore.com` as the authDomain:

```typescript
const getAuthDomain = () => {
  if (typeof window === 'undefined') {
    return 'veefore.com';
  }
  
  const hostname = window.location.hostname;
  
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return 'localhost';
  }
  
  return 'veefore.com';
}
```

### Step 3: Deploy and Test

1. **Commit and Push Changes**
   ```bash
   git add client/src/lib/firebase.ts
   git commit -m "feat: use custom domain (veefore.com) for Firebase OAuth"
   git push origin main
   ```

2. **Deploy to Vercel**
   - Vercel will automatically deploy from main branch
   - Or manually deploy: `vercel --prod`

3. **Test OAuth Flow**
   - Go to: https://veefore.com/signin
   - Click "Continue with Google"
   - Expected: Redirect to Google consent screen showing "veefore.com"
   - After approval: Redirect back to veefore.com with successful sign-in

---

## How It Works

### Before (With Proxy - Caused Blank Page)

```
User clicks "Continue with Google"
  ↓
veefore.com/signin
  ↓
Vercel rewrite: /__/auth/* → Railway
  ↓
Railway proxy → Firebase
  ↓
Browser blocks iframe (CSP violation)
  ↓
BLANK PAGE ❌
```

### After (With Authorized Domain - No Proxy)

```
User clicks "Continue with Google"
  ↓
veefore.com/signin
  ↓
signInWithRedirect(googleProvider)
  ↓
Full-page redirect to Google
  ↓
User approves permissions
  ↓
Google redirects to: veefore.com/__/auth/handler
  ↓
Firebase handles OAuth callback directly
  ↓
Redirect back to: veefore.com/signin
  ↓
getRedirectResult() retrieves credential
  ↓
User is signed in ✅
```

### Key Difference

- **No Vercel rewrite needed** - OAuth goes directly to Firebase
- **No Railway proxy needed** - Firebase handles callbacks on custom domain
- **No CSP violations** - Full-page redirect (not iframe)
- **User sees custom domain** - Better branding and UX

---

## Benefits of Using Custom Domain

1. **Better Branding**
   - Google consent screen shows "veefore.com" instead of "veefore-b84c8.firebaseapp.com"
   - More professional and trustworthy appearance

2. **Consistent User Experience**
   - User stays on veefore.com throughout the OAuth flow
   - No confusing domain switches

3. **Simpler Architecture**
   - No proxy chain to maintain
   - Fewer potential points of failure
   - Direct Firebase communication

4. **Improved Security**
   - No additional proxy servers handling OAuth credentials
   - Reduced attack surface

---

## Important Notes

### Requirement: Domain Must Be Authorized

⚠️ **CRITICAL**: The custom domain MUST be added to Firebase Console → Authentication → Authorized domains **BEFORE** deploying this change. Otherwise, Firebase will reject the OAuth redirect and users will see an error.

### Verifying Authorization

To verify your domain is authorized:

1. Go to Firebase Console
2. Authentication → Settings → Authorized domains
3. Confirm `veefore.com` is in the list

If not present, OAuth will fail with error:
```
Error: This domain is not authorized for OAuth operations for your Firebase project.
Add veefore.com to the list of authorized domains in Firebase Console.
```

### Testing After Setup

Manual testing checklist:

- [ ] Custom domain added to Firebase authorized domains
- [ ] Code deployed to production (Vercel)
- [ ] Navigate to https://veefore.com/signin
- [ ] Click "Continue with Google"
- [ ] Verify Google consent screen shows "veefore.com"
- [ ] Complete OAuth flow
- [ ] Verify successful sign-in
- [ ] Check browser console for errors (should be none)

---

## Rollback Plan

If OAuth doesn't work with custom domain:

1. **Revert to Firebase Hosted Domain**
   ```typescript
   return 'veefore-b84c8.firebaseapp.com';
   ```

2. **Redeploy**
   ```bash
   git add client/src/lib/firebase.ts
   git commit -m "revert: use Firebase hosted domain for OAuth"
   git push origin main
   ```

3. **Verify OAuth works with Firebase domain**

4. **Investigate why custom domain failed**
   - Check Firebase Console for domain authorization
   - Verify domain spelling matches exactly
   - Check Firebase project settings

---

## Troubleshooting

### Issue: "Domain not authorized" Error

**Cause**: Custom domain not added to Firebase authorized domains

**Solution**:
1. Go to Firebase Console → Authentication → Settings
2. Add `veefore.com` to authorized domains
3. Wait 1-2 minutes for changes to propagate
4. Retry OAuth flow

### Issue: OAuth Redirect Fails

**Cause**: DNS or domain configuration issue

**Solution**:
1. Verify `veefore.com` resolves correctly
2. Check Vercel domain settings
3. Ensure SSL certificate is valid
4. Test with `curl -I https://veefore.com`

### Issue: Still Seeing Blank Page

**Cause**: Browser cache or old code still deployed

**Solution**:
1. Clear browser cache completely
2. Open in incognito/private mode
3. Verify latest code is deployed (check Vercel dashboard)
4. Check console logs for authDomain value

---

## References

- [Firebase Authentication: Authorized Domains](https://firebase.google.com/docs/auth/web/redirect-best-practices#authorized_domains)
- [Firebase OAuth Configuration](https://firebase.google.com/docs/auth/web/google-signin)
- [Custom Domain Setup with Firebase](https://firebase.google.com/docs/hosting/custom-domain)

---

## Summary

✅ **Custom Domain**: veefore.com
✅ **No Proxy Needed**: Direct Firebase OAuth handling
✅ **Better UX**: Professional branding on OAuth screen
✅ **Simpler Architecture**: Removed proxy chain complexity
✅ **Security**: Direct Firebase communication

The key insight: Firebase supports custom domains for OAuth when they're added to the authorized domains list. This eliminates the need for proxying and provides a better user experience.
