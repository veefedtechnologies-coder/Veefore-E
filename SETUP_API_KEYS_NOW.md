# 🚨 URGENT: Setup API Keys for AI Story Banner

## 🎯 **Current Issue:**
The AI story banner is using **fallback stories** instead of AI-generated content because the API keys are not configured.

## 📋 **Server Logs Show:**
- ❌ OpenAI: `Invalid JSON response from OpenAI`
- ❌ Anthropic: `Your credit balance is too low to access the Anthropic API`

## 🔧 **Quick Fix:**

### **Step 1: Create .env file**
Create a `.env` file in the root directory with:

```bash
# AI API Keys - Replace with your actual keys
OPENAI_API_KEY=your_openai_api_key_here
ANTHROPIC_API_KEY=your_anthropic_api_key_here

# Database
MONGODB_URI=mongodb+srv://brandboost09:Arpitc8433@cluster0.mekr2dh.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0

# Other environment variables
NODE_ENV=development
PORT=5000
```

### **Step 2: Get API Keys**

**OpenAI API Key:**
1. Go to https://platform.openai.com/api-keys
2. Create new API key
3. Copy the key (starts with `sk-`)

**Anthropic API Key:**
1. Go to https://console.anthropic.com/
2. Go to API Keys section
3. Create new API key
4. Copy the key (starts with `sk-ant-`)

### **Step 3: Update .env file**
Replace `your_openai_api_key_here` and `your_anthropic_api_key_here` with your actual keys.

### **Step 4: Restart Server**
```bash
npx tsx server/index.ts
```

## ✅ **Expected After Setup:**
- **Real AI-generated stories** (not fallback)
- **Different stories for each period** (Today/This Week/This Month)
- **Honest AI analysis** with realistic insights
- **Server logs showing**: `[AI STORY] Generated X stories`

## 🎯 **Current Status:**
- ✅ Period-specific fallback stories implemented
- ✅ Different titles and content for day/week/month
- ❌ **API keys needed for real AI generation**

**Once API keys are set up, you'll get proper AI-generated stories instead of fallback content!**
