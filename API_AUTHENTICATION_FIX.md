# API Authentication Fix

## 🐛 **Problem Discovered**

After pushing the enterprise authentication system, API requests to protected endpoints are failing with:

```
[AUTH] Invalid JWT structure - expected 3 parts, got: 1
[AUTH] Token received: null...
Error 401 for origin https://www.veefore.com on POST /workspace/:id/generate-insight
```

## 🔍 **Root Cause**

The frontend is **NOT sending Firebase ID tokens** with API requests to protected endpoints.

### What's Happening:

1. ✅ User authenticates successfully (Firebase + Backend session)
2. ✅ User is logged in and can access the dashboard
3. ❌ Frontend makes API request **WITHOUT Authorization header**
4. ❌ Backend requires JWT token → Returns 401 Unauthorized

### Why This Happens:

The frontend code is making direct `fetch()` calls to API endpoints without including the Firebase ID token:

```typescript
// ❌ WRONG: No authentication
fetch('/api/workspace/:id/generate-insight', {
  method: 'POST',
  body: JSON.stringify(data)
})

// ✅ CORRECT: Include Firebase ID token
const idToken = await auth.currentUser.getIdToken()
fetch('/api/workspace/:id/generate-insight', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${idToken}`
  },
  body: JSON.stringify(data)
})
```

## ✅ **Solution Implemented**

Created an **Authenticated API Client** that automatically includes Firebase ID tokens.

### File Created: `client/src/lib/api-client.ts`

This provides utility functions for authenticated API requests:

```typescript
import { apiGet, apiPost, apiPut, apiDelete, apiPatch } from '@/lib/api-client'

// GET request
const data = await apiGet('/api/workspace/123')

// POST request
const result = await apiPost('/api/workspace/123/generate-insight', {
  prompt: 'Create video about...'
})

// PUT request
await apiPut('/api/workspace/123', { name: 'New Name' })

// DELETE request
await apiDelete('/api/workspace/123')

// PATCH request
await apiPatch('/api/workspace/123', { status: 'active' })
```

### Features:

1. **Automatic Token Injection**
   - Gets Firebase ID token from current user
   - Adds `Authorization: Bearer <token>` header
   - Refreshes token if expired

2. **Error Handling**
   - Throws descriptive errors on failure
   - Parses error responses
   - HTTP status code handling

3. **Type Safety**
   - TypeScript support
   - Return type inference
   - Async/await support

4. **Content-Type Handling**
   - Automatically sets `Content-Type: application/json`
   - JSON serialization for request bodies
   - JSON parsing for responses

## 🔧 **How to Fix Existing Code**

### Step 1: Find All Unauthenticated API Calls

Search for patterns like:
- `fetch('/api/`
- `fetch(\`/api/`
- `fetch('http`
- Axios calls: `axios.get`, `axios.post`, etc.

### Step 2: Replace with Authenticated Client

**Before:**
```typescript
const response = await fetch('/api/workspace/123/generate-insight', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    prompt: 'Create video about AI'
  })
})
const data = await response.json()
```

**After:**
```typescript
import { apiPost } from '@/lib/api-client'

const data = await apiPost('/api/workspace/123/generate-insight', {
  prompt: 'Create video about AI'
})
```

### Step 3: Add Error Handling

```typescript
try {
  const data = await apiPost('/api/workspace/123/generate-insight', {
    prompt: 'Create video about AI'
  })
  console.log('Success:', data)
} catch (error) {
  console.error('API Error:', error.message)
  toast({
    title: 'Error',
    description: error.message,
    variant: 'destructive'
  })
}
```

## 📝 **Common Patterns to Fix**

### Pattern 1: Simple GET Request

**Before:**
```typescript
const response = await fetch('/api/workspace/123')
const data = await response.json()
```

**After:**
```typescript
import { apiGet } from '@/lib/api-client'
const data = await apiGet('/api/workspace/123')
```

### Pattern 2: POST with Body

**Before:**
```typescript
const response = await fetch('/api/workspace/123/items', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'New Item' })
})
const data = await response.json()
```

**After:**
```typescript
import { apiPost } from '@/lib/api-client'
const data = await apiPost('/api/workspace/123/items', {
  name: 'New Item'
})
```

### Pattern 3: DELETE Request

**Before:**
```typescript
await fetch('/api/workspace/123', {
  method: 'DELETE'
})
```

**After:**
```typescript
import { apiDelete } from '@/lib/api-client'
await apiDelete('/api/workspace/123')
```

### Pattern 4: PUT/PATCH Update

**Before:**
```typescript
await fetch('/api/workspace/123', {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'Updated Name' })
})
```

**After:**
```typescript
import { apiPut } from '@/lib/api-client'
await apiPut('/api/workspace/123', {
  name: 'Updated Name'
})
```

## 🔍 **How to Find All Unauthenticated Calls**

### Method 1: Search in IDE

Search for these patterns:
```
fetch('/api/
fetch(`/api/
fetch("http
axios.get(
axios.post(
```

### Method 2: Use grep

```bash
cd client/src
grep -r "fetch('/api/" .
grep -r 'fetch(`/api/' .
grep -r "fetch(\"http" .
```

### Method 3: Check Network Tab

1. Open DevTools → Network tab
2. Use the app and look for 401 errors
3. Check which endpoints are failing
4. Update those components

## ⚠️ **Important Notes**

### 1. User Must Be Authenticated

The API client requires a logged-in user:

```typescript
if (!auth.currentUser) {
  throw new Error('User not authenticated')
}
```

**Solution:** Check authentication before making API calls:

```typescript
import { useFirebaseAuth } from '@/hooks/useFirebaseAuth'

function MyComponent() {
  const { user, loading } = useFirebaseAuth()
  
  const handleAction = async () => {
    if (!user) {
      toast({ title: 'Please sign in', variant: 'destructive' })
      return
    }
    
    try {
      const data = await apiPost('/api/workspace/123/action', { ... })
    } catch (error) {
      // Handle error
    }
  }
}
```

### 2. Token Refresh Handled Automatically

Firebase automatically refreshes tokens every hour. The `getIdToken()` method:
- Returns cached token if valid
- Refreshes token if expired
- Returns fresh token

**No manual refresh needed!**

### 3. Error Handling Best Practices

```typescript
try {
  const data = await apiPost('/api/endpoint', payload)
  // Handle success
} catch (error: any) {
  if (error.message.includes('not authenticated')) {
    // Redirect to login
    window.location.href = '/signin'
  } else if (error.message.includes('HTTP 403')) {
    // Permission denied
    toast({ title: 'Access Denied', variant: 'destructive' })
  } else if (error.message.includes('HTTP 429')) {
    // Rate limited
    toast({ title: 'Too many requests, please wait', variant: 'destructive' })
  } else {
    // Generic error
    toast({ title: 'Error', description: error.message, variant: 'destructive' })
  }
}
```

## 🚀 **Next Steps**

### Immediate Actions:

1. ✅ **Create API client** (DONE - `client/src/lib/api-client.ts`)

2. ⏳ **Find all unauthenticated API calls**
   ```bash
   cd client/src
   grep -r "fetch('/api/" . > unauthenticated-calls.txt
   ```

3. ⏳ **Replace with authenticated client**
   - Update components one by one
   - Test each update
   - Commit incrementally

4. ⏳ **Test thoroughly**
   - Check Network tab for 401 errors
   - Verify all features work
   - Test with expired tokens

### Long-term Improvements:

1. **Add Request Interceptor**
   - Retry on 401 (token refresh)
   - Automatic retry on network errors
   - Request/response logging

2. **Add Response Caching**
   - Cache GET requests
   - Invalidate on mutations
   - Reduce unnecessary API calls

3. **Add TypeScript Types**
   - Define API response types
   - Type-safe request payloads
   - Better autocomplete

4. **Add Request Queue**
   - Queue requests during auth
   - Retry failed requests
   - Prevent duplicate requests

## 📊 **Verification Checklist**

After updating code, verify:

- [ ] No 401 errors in console
- [ ] All features work as expected
- [ ] Network tab shows Authorization header
- [ ] Token is valid JWT (3 parts: `xxxxx.yyyyy.zzzzz`)
- [ ] Backend logs show successful authentication
- [ ] No performance degradation
- [ ] Error handling works correctly

## 🎯 **Expected Outcome**

**Before Fix:**
```
[AUTH] Invalid JWT structure - expected 3 parts, got: 1
[AUTH] Token received: null...
Error 401 Unauthorized
```

**After Fix:**
```
[AUTH] Token verified successfully
[AUTH] User: uid=abc123
[API] Request processed successfully
Status: 200 OK
```

## 📖 **Additional Resources**

- [Firebase ID Tokens](https://firebase.google.com/docs/auth/admin/verify-id-tokens)
- [JWT Structure](https://jwt.io/)
- [HTTP Authorization Header](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Authorization)

---

**Status:** ⏳ In Progress  
**Priority:** 🔴 High (Blocks API functionality)  
**Estimated Time:** 2-4 hours (find and replace all calls)

---

**Created:** June 12, 2026  
**Last Updated:** June 12, 2026
