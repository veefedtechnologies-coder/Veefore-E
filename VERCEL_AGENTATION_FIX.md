# Vercel Build Fix - Agentation Module Resolution Error

## Problem

Build was failing with Rollup/Vite error:

```
[vite]: Rollup failed to resolve import "agentation" from "/vercel/path0/client/src/..."
This is most likely unintended because it can break your application at runtime.
If you do want to externalize this module explicitly add it to 'build.rollupOptions.external'
```

## Root Cause

The "agentation" package is listed in `client/package.json` as a **devDependency**:
- It's a development tool (not used in production code)
- Rollup tried to bundle it but couldn't resolve it properly
- This caused the build to fail

## Solution Applied

Added "agentation" to the external modules list in `vite.client.config.ts`:

```typescript
build: {
  outDir: path.resolve(__dirname, "dist/public"),
  emptyOutDir: true,
  rollupOptions: {
    external: ['agentation'],
  },
},
```

This tells Vite/Rollup to skip bundling this module, treating it as external.

## What This Means

- ✅ "agentation" won't be included in the production bundle
- ✅ Build will succeed
- ✅ No runtime issues (it's only a dev tool anyway)
- ✅ Smaller bundle size

## Why This Works

The "agentation" package is a development tool that shouldn't be in the production bundle:
- It's only needed during development/testing
- Externalizing it tells Rollup to ignore it during build
- Production code doesn't depend on it

## Files Changed

- ✅ `vite.client.config.ts` - Added `rollupOptions.external: ['agentation']`

## Deploy Now

```bash
git add vite.client.config.ts
git commit -m "Fix Vercel build: externalize agentation dev dependency"
git push
```

Or use the script:
```bash
./deploy-to-vercel.sh
```

## Test Locally

```bash
./test-build-locally.sh
```

This should now complete without the agentation error.

## If You See Similar Errors for Other Packages

If you see "Rollup failed to resolve import" for other devDependencies, add them to the external list:

```typescript
rollupOptions: {
  external: ['agentation', 'package-name-here', 'another-package'],
},
```

Common devDependencies that might need to be externalized:
- Testing tools (vitest, jest, etc.)
- Development utilities
- Build tools
- Linting/formatting tools

---

**This fix tells Vite to skip bundling development-only packages that aren't used in production.**
