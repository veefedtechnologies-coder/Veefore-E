# Instagram Sync Debugging Guide

## What I Fixed

### Backend Changes (`server/routes.ts`)
- ✅ Added **comprehensive logging** at the very start of `/api/instagram/immediate-sync`
- ✅ Logs request body, headers, workspace ID
- ✅ Tracks every step of the sync process
- ✅ Shows detailed account data and token info

### Frontend Changes
- ✅ Added **detailed console logs** in `Integration.tsx` refresh button
- ✅ Added **detailed console logs** in `social-accounts.tsx` sync button  
- ✅ Shows workspace ID before making API call
- ✅ Shows request body and response
- ✅ Better error messages

## How to Debug

### Step 1: Open Both Consoles

1. **Browser Console (F12)** - Click "Console" tab
2. **PowerShell Console** - Your server terminal window

### Step 2: Click the Refresh Button

Go to the **Integration** page (`/integration`) and click the **"Refresh"** button on your Instagram account card.

### Step 3: Watch BOTH Consoles

#### What You Should See in **BROWSER CONSOLE** (F12):

```
🔄 [FRONTEND] Manual refresh triggered
🔄 [FRONTEND] Current workspace: { id: "...", name: "..." }
🔄 [FRONTEND] Workspace ID: 686d98d74888852d5d7beb75
🔄 [FRONTEND] Calling API: /api/instagram/immediate-sync
🔄 [FRONTEND] Request body: { workspaceId: "686d98d74888852d5d7beb75" }
✅ [FRONTEND] Manual refresh completed: { success: true, username: "rahulc1020" }
✅ Refresh mutation success, refetching data...
```

#### What You Should See in **SERVER CONSOLE** (PowerShell):

```
🔵 [IMMEDIATE SYNC] ========== REQUEST RECEIVED ==========
🔵 [IMMEDIATE SYNC] Request body: {
  "workspaceId": "686d98d74888852d5d7beb75"
}
🔵 [IMMEDIATE SYNC] Request headers: { ... }
[IMMEDIATE SYNC] 🚀 Force sync requested for workspace: 686d98d74888852d5d7beb75
[IMMEDIATE SYNC] Retrieved accounts from storage: 1
[IMMEDIATE SYNC] Account object keys: [ ... ]
[IMMEDIATE SYNC] Has accessToken field: true
[IMMEDIATE SYNC] AccessToken value type: string
[IMMEDIATE SYNC] AccessToken value: EXISTS (200 chars)
[IMMEDIATE SYNC] Found account: { username: 'rahulc1020', ... }
[INSTAGRAM DIRECT SYNC] 🚀 Starting immediate sync for account: 25418395794416915
[INSTAGRAM DIRECT SYNC] ✅ Profile data fetched: { username: 'rahulc1020', followers: 3, ... }
[INSTAGRAM DIRECT SYNC] ✅ Account found in database
[INSTAGRAM DIRECT SYNC] ✅ Account updated successfully
[IMMEDIATE SYNC] ✅ Sync completed successfully
```

## Troubleshooting

### If You DON'T See Frontend Logs

**Problem**: Frontend code didn't update  
**Solution**: Hard refresh your browser (Ctrl + Shift + R or Ctrl + F5)

### If You See Frontend Logs BUT NO Server Logs

**Problem**: Request not reaching server  
**Possible Causes**:
1. Wrong URL or port
2. Server not running
3. Network issue
4. CORS issue

**Solution**: 
- Check server is running on correct port
- Check browser Network tab (F12 → Network) for the request
- Look for error in Network tab

### If Workspace ID is `undefined`

**Problem**: Workspace not loaded  
**Error in browser**: "No workspace selected. Please refresh the page and try again."  
**Solution**: Refresh the page (F5) and try again

### If Server Shows "No access token"

**Problem**: Access token not saved in database  
**Solution**: 
1. Disconnect Instagram account
2. Reconnect via OAuth
3. Check server logs during OAuth to verify token is saved

### If You See "Refresh Failed" Dialog

**Problem**: API returned an error  
**What to do**:
1. Check **browser console** for the error message
2. Check **server console** for the error details
3. Send me both console outputs

## Expected Result

After clicking "Refresh" and seeing all the logs above:
- ✅ "Data Synced!" success message appears
- ✅ Instagram followers count updates to 3
- ✅ Engagement rate updates to ~61% or 100%
- ✅ Posts count shows 15
- ✅ ALL visible immediately without refreshing page

## Next Steps

1. **Clear your browser cache** if you haven't already
2. **Hard refresh** the page (Ctrl + Shift + R)
3. **Click Refresh** button
4. **Take screenshots** of BOTH consoles
5. **Send me the console outputs** so I can see exactly what's happening

---

**Important**: Keep BOTH console windows visible side-by-side while testing so you can see logs in real-time!

