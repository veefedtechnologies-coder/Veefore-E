# 🔄 Restart and Test Guide - AI Story Banner System

## ⚠️ IMPORTANT: You MUST Restart Your Server!

The AI Story Banner system code was added while your server was running. **Node.js does not hot-reload server-side code**, so you need to restart to load the new services.

---

## 📋 Step-by-Step Testing Instructions

### Step 1: Stop Your Current Server

In your terminal where the server is running:
```powershell
# Press Ctrl+C to stop the server
```

You should see the server process terminate.

---

### Step 2: Restart the Server

```powershell
# Make sure you're in the project root
cd F:\Veefed Veefore\Veefore

# Start the server
npx tsx server/index.ts
```

---

### Step 3: Look for Startup Messages

After restart, you should see these new log messages:

```
✅ EXPECTED STARTUP LOGS:
[SCHEDULER] Next 4 AM snapshot task scheduled at: 2025-10-04T04:00:00.000Z
```

If you DON'T see this message, there's an initialization error.

---

### Step 4: Test the Status Endpoint

Open a new terminal and run:

```powershell
# Test if services are loaded
curl http://localhost:5000/api/ai-growth-insights/status
```

**Expected Response:**
```json
{
  "status": "operational",
  "servicesLoaded": {
    "snapshotService": true,
    "aiStoryGenerator": true
  },
  "timestamp": "2025-10-03T16:20:00.000Z"
}
```

If `snapshotService` or `aiStoryGenerator` is `false`, the services didn't initialize.

---

### Step 5: Open Your Dashboard

1. Open your browser: `http://localhost:5000` (or your app URL)
2. Navigate to the **Performance Overview** section
3. **Open Browser DevTools** (F12)
4. Go to the **Console** tab

---

### Step 6: Watch for API Calls

In the browser console, you should see:

```javascript
// Network tab should show:
GET /api/ai-growth-insights?workspaceId=XXX&period=month

// In server terminal, you should see:
[AI INSIGHTS API] ⭐ REQUEST RECEIVED for workspace: XXX period: month
[AI INSIGHTS API] Services available: { snapshotService: true, aiStoryGenerator: true }
```

---

### Step 7: Verify Story Banner

On the dashboard, you should see:

1. **Story Banner Card** appears below the period tabs (Today/Week/Month)
2. Banner shows:
   - 📊 Emoji (large, centered)
   - **Bold Title** (e.g., "Growth Momentum")
   - Story text with your actual metrics
   - 💡 Suggestion pill
   - ✅ "What's working" section
   - ⚠️ "Needs attention" section
3. Close button (X) in top-right corner

---

## 🔍 Troubleshooting

### Problem: Server won't start / crashes

**Check for errors:**
```powershell
# Look for import errors
npx tsx server/index.ts 2>&1 | Select-String "Error"
```

**Common issues:**
- Missing dependencies
- TypeScript compilation errors
- MongoDB connection issues

**Solution:**
```powershell
# Reinstall dependencies
npm install

# Check for TypeScript errors
npx tsc --noEmit
```

---

### Problem: Status endpoint shows services as false

**This means the services didn't initialize.**

**Check:**
1. Are the service files present?
   ```powershell
   dir server\performance-snapshot-service.ts
   dir server\ai-story-generator.ts
   ```

2. Are imports correct in routes.ts?
   ```powershell
   Select-String -Path server\routes.ts -Pattern "PerformanceSnapshotService|AIStoryGenerator"
   ```

3. Are services instantiated?
   ```powershell
   Select-String -Path server\routes.ts -Pattern "new PerformanceSnapshotService|new AIStoryGenerator"
   ```

---

### Problem: API call not happening

**Check browser console for errors:**

Look for:
- Network errors (401, 403, 500)
- CORS errors
- React query errors

**Check if query is enabled:**
```typescript
// In performance-score.tsx
enabled: !!currentWorkspace?.id  // Must be true
```

**Force a refresh:**
1. Open DevTools → Application → Storage
2. Clear "Query Client Cache"
3. Refresh page

---

### Problem: Story banner not visible

**Check component rendering:**

1. Open browser DevTools
2. Inspect the Performance Overview section
3. Look for element with class containing `story` or `banner`

**Check if stories array exists:**
```javascript
// In browser console
// Find the component props
// Should have: aiInsights.stories (array with 3 items)
```

**Check if `showDataStory` is true:**
- Component sets `showDataStory = true` on mount
- If false, banner won't render

---

### Problem: "What's working" / "Needs attention" not showing

**This happens if the story object doesn't have these fields.**

**Check API response:**
```javascript
// In browser Network tab, click the ai-growth-insights request
// Check response:
{
  "stories": [
    {
      "working": "...",    // Must be present
      "attention": "..."   // Must be present
    }
  ]
}
```

**If missing:**
- AI didn't generate them (fallback being used)
- Check server logs for AI errors

---

### Problem: No rotation after 3 minutes

**Check:**
1. Is `showDataStory` true? (Banner must be visible)
2. Are there multiple stories? (Need at least 2 to rotate)
3. Check browser console for timer errors

**Test rotation manually:**
```javascript
// In browser console, force rotation:
// Find React component and update storyIndex
```

---

### Problem: Scheduler not running

**Check if scheduled:**
```
# Should see in server logs on startup:
[SCHEDULER] Next 4 AM snapshot task scheduled at: ...
```

**If not present:**
- Server restarted before schedule4AMTasks() was called
- Syntax error in scheduler code
- Schedule function not invoked

**Manual test (for dev):**
You can modify the code to run immediately:
```typescript
// In routes.ts, change:
next4AM.setHours(4, 0, 0, 0);
// to:
next4AM.setHours(new Date().getHours(), new Date().getMinutes() + 1, 0, 0);
```

---

## ✅ Expected Behavior After Successful Setup

### First Dashboard Visit
1. Component loads
2. Calls `/api/ai-growth-insights?workspaceId=XXX&period=month`
3. Server logs: `[AI INSIGHTS API] ⭐ REQUEST RECEIVED`
4. No cache exists → Generates AI stories
5. Server logs: `[AI STORY] Generating stories for @username, period: month`
6. Server logs: `[AI STORY] Claude generated 3 stories` (or OpenAI)
7. Response includes 3 stories
8. Banner appears on dashboard
9. Stories cached until 4 AM or data change

### Second Dashboard Visit (within 1 hour)
1. Component loads
2. Calls same API
3. Server finds valid cache
4. Server logs: `[AI STORY CACHE] Cache hit for workspace XXX`
5. Returns cached stories instantly (<50ms)
6. Banner appears immediately

### After Switching Period
1. User clicks "This Week" tab
2. Component calls `/api/ai-growth-insights?period=week`
3. Different cache key → May regenerate if no weekly cache
4. Banner shows different content (weekly insights)
5. Rotation resets to first story

### After 3 Minutes
1. Timer fires
2. `storyIndex` increments
3. Banner smoothly transitions to next story
4. Different emoji, title, text appear
5. Repeats every 3 minutes

### At 4:00 AM
1. Scheduler wakes up
2. Logs: `[SCHEDULER 4AM] Running daily snapshot and cache invalidation...`
3. Creates snapshots for all accounts
4. Logs: `[SNAPSHOT] Created daily snapshot for @username`
5. Invalidates expired caches
6. Logs: `[AI STORY CACHE] Invalidated X expired cache entries`
7. Cleans up old snapshots
8. Logs: `[SNAPSHOT CLEANUP] Deleted old snapshots: {...}`
9. Reschedules for next day

---

## 🧪 Quick Verification Checklist

After restarting, check these:

- [ ] Server starts without errors
- [ ] See `[SCHEDULER] Next 4 AM snapshot...` in logs
- [ ] Status endpoint returns `true` for both services
- [ ] Dashboard loads without errors
- [ ] API call appears in browser Network tab
- [ ] Server logs show `[AI INSIGHTS API] ⭐ REQUEST RECEIVED`
- [ ] Story banner visible on dashboard
- [ ] Banner has emoji, title, story, suggestion
- [ ] "What's working" and "Needs attention" sections present
- [ ] Can switch between Today/Week/Month (banner updates)
- [ ] After 3 minutes, story changes automatically
- [ ] Close button works (banner disappears)

---

## 🚨 If Nothing Works

### Nuclear Option: Fresh Restart

1. **Stop server** (Ctrl+C)
2. **Clear node_modules and reinstall:**
   ```powershell
   Remove-Item -Recurse -Force node_modules
   npm install
   ```
3. **Rebuild TypeScript:**
   ```powershell
   npx tsc --noEmit
   ```
4. **Check for compilation errors** in output
5. **Restart server:**
   ```powershell
   npx tsx server/index.ts
   ```

### Still Not Working?

**Check file integrity:**
```powershell
# Verify files exist and have content
(Get-Content server\performance-snapshot-service.ts).Count
(Get-Content server\ai-story-generator.ts).Count

# Should output: 374, 414 (or similar)
```

**Check imports:**
```powershell
Select-String -Path server\routes.ts -Pattern "import.*PerformanceSnapshotService"
Select-String -Path server\routes.ts -Pattern "import.*AIStoryGenerator"
```

**Check services initialization:**
```powershell
Select-String -Path server\routes.ts -Pattern "snapshotService = new|aiStoryGenerator = new"
```

---

## 📞 What to Report If Still Broken

If you've followed all steps and it still doesn't work, provide:

1. **Server startup logs** (first 50 lines after restart)
2. **Browser console errors** (screenshot or copy)
3. **Network tab** for `/api/ai-growth-insights` request (status, response)
4. **Status endpoint response:** `/api/ai-growth-insights/status`
5. **File verification:**
   ```powershell
   dir server\*.ts | Select-String "snapshot|ai-story"
   ```

---

## 🎯 Success Indicators

You'll know it's working when:

✅ Server logs show scheduler initialized  
✅ Status endpoint returns both services as `true`  
✅ API call succeeds with 200 status  
✅ Response has `stories` array with 3 items  
✅ Story banner renders on dashboard  
✅ Banner content is unique per period  
✅ Stories rotate every 3 minutes  
✅ Cache works (instant second load)  

---

**Remember: SERVER RESTART IS MANDATORY!** 🔄

The code exists in the files, but Node.js won't load it until you restart the server process.


