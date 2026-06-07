# AIServiceManager.generateInstagramCaptions()

**Task 11.1 Implementation** - Authentic Instagram Caption Generation with Voice Matching and Viral Patterns

---

## Overview

The `generateInstagramCaptions()` method implements the full authentic caption generation workflow by integrating with multiple specialized services to generate captions that:

- Match the user's unique writing style (voice profile)
- Leverage proven viral patterns and hooks
- Use niche-specific language and cultural references
- Reference real high-performing examples
- Generate 3 distinct variations for user selection

## Method Signature

```typescript
async generateInstagramCaptions(params: {
  userId: string;
  workspaceId: string;
  topic: string;
  mediaAnalysis?: string;
  existingCaption?: string;
  postType?: 'post' | 'story' | 'reel';
  platform?: string;
  preferences?: UserAIPreferences;
}): Promise<CaptionVariation[]>
```

## Parameters

### Required Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `userId` | `string` | User identifier for voice profile lookup |
| `workspaceId` | `string` | Workspace identifier for voice profile lookup |
| `topic` | `string` | Main topic or theme for the caption |

### Optional Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `mediaAnalysis` | `string` | `undefined` | Description of media content (image/video analysis) |
| `existingCaption` | `string` | `undefined` | Existing caption to improve/enhance |
| `postType` | `'post' \| 'story' \| 'reel'` | `'post'` | Type of Instagram content |
| `platform` | `string` | `'Instagram'` | Social media platform |
| `preferences` | `UserAIPreferences` | `{}` | AI generation preferences |

### UserAIPreferences

```typescript
interface UserAIPreferences {
  aiModel?: string;              // AI model to use (default: 'veegpt-hybrid')
  creativityLevel?: number;      // 0.0-1.0 (default: 0.7)
  optimizationGoals?: string;    // e.g., 'Engagement', 'Reach'
  aiPersona?: string;            // e.g., 'Professional & Authoritative'
  captionStyle?: string;         // e.g., 'Storytelling'
  responseLength?: string;       // e.g., 'medium'
  multilingual?: string;         // e.g., 'auto'
  contentSafety?: string;        // 'strict', 'standard', 'off'
  aiMemory?: string;             // 'long-term', 'short-term'
  autoHashtags?: boolean;        // Include hashtags
  googleAiStudioKey?: string;    // Custom Google AI key
  openAiKey?: string;            // Custom OpenAI key
  contentNiche?: string;         // Content niche for context
}
```

## Return Value

Returns a Promise that resolves to an array of 3 `CaptionVariation` objects:

```typescript
interface CaptionVariation {
  caption: string;                              // The generated caption text
  style: 'viral' | 'authentic' | 'balanced';   // Variation style
  styleDescription: string;                     // Description of the style
}
```

### The 3 Variations

1. **Viral Variation** (`style: 'viral'`)
   - Maximum engagement focus
   - Aggressive hooks and trending patterns
   - Optimized for likes, shares, saves
   - Pushes boundaries while staying authentic

2. **Authentic Variation** (`style: 'authentic'`)
   - Voice-first approach
   - Personal, relatable storytelling
   - Genuine connection over viral mechanics
   - Sounds exactly like the user wrote it

3. **Balanced Variation** (`style: 'balanced'`)
   - Strategic blend of viral and authentic
   - Proven engagement formulas + unique voice
   - Sustainable long-term engagement
   - Best of both worlds

## How It Works

### 1. Prompt Construction

The method uses `PromptConstructorService` to build a comprehensive multi-layered prompt:

```
Layer 1: Base Context
├─ Platform-native writing principles
├─ Current viral formulas
└─ "What NOT to do" guidelines

Layer 2: Voice Layer
├─ User's vocabulary frequency
├─ Sentence structure patterns
├─ Emoji usage style
└─ Tone markers

Layer 3: Viral Patterns
├─ Proven high-engagement structures
├─ Viral hooks for the niche
└─ Pattern adaptation guidelines

Layer 4: Niche Context
├─ Industry-specific vocabulary
├─ Current slang and trends
├─ Cultural references
└─ Typical emojis

Layer 5: Examples
├─ Real high-performing captions
├─ Engagement metrics
└─ Style characteristics

Layer 6: Constraints
├─ Task-specific instructions
├─ Content safety guidelines
└─ Platform conventions
```

### 2. AI Generation

For each of the 3 variations:
1. Constructs a specific prompt for that style
2. Calls the AI provider (Google Gemini or OpenAI)
3. Receives the generated caption text

### 3. Response Parsing

The `cleanCaptionText()` method:
- Removes AI response labels
- Strips surrounding quotes
- Removes explanation sections
- Trims whitespace

### 4. Return Results

Returns array of 3 properly formatted `CaptionVariation` objects.

## Usage Examples

### Basic Usage

```typescript
import { aiServiceManager } from './services/AIServiceManager';

const variations = await aiServiceManager.generateInstagramCaptions({
  userId: 'user-123',
  workspaceId: 'workspace-456',
  topic: 'Morning workout and healthy breakfast',
  preferences: {
    contentNiche: 'fitness',
    aiModel: 'veegpt-hybrid',
    creativityLevel: 0.7
  }
});

// Access variations
console.log(variations[0].caption); // Viral variation
console.log(variations[1].caption); // Authentic variation
console.log(variations[2].caption); // Balanced variation
```

### With Media Analysis

```typescript
const variations = await aiServiceManager.generateInstagramCaptions({
  userId: 'user-123',
  workspaceId: 'workspace-456',
  topic: 'Tropical vacation',
  mediaAnalysis: 'Beach sunset with palm trees and crystal clear water',
  postType: 'post',
  preferences: {
    contentNiche: 'travel',
    creativityLevel: 0.8
  }
});
```

### Improving Existing Caption

```typescript
const variations = await aiServiceManager.generateInstagramCaptions({
  userId: 'user-123',
  workspaceId: 'workspace-456',
  topic: 'Chocolate chip cookies',
  existingCaption: 'Here is my new recipe. It tastes good.',
  preferences: {
    contentNiche: 'food',
    aiPersona: 'Warm & Friendly'
  }
});
```

### Different Post Types

```typescript
// Story
const storyVariations = await aiServiceManager.generateInstagramCaptions({
  userId: 'user-123',
  workspaceId: 'workspace-456',
  topic: 'Quick fashion tip',
  postType: 'story',
  preferences: { contentNiche: 'fashion' }
});

// Reel
const reelVariations = await aiServiceManager.generateInstagramCaptions({
  userId: 'user-123',
  workspaceId: 'workspace-456',
  topic: 'Dance challenge',
  postType: 'reel',
  preferences: { contentNiche: 'lifestyle' }
});
```

## Service Integration

### Automatic Service Loading

The method automatically loads context from:

1. **VoiceProfileService**
   - Uses `userId` and `workspaceId`
   - Loads voice characteristics
   - Falls back to default if not found

2. **ViralPatternService**
   - Uses `contentNiche` and `postType`
   - Loads 3 relevant patterns
   - Loads 5 viral hooks

3. **NicheContextService**
   - Uses `contentNiche`
   - Loads language, slang, trends
   - Provides cultural context

4. **ExampleCaptionService**
   - Uses `contentNiche` and `postType`
   - Loads 3 high-performing examples
   - Provides few-shot learning samples

## Error Handling

The method handles errors gracefully:

```typescript
try {
  const variations = await aiServiceManager.generateInstagramCaptions({
    userId: 'user-123',
    workspaceId: 'workspace-456',
    topic: 'Test topic'
  });
  
  console.log('Success:', variations.length, 'variations generated');
  
} catch (error) {
  if (error instanceof Error) {
    console.error('Error:', error.message);
    // Error message format: "Failed to generate Instagram captions: [reason]"
  }
}
```

### Common Error Scenarios

1. **AI Provider Not Configured**
   - Error: "OpenAI is not configured" or "No AI provider configured"
   - Solution: Set `GOOGLE_API_KEY` or `OPENAI_API_KEY` environment variable

2. **Database Connection Issues**
   - Error: "Operation buffering timed out"
   - Solution: Check MongoDB connection

3. **Service Unavailable**
   - The method continues with degraded functionality
   - Missing services result in simplified prompts

## Performance Considerations

### Timing

- **Typical execution time:** 15-30 seconds
- **3 sequential AI calls** (one per variation)
- **Parallel context loading** (voice profile, patterns, niche context, examples)

### Optimization Tips

1. **Cache voice profiles** - They change infrequently
2. **Pre-load niche contexts** - Can be cached for hours
3. **Batch requests** - Generate multiple captions in parallel
4. **Use faster models** - Consider `gemini-1.5-flash` for speed

## Testing

### Unit Tests

```bash
npm test -- server/services/AIServiceManager.unit.test.ts --run
```

Tests verify:
- Interface structure
- Type safety
- Parameter handling
- Return value format

### Integration Tests

```bash
npm test -- server/services/AIServiceManager.integration.test.ts --run
```

Tests verify:
- Actual AI generation
- Service integration
- Different post types
- Error handling

## Requirements Satisfied

This implementation satisfies the following requirements:

- ✅ **1.4** - Voice profile integration in caption generation
- ✅ **2.3** - Viral pattern selection and application
- ✅ **3.2** - Niche context integration
- ✅ **7.3** - Example caption integration
- ✅ **8.1** - Multi-variation generation (3 variations)
- ✅ **8.2** - Variation display with style characteristics

## Next Steps

This method will be used by:

1. **Task 11.2** - Multi-variation generation with authenticity scoring and engagement prediction
2. **Task 11.3** - Caption tracking and storage
3. **Task 15.1** - Extended POST /api/ai/generate-caption endpoint

## API Endpoint Integration (Future)

Future endpoint structure:

```typescript
POST /api/v1/ai/generate-instagram-captions

Request Body:
{
  "topic": "Morning workout",
  "mediaAnalysis": "Image of person doing yoga",
  "postType": "post",
  "preferences": {
    "contentNiche": "fitness",
    "creativityLevel": 0.7
  }
}

Response:
{
  "variations": [
    {
      "caption": "...",
      "style": "viral",
      "styleDescription": "...",
      "authenticityScore": 85,
      "engagementPrediction": { ... }
    },
    // ... 2 more variations
  ],
  "creditsUsed": 3,
  "remainingCredits": 997
}
```

## Additional Resources

- **Usage Examples:** `AIServiceManager.generateInstagramCaptions.example.ts`
- **Task Summary:** `TASK_11.1_SUMMARY.md`
- **Design Document:** `.kiro/specs/authentic-instagram-caption-generation/design.md`
- **PromptConstructorService:** `PromptConstructorService.README.md`

## Support

For issues or questions:
1. Check the example file for usage patterns
2. Review the task summary for implementation details
3. Consult the design document for architecture overview
4. Check the integration tests for expected behavior

---

**Implementation:** Task 11.1  
**Version:** 1.0.0  
**Date:** June 7, 2026  
**Status:** ✅ Complete
