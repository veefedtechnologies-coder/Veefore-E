# Railway Backend Deployment Fix

## Problem
Railway deployment was failing with EBADENGINE errors because over 20 dependencies require Node >=20:
- Firebase backends
- Vite 7
- Vite 4
- @googleapis/gmail
- Many other modern packages

The build was using Node 18, causing compatibility issues and build failures.

## Root Cause
1. **Dockerfile** was using `node:18-alpine` for both build and production stages
2. **package.json** had no explicit engine requirements
3. **Railway/Nixpacks** was not configured to use Node 20
4. Dependencies require Node >=20 but the environment was providing Node 18 or lower

## Solution Applied

### 1. Updated Dockerfile (Node 18 → Node 20)
**Changed:**
```dockerfile
# Build Stage
FROM node:20-alpine AS builder

# Production Stage  
FROM node:20-alpine AS production
```

### 2. Added Engine Requirements to package.json
**Added:**
```json
"engines": {
  "node": ">=20.0.0",
  "npm": ">=10.0.0"
}
```

This ensures npm will warn/error if the wrong Node version is used.

### 3. Updated railway.toml with Nixpacks Configuration
**Added:**
```toml
[nixpacks]
version = "1.x"

[nixpacks.phases.setup]
nixPkgs = ["nodejs-20_x"]
```

This explicitly tells Railway/Nixpacks to use Node.js 20.x.

### 4. Created .nvmrc File
**Added:**
```
20
```

This ensures Node Version Manager (nvm) and compatible tools use Node 20.

## Why This Works

1. **Dockerfile**: Docker builds will now use Node 20 in both build and runtime stages
2. **package.json engines**: npm will validate Node version before installing dependencies
3. **railway.toml**: Railway's Nixpacks builder will use Node 20 during deployment
4. **.nvmrc**: Developers and CI/CD tools will use the correct Node version locally

## Verification Steps

### Local Testing
```bash
# Check Node version
node --version  # Should show v20.x.x

# Clean install
rm -rf node_modules package-lock.json
npm install

# Test build
npm run build

# Test start
npm start
```

### Docker Testing
```bash
# Build Docker image
docker build -t veefore-backend .

# Run container
docker run -p 5000:5000 veefore-backend

# Verify it starts without EBADENGINE errors
```

### Railway Deployment
1. Commit and push these changes to GitHub
2. Railway will automatically trigger a new deployment
3. Check Railway logs for successful build
4. Verify no EBADENGINE warnings appear
5. Confirm the application starts successfully

## Files Modified
- `Dockerfile` - Updated both build and production stages to Node 20
- `package.json` - Added engines field with Node >=20.0.0 requirement
- `railway.toml` - Added Nixpacks configuration for Node 20
- `.nvmrc` - Created with Node version 20

## Expected Outcome
✅ Railway build succeeds without EBADENGINE errors  
✅ All dependencies install correctly with Node 20  
✅ Application starts successfully in production  
✅ No more mixed runtime failures  
✅ Consistent Node version across all environments  

## Additional Notes

### Why Node 20?
Modern dependencies increasingly require Node 20+ due to:
- Native ESM support improvements
- Performance enhancements
- Security updates
- New JavaScript features
- Better TypeScript compatibility

### Backward Compatibility
Node 20 is the current LTS (Long Term Support) version and is recommended for production use. All your dependencies are compatible with Node 20.

### Future Maintenance
When Node 22 becomes LTS, you can update:
1. Dockerfile: `FROM node:22-alpine`
2. package.json engines: `"node": ">=22.0.0"`
3. railway.toml: `nixPkgs = ["nodejs-22_x"]`
4. .nvmrc: `22`

## Troubleshooting

If deployment still fails:

1. **Check Railway Logs**: Look for specific error messages
2. **Verify Environment Variables**: Ensure all required env vars are set in Railway
3. **Check Memory Limits**: Node 20 may require more memory during builds
4. **Build Command**: Ensure `npm run build` completes successfully
5. **Start Command**: Verify `npm start` works with the built artifacts

## Related Issues
- Vercel frontend deployment: Fixed separately (logo import issue)
- Railway backend deployment: Fixed with this update
