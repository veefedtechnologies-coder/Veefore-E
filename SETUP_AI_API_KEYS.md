# 🔑 Setup AI API Keys for Story Banner

## ❌ Problem Identified

Your AI Story Banner is showing **identical fallback stories** because:
- ❌ **ANTHROPIC_API_KEY is NOT configured**
- ❌ **OPENAI_API_KEY is NOT configured**

Without API keys, the system cannot generate AI-powered stories and falls back to hardcoded ones:
- "Growth Tracking"
- "Community Engagement"  
- "Growth Opportunity"

---

## ✅ Solution: Add API Keys

You need **at least ONE** API key (Anthropic recommended):

### Option 1: Anthropic Claude (Recommended)

1. **Get API Key:**
   - Go to: https://console.anthropic.com/
   - Sign up or log in
   - Navigate to "API Keys"
   - Create a new key
   - Copy the key (starts with `sk-ant-...`)

2. **Add to your environment:**
   
   **Windows (PowerShell):**
   ```powershell
   # Temporary (current session only)
   $env:ANTHROPIC_API_KEY = "sk-ant-your-key-here"
   
   # Then restart your server:
   npx tsx server/index.ts
   ```
   
   **Or create a `.env` file** in your project root:
   ```
   ANTHROPIC_API_KEY=sk-ant-your-key-here
   ```

### Option 2: OpenAI GPT-4 (Alternative)

1. **Get API Key:**
   - Go to: https://platform.openai.com/api-keys
   - Sign up or log in
   - Create new secret key
   - Copy the key (starts with `sk-...`)

2. **Add to environment:**
   ```powershell
   $env:OPENAI_API_KEY = "sk-your-key-here"
   ```
   
   Or add to `.env`:
   ```
   OPENAI_API_KEY=sk-your-key-here
   ```

---

## 🚀 After Adding the Key

### Step 1: Restart Your Server

**IMPORTANT:** You MUST restart the server for the API key to be loaded!

```powershell
# Stop current server (Ctrl + C)
# Then start again:
npx tsx server/index.ts
```

### Step 2: Verify It's Working

After restart, you should see in server logs:

```
[AI STORY] Generating stories for @rahulc1020, period: month
[AI STORY] Claude generated 3 stories
```

**NOT:**
```
[AI STORY] Error generating stories: Anthropic API key not configured
```

### Step 3: Refresh Dashboard

1. Hard refresh your browser: **Ctrl + Shift + R**
2. Click through Today/Week/Month tabs
3. You should now see **DIFFERENT story titles** like:
   - "Daily Momentum" / "Today's Fire" / "Perfect Timing"
   - "Weekly Pulse" / "Engagement Surge" / "Content Strategy"
   - "Growth Journey" / "Monthly Momentum" / "Strategic Growth"

---

## 🎯 What You'll See After Fix

### Before (Current - Fallback Stories):
```
✅ Story titles: Growth Tracking | Community Engagement | Growth Opportunity
❌ Same titles for all periods
❌ Generic content
```

### After (With API Keys):
```
✅ Today: "Daily Momentum" | "Today's Fire" | "Perfect Timing"
✅ This Week: "Weekly Pulse" | "Engagement Surge" | "Content Strategy"
✅ This Month: "Growth Journey" | "Monthly Momentum" | "Strategic Growth"
✅ Each period has unique AI-generated content
✅ Personalized insights based on your actual metrics
```

---

## 💰 API Costs

### Anthropic Claude
- **Free tier:** $5 free credit
- **Cost per story generation:** ~$0.01-0.02
- **With caching:** Stories regenerate only when data changes or at 4 AM daily
- **Estimated monthly cost:** $1-3 (with smart caching)

### OpenAI GPT-4
- **Free tier:** $5 free credit (new accounts)
- **Cost per story generation:** ~$0.02-0.03
- **Similar caching benefits**

---

## 🔒 Security Notes

1. **Never commit API keys to Git**
   - Add `.env` to your `.gitignore`
   - Keys should stay on your local machine or server

2. **Use environment variables**
   - Don't hardcode keys in source code
   - Load from `.env` or system environment

3. **Rotate keys regularly**
   - If a key is exposed, regenerate immediately

---

## 🐛 Troubleshooting

### Issue: Server still shows "API key not configured"

**Solution:** Make sure you:
1. Set the environment variable BEFORE starting the server
2. Restarted the server after adding the key
3. Used the correct key format (starts with `sk-ant-` or `sk-`)

### Issue: "Invalid API key" error

**Solution:**
1. Verify the key is correct (no extra spaces)
2. Check if the key is active in your API dashboard
3. Ensure you have credits/billing enabled

### Issue: Stories still identical

**Solution:**
1. Clear browser cache (Ctrl + Shift + R)
2. Check server logs for "[AI STORY] Claude generated 3 stories"
3. Verify the API is actually being called

---

## 📝 Quick Setup Commands

```powershell
# 1. Set API key (replace with your actual key)
$env:ANTHROPIC_API_KEY = "sk-ant-api03-your-key-here"

# 2. Verify it's set
if ($env:ANTHROPIC_API_KEY) { Write-Host "✅ Key is set" } else { Write-Host "❌ Key NOT set" }

# 3. Restart server
npx tsx server/index.ts

# 4. In another terminal, test the endpoint
curl http://localhost:5000/api/ai-growth-insights/status
```

---

## ✨ Expected Result

Once configured, you'll get **truly unique AI-generated stories** for each period:

**Today:**
> 🔥 **Daily Momentum**  
> @rahulc1020 posted 2 pieces of content today. Your engagement rate of 61% shows strong audience connection!
> 
> 💡 Post during peak hours (6-9 PM) for maximum visibility
> 
> ✅ What's working: Engagement rate is exceptional  
> ⚠️ Needs attention: Increase posting frequency to daily

**This Week:**
> 🚀 **Weekly Growth**  
> Your content reached 50 people this week with 15 posts. Consistency is building momentum!
> 
> 💡 Maintain 3-5 posts per week for optimal growth
> 
> ✅ What's working: Posting consistency is excellent  
> ⚠️ Needs attention: Explore Reels for broader reach

**This Month:**
> 📊 **Strategic Growth**  
> @rahulc1020 has grown to 3 followers with 15 quality posts. Your foundation is solid for scale!
> 
> 💡 Focus on audience engagement and content variety
> 
> ✅ What's working: Content quality maintains high engagement  
> ⚠️ Needs attention: Expand reach with hashtags and collaborations

---

**That's the fix! Add your API key and restart the server!** 🚀

