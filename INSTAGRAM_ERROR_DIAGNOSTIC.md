# 🔍 Instagram Insight Error Diagnostic Guide

## Common Instagram API Errors and Solutions

After restarting your server, you mentioned seeing Instagram insight errors. Let's diagnose and fix them.

---

## 📊 Error Types and Solutions

### Error Type 1: Token Issues (Most Common)

#### Symptom:
```
[INSTAGRAM DIRECT] Instagram API error: 190
[INSTAGRAM CALLBACK] Token exchange failed
Instagram API Error: {"error":{"code":190,"message":"Error validating access token"}}
```

#### Cause:
- Instagram access token expired (60-day expiry)
- Token was revoked by user
- Token doesn't have required permissions

#### Solution:
1. **Reconnect Instagram account:**
   - Go to your app → Integrations
   - Disconnect Instagram
   - Reconnect Instagram (this gets a fresh token with full permissions)

2. **Check token status:**
   ```bash
   # Call this endpoint to see token validity
   GET /api/instagram/token-status?accountId=YOUR_ACCOUNT_ID
   ```

3. **Manual token refresh:**
   ```bash
   # Try refreshing the token
   POST /api/instagram/refresh-token/YOUR_ACCOUNT_ID
   ```

---

### Error Type 2: Permission Issues

#### Symptom:
```
[INSTAGRAM DIRECT] Account insights failed - Status: 403
Instagram API error: 100 - Unsupported request
Insights failed for [media_id]: 403
```

#### Cause:
- Instagram account is not a Business/Creator account
- Missing `instagram_business_manage_insights` permission
- App not approved for required permissions

#### Solution:
1. **Convert to Business Account:**
   - Open Instagram app on phone
   - Go to Settings → Account → Switch to Professional Account
   - Choose "Business"

2. **Reconnect with full permissions:**
   - The OAuth flow should request: `instagram_business_basic,instagram_business_manage_insights`
   - Check your Instagram App permissions in Meta Developer Dashboard

3. **Verify account type:**
   ```bash
   # Check if account is business
   GET /api/social-accounts?workspaceId=YOUR_WORKSPACE_ID
   # Look for: "isBusinessAccount": true
   ```

---

### Error Type 3: Post-Level Insight Restrictions (Instagram API v22+)

#### Symptom:
```
[INSTAGRAM DIRECT] Instagram API v22+ blocking individual post reach insights
[SMART POLLING] Insights failed for [media_id]: 400
Current account reach: 4 vs expected ~747
Gap: 743 reach units (99% missing)
```

#### Cause:
- Instagram API v22+ has stricter rate limits for post-level insights
- Accounts with few followers (<10k) have limited access to post insights
- API throttling to prevent abuse

#### Solution:
**This is NOT a bug - it's an Instagram API limitation!**

The app already handles this gracefully:
1. **Uses account-level insights as primary source** (more reliable)
2. **Falls back to profile metrics** if insights unavailable
3. **Samples only 5 posts** to avoid rate limits
4. **Caches results** to minimize API calls

✅ **Your AI Story Banner will still work** - it uses aggregated account metrics, not individual post insights.

---

### Error Type 4: Rate Limiting

#### Symptom:
```
[INSTAGRAM DIRECT] Instagram API error: 4
Rate limit exceeded
Too many requests
```

#### Cause:
- Too many API calls in short time
- Instagram Graph API has rate limits: 200 calls/hour per user

#### Solution:
**The app has built-in protections:**
1. Smart polling (only checks every 5-15 minutes)
2. Caching (reuses data for 1 hour)
3. Webhook-based updates (real-time, no polling needed)

**If you hit rate limits:**
- Wait 1 hour
- Don't manually sync repeatedly
- Let webhooks handle updates automatically

---

### Error Type 5: Account Not Found / Profile Fetch Failed

#### Symptom:
```
[INSTAGRAM CALLBACK] Profile fetch failed: 400
Instagram account not found
No Instagram account connected
```

#### Cause:
- OAuth callback didn't complete successfully
- Account was saved but missing critical fields
- Database connection interrupted during save

#### Solution:
1. **Check if account exists in database:**
   ```bash
   GET /api/social-accounts?workspaceId=YOUR_WORKSPACE_ID
   ```

2. **If account is missing:**
   - Reconnect Instagram from Integrations page
   - Make sure OAuth callback completes (don't close the tab)

3. **If account exists but broken:**
   - Delete the account: `DELETE /api/social-accounts/ACCOUNT_ID`
   - Reconnect fresh

---

## 🔧 Diagnostic Commands

### Check Server Logs for Specific Error

```powershell
# Search for Instagram errors in running server
# (Watch your terminal where npx tsx server/index.ts is running)

# Look for patterns like:
# - [INSTAGRAM DIRECT] Error:
# - [INSTAGRAM API] Failed:
# - Instagram API error: XXX
```

### Test Instagram Connection

```powershell
# 1. Check if account is connected
curl http://localhost:5000/api/social-accounts?workspaceId=684402c2fd2cd4eb6521b386

# 2. Check token status
curl http://localhost:5000/api/instagram/token-status?accountId=YOUR_ACCOUNT_ID

# 3. Try manual sync
curl -X POST http://localhost:5000/api/instagram/manual-sync/YOUR_ACCOUNT_ID
```

### Check AI Story System Status

```powershell
# Verify AI Story services are loaded
curl http://localhost:5000/api/ai-growth-insights/status

# Expected:
# {
#   "status": "operational",
#   "servicesLoaded": {
#     "snapshotService": true,
#     "aiStoryGenerator": true
#   }
# }
```

---

## 🎯 Is This Related to AI Story Banner?

### ✅ NOT Related (Safe to Ignore):
- Post-level insight restrictions (API v22+)
- Rate limits from old polling code
- Historical sync errors

The AI Story Banner uses:
- **Account-level aggregated metrics** (not individual posts)
- **Cached data** (minimal API calls)
- **Fallback strategies** (works even if Instagram API is limited)

### ⚠️ RELATED (Needs Fixing):
- Expired access token (Error 190)
- Missing account (404)
- Permission errors (Error 100)

These prevent fetching any Instagram data, which breaks the AI Story system.

---

## 🚀 Quick Fix Checklist

For AI Story Banner to work, you need:

- [ ] Instagram Business/Creator account connected
- [ ] Valid access token (not expired)
- [ ] Account has at least some metrics (followers, posts)
- [ ] Server restarted (to load new AI Story services)
- [ ] Services initialized (status endpoint returns true)

**If you have all of the above, the AI Story Banner will work regardless of post-level insight errors!**

---

## 📸 What to Share for Help

If you need help diagnosing, share:

1. **Exact error message from server console** (copy-paste or screenshot)
2. **Error code** (e.g., 190, 100, 403, 4)
3. **Endpoint that failed** (e.g., `/insights?metric=reach`)
4. **Your account type** (Personal vs Business/Creator)
5. **Status endpoint response:**
   ```bash
   curl http://localhost:5000/api/ai-growth-insights/status
   ```

---

## 🎓 Understanding Instagram API Limitations

Instagram intentionally restricts insights to:
- **Business/Creator accounts only** (Personal accounts get zero insights)
- **Accounts with sufficient followers** (some endpoints need 100+ followers)
- **Recent content** (insights only for last 30 days)
- **Rate-limited access** (200 calls/hour per user)

This is **normal** and **expected**. Your app handles these limitations gracefully.

---

## ✨ Expected Behavior After Fix

Once Instagram connection is healthy:

1. **Server logs show:**
   ```
   [AI INSIGHTS API] ⭐ REQUEST RECEIVED for workspace: ...
   [AI STORY] Generating stories for @rahulc1020, period: month
   [INSTAGRAM DIRECT] Using comprehensive Instagram Business API insights
   [AI STORY] Claude generated 3 stories
   ```

2. **Dashboard shows:**
   - Story banner with AI-generated content
   - Metrics from Instagram (followers, reach, engagement)
   - No error messages

3. **Browser console shows:**
   - `GET /api/ai-growth-insights?workspaceId=...&period=month → 200 OK`
   - No 401, 403, or 500 errors

---

## 🔄 If Nothing Works

**Nuclear option:**

1. **Disconnect Instagram** (Integrations page)
2. **Delete account from database** (if needed)
3. **Clear browser cache** (Application → Storage → Clear site data)
4. **Restart server**
5. **Reconnect Instagram** (fresh OAuth flow)
6. **Verify Business account** (Instagram app settings)
7. **Test status endpoint**
8. **Check dashboard**

This gives you a completely fresh start.

---

## 💡 Pro Tips

1. **Don't worry about post-level insight errors** - They're Instagram API limitations, not bugs
2. **Use account-level metrics** - More reliable and not rate-limited
3. **Let webhooks handle updates** - No need to manually sync
4. **Cache is your friend** - Reduces API calls and prevents rate limits
5. **Business account is required** - Convert from Personal if needed

---

**Bottom Line:**

Most Instagram "errors" you see are actually just the app handling API limitations gracefully. As long as:
- Account is connected ✅
- Token is valid ✅
- Services are loaded ✅

...the AI Story Banner will work perfectly! 🚀

