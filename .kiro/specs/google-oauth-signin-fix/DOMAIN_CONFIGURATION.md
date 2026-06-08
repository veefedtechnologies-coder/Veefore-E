# Google OAuth Domain Configuration

## ✅ Configuration Updated

Your Firebase OAuth configuration has been updated to use the correct production domain.

---

## 🌐 Domain Usage

### Production
- **Domain**: `veefore.com`
- **OAuth Redirect**: `https://veefore.com/__/auth/handler`
- **Used for**: All production traffic

### Development/Local
- **Domain**: `app.veefore.com` or `localhost`
- **OAuth Redirect**: `https://app.veefore.com/__/auth/handler` or `http://localhost:5173/__/auth/handler`
- **Used for**: Local development and testing only

---

## 📝 Changes Made

### File: `client/src/lib/firebase.ts`

**Updated `getAuthDomain()` function**:

```typescript
const getAuthDomain = () => {
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    
    // Production: Always use veefore.com (not app.veefore.com)
    if (hostname === 'veefore.com') {
      return 'veefore.com';
    }
    
    // Development/Local: Use app.veefore.com or localhost
    if (hostname === 'app.veefore.com' || hostname === 'localhost') {
      return hostname;
    }
  }
  
  // Fallback for SSR or unknown environments
  return 'veefore-b84c8.firebaseapp.com';
}
```

**What this does**:
- ✅ Production (`veefore.com`) → Uses `veefore.com` as authDomain
- ✅ Development (`app.veefore.com`) → Uses `app.veefore.com` as authDomain
- ✅ Local (`localhost`) → Uses `localhost` as authDomain
- ✅ Unknown → Falls back to Firebase default

---

## 🔧 Required Google Cloud Console Configuration

### Authorized JavaScript Origins
```
https://veefore.com               ← PRODUCTION (REQUIRED)
https://app.veefore.com           ← Dev/Local only
http://localhost:5173             ← Local development
```

### Authorized Redirect URIs
```
https://veefore.com/__/auth/handler                ← PRODUCTION (REQUIRED)
https://veefore-b84c8.firebaseapp.com/__/auth/handler
https://app.veefore.com/__/auth/handler            ← Dev/Local only
http://localhost:5173/__/auth/handler              ← Local development
```

---

## 🔧 Required Firebase Console Configuration

### Project Settings → Authorized Domains
```
veefore.com                       ← PRODUCTION (REQUIRED)
app.veefore.com                   ← Dev/Local only
localhost                         ← Local development
```

---

## ✅ Configuration Steps

1. **Google Cloud Console**
   - Go to: https://console.cloud.google.com/apis/credentials
   - Select your OAuth 2.0 Client
   - Add the JavaScript origins above
   - Add the redirect URIs above
   - Save

2. **Firebase Console**
   - Go to: https://console.firebase.google.com/
   - Project Settings → Authorized domains
   - Ensure `veefore.com` is listed (primary)
   - Ensure `app.veefore.com` is listed (dev/local)
   - Save

3. **Deploy**
   - Commit the `firebase.ts` changes
   - Deploy to production
   - Test OAuth flow

---

## 🧪 Testing

### Test Production OAuth
1. Open: `https://veefore.com`
2. Click "Continue with Google"
3. Console should show: `🔧 Using authDomain: veefore.com`
4. OAuth should redirect to: `https://veefore.com/__/auth/handler`
5. Should successfully sign in

### Test Development OAuth
1. Open: `http://localhost:5173`
2. Click "Continue with Google"
3. Console should show: `🔧 Using authDomain: localhost`
4. OAuth should work locally

---

## 🎯 Expected Behavior

### Production (veefore.com)
```
User clicks "Continue with Google"
    ↓
Redirect to: accounts.google.com/o/oauth2/auth?...
    ↓
User signs in with Google
    ↓
Google redirects to: https://veefore.com/__/auth/handler
    ↓
Firebase processes OAuth
    ↓
Firebase redirects to: https://veefore.com/signin (or current page)
    ↓
getRedirectResult() processes auth
    ↓
Call backend: /api/auth/link-firebase
    ↓
Success: Redirect to dashboard
```

### Development (app.veefore.com or localhost)
```
Same flow as production, but using:
- https://app.veefore.com/__/auth/handler OR
- http://localhost:5173/__/auth/handler
```

---

## 🔍 Verification

### Check Browser Console
After clicking "Continue with Google", you should see:

**Production**:
```
🌐 Current domain: veefore.com
🔧 Using authDomain: veefore.com
```

**Development (app.veefore.com)**:
```
🌐 Current domain: app.veefore.com
🔧 Using authDomain: app.veefore.com
```

**Local**:
```
🌐 Current domain: localhost
🔧 Using authDomain: localhost
```

---

## ⚠️ Important Notes

1. **Production domain is `veefore.com`**
   - NOT `app.veefore.com`
   - This is now hardcoded in the configuration

2. **`app.veefore.com` is for development only**
   - Used for local testing with a production-like domain
   - OAuth will work but uses separate redirect URI

3. **Changes require deployment**
   - The `firebase.ts` file must be deployed to production
   - Old cached versions might use old domain logic

4. **Google Cloud Console changes take 5-10 minutes**
   - After updating redirect URIs, wait before testing
   - Changes need to propagate through Google's systems

---

## 🆘 Troubleshooting

### Issue: OAuth still tries to use app.veefore.com
**Cause**: Old code is cached  
**Solution**: 
- Clear browser cache
- Hard refresh (Ctrl+Shift+R / Cmd+Shift+R)
- Deploy updated `firebase.ts` to production

### Issue: redirect_uri_mismatch error
**Cause**: Google Cloud Console doesn't have `veefore.com` redirect URI  
**Solution**: 
- Add `https://veefore.com/__/auth/handler` to Google Cloud Console
- Wait 5-10 minutes for propagation
- Try again

### Issue: OAuth works in dev but not production
**Cause**: Production redirect URI not configured  
**Solution**:
- Verify `https://veefore.com/__/auth/handler` is in Google Cloud Console
- Verify `veefore.com` is in Firebase authorized domains
- Check browser console for actual authDomain being used

---

## 📊 Summary

| Environment | Domain | authDomain | Redirect URI |
|-------------|--------|------------|--------------|
| **Production** | `veefore.com` | `veefore.com` | `https://veefore.com/__/auth/handler` |
| **Development** | `app.veefore.com` | `app.veefore.com` | `https://app.veefore.com/__/auth/handler` |
| **Local** | `localhost` | `localhost` | `http://localhost:5173/__/auth/handler` |

---

**Last Updated**: Domain configuration finalized  
**Production Domain**: `veefore.com` (confirmed)  
**Development Domain**: `app.veefore.com` (dev/local only)
