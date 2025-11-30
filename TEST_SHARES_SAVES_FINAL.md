# 🧪 TEST: React Query Cache Fix for Shares/Saves

## ✅ What Was Fixed

**ROOT CAUSE:** React Query was caching API responses with the OLD/INVALID workspace ID, so even though the workspace validator corrected localStorage, the API calls were still returning empty data from the wrong workspace.

**THE FIX:** Added automatic React Query cache invalidation + refetch when workspace ID is corrected.

---

## 🧪 Testing Steps

### Step 1: Close Browser Completely
```
1. Close ALL browser windows
2. Wait 5 seconds
3. Open fresh browser window
```

**Why:** Ensures we're testing with React Query starting fresh.

---

### Step 2: Open Dashboard & Check Console

Open your app and **immediately** open DevTools Console (F12).

**YOU SHOULD SEE:**

```
[APP INIT] ✅ Workspace ID validated: 684402c2fd2cd4eb6521b386

OR if it was invalid:

[APP INIT] ❌ Invalid workspace ID detected: 686d98ce4888852d5d7beb64
[APP INIT] 🔧 Auto-correcting to valid workspace...
[APP INIT] ✅ Auto-corrected workspace: { from: "686d...", to: "6844...", name: "My VeeFore Workspace" }
[APP INIT] 🔄 Invalidating all workspace-dependent queries...
[APP INIT] ✅ All queries invalidated and refetched with correct workspace ID
```

---

### Step 3: Check Dashboard Display

**EXPECTED RESULT:**

Instagram account should show:
- ✅ **Shares: 16**
- ✅ **Saves: 9**
- ✅ **Likes: 225** (or current real value)
- ✅ **Comments: 15** (or current real value)

---

### Step 4: Verify API Calls in Console

Look for these log lines in console:

```
[SOCIAL ACCOUNTS] Getting accounts for specific workspace: 684402c2fd2cd4eb6521b386
                                                          ↑↑↑ CORRECT workspace ID

[MULTI-PLATFORM] Found social accounts: [1 account with data]
```

**❌ If you see:** `workspace: 686d98ce4888852d5d7beb64` - WRONG!
**✅ If you see:** `workspace: 684402c2fd2cd4eb6521b386` - CORRECT!

---

## 🔍 If Still Shows 0

If shares/saves still show 0 after this fix:

1. **Check what workspace ID is being used in API calls:**
   - Open DevTools Network tab
   - Filter for: `social-accounts`
   - Click the request
   - Check Query Params: `workspaceId=?`

2. **Manually verify database has the data:**
   ```bash
   node verify-database-data.cjs
   ```

3. **Share these logs with me:**
   - Console logs from browser (especially workspace validation)
   - Network tab showing the API request URL
   - The database verification output

---

## ✨ Expected Outcome

After this fix:
- ✅ Workspace ID is validated on app load
- ✅ Invalid workspace IDs are auto-corrected  
- ✅ React Query cache is invalidated when correction happens
- ✅ API refetches data with CORRECT workspace ID immediately
- ✅ Dashboard displays: **Shares: 16, Saves: 9**

---

## 🎉 Success Criteria

**YOU'LL KNOW IT'S FIXED WHEN:**

1. Console shows correct workspace ID in API calls
2. Dashboard displays Shares: 16, Saves: 9
3. No more "0 accounts found" logs
4. Data persists after page refresh

---

## 📝 What Changed in Code

### 1. `client/src/components/WorkspaceSwitcher.tsx`
```typescript
// Added React Query cache invalidation
await Promise.all([
  queryClient.invalidateQueries({ queryKey: ['/api/social-accounts'] }),
  queryClient.invalidateQueries({ queryKey: ['/api/dashboard/analytics'] }),
  // ... more invalidations
  queryClient.refetchQueries({ queryKey: ['/api/social-accounts'], type: 'active' }),
]);
```

### 2. `client/src/App.tsx`
```typescript
// Same cache invalidation on app initialization
```

**This ensures:** When workspace ID is corrected, ALL cached data with the old ID is thrown away and refetched with the correct ID!

---

## 🚀 Ready to Test!

**Start here:** Close browser → Reopen → Check console → Verify dashboard shows 16/9!

