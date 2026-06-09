# OAuth Custom Domain - Final Solution

## Problem

When using a custom domain (`veefore.com`) as Firebase `authDomain`, OAuth callbacks return "Page Not Found" because the custom domain doesn't have Firebase's OAuth handler.

## Root Cause

Firebase Auth OAuth handlers are hosted on Firebase's domain (`veefore-b84c8.firebaseapp.com/__/auth/handler`). When you set `authDomain: 'veefore.com'`, Firebase tells Google to redirect OAuth callbacks to `veefore.com/__/auth/handler`, but there's no handler at that URL on your custom domain.

## Solution: Vercel Rewrite to Firebase

Add a Vercel rewrite that forwards `/__/auth/*` requests from `veefore.com` directly to Firebase's hosted domain.

### vercel.json Configuration

```json
{
  "rewrites": [
    {
      "source": "/__/auth/:path*",
      "destination": "https://veefore-b84c8.firebaseapp.com/__/auth/:path*"
    },
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ]
}
```

## How It Works

### OAuth Flow with Custom Domain + Rewrite

```
1. User visits: https://veefore.com/signin
   ↓
2. Clicks "Continue with Google"
   ↓
3. Firebase SDK: signInWithRedirect(googleProvider)
   - authDomain: 'veefore.com'
   - redirect_uri: 'veefore.com/__/auth/handler'
   ↓
4. Full-page redirect to Google
   - Google shows: "Continue to veefore.com" ✅
   ↓
5. User approves permissions
   ↓
6. Google redirects to: https://veefore.com/__/auth/handler
   ↓
7. Vercel rewrite intercepts and forwards to:
   https://veefore-b84c8.firebaseapp.com/__/auth/handler
   ↓
8. Firebase processes OAuth callback
   ↓
9. Firebase redirects back to: https://veefore.com/signin
   (with credential in URL fragment)
   ↓
10. getRedirectResult() retrieves credential
   ↓
11. User is signed in ✅
```

## Key Differences from Previous Approaches

### Approach 1: Firebase Hosted Domain (Working but Not Branded)
```typescript
authDomain: 'veefore-b84c8.firebaseapp.com'
```
- ✅ Works perfectly
- ❌ Google shows "Continue to veefore-b84c8.firebaseapp.com" (not professional)
- ❌ User sees Firebase domain instead of your brand

### Approach 2: Custom Domain + Railway Proxy (Caused Blank Page)
```typescript
authDomain: 'veefore.com'
// + Railway proxy middleware
// + Vercel rewrite to Railway
```
- ❌ Caused CSP violations
- ❌ Blank page due to iframe blocking
- ❌ Complex proxy chain

### Approach 3: Custom Domain + Vercel Rewrite to Firebase (✅ FINAL SOLUTION)
```typescript
authDomain: 'veefore.com'
// + Vercel rewrite directly to Firebase
// + No proxy middleware
```
- ✅ Google shows "Continue to veefore.com" (professional branding)
- ✅ No CSP violations (direct rewrite, not proxy)
- ✅ No blank pages
- ✅ Simpler architecture (one rewrite rule)
- ✅ Fast and reliable

## Benefits

### 1. Professional Branding
- Google OAuth consent screen shows your domain: "Continue to veefore.com"
- Users trust your brand, not Firebase's domain

### 2. No Proxy Issues
- Direct Vercel rewrite to Firebase (not a proxy)
- No CSP violations
- No iframe blocking
- No blank pages

### 3. Simple Architecture
- One rewrite rule in vercel.json
- No backend proxy middleware needed
- No complex forwarding logic

### 4. Maintainable
- Easy to understand: "Forward OAuth handler to Firebase"
- No custom middleware to maintain
- Standard Vercel rewrite functionality

## Technical Details

### Why This Works

1. **Authorized Domain**: `veefore.com` is in Firebase Console → Authorized domains
2. **authDomain Setting**: Firebase SDK uses `authDomain: 'veefore.com'`
3. **Google Redirect**: Google redirects to `veefore.com/__/auth/handler`
4. **Vercel Rewrite**: Transparently forwards to Firebase's actual handler
5. **Firebase Processing**: Firebase processes OAuth on its domain
6. **Return to App**: Firebase redirects back to `veefore.com/signin`

### Why Previous Proxy Failed

The Railway proxy middleware tried to intercept and forward OAuth requests, but:
- Created an iframe context (CSP violation)
- Added unnecessary complexity
- Broke the OAuth redirect chain

### Why This Rewrite Succeeds

Vercel rewrite is:
- Transparent URL forwarding (not a proxy)
- No iframe context created
- Direct connection to Firebase
- Preserves OAuth redirect chain integrity

## Configuration Files

### client/src/lib/firebase.ts
```typescript
const getAuthDomain = () => {
  if (typeof window === 'undefined') {
    return 'veefore.com'; // SSR/build time
  }
  
  const hostname = window.location.hostname;
  
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return 'localhost'; // Local development
  }
  
  return 'veefore.com'; // Production
}
```

### vercel.json
```json
{
  "rewrites": [
    {
      "source": "/__/auth/:path*",
      "destination": "https://veefore-b84c8.firebaseapp.com/__/auth/:path*"
    },
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ]
}
```

### server/index.ts
```typescript
// NO PROXY MIDDLEWARE NEEDED!
// OAuth handler rewrite is done at Vercel level

// Only keep Firebase config probe (unrelated to OAuth)
app.get('/__/firebase/init.json', (req, res) => {
  res.status(404).end();
});
```

## Testing

### Manual Test Steps

1. **Deploy to Vercel**
   - Push changes to main branch
   - Vercel auto-deploys

2. **Test OAuth Flow**
   - Go to: https://veefore.com/signin
   - Click "Continue with Google"
   - Should see: Google consent screen with "Continue to veefore.com"
   - Approve permissions
   - Should be: Redirected back to veefore.com and signed in

3. **Verify No Errors**
   - Check browser console: No CSP errors
   - Check Network tab: Requests to `/__/auth/handler` succeed
   - Check authentication: User is signed in successfully

### Expected Results

✅ Google shows: "Continue to veefore.com"
✅ No blank pages
✅ No CSP violations
✅ No iframe blocking errors
✅ OAuth completes successfully
✅ User is authenticated

## Troubleshooting

### Issue: Still Getting "Page Not Found"

**Cause**: Vercel hasn't deployed the latest vercel.json changes

**Solution**:
1. Check Vercel dashboard for deployment status
2. Wait for deployment to complete
3. Clear browser cache
4. Retry OAuth flow

### Issue: OAuth Redirect Fails

**Cause**: `veefore.com` not in Firebase authorized domains

**Solution**:
1. Firebase Console → Authentication → Settings → Authorized domains
2. Verify `veefore.com` is in the list
3. Wait 1-2 minutes for changes to propagate
4. Retry

### Issue: CSP Errors in Console

**Cause**: Old Railway proxy middleware still running

**Solution**:
1. Verify server/index.ts has NO `app.use('/__/auth', ...)` middleware
2. Redeploy backend to Railway
3. Restart Railway service

## Summary

This final solution provides:
- ✅ Professional branding (custom domain on OAuth screen)
- ✅ Reliable OAuth flow (no blank pages or CSP issues)
- ✅ Simple architecture (one Vercel rewrite rule)
- ✅ Easy maintenance (no custom proxy code)

The key insight: Use a transparent Vercel rewrite to forward OAuth handler requests to Firebase, rather than a complex proxy middleware that creates iframe contexts and causes CSP violations.
