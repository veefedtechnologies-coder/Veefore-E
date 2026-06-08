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
