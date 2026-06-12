# Authentication Debug Guide

## Current Issues

### Development: Infinite Loop
**Symptom**: App keeps showing loading then authenticated app in a loop

**Root Cause**: The `onAuthStateChanged` listener is being triggered repeatedly, possibly because:
1. React component re-renders are causing cleanup and re-setup
2. State updates are triggering new renders
3. Firebase is detecting auth state changes in a loop

**Latest Fix**: Added absolute guards with refs to prevent re-initialization

### Production: Session Not Fetched
**Symptom**: After OAuth signin, user is redirected to landing page instead of dashboard

**Root Cause**: One or more of:
1. Cookie not being set correctly in production (domain mismatch)
2. Cookie not being sent with session API request (CORS/credentials issue)
3. Frontend calling wrong API endpoint
4. Backend session endpoint not accessible in production

## Debug Steps for Production

### 1. Check Cookie in Browser
Open DevTools → Application → Cookies → `https://app.veefore.com`
- Look for `auth_token` cookie
- Check its domain: should be `.app.veefore.com` or `app.veefore.com`
- Check Secure flag: should be `true` in production
- Check HttpOnly: should be `true`
- Check SameSite: should be `Lax`

### 2. Check Network Request
Open DevTools → Network tab → filter by "session"
- Look for request to `/api/auth/session`
- Check if cookie is being sent (Request Headers → Cookie)
- Check response status and body

### 3. Check Server Logs
Look for:
```
[GET /api/auth/session] Endpoint hit
[GET /api/auth/session] Cookie header: ...
[GET /api/auth/session] auth_token found
```

If you don't see these logs, the request isn't reaching the server.

### 4. Common Production Issues

#### Issue: Cookie Domain Mismatch
- **Symptom**: Cookie shows in DevTools but isn't sent with requests
- **Fix**: Ensure `COOKIE_DOMAIN` matches your actual domain
- **Current**: `COOKIE_DOMAIN=app.veefore.com`
- **Note**: Don't include protocol (https://)

#### Issue: CORS Credentials
- **Symptom**: Cookie exists but isn't sent cross-origin
- **Fix**: Ensure `credentials: 'include'` in fetch and CORS allows credentials
- **Check**: Server CORS config must have `credentials: true`

#### Issue: Mixed Content (HTTP/HTTPS)
- **Symptom**: Secure cookie not sent on HTTP requests
- **Fix**: Ensure all requests use HTTPS in production
- **Check**: `FRONTEND_URL` and `BASE_URL` must start with `https://`

## Current Configuration

### Environment Variables (Production)
```
NODE_ENV=production
FRONTEND_URL=https://app.veefore.com
BASE_URL=https://app.veefore.com
COOKIE_DOMAIN=app.veefore.com
```

### Cookie Configuration
```typescript
{
  httpOnly: true,
  secure: true,  // in production
  sameSite: 'lax',
  path: '/',
  maxAge: 30 * 24 * 60 * 60 * 1000,  // 30 days
  domain: 'app.veefore.com'  // in production
}
```

### API Endpoints
- OAuth callback sets cookie: `POST /api/auth/google/callback`
- Email signin sets cookie: `POST /api/auth/signin`
- Session exchange: `GET /api/auth/session`

## Testing Checklist

### Development
- [ ] Sign in with email/password → no loop
- [ ] Sign in with Google OAuth → no loop  
- [ ] Page refresh maintains auth → no loop
- [ ] Console shows "Initializing (ONCE)" only once

### Production
- [ ] Sign in with email/password → redirects to dashboard
- [ ] Sign in with Google OAuth → redirects to dashboard
- [ ] Check `auth_token` cookie exists
- [ ] Check `/api/auth/session` request succeeds (200)
- [ ] Page refresh maintains authentication
- [ ] No CORS errors in console
- [ ] Cookie is sent with session request

## Next Steps

If production still fails after fixes:
1. Share browser DevTools Network tab screenshot showing `/api/auth/session` request
2. Share Application → Cookies screenshot
3. Share server logs from Railway showing the session endpoint being called (or not)
4. Check if Railway env variables match .env file
