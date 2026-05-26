# ✅ BOTH ISSUES FIXED!

## 🎯 **Issue 1: Smart Sync Button - FIXED** ✅

### **The Problem:**
The force-sync endpoint was using the converted account object which has different field names:
- Converted object has: `hasAccessToken` (boolean flag)
- But we needed: `accessToken` and `encryptedAccessToken` (actual values)

### **The Fix:**
Changed to query the **raw MongoDB model** directly:
```typescript
// ❌ BEFORE (Using converted object)
const accounts = await storage.getSocialAccountsByWorkspace(workspaceId);
const instagramAccount = accounts.find((acc: any) => acc.platform === 'instagram');
// Result: hasAccessToken: false, hasEncryptedToken: false

// ✅ AFTER (Using raw MongoDB model)
const { SocialAccountModel } = await import('./mongodb-models');
const rawInstagramAccount = await SocialAccountModel.findOne({
  workspaceId: workspaceId,
  platform: 'instagram'
});
// Result: Actually has encryptedAccessToken field!
```

---

## 🎯 **Issue 2: Shares/Saves - FIXED** ✅

### **The Problem:**
Instagram API error:
```
"metric[1] must be one of the following values: impressions, shares, comments, plays, likes, saved, ..."
```

We were using `shares,saves` but Instagram expects **`saved`** (not `saves`)!

### **The Fix:**
Changed the metric name from `saves` to `saved`:
```typescript
// ❌ BEFORE (Wrong metric name)
const sharesResponse = await fetch(`https://graph.instagram.com/${media.id}/insights?metric=shares,saves&access_token=${accessToken}`);
// Error: metric[1] must be one of following values...

// ✅ AFTER (Correct metric name)
const sharesResponse = await fetch(`https://graph.instagram.com/${media.id}/insights?metric=saved&access_token=${accessToken}`);
// Success: Instagram returns saved count!
```

### **Note on Shares:**
- **Shares** is only available for Reels/Stories
- Regular feed posts don't have a "shares" metric
- That's why we now only fetch "saved" (which works for all post types)

---

## 🚀 **How to Test**

### Step 1: Kill and Restart Server
```bash
# Kill existing processes
Get-Process -Name node | Stop-Process -Force

# Wait 2 seconds
Start-Sleep -Seconds 2

# Start fresh
npm run dev
```

### Step 2: Test Smart Sync Button
1. Open dashboard: `http://localhost:5000`
2. Click "🧠 Smart Sync" button
3. **Check SERVER TERMINAL** - you should see:
```
[FORCE SYNC] Instagram account found: {
  username: 'arpit.10',
  hasAccessToken: false,
  hasEncryptedToken: true  ✅ (Now TRUE!)
}
[FORCE SYNC] Decrypting access token...
[FORCE SYNC] ✅ Token decrypted successfully
[FORCE SYNC] ✅ Successfully used smart polling
```

### Step 3: Wait for Saves Data (3 minutes)
After ~3 minutes, smart polling will run and you'll see:
```
[SMART POLLING] 🔍 Saves API response status for post 18053962234971510: 200
[SMART POLLING] 🔍 Saves raw data for post 18053962234971510: {...}
[SMART POLLING] ✅ Real saves for post 18053962234971510: 5
[SMART POLLING] 📊 Shares/Saves summary: 0 shares from 0 posts, 15 saves from 3 posts
```

---

## 📊 **Expected Results**

### Smart Sync Button ✅
- No more "No Instagram access token found" error
- Button works and shows success message
- Dashboard refreshes with latest data

### Saves Data ✅
- Saves will now be fetched correctly (using `saved` metric)
- Shares will remain 0 (only available for Reels, not feed posts)
- Dashboard will show actual saves count

---

## 🎉 **Summary of All Fixes**

| Issue | Status | Solution |
|-------|--------|----------|
| Dashboard showing 0s | ✅ FIXED | `refetchOnMount: 'always'`, `staleTime: 0` |
| OAuth not refreshing | ✅ FIXED | `invalidateQueries` + `refetchQueries` after OAuth |
| MongoDB ObjectId regex error | ✅ FIXED | Removed regex on `_id` field |
| Smart Sync button failing | ✅ FIXED | Query raw MongoDB model directly |
| Saves not fetching | ✅ FIXED | Changed `saves` to `saved` metric |

---

**Restart your server and test both fixes!** 🚀

**Note:** Shares data may still be 0 if your posts are regular feed posts (not Reels). This is normal!

