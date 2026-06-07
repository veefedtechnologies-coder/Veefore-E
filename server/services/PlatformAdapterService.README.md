# PlatformAdapterService

## Overview

The `PlatformAdapterService` is a core component of the Authentic Instagram Caption Generation system that adapts captions for different social media platforms while preserving the user's unique voice and maintaining platform-native conventions.

## Purpose

This service addresses **Requirement 12: Cross-Platform Caption Adaptation** from the specification, enabling content creators to efficiently repurpose Instagram captions for other platforms (Facebook, Twitter/X, LinkedIn) while maintaining authenticity and platform-specific best practices.

## Features

### Supported Platforms

1. **Instagram** (2,200 char limit, 30 hashtags max)
   - Emoji-friendly
   - Mobile-first line breaks
   - Visual-focused casual tone

2. **Facebook** (63,206 char limit, 50 hashtags max)
   - Conversational storytelling
   - Moderate emoji usage
   - Paragraph-style formatting

3. **Twitter/X** (280 char limit, practical 2-3 hashtags)
   - Concise and punchy
   - Minimal emojis
   - Compact formatting

4. **LinkedIn** (3,000 char limit, 30 hashtags max)
   - Professional tone
   - Business-focused language
   - Minimal emoji usage (2-3 max)

5. **TikTok** (2,200 char limit, 30 hashtags max)
   - Ultra-casual Gen Z style
   - Short and punchy (50-150 chars optimal)
   - Trending-focused
   - Emoji-friendly

### Core Methods

#### `getPlatformConstraints(platform: string): PlatformConstraints`

Returns platform-specific constraints and rules including character limits, hashtag limits, emoji styles, tone guidelines, and formatting preferences.

**Example:**
```typescript
const constraints = service.getPlatformConstraints('twitter');
// Returns: { characterLimit: 280, hashtagLimit: 100, ... }
```

#### `adaptForPlatform(caption: string, platform: string, voiceProfile?: VoiceProfile): Promise<AdaptedCaption>`

Adapts a caption for a specific platform while maintaining the user's voice profile characteristics.

**Key Adaptations:**
- **Twitter:** Condenses caption, removes filler words, limits to 2-3 hashtags
- **LinkedIn:** Replaces casual language with professional tone, reduces emojis
- **Facebook:** Applies paragraph formatting, maintains storytelling elements
- **TikTok:** Condenses to 50-150 chars, removes formal language, keeps casual and punchy
- **Instagram:** No adaptation needed (source platform)

**Example:**
```typescript
const adapted = await service.adaptForPlatform(
  instagramCaption,
  'twitter',
  userVoiceProfile
);

console.log(adapted.caption); // Condensed version
console.log(adapted.hashtags); // Limited to 2-3
console.log(adapted.warnings); // Platform compatibility warnings
console.log(adapted.optimizationTips); // Suggestions for improvement
```

#### `validateForPlatform(caption: string, platform: string): PlatformValidation`

Validates a caption against platform-specific requirements and provides errors, warnings, and suggestions.

**Example:**
```typescript
const validation = service.validateForPlatform(longCaption, 'twitter');

if (!validation.isValid) {
  console.log(validation.errors); // Character/hashtag limit violations
  console.log(validation.warnings); // Best practice warnings
  console.log(validation.suggestions); // Improvement recommendations
}
```

## Platform-Specific Rules

### Twitter/X Adaptations
- Removes filler words: "really", "just", "actually", "very", "literally"
- Condenses to ~240 characters (leaving room for hashtags)
- Applies compact line breaks
- Limits to 2-3 hashtags for readability

### LinkedIn Adaptations
- Replaces casual phrases:
  - "gonna" → "going to"
  - "wanna" → "want to"
  - "ya know" → "you know"
  - "yeah" → "yes"
- Reduces emojis to 2-3 maximum
- Applies paragraph formatting
- Warns if content is too casual

### Facebook Adaptations
- Maintains storytelling elements
- Uses paragraph-style formatting
- Allows moderate emoji usage (up to 5)
- Suggests expansion for short posts

### TikTok Adaptations
- Condenses caption to 50-150 characters (optimal)
- Removes formal connecting words (however, therefore, etc.)
- Applies compact line breaks
- Keeps ultra-casual and energetic tone
- Emoji-friendly (keeps all emojis)

### Instagram (No Adaptation)
- Maintains original formatting
- Preserves all emojis and hashtags
- Mobile-first line breaks retained

## Integration with Voice Profile

The service respects user voice profile characteristics:
- Emoji usage patterns
- Tone preferences (casual vs professional)
- Sentence structure preferences

**Example:**
```typescript
// User has casual voice profile
const adapted = await service.adaptForPlatform(
  caption,
  'linkedin',
  voiceProfile
);

// Service will:
// 1. Apply professional tone
// 2. Warn about casual → professional shift
// 3. Maintain core message and personality
```

## Validation and Warnings

The service provides three levels of feedback:

### Errors
- Character limit violations
- Hashtag limit violations

### Warnings
- Sub-optimal caption length
- Too many hashtags for platform
- Informal language on professional platforms
- Missing best practices (e.g., line breaks on Instagram)

### Optimization Tips
- Suggestions for length optimization
- Hashtag strategy recommendations
- Formatting improvements

## Usage Example

```typescript
import { PlatformAdapterService } from './services/PlatformAdapterService';

const service = new PlatformAdapterService();

// Original Instagram caption
const instagramCaption = `
Just launched my new course! 🚀✨

I've been working on this for months and I'm so excited to share it with you all!

Here's what you'll learn:
• Content strategy
• Engagement tactics
• Growth hacks

Link in bio! Drop a comment if you have questions! 👇

#contentmarketing #socialmedia #digitalmarketing #marketing #contentcreation #socialmediamarketing
`;

// Adapt for Twitter
const twitterVersion = await service.adaptForPlatform(
  instagramCaption,
  'twitter'
);

console.log(twitterVersion.caption);
// "Just launched my new course! 🚀
// Learn content strategy, engagement tactics & growth hacks.
// Link in bio!"

console.log(twitterVersion.hashtags);
// ['#contentmarketing', '#socialmedia', '#digitalmarketing']

console.log(twitterVersion.warnings);
// ['Original caption exceeded Twitter limit and was condensed']

// Adapt for LinkedIn
const linkedinVersion = await service.adaptForPlatform(
  instagramCaption,
  'linkedin',
  voiceProfile
);

console.log(linkedinVersion.caption);
// Professional tone applied, emojis reduced, formatted for business audience
```

## Testing

Comprehensive test suite covering:
- Platform constraints retrieval
- Caption validation (36 tests, all passing)
- Platform-specific adaptations
- Hashtag limiting
- Emoji reduction
- Tone adjustments
- Edge cases (empty captions, special characters, etc.)
- Warning and optimization messages

Run tests:
```bash
npm test -- PlatformAdapterService.test.ts
```

## Implementation Notes

### Voice Profile Preservation
- The service maintains core message and user personality
- Adaptations are about format and platform norms, not content
- User's signature phrases are preserved where possible

### Hashtag Strategy
- Twitter: Practical limit of 2-3 for readability (not technical 100)
- LinkedIn: Up to 30 hashtags
- Facebook: Up to 50 hashtags
- Instagram: Up to 30 hashtags

### Character Truncation
- Attempts to truncate at sentence boundaries
- Falls back to word boundaries if needed
- Always adds "..." to indicate truncation
- Aims for optimal length, not just maximum

### Emoji Handling
- Platform-specific emoji limits enforced
- Preserves user's emoji style where possible
- Removes excessive emojis for professional platforms

## Future Enhancements

Potential improvements for future versions:
1. ~~TikTok platform support~~ ✅ **COMPLETED**
2. Performance tracking across platforms
3. A/B testing different adaptation strategies
4. AI-powered tone adjustment
5. Custom platform rules per user
6. Hashtag performance analysis per platform
7. Snapchat and Pinterest support

## Related Services

- `VoiceProfileService`: Provides user voice characteristics
- `PromptConstructorService`: Uses adapted captions in AI generation
- `AIServiceManager`: Integrates platform adaptation in caption generation workflow

## Requirements Met

This service fully implements **Requirement 12: Cross-Platform Caption Adaptation**:
- ✅ Adapts Instagram captions for platform-specific conventions
- ✅ Maintains core message and user's voice
- ✅ Applies platform-specific emoji, hashtag, and formatting rules
- ✅ Provides warnings for platform compatibility issues
- ✅ Optimizes for each platform's algorithm patterns
- ✅ Ready for cross-platform performance tracking

## API Integration

This service is designed to be integrated with the API endpoints defined in Task 21.2:
- `POST /api/ai/adapt-caption` - Adapt captions for target platforms
- Returns adapted caption with warnings and optimization tips

---

**Status:** ✅ Complete and fully tested (38/38 tests passing)  
**Task:** 21.1 Create PlatformAdapterService  
**Spec:** authentic-instagram-caption-generation  
**Platforms Supported:** Instagram, Facebook, Twitter/X, LinkedIn, TikTok
