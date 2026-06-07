# POST /api/v1/ai/adapt-caption

Adapt an Instagram caption for different social media platforms. This endpoint transforms caption structure, hashtag placement, and tone based on platform-specific requirements while maintaining the user's voice profile.

**Requirements:** 12.1, 12.2, 12.4

## Endpoint

```
POST /api/v1/ai/adapt-caption
```

## Authentication

Requires authentication via `requireAuth` middleware.

## Rate Limiting

Subject to AI rate limiting via `aiRateLimiter` middleware.

## Request Body

```typescript
{
  caption: string;           // Required: Original caption (1-5000 characters)
  targetPlatform: string;    // Required: Target platform (instagram, facebook, twitter, linkedin)
  workspaceId?: string;      // Optional: Workspace ID for voice profile context
}
```

### Request Example

```json
{
  "caption": "Just wrapped up an incredible photoshoot! 📸✨\n\nHad the most amazing time capturing these moments with the talented @photographer_name. The energy was unreal and I can't wait to share more behind-the-scenes content with you all!\n\nWhat type of content do you want to see more of? Drop a comment below! 👇\n\n#photography #photoshoot #behindthescenes #contentcreator #creative #artistlife",
  "targetPlatform": "twitter",
  "workspaceId": "workspace_123"
}
```

## Response

### Success Response (200 OK)

```typescript
{
  success: boolean;
  adapted: {
    platform: string;           // Target platform
    caption: string;            // Adapted caption text
    hashtags: string[];         // Extracted/limited hashtags
    characterCount: number;     // Character count of adapted caption
    warnings: string[];         // Warnings about adaptations
    adaptationNotes: string[];  // Notes about changes made
    optimizationTips: string[]; // Tips for improving the caption
  };
  original: {
    caption: string;            // Original caption
    characterCount: number;     // Original character count
  };
}
```

### Success Example

```json
{
  "success": true,
  "adapted": {
    "platform": "twitter",
    "caption": "wrapped up an incredible photoshoot! 📸✨ Had the most amazing time capturing these moments with the talented @photographer_name.",
    "hashtags": [
      "#photography",
      "#photoshoot",
      "#behindthescenes"
    ],
    "characterCount": 128,
    "warnings": [
      "Original caption exceeded Twitter limit and was condensed"
    ],
    "adaptationNotes": [
      "Caption condensed for Twitter character limit",
      "Adapted for Twitter: concise and direct tone"
    ],
    "optimizationTips": [
      "Twitter posts perform best with 2-3 targeted hashtags. Consider reducing."
    ]
  },
  "original": {
    "caption": "Just wrapped up an incredible photoshoot! 📸✨\n\nHad the most amazing time capturing these moments...",
    "characterCount": 709
  }
}
```

### Error Responses

#### 400 Bad Request - Invalid Input
```json
{
  "error": "Validation error",
  "details": "targetPlatform must be one of: instagram, facebook, twitter, linkedin"
}
```

#### 403 Forbidden - Workspace Access Denied
```json
{
  "error": "Access denied to workspace"
}
```

#### 404 Not Found - Workspace Not Found
```json
{
  "error": "Workspace not found"
}
```

#### 500 Internal Server Error
```json
{
  "error": "Failed to adapt caption",
  "details": "Unsupported platform: tiktok"
}
```

## Platform-Specific Behavior

### Twitter
- **Character Limit:** 280 characters
- **Hashtag Strategy:** 2-3 hashtags recommended (practical limit)
- **Tone:** Concise, punchy, direct
- **Formatting:** Compact line breaks
- **Emoji Usage:** Minimal (max 1-2)

**Adaptations:**
- Removes excessive line breaks
- Condenses caption if over 240 chars (leaving room for hashtags)
- Removes filler words (really, very, just, actually, literally)
- Makes tone more concise and direct

### LinkedIn
- **Character Limit:** 3,000 characters
- **Hashtag Strategy:** Up to 30 hashtags
- **Tone:** Professional, insightful, value-driven
- **Formatting:** Paragraph breaks
- **Emoji Usage:** Professional (max 2-3)

**Adaptations:**
- Adjusts tone to be more professional
- Replaces casual phrases (gonna → going to, wanna → want to)
- Reduces emoji usage to 2-3 maximum
- Applies paragraph structure for readability
- Adds business context framing

### Facebook
- **Character Limit:** 63,206 characters
- **Hashtag Strategy:** Up to 50 hashtags
- **Tone:** Conversational, storytelling-focused
- **Formatting:** Paragraph breaks
- **Emoji Usage:** Moderate (max 5)

**Adaptations:**
- Maintains storytelling elements
- Applies paragraph breaks for readability
- Keeps conversational tone
- Reduces excessive emoji usage

### Instagram
- **Character Limit:** 2,200 characters
- **Hashtag Strategy:** Up to 30 hashtags
- **Tone:** Casual, authentic, visual-focused
- **Formatting:** Mobile-first line breaks
- **Emoji Usage:** Friendly (no limit)

**Adaptations:**
- No adaptation needed (source platform)
- Maintains original format

## Voice Profile Integration

If a `workspaceId` is provided, the endpoint will attempt to load the user's voice profile to maintain voice consistency during adaptation. The voice profile helps:

- Preserve vocabulary patterns
- Maintain signature phrases
- Keep tone markers consistent
- Match emoji usage preferences

If the voice profile cannot be loaded, the endpoint will proceed with default adaptation rules.

## Usage Examples

### Adapt Instagram Caption for Twitter

```bash
curl -X POST https://api.example.com/api/v1/ai/adapt-caption \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "caption": "Just launched my new product! 🚀✨ Super excited to share this with everyone. Been working on this for months and finally ready! Check it out in my bio 👆 #product #launch #entrepreneur #startup #business #innovation",
    "targetPlatform": "twitter",
    "workspaceId": "workspace_123"
  }'
```

### Adapt Instagram Caption for LinkedIn

```bash
curl -X POST https://api.example.com/api/v1/ai/adapt-caption \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "caption": "Dropping some 🔥 tips today! Swipe through to see my favorite productivity hacks that changed my life 💯✨",
    "targetPlatform": "linkedin",
    "workspaceId": "workspace_123"
  }'
```

### Adapt Long Caption for Twitter

```bash
curl -X POST https://api.example.com/api/v1/ai/adapt-caption \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "caption": "Had the most amazing weekend getaway! 🌴☀️ Visited this incredible beach resort and the views were absolutely stunning. Met some wonderful people, tried amazing local cuisine, and just had the best time relaxing and unwinding. Sometimes you just need to take a break from the hustle and recharge. Highly recommend this place if you are looking for a peaceful escape! Already planning my next trip back here. #travel #beach #vacation #resort #weekend #getaway #relaxation #paradise #wanderlust #travelphotography",
    "targetPlatform": "twitter"
  }'
```

## Implementation Notes

1. **Character Truncation:** If a caption exceeds the platform's character limit, it will be truncated at sentence or word boundaries to maintain readability.

2. **Hashtag Extraction:** Hashtags are automatically extracted from the caption text and provided separately in the `hashtags` array.

3. **Emoji Reduction:** Excessive emoji usage is automatically reduced based on platform guidelines.

4. **Tone Adjustment:** The service adjusts tone based on platform conventions (e.g., professional for LinkedIn, concise for Twitter).

5. **Warning System:** The response includes warnings if the original caption required significant adaptation (e.g., truncation, excessive hashtag removal).

6. **Optimization Tips:** The response provides actionable tips for improving the caption's performance on the target platform.

## Related Endpoints

- `POST /api/v1/ai/generate-caption` - Generate caption variations
- `POST /api/v1/ai/regenerate-captions` - Regenerate captions with adjustments
- `GET /api/v1/voice-profile/:workspaceId` - Get voice profile

## Service Implementation

The endpoint uses the `PlatformAdapterService` which provides:
- Platform-specific constraints and rules
- Caption validation for platform requirements
- Adaptation logic for each platform
- Voice profile integration for consistency

See `server/services/PlatformAdapterService.ts` for implementation details.
