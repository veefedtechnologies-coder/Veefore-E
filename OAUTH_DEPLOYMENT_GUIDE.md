# OAuth 2.0 Server-Side Deployment Guide

## 🚨 Current Issue

**Problem**: "Page Not Found" error when clicking "Continue with Google"

**Root Cause**: Frontend is redirecting to `https://www.veefore.com/signup/auth/googlestart` instead of the correct backend OAuth endpoint.

---

## ✅ Correct Production Configuration

### **Architecture**
- **Frontend (Vercel)**: `https://veefore.com`
- **Backend API (Railway)**: `https://api.veefore.com`
- **OAuth Flow**: User clicks button → Backend initiates OAuth → Google → Backend callback → Frontend redirect

---

## 📋 Step-by-Step Fix

### **1. Update Railway Environment Variables**

Add these variables in Railway Dashboard:

```bash
# OAuth Configuration
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret
OAUTH_CALLBACK_URL=https://api.veefore.com/api/auth/google/callback
FRONTEND_URL=https://veefore.com
COOKIE_DOMAIN=.veefore.com
SESSION_SECRET=your-session-secret-here

# Firebase Service Account (Already in RAILWAY_ENV_VARIABLES.txt)
FIREBASE_SERVICE_ACCOUNT_KEY={"type":"service_account","project_id":"veefore-8433",...}
```

**Note:** Get your actual GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET from Google Cloud Console at https://console.cloud.google.com/apis/credentials

### **2. Update Vercel Environment Variables**

Add these variables in Vercel Dashboard:

```bash
VITE_APP_URL=https://veefore.com
VITE_API_BASE_URL=https://api.veefore.com
VITE_OAUTH_START_URL=https://api.veefore.com/api/auth/google/start

# Firebase Frontend Config
VITE_FIREBASE_API_KEY=AIzaSyB83z17nqQvXq8-gLSU0E7cSgjMnlkzznI
VITE_FIREBASE_APP_ID=1:977021132015:web:173d3088f4ba7bac960f1a
VITE_FIREBASE_PROJECT_ID=veefore-8433
```

### **3. Fix Frontend "Continue with Google" Button**

Your frontend button should redirect to the backend OAuth start endpoint:

```typescript
// CORRECT - Redirect to backend OAuth endpoint
const handleGoogleSignIn = () => {
  window.location.href = import.meta.env.VITE_OAUTH_START_URL || 'https://api.veefore.com/api/auth/google/start'
}

// Or use direct link
<a href={`${import.meta.env.VITE_API_BASE_URL}/api/auth/google/start`}>
  Continue with Google
</a>
```

**❌ INCORRECT** (what's currently happening):
```typescript
// This creates a frontend route that doesn't exist
<a href="/signup/auth/googlestart">Continue with Google</a>
```

### **4. Update Google Cloud Console**

Add this **Authorized redirect URI** in [Google Cloud Console](https://console.cloud.google.com/apis/credentials):

```
https://api.veefore.com/api/auth/google/callback
```

**Remove** any old redirect URIs pointing to:
- ❌ `https://app.veefore.com/...`
- ❌ `https://www.veefore.com/...`
- ❌ `https://veefore.com/...`

---

## 🔄 OAuth Flow Diagram

```
1. User clicks "Continue with Google" on veefore.com
   ↓
2. Frontend redirects to: https://api.veefore.com/api/auth/google/start
   ↓
3. Railway backend:
   - Generates state parameter (CSRF protection)
   - Generates PKCE code_verifier and code_challenge
   - Stores in session (10-minute TTL)
   - Redirects user to Google OAuth
   ↓
4. User authenticates with Google
   ↓
5. Google redirects to: https://api.veefore.com/api/auth/google/callback?code=xxx&state=yyy
   ↓
6. Railway backend:
   - Validates state parameter
   - Exchanges code for tokens (with PKCE)
   - Gets user info from Google
   - Creates/updates user in MongoDB
   - Creates Firebase custom token
   - Sets auth_token cookie (domain=.veefore.com)
   - Redirects to: https://veefore.com/?oauth_success=true
   ↓
7. Frontend receives auth_token cookie and user is authenticated
```

---

## 🧪 Testing Checklist

After deploying these changes:

1. **Verify Environment Variables**
   - [ ] Railway has all OAuth variables
   - [ ] Vercel has VITE_OAUTH_START_URL

2. **Test OAuth Flow**
   - [ ] Click "Continue with Google"
   - [ ] Should redirect to `https://api.veefore.com/api/auth/google/start`
   - [ ] NOT `https://www.veefore.com/signup/auth/googlestart`

3. **Verify Google Console**
   - [ ] Only `https://api.veefore.com/api/auth/google/callback` in Authorized redirect URIs
   - [ ] No old app.veefore.com URLs

4. **Test Complete Flow**
   - [ ] User can sign in
   - [ ] User redirected back to veefore.com
   - [ ] auth_token cookie set correctly
   - [ ] Firebase authentication works

---

## 📝 Environment Summary

### **Development (.env)**
```bash
OAUTH_CALLBACK_URL=https://app.veefore.com/api/auth/google/callback
FRONTEND_URL=https://app.veefore.com
COOKIE_DOMAIN=app.veefore.com
```

### **Production Railway**
```bash
OAUTH_CALLBACK_URL=https://api.veefore.com/api/auth/google/callback
FRONTEND_URL=https://veefore.com
COOKIE_DOMAIN=.veefore.com
```

### **Production Vercel**
```bash
VITE_API_BASE_URL=https://api.veefore.com
VITE_APP_URL=https://veefore.com
VITE_OAUTH_START_URL=https://api.veefore.com/api/auth/google/start
```

---

## 🆘 Troubleshooting

### Issue: "Page Not Found" on Google Sign-In
**Cause**: Frontend button points to wrong URL  
**Fix**: Update button to redirect to `${VITE_API_BASE_URL}/api/auth/google/start`

### Issue: "redirect_uri_mismatch" from Google
**Cause**: Google Console doesn't have correct redirect URI  
**Fix**: Add `https://api.veefore.com/api/auth/google/callback` to Google Console

### Issue: Cookie not set after OAuth
**Cause**: COOKIE_DOMAIN mismatch  
**Fix**: Set `COOKIE_DOMAIN=.veefore.com` in Railway (with leading dot for subdomain sharing)

### Issue: CORS error when calling OAuth endpoint
**Cause**: ALLOWED_ORIGINS doesn't include frontend  
**Fix**: Ensure Railway has `ALLOWED_ORIGINS=https://veefore.com,https://www.veefore.com`

---

## 📚 Related Files

- **Backend OAuth Routes**: `server/routes/auth.ts`
- **Token Exchange Service**: `server/services/oauth/TokenExchangeService.ts`
- **Firebase Token Service**: `server/services/oauth/FirebaseTokenService.ts`
- **Environment Files**:
  - `RAILWAY_ENV_VARIABLES.txt` (updated)
  - `VERCEL_ENV_VARIABLES.txt` (updated)
  - `.env` (development only)
