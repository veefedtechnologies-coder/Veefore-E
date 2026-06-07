# POST /api/ai/regenerate-captions Endpoint

## Overview
This endpoint regenerates a single caption variation with optional adjustments based on user feedback. It's part of Task 15.2 of the Authentic Instagram Caption Generation feature.

## Endpoint Details
- **URL**: `POST /api/v1/ai/regenerate-captions`
- **Authentication**: Required (Bearer token)
- **Rate Limiting**: Applied (aiRateLimiter)
- **Credits**: Costs 1 content_generation credit

## Request Body Schema

```typescript
{
  workspaceId: string;                    // Required - workspace ID
  postDetails: {
    title?: string;                       // Optional - post title
    type?: string;                        // Optional - 'post' | 'story' | 'reel'
    platform?: string;                    // Optional - default: 'Instagram'
    mediaUrl?: string;                    // Optional - media URL
    existingCaption?: string;             // Optional - previous caption
  };
  variationIndex: number;                 // Required - index of variation being regenerated (0-2)
  adjustments?: {
    tone?: string;                        // Optional - adjust tone (e.g., 'casual', 'professional')
    hashtagStrategy?: string;             // Optional - hashtag strategy
    emphasize?: string;                   // Optional - what to emphasize in caption
  };
}
```

## Response Schema

```typescript
{
  variation: {
    caption: string;                      // Generated caption text
    hashtags: string[];                   // Array of hashtags
    style: 'viral' | 'authentic' | 'balanced';
    styleDescription: string;
    authenticityScore: number;            // 0-100 score
    authenticityDetails: {
      criteriaScores: {                   // Detailed scores
        vocabularyNaturalness: number;
        sentenceFlow: number;
        // ... 10 more criteria
      };
      aiTellsDetected: string[];          // Detected AI patterns
      recommendations: string[];          // Improvement suggestions
      passesThreshold: boolean;           // Whether score >= 80
    };
    engagementPrediction: {
      predictedLikeRate: number;          // Predicted like rate %
      predictedCommentRate: number;       // Predicted comment rate %
      predictedSaveRate: number;          // Predicted save rate %
      predictedShareRate: number;         // Predicted share rate %
      confidence: number;                 // Prediction confidence 0-1
      factors: {                          // Contributing factors
        hookStrength: number;             // 0-10
        readabilityScore: number;         // 0-10
        ctaClarity: number;               // 0-10
        emotionalResonance: number;       // 0-10
        lengthOptimality: number;         // 0-10
        trendingTopicBonus: number;       // 0-10
      };
      vsUserAverage: number;              // % diff from user average
    };
    regenerationMetadata: {
      originalVariationIndex: number;     // Index of original variation
      adjustmentsApplied: object;         // Applied adjustments
      regeneratedAt: string;              // ISO timestamp
    };
  };
  creditsUsed: number;
  remainingCredits: number;
}
```

## Implementation Details

### Flow
1. **Validate credentials** - Check user authentication
2. **Check credits** - Ensure sufficient credits (1 for content_generation)
3. **Validate workspace** - Verify user owns workspace
4. **Load preferences** - Get user and workspace AI preferences
5. **Apply adjustments** - Merge adjustments into preferences
6. **Generate caption** - Use AIServiceManager.generateInstagramCaptions()
7. **Apply authenticity filter** - Only return captions with score >= 80
8. **Generate hashtags** - Use HashtagGeneratorService
9. **Save to database** - Track regenerated caption
10. **Deduct credits** - Charge user's account
11. **Return response** - Send variation with metadata

### Key Features
- **Authenticity Scoring**: Uses AuthenticityScorer to evaluate captions (12 criteria)
- **Engagement Prediction**: Uses EngagementPredictor for performance estimates
- **Voice Matching**: Leverages PromptConstructorService for voice profile integration
- **Adjustments Support**: Allows tone, hashtag strategy, and emphasis modifications
- **Database Tracking**: Saves regenerated captions for learning and feedback

### Error Handling
- **402 Insufficient Credits**: User doesn't have enough credits
- **403 Access Denied**: User doesn't own workspace
- **404 Workspace Not Found**: Invalid workspaceId
- **500 Failed to regenerate**: Generation or authenticity scoring failed

## Example Usage

### Request
```bash
POST /api/v1/ai/regenerate-captions
Authorization: Bearer <token>
Content-Type: application/json

{
  "workspaceId": "workspace123",
  "postDetails": {
    "title": "New fitness routine",
    "type": "post",
    "platform": "Instagram",
    "mediaUrl": "https://example.com/image.jpg",
    "existingCaption": "Check out my new workout!"
  },
  "variationIndex": 0,
  "adjustments": {
    "tone": "motivational",
    "emphasize": "transformation journey"
  }
}
```

### Response
```json
{
  "variation": {
    "caption": "Your transformation starts now! 💪...",
    "hashtags": ["#fitness", "#transformation", ...],
    "style": "balanced",
    "styleDescription": "Strategic blend of viral patterns...",
    "authenticityScore": 85,
    "authenticityDetails": { ... },
    "engagementPrediction": {
      "predictedLikeRate": 3.5,
      "predictedCommentRate": 0.8,
      ...
    },
    "regenerationMetadata": {
      "originalVariationIndex": 0,
      "adjustmentsApplied": {
        "tone": "motivational",
        "emphasize": "transformation journey"
      },
      "regeneratedAt": "2024-01-15T10:30:00.000Z"
    }
  },
  "creditsUsed": 1,
  "remainingCredits": 49
}
```

## Database Integration

The endpoint uses:
- **AIServiceManager** - Caption generation with authenticity/engagement scoring
- **HashtagGeneratorService** - Strategic hashtag generation
- **AIContentGenerator.saveGeneratedCaption()** - Persist caption data
- **Storage** - Workspace validation and user data
- **AICreditService** - Credit checking and deduction

## MongoDB Collections Used
- `generatedcaptions` - Stores caption variations and metadata
- `voiceprofiles` - Loads user voice profile for generation
- `viralpatterns` - Retrieves relevant viral patterns
- `nichecontexts` - Gets niche-specific language
- `examplecaptions` - Provides few-shot learning examples

## Testing
To test the endpoint:

```bash
# Using curl
curl -X POST http://localhost:5000/api/v1/ai/regenerate-captions \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "workspaceId": "workspace123",
    "postDetails": {
      "title": "Test post",
      "type": "post"
    },
    "variationIndex": 0
  }'
```

## Requirements Satisfied
- ✅ Accept workspaceId, postDetails, variationIndex, adjustments
- ✅ Use AIContentGenerator to regenerate single variation with adjustments
- ✅ Apply authenticity score threshold (80+)
- ✅ Save to database with regeneration metadata
- ✅ Return new caption variation with authenticity and engagement scores
- ✅ Integrate with MongoDB for persistence
- ✅ Support tone, hashtagStrategy, emphasize adjustments

## Related Files
- `/server/routes/v1/ai.routes.ts` - Endpoint implementation
- `/server/services/AIServiceManager.ts` - Caption generation
- `/server/services/AuthenticityScorer.ts` - Authenticity scoring
- `/server/services/EngagementPredictor.ts` - Engagement prediction
- `/server/services/HashtagGeneratorService.ts` - Hashtag generation
- `/server/ai-content-generator.ts` - Caption tracking
- `/server/services/PromptConstructorService.ts` - Prompt building

## Task Information
- **Spec**: authentic-instagram-caption-generation
- **Task**: 15.2 - Create POST /api/ai/regenerate-captions endpoint
- **Status**: ✅ Completed
- **Date**: January 2024
