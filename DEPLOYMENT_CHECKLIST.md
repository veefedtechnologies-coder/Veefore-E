# Vercel & Railway Deployment Checklist

## ✅ Completed Steps

### 1. Environment Variables Prepared
- ✅ RAILWAY_ENV_VARIABLES.txt - Backend variables for Railway
- ✅ VERCEL_ENV_VARIABLES.txt - Frontend variables for Vercel

### 2. Build Configuration Fixed
- ✅ Updated root `package.json` `client:build` script
- ✅ Script now includes TypeScript compilation step
- ✅ Uses correct vite config (root `vite.client.config.ts`)
- ✅ Outputs to correct directory (`dist/public`)

### 3. Domain Configuration
- ✅ Frontend: `veefore.com` (Vercel)
- ✅ Backend: `api.veefore.com` (Railway)
- ✅ All environment variables use correct domains

---

## 🔄 Next Steps for Deployment

### Railway Backend Deployment

1. **Add Environment Variables to Railway**
   - Go to Railway Dashboard → Your Service → Variables tab
   - Copy ALL variables from `RAILWAY_ENV_VARIABLES.txt`
   - Add them one by one OR use the provided `railway-set-vars.sh` script
   
2. **Verify Railway Configuration**
   - Ensure PORT=8080 is set (required for custom domain)
   - Verify custom domain `api.veefore.com` points to your service
   - Check that target port in custom domain settings is 8080

3. **Deploy Backend**
   - Railway auto-deploys on git push
   - Or manually trigger deployment from Railway dashboard
   - Monitor deployment logs for errors

### Vercel Frontend Deployment

1. **Add Environment Variables to Vercel**
   - Go to Vercel Dashboard → Your Project → Settings → Environment Variables
   - Copy ALL variables from `VERCEL_ENV_VARIABLES.txt`
   - Add each variable for **Production**, **Preview**, and **Development** environments
   
2. **Verify Vercel Build Settings**
   - Go to Project Settings → General
   - **Production Overrides** (locked - cannot edit):
     - Build Command: `npm run client:build`
     - Output Directory: `dist/public`
   - This is now compatible with our updated build script ✅

3. **Commit and Push the Build Fix**
   ```bash
   git add package.json
   git commit -m "Fix Vercel build: add TypeScript compilation and use correct vite config"
   git push
   ```

4. **Monitor Vercel Deployment**
   - Vercel will auto-deploy after push
   - Watch build logs in Vercel dashboard
   - Look for any TypeScript errors or build failures

---

## 🔍 Verification Steps

### After Railway Deployment
```bash
# Test health endpoint
curl https://api.veefore.com/api/health

# Should return: {"status":"ok","timestamp":"..."}
```

### After Vercel Deployment
1. Visit `https://veefore.com`
2. Check browser console for errors
3. Test API connection (try login or any API call)
4. Verify environment variables are loaded (check Network tab)

---

## 🔄 Redis Optimization Rollback (Phase 4)

### Rate Limiting Algorithm Feature Flag

The application uses an optimized **fixed-window rate limiting algorithm** by default (2 Redis commands per request instead of 4). If issues arise, you can instantly rollback to the old **sliding-window algorithm** without code changes.

#### Rollback Procedure

**Method 1: Environment Variable (Recommended - NO CODE DEPLOY REQUIRED)**

1. **Set the rollback flag:**
   - Railway: Add environment variable `RATE_LIMIT_ALGORITHM=sliding-window`
   - Vercel: Add environment variable `RATE_LIMIT_ALGORITHM=sliding-window`
   
2. **Restart the application:**
   - Railway: Restart happens automatically when env var changes
   - Vercel: Redeploy or wait for auto-restart
   
3. **Verify rollback:**
   - Check server logs for: `📊 Rate Limit Algorithm: sliding-window`
   - Monitor Redis commands increase to ~350K-450K/month (expected)
   - Test rate limiting: send 121 requests/min, verify 121st is blocked

**Method 2: Git Revert (If env var unavailable)**

1. Revert commit implementing Phase 4 (Task 6.1)
2. Deploy previous version
3. System returns to sliding-window implementation

#### When to Rollback

Consider rollback if you observe:
- ❌ Rate limiting not working correctly (requests not blocked)
- ❌ False positives (legitimate requests blocked unexpectedly)
- ❌ Application errors related to Redis rate limiting
- ❌ Unusual spikes in 429 (Too Many Requests) responses

#### Verification After Rollback

```bash
# Check logs for algorithm in use
grep "Rate Limit Algorithm" logs/server.log

# Expected output:
# 📊 Rate Limit Algorithm: sliding-window (set RATE_LIMIT_ALGORITHM=sliding-window to rollback)

# Test rate limiting still works
curl -X POST https://api.veefore.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test"}' \
  # Repeat 121 times, 121st should return 429
```

#### Default Algorithm

By default (no RATE_LIMIT_ALGORITHM set):
- Uses **fixed-window** algorithm (optimized, 2 commands/request)
- 50% reduction in Redis commands
- Slightly different behavior at window boundaries (allows burst)
- Production-tested and recommended

---

## 🐛 Troubleshooting

### If Vercel Build Still Fails

1. **Check Build Logs**
   - Go to Vercel Dashboard → Deployments → Click failed deployment
   - Look for specific error messages

2. **Common Issues:**
   - **TypeScript Errors**: Fix type errors in your code
   - **Missing Dependencies**: Ensure `client/package.json` has all deps
   - **Environment Variables**: Verify ALL VITE_ variables are set in Vercel
   - **Vite Config Issues**: Check `vite.client.config.ts` for syntax errors

3. **Test Build Locally**
   ```bash
   # From project root
   npm run client:build
   
   # Should output to dist/public without errors
   ```

### If Railway Deployment Fails

1. **Check Railway Logs**
   - Railway Dashboard → Your Service → Deployments → View logs
   
2. **Common Issues:**
   - **Missing JWT_SECRET**: Ensure JWT_SECRET is set in Railway variables
   - **MongoDB Connection**: Verify MONGODB_URI is correct
   - **PORT Configuration**: Must be PORT=8080 for custom domain

---

## 📋 Environment Variables Checklist

### Vercel (Frontend) - 12 variables
- [ ] VITE_API_BASE_URL
- [ ] VITE_APP_URL
- [ ] VITE_SOCKET_URL
- [ ] VITE_FIREBASE_API_KEY
- [ ] VITE_FIREBASE_AUTH_DOMAIN
- [ ] VITE_FIREBASE_PROJECT_ID
- [ ] VITE_FIREBASE_STORAGE_BUCKET
- [ ] VITE_FIREBASE_MESSAGING_SENDER_ID
- [ ] VITE_FIREBASE_APP_ID
- [ ] VITE_STRIPE_PUBLISHABLE_KEY
- [ ] VITE_RAZORPAY_KEY_ID
- [ ] VITE_SENTRY_DSN
- [ ] VITE_META_PHASE_1_REVIEW_MODE

### Railway (Backend) - Critical variables only
- [ ] NODE_ENV
- [ ] PORT
- [ ] BASE_URL
- [ ] MONGODB_URI
- [ ] MONGODB_DB_NAME
- [ ] JWT_SECRET
- [ ] SESSION_SECRET
- [ ] ENCRYPTION_KEY
- [ ] TOKEN_ENCRYPTION_KEY
- [ ] TOKEN_ENCRYPTION_GLOBAL_SALT
- [ ] All API keys (OpenAI, Anthropic, etc.)
- [ ] All social media credentials
- [ ] Payment gateway keys (Stripe, Razorpay)

---

## 🎯 Success Criteria

### Backend (Railway)
✅ Deployment successful
✅ Health endpoint returns 200
✅ Database connection works
✅ API endpoints accessible from frontend

### Frontend (Vercel)
✅ Build completes without errors
✅ Site loads at veefore.com
✅ Can make API calls to api.veefore.com
✅ No console errors related to missing env vars
✅ Firebase authentication works
✅ Socket.io connection established

---

## 📞 Need Help?

If you encounter issues:
1. Share the specific error message from build logs
2. Check if the error is related to:
   - Build configuration
   - Environment variables
   - Code/TypeScript errors
   - Dependency issues
