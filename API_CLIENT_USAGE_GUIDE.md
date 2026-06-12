# API Client Usage Guide

## ✅ **Good News!**

You already have an authenticated API client at `client/src/lib/api.ts`!

The `ApiClient` class automatically:
- ✅ Gets Firebase ID token from current user
- ✅ Adds `Authorization: Bearer <token>` header
- ✅ Handles base URL configuration
- ✅ Provides GET, POST, PUT, DELETE methods
- ✅ Error handling for 401 Unauthorized

## 🐛 **The Problem**

Some code is **NOT using ApiClient** and is making direct `fetch()` calls without authentication. This causes 401 errors.

## ✅ **The Solution**

Replace all direct `fetch()` calls with `ApiClient` methods.

---

## 📚 **How to Use ApiClient**

### Import Statement:
```typescript
import { ApiClient } from '@/lib/api'
```

### GET Request:
```typescript
// ❌ WRONG - No auth
const response = await fetch('/api/workspace/123')
const data = await response.json()

// ✅ CORRECT - With auth
const data = await ApiClient.get('/api/workspace/123')
```

### POST Request:
```typescript
// ❌ WRONG - No auth
const response = await fetch('/api/workspace/123/action', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ key: 'value' })
})
const data = await response.json()

// ✅ CORRECT - With auth
const data = await ApiClient.post('/api/workspace/123/action', {
  key: 'value'
})
```

### PUT Request:
```typescript
// ❌ WRONG - No auth
await fetch('/api/workspace/123', {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'New Name' })
})

// ✅ CORRECT - With auth
await ApiClient.put('/api/workspace/123', {
  name: 'New Name'
})
```

### DELETE Request:
```typescript
// ❌ WRONG - No auth
await fetch('/api/workspace/123', {
  method: 'DELETE'
})

// ✅ CORRECT - With auth
await ApiClient.delete('/api/workspace/123')
```

---

## 🔍 **Files That Need Fixing**

Based on file search, these files use `fetch()` and may need updates:

### High Priority (Likely need auth):
1. ✅ `lib/api.ts` - Already has ApiClient ✓
2. ⏳ `AuthenticatedApp.tsx` - Check for fetch calls
3. ⏳ `components/settings/SettingsTabs.tsx` - Settings API calls
4. ⏳ `components/dashboard/performance-score.tsx` - Dashboard data
5. ⏳ `components/create/create-post.tsx` - Content creation
6. ⏳ `components/create/VideoAdjuster.tsx` - Video editing

### Medium Priority (May need auth):
7. ⏳ `components/caption/CaptionPerformanceInsights.example.tsx`
8. ⏳ `components/caption/CaptionEditorWithTracking.example.tsx`
9. ⏳ `components/voice-profile/VoiceProfileViewer.example.tsx`

### Low Priority (Probably don't need auth):
10. ✅ `components/waitlist/WaitlistModal.tsx` - Public endpoint
11. ✅ `components/MainFooter.tsx` - Probably just UI
12. ✅ `hooks/useEarlyAccessCheck.ts` - Public check

### Already Using Auth:
13. ✅ `lib/api-client.ts` - New file we created
14. ✅ `lib/auth-session-validator.ts` - Already authenticated
15. ✅ `hooks/useTokenRefresh.ts` - Auth related
16. ✅ `lib/auth.ts` - Auth related
17. ✅ `lib/auth-cookies.ts` - Auth related

---

## 🔧 **How to Fix Each File**

### Step 1: Check if fetch() needs authentication

Open the file and look for fetch calls:
```typescript
// If calling /api/ endpoints that are protected
fetch('/api/workspace/...') // ← Needs auth!
fetch('/api/user/...') // ← Needs auth!
fetch('/api/content/...') // ← Needs auth!

// If calling public endpoints
fetch('/api/auth/verify-email') // ← No auth needed
fetch('/api/waitlist/join') // ← No auth needed
```

### Step 2: Replace with ApiClient

**Before:**
```typescript
const response = await fetch('/api/workspace/123/generate-insight', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    prompt: 'Create video about AI',
    settings: { quality: 'high' }
  })
})

if (!response.ok) {
  throw new Error('Failed to generate insight')
}

const data = await response.json()
console.log('Insight:', data)
```

**After:**
```typescript
import { ApiClient } from '@/lib/api'

try {
  const data = await ApiClient.post('/api/workspace/123/generate-insight', {
    prompt: 'Create video about AI',
    settings: { quality: 'high' }
  })
  
  console.log('Insight:', data)
} catch (error: any) {
  if (error.message.includes('Authentication required')) {
    // User not logged in - redirect to signin
    window.location.href = '/signin'
  } else {
    // Other error - show toast
    toast({
      title: 'Error',
      description: error.message,
      variant: 'destructive'
    })
  }
}
```

### Step 3: Test the fix

1. Open the page/component
2. Check DevTools → Network tab
3. Look for the API call
4. Verify `Authorization: Bearer <token>` header is present
5. Verify response is 200 OK (not 401)

---

## 🎯 **Quick Fix Script**

Search for all fetch calls that need updating:

```bash
cd client/src
# Find all fetch calls to /api/ endpoints
grep -rn "fetch('/api/" . --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v "lib/api"
```

---

## ⚠️ **Important Notes**

### 1. Only Fix Protected Endpoints

These endpoints need authentication:
- ✅ `/api/workspace/*` - User workspaces
- ✅ `/api/user/*` - User profile
- ✅ `/api/content/*` - User content
- ✅ `/api/subscription/*` - User subscription
- ✅ `/api/analytics/*` - User analytics

These endpoints are public (no auth needed):
- ❌ `/api/auth/verify-email` - Email verification
- ❌ `/api/auth/send-verification` - Send OTP
- ❌ `/api/waitlist/*` - Waitlist endpoints
- ❌ `/api/health` - Health check

### 2. Error Handling

`ApiClient` throws errors that you should catch:

```typescript
try {
  const data = await ApiClient.post('/api/endpoint', payload)
  // Success
} catch (error: any) {
  // Handle error
  console.error('API Error:', error.message)
  
  if (error.message.includes('Authentication required')) {
    // User not authenticated - redirect to login
    window.location.href = '/signin'
  } else if (error.message.includes('HTTP error! status: 403')) {
    // Permission denied
    toast({ title: 'Access Denied', variant: 'destructive' })
  } else {
    // Generic error
    toast({ title: 'Error', description: error.message, variant: 'destructive' })
  }
}
```

### 3. User Must Be Logged In

`ApiClient` requires a logged-in user. Check before making calls:

```typescript
import { useFirebaseAuth } from '@/hooks/useFirebaseAuth'
import { ApiClient } from '@/lib/api'

function MyComponent() {
  const { user, loading } = useFirebaseAuth()
  
  const handleAction = async () => {
    if (!user) {
      toast({ title: 'Please sign in first', variant: 'destructive' })
      return
    }
    
    try {
      const data = await ApiClient.post('/api/action', { ... })
      // Success
    } catch (error: any) {
      // Error
    }
  }
  
  if (loading) return <LoadingSpinner />
  if (!user) return <SignInPrompt />
  
  return <button onClick={handleAction}>Do Action</button>
}
```

---

## 📋 **Testing Checklist**

After fixing each file:

- [ ] No 401 errors in Network tab
- [ ] Authorization header present in requests
- [ ] Token is valid JWT (3 parts: `xxxxx.yyyyy.zzzzz`)
- [ ] Feature works as expected
- [ ] Error handling works
- [ ] Loading states work
- [ ] No console errors

---

## 🚀 **Next Steps**

1. ⏳ Find all unauth fetch() calls:
   ```bash
   cd client/src
   grep -rn "fetch('/api/" . --include="*.ts" --include="*.tsx" | grep -v node_modules
   ```

2. ⏳ Replace with ApiClient one by one

3. ⏳ Test each fix

4. ⏳ Commit and push changes

5. ⏳ Verify in production

---

## 📖 **Examples from Real Code**

### Example 1: Generate Insight (Most Likely the Issue)

**File:** `components/create/create-post.tsx` or similar

**Before:**
```typescript
const generateInsight = async () => {
  const response = await fetch(`/api/workspace/${workspaceId}/generate-insight`, {
    method: 'POST',
    body: JSON.stringify({ prompt })
  })
  const data = await response.json()
  return data
}
```

**After:**
```typescript
import { ApiClient } from '@/lib/api'

const generateInsight = async () => {
  const data = await ApiClient.post(`/api/workspace/${workspaceId}/generate-insight`, {
    prompt
  })
  return data
}
```

### Example 2: Load Dashboard Data

**File:** `components/dashboard/performance-score.tsx`

**Before:**
```typescript
useEffect(() => {
  fetch(`/api/analytics/performance`)
    .then(res => res.json())
    .then(data => setPerformance(data))
}, [])
```

**After:**
```typescript
import { ApiClient } from '@/lib/api'

useEffect(() => {
  ApiClient.get(`/api/analytics/performance`)
    .then(data => setPerformance(data))
    .catch(error => console.error('Failed to load performance:', error))
}, [])
```

### Example 3: Update Settings

**File:** `components/settings/SettingsTabs.tsx`

**Before:**
```typescript
const saveSettings = async (settings: any) => {
  await fetch('/api/user/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings)
  })
}
```

**After:**
```typescript
import { ApiClient } from '@/lib/api'

const saveSettings = async (settings: any) => {
  await ApiClient.put('/api/user/settings', settings)
}
```

---

**Status:** ⏳ **Action Required**  
**Priority:** 🔴 **High**  
**Estimated Time:** 1-2 hours

---

**Created:** June 12, 2026  
**Last Updated:** June 12, 2026
