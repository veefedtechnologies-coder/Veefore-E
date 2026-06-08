# Vercel Deployment Fix

## Issue
Build failing with import resolution error.

## Solution

### Option 1: Update Vercel Project Settings (Recommended)

1. Go to Vercel Dashboard → Your Project → Settings
2. Update these settings:

**Root Directory:**
```
./
```

**Build Command:**
```
cd client && npm install && npm run build
```

**Output Directory:**
```
client/dist
```

**Install Command:**
```
npm install --prefix client
```

**Node Version:**
```
20.x
```

### Option 2: Create a Root package.json

If the above doesn't work, we need a root package.json to help Vercel understand the monorepo structure.

### Option 3: Check Environment Variables

Make sure all these are set in Vercel:
- VITE_APP_URL
- VITE_API_BASE_URL
- VITE_FIREBASE_API_KEY
- VITE_FIREBASE_APP_ID
- VITE_FIREBASE_PROJECT_ID
- VITE_STRIPE_PUBLIC_KEY
- VITE_RAZORPAY_KEY_ID
- VITE_SENTRY_DSN
- VITE_META_PHASE_1_REVIEW_MODE

## Quick Fix Steps

1. In Vercel → Project Settings → General
2. Set **Root Directory** to: `client`
3. Set **Build Command** to: `npm run build`
4. Set **Output Directory** to: `dist`
5. Set **Install Command** to: `npm install`
6. Redeploy

This tells Vercel to treat the `client` folder as the root of the frontend project.
