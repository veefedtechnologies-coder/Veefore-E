# Voice Profile Recalibrate API

## PUT /api/v1/voice-profile/:workspaceId/recalibrate

Manually triggers voice profile recalibration using recent captions. This endpoint allows users to update their voice profile based on their latest content, ensuring the AI continues to match their evolving writing style.

### Authentication
Requires authentication via `requireAuth` middleware.

### Rate Limiting
Subject to AI rate limiting via `aiRateLimiter` middleware.

### URL Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| workspaceId | string | Yes | The workspace ID for which to recalibrate the voice profile |

### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| recentCaptions | string[] | No | Array of at least 5 captions (min 1 char, max 5000 chars each). If not provided, will fetch from database. |
| forceUpdate | boolean | No | Force recalibration even if profile was recently updated (within 24 hours). Default: false |

### Request Example

#### With provided captions
```json
{
  "recentCaptions": [
    "Just posted my best workout yet! 💪 Who else is crushing their fitness goals?",
    "Coffee and code - the perfect combo ☕ What's your go-to morning routine?",
    "Behind the scenes of my latest project 🎨 #CreativeProcess",
    "Throwback to this amazing sunset 🌅 Missing summer vibes already",
    "New recipe alert! This one is a game changer 🍝 Link in bio"
  ],
  "forceUpdate": false
}
```

#### Without captions (fetch from DB)
```json
{
  "forceUpdate": true
}
```

#### Empty body (use defaults)
```json
{}
```

### Success Response (200 OK)

When recalibration is successful:

```json
{
  "success": true,
  "voiceProfile": {
    "confidence": 0.89,
    "sampleSize": 8,
    "characteristics": {
      "paragraphStructure": "short-breaks",
      "sentenceLengthDistribution": {
        "short": 35,
        "medium": 45,
        "long": 20
      },
      "emojiUsage": {
        "frequency": "moderate",
        "placement": "inline",
        "topEmojis": ["💪", "☕", "🎨", "🌅", "🍝"]
      },
      "punctuation": {
        "exclamations": "moderate",
        "questions": "frequent",
        "ellipsis": true
      },
      "dominantTones": [
        { "tone": "casual", "score": 75 },
        { "tone": "conversational", "score": 68 },
        { "tone": "inspirational", "score": 52 }
      ],
      "signaturePhrases": [
        "just posted",
        "who else",
        "game changer"
      ],
      "hookPatterns": [
        "Just [action]!",
        "[Item] and [item] - [description]",
        "[Action] alert!"
      ],
      "engagementStyles": [
        "Who else [question]?",
        "What's your [question]?",
        "Link in bio"
      ],
      "storytellingStructure": "linear"
    },
    "topVocabulary": [
      { "word": "amazing", "frequency": 0.045 },
      { "word": "best", "frequency": 0.038 },
      { "word": "new", "frequency": 0.032 },
      { "word": "just", "frequency": 0.028 }
    ],
    "lastUpdated": "2024-01-15T10:30:00.000Z",
    "createdAt": "2024-01-01T08:00:00.000Z"
  },
  "confidence": 0.89,
  "message": "Voice profile recalibrated successfully using 8 recent captions with 89% confidence.",
  "recalibratedAt": "2024-01-15T10:30:00.000Z"
}
```

### Success Response - Recently Updated (200 OK)

When profile was recently updated and forceUpdate is false:

```json
{
  "success": false,
  "message": "Voice profile was updated 2 hours ago. Use forceUpdate: true to recalibrate anyway.",
  "lastUpdated": "2024-01-15T08:30:00.000Z",
  "hoursSinceUpdate": 2
}
```

### Error Responses

#### 400 Bad Request - Missing Workspace ID
```json
{
  "error": "Workspace ID is required in URL path"
}
```

#### 400 Bad Request - Insufficient Captions
```json
{
  "error": "Insufficient captions for recalibration. Need at least 5 captions with 10+ characters.",
  "found": 3,
  "required": 5,
  "suggestion": "Either provide recentCaptions in the request body or ensure you have at least 5 published posts with captions."
}
```

#### 404 Not Found - Workspace Not Found
```json
{
  "error": "Workspace not found"
}
```

#### 403 Forbidden - Access Denied
```json
{
  "error": "Access denied to workspace"
}
```

#### 500 Internal Server Error
```json
{
  "error": "Failed to recalibrate voice profile",
  "details": "Error message details"
}
```

## Behavior Details

### Caption Source Priority
1. **Provided Captions**: If `recentCaptions` is provided with at least 5 valid captions, use those
2. **Database Captions**: If no captions provided or fewer than 5, fetch recent content from database
3. **Caption Extraction**: Captions are extracted from content in this order:
   - `contentData.caption`
   - `contentData.description`
   - `description` field

### Caption Filtering
- Captions must have at least 10 characters after trimming
- Invalid or empty captions are filtered out
- System fetches up to 20 most recent posts from database

### Update Cooldown
- By default, recalibration is skipped if profile was updated within the last 24 hours
- Use `forceUpdate: true` to bypass this check
- This prevents excessive recalibration that may destabilize the profile

### Voice Profile Analysis
The recalibration process analyzes:
- **Vocabulary Frequency**: Word usage patterns
- **Signature Phrases**: Unique expressions
- **Sentence Length Distribution**: Short/medium/long sentence ratios
- **Paragraph Structure**: single, short-breaks, or long-form
- **Emoji Usage**: Frequency, placement, and top emojis
- **Punctuation Style**: Exclamation, question, and ellipsis usage
- **Tone Markers**: Casual, professional, humorous, inspirational, educational, conversational
- **Hook Patterns**: Opening sentence structures
- **Engagement Questions**: Question asking styles
- **Storytelling Structure**: Linear, flashback, buildup, or revelation

### Confidence Score
- Based on sample size (more captions = higher confidence)
- Starts at 85% for 5 captions
- Increases by 2% per additional caption (up to 98% max)

## Use Cases

### 1. Initial Profile Setup
After publishing several posts, recalibrate to create an initial voice profile based on actual published content:

```bash
curl -X PUT https://api.example.com/api/v1/voice-profile/workspace123/recalibrate \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"forceUpdate": true}'
```

### 2. Writing Style Evolution
After your writing style evolves over time, force recalibration to update the profile:

```bash
curl -X PUT https://api.example.com/api/v1/voice-profile/workspace123/recalibrate \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"forceUpdate": true}'
```

### 3. Manual Caption Submission
Provide specific high-performing captions to train the profile:

```bash
curl -X PUT https://api.example.com/api/v1/voice-profile/workspace123/recalibrate \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "recentCaptions": [
      "Your high-performing caption 1",
      "Your high-performing caption 2",
      "Your high-performing caption 3",
      "Your high-performing caption 4",
      "Your high-performing caption 5"
    ]
  }'
```

## Requirements Validation

This endpoint implements **Requirement 10.6** from the design document:
> "WHERE the system detects declining caption acceptance rates, THE Caption_Generator SHALL flag the issue and prompt voice profile recalibration"

While this is a manual endpoint, it supports the automated recalibration system by providing a way for users to manually trigger profile updates when needed.

## Related Endpoints

- `POST /api/v1/voice-profile/analyze` - Initial voice profile creation
- `GET /api/v1/voice-profile/:workspaceId` - Retrieve existing voice profile

## Implementation Notes

- Uses `VoiceProfileService.analyzeAndCreateProfile()` which performs an upsert operation
- Requires MongoDB connection for both fetching content and storing updated profile
- Validates workspace ownership using multiple user ID formats (MongoDB ObjectId, Firebase UID)
- Automatically filters out short captions (< 10 characters)
- Stores updated profile with new confidence score and timestamp
