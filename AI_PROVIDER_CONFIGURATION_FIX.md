# AI Provider Configuration Fix

## Issue
The AI content generation system was hardcoded to use OpenAI, ignoring the user's AI provider configuration settings. Users who selected "Google AI Studio API" in their settings were still getting OpenAI quota errors.

## Root Cause
The `ai-content-generator.ts` file was:
1. Directly importing and using OpenAI SDK
2. Not checking workspace AI configuration
3. Not respecting the user's selected AI provider (Google AI Studio, Gemini, etc.)

## Solution Implemented

### Changes Made

**File**: `/server/ai-content-generator.ts`

1. **Removed Direct OpenAI Dependency**:
   - Removed `import OpenAI from 'openai'`
   - Removed `private openai: OpenAI` instance variable
   - Added `import { aiServiceManager } from './services/AIServiceManager'`

2. **Read User's AI Configuration**:
   ```typescript
   // Get AI preferences from workspace configuration
   const aiPreferences = {
     aiModel: insights.workspaceAI?.aiModel || 'veegpt-hybrid',
     creativityLevel: insights.creativityLevel || 0.7,
     optimizationGoals: insights.optimizationGoals,
     contentSafety: 'standard'
   };

   console.log('[AI CONTENT] Using AI model:', aiPreferences.aiModel);
   ```

3. **Use AIServiceManager Instead of Direct OpenAI Calls**:
   - **Caption Generation**: Now uses `aiServiceManager.generateText(fullCaptionPrompt, aiPreferences)`
   - **Hashtag Generation**: Now uses `aiServiceManager.generateText(fullHashtagPrompt, aiPreferences)`
   - Both respect the user's configured AI provider

4. **Updated Media Analysis**:
   - Added check: Only attempts vision analysis if using OpenAI GPT-4o
   - Gracefully skips media analysis for other providers
   - Provides clear log messages about why analysis was skipped

## How It Works Now

### 1. User Selects AI Provider in Settings
User goes to Settings → AI Configuration and selects:
- **Google AI Studio API** (Gemini 2.5 Pro)
- **OpenAI GPT-4o**
- **Gemini 1.5 Flash**
- **Gemini 2.0 Flash Exp**
- **VeeGPT Hybrid** (auto-selects best provider)

### 2. Configuration is Stored
The selection is saved in:
```typescript
workspace.aiConfiguration = {
  aiModel: 'google-ai-studio', // or other selected model
  creativityLevel: 0.7,
  optimizationGoals: 'engagement',
  // other settings...
}
```

### 3. AI Content Generator Reads Configuration
When generating content, the system:
1. Fetches user insights from database
2. Reads `workspace.aiConfiguration.aiModel`
3. Passes it to `AIServiceManager`

### 4. AIServiceManager Routes to Correct Provider
The `AIServiceManager` automatically routes requests to:
- `'google-ai-studio'` → Gemini 2.5 Pro API
- `'openai-gpt4o'` → OpenAI GPT-4o API
- `'gemini-1.5-flash'` → Gemini 1.5 Flash API
- `'veegpt-hybrid'` → Auto-selects based on query type

## Benefits

✅ **Respects User Preferences**: System now uses the AI provider selected in settings  
✅ **No More Hardcoded Provider**: Flexible architecture supports multiple AI providers  
✅ **Quota Management**: Users can switch providers to avoid quota limits  
✅ **Cost Optimization**: Users can choose more cost-effective providers  
✅ **Fallback Support**: VeeGPT Hybrid mode automatically selects best provider  
✅ **Clear Logging**: Console logs show which AI model is being used  

## Testing

### Before Fix
- User selects "Google AI Studio API" in settings
- AI generation still attempts to use OpenAI
- Gets 429 "quota exceeded" error from OpenAI
- Generation fails

### After Fix
- User selects "Google AI Studio API" in settings
- AI generation reads configuration
- Logs: `[AI CONTENT] Using AI model: google-ai-studio`
- Routes to Gemini 2.5 Pro
- Generation succeeds with Google's API

## Configuration Example

```typescript
// Example workspace AI configuration
{
  "aiModel": "google-ai-studio",
  "creativityLevel": 0.7,
  "optimizationGoals": "engagement",
  "aiPersona": "Professional & Authoritative",
  "captionStyle": "Storytelling"
}
```

## Supported AI Providers

1. **OpenAI GPT-4o** (`openai-gpt4o`)
   - Best for: Complex reasoning, vision analysis
   - Supports: Text, Vision, Media analysis

2. **Google AI Studio** (`google-ai-studio`)
   - Routes to: Gemini 2.5 Pro
   - Best for: Cost-effective, fast generation
   - Supports: Text generation

3. **Gemini 1.5 Flash** (`gemini-1.5-flash`)
   - Best for: Fast, lightweight tasks
   - Supports: Text generation

4. **Gemini 2.0 Flash Exp** (`gemini-2.0-flash-exp`)
   - Best for: Experimental features
   - Supports: Text generation

5. **VeeGPT Hybrid** (`veegpt-hybrid`)
   - Best for: Automatic selection
   - Falls back between providers based on availability

## Migration Notes

### For Users
- No action required
- Existing AI configuration preferences are automatically respected
- Switch providers in Settings → AI Configuration at any time

### For Developers
- `ai-content-generator.ts` no longer imports OpenAI directly
- All AI calls now go through `AIServiceManager`
- Media vision analysis only available with OpenAI GPT-4o
- Other providers gracefully skip vision and use text-only generation

## Future Enhancements

1. **Add Vision Support for Google Gemini** (when available)
2. **Add Anthropic Claude Support**
3. **Add Custom API Endpoint Support**
4. **Add Per-Operation Provider Selection**
5. **Add Cost Tracking Per Provider**

## Status

✅ **IMPLEMENTED AND TESTED**
- Configuration is properly read from workspace
- AI provider routing works correctly
- Logging shows which provider is being used
- Falls back gracefully when provider unavailable

## Date Implemented
June 7, 2026

## Related Files
- `/server/ai-content-generator.ts` - Main implementation
- `/server/services/AIServiceManager.ts` - Provider routing
- `/server/models/Workspace.ts` - Configuration storage
- `/client/src/components/settings/ai-configuration.tsx` - UI for settings
