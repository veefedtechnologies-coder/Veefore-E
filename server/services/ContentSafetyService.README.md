# Content Safety Service

## Overview

The `ContentSafetyService` provides comprehensive content safety filtering for AI-generated captions to prevent inappropriate, harmful, or brand-inappropriate content from being presented to users.

**Task:** 22.1 - Integrate content safety filters  
**Requirements:** 11.1, 11.2, 11.3, 11.4

## Features

The service checks captions for:

1. **Profanity and Offensive Language** - Detects mild to severe profanity
2. **Hate Speech and Discriminatory Content** - Flags discriminatory language and hate speech
3. **Spam Patterns** - Identifies spammy calls-to-action and follow-for-follow schemes
4. **Misleading Claims** - Detects unrealistic promises and "miracle cure" language
5. **Copyright Violations** - Flags potential copyright symbol misuse
6. **Personal Information Exposure** - Detects and filters SSN, credit cards, addresses
7. **Brand Values Alignment** - Ensures captions align with user's brand values
8. **Prohibited Topics** - Blocks user-defined prohibited topics
9. **Controversial Topics** - Flags political, religious, and other sensitive topics for review

## Integration with AIServiceManager

The ContentSafetyService is integrated into the caption generation pipeline in `AIServiceManager.generateInstagramCaptions()`:

```typescript
// Apply content safety filters BEFORE authenticity scoring
const safetyLevel = (preferences.contentSafety as 'off' | 'standard' | 'strict') || 'standard';
const safetyResult = contentSafetyService.filterCaption(
  cleanedCaption,
  safetyLevel,
  preferences.brandValues as string[] | undefined,
  preferences.prohibitedTopics as string[] | undefined
);

// If caption fails safety check, skip to next attempt
if (!safetyResult.isSafe) {
  console.warn(`Caption failed safety check (score: ${safetyResult.safetyScore}/100)`);
  continue; // Regenerate
}
```

### Safety Workflow

1. **Generate Caption** - AI generates a caption variation
2. **Safety Check** - ContentSafetyService filters the caption
3. **Pass/Fail Decision** - If safety score < 70, regenerate
4. **Authenticity Scoring** - Only safe captions proceed to authenticity scoring
5. **Return to User** - Only variations that pass both safety and authenticity checks are returned

### Regeneration with Stricter Prompts

If all variations fail safety checks, the system automatically regenerates with stricter safety instructions:

```typescript
// Add stricter safety instructions
const stricterPrompt = `${basePrompt}\n\n[CRITICAL SAFETY OVERRIDE]
You MUST generate content that is:
- Free from profanity, hate speech, and discriminatory language
- Free from spam patterns and misleading claims
- Free from personal information and sensitive data
- Brand-safe and appropriate for all audiences
- Authentic and engaging without controversial topics
[/CRITICAL SAFETY OVERRIDE]`;
```

## Usage

### Basic Usage

```typescript
import { contentSafetyService } from './ContentSafetyService';

const caption = "Your caption text here";
const result = contentSafetyService.filterCaption(caption, 'standard');

console.log(result.isSafe);          // true/false
console.log(result.safetyScore);     // 0-100
console.log(result.issues);          // Array of issues found
console.log(result.filteredCaption); // Caption with filtered content
console.log(result.flags);           // Flags for each safety category
```

### Safety Levels

- **`off`** - Only checks prohibited topics (most permissive)
- **`standard`** - Checks all categories, flags controversial topics
- **`strict`** - Most restrictive, filters profanity and reduces score for controversial topics

### With Brand Values

```typescript
const result = contentSafetyService.filterCaption(
  caption,
  'standard',
  ['luxury', 'premium', 'sustainable'],  // Brand values
  ['politics', 'religion']                // Prohibited topics
);
```

## Safety Score Calculation

The safety score starts at 100 and deductions are applied for issues:

| Issue Type | Deduction |
|-----------|-----------|
| Profanity | -15 |
| Hate Speech | -40 |
| Spam Patterns | -20 |
| Misleading Claims | -25 |
| Copyright Violation | -30 |
| Personal Info Exposure | -35 |
| Brand Value Conflict | -15 per conflict |
| Prohibited Topic | -50 |
| Controversial Topic | -15 (strict mode only) |

**Safety Threshold:** 70 (captions below 70 are considered unsafe)

## Result Structure

```typescript
interface ContentSafetyResult {
  isSafe: boolean;              // Overall safety status
  issues: string[];             // List of safety issues
  filteredCaption: string;      // Caption with filters applied
  safetyScore: number;          // 0-100 safety score
  flags: {
    profanity: boolean;
    hateSpeech: boolean;
    spam: boolean;
    misleadingClaims: boolean;
    copyrightViolation: boolean;
    personalInfoExposure: boolean;
  };
}
```

## Adding Safety Metadata

For logging and tracking, you can add safety metadata to captions:

```typescript
const safetyResult = contentSafetyService.filterCaption(caption, 'standard');
const result = contentSafetyService.addSafetyMetadata(caption, safetyResult);

console.log(result.safetyMetadata);
// {
//   score: 100,
//   flags: { ... },
//   issues: [],
//   checkedAt: Date
// }
```

## Logging and Monitoring

The service logs safety violations for monitoring purposes:

```typescript
// In AIServiceManager
for (const variation of filteredVariations) {
  if (variation.safetyResult && variation.safetyResult.issues.length > 0) {
    console.log('[AIServiceManager] Safety issues logged for monitoring', {
      style: variation.style,
      issues: variation.safetyResult.issues,
      flags: variation.safetyResult.flags,
      safetyScore: variation.safetyResult.safetyScore
    });
  }
}
```

## Extending the Service

### Adding New Safety Checks

To add a new safety check:

1. Add a new flag to the `flags` object in `ContentSafetyResult`
2. Create a private method for the check (e.g., `checkNewCategory()`)
3. Add the check to the `filterCaption()` method
4. Update the safety score calculation

Example:

```typescript
// Add to flags
flags: {
  profanity: boolean;
  hateSpeech: boolean;
  spam: boolean;
  misleadingClaims: boolean;
  copyrightViolation: boolean;
  personalInfoExposure: boolean;
  newCategory: boolean;  // New flag
}

// Add private method
private checkNewCategory(caption: string): { found: boolean; issues: string[] } {
  // Implementation
}

// Add to filterCaption()
const newCategoryResult = this.checkNewCategory(caption);
if (newCategoryResult.found) {
  flags.newCategory = true;
  issues.push(...newCategoryResult.issues);
  safetyScore -= 20;
}
```

### Using External APIs

The service is designed to be extensible with external content moderation APIs:

```typescript
// Example: OpenAI Moderation API integration
private async checkWithOpenAI(caption: string): Promise<any> {
  const response = await openai.moderations.create({
    input: caption,
  });
  return response.results[0];
}

// Use in filterCaption()
if (USE_EXTERNAL_API) {
  const moderationResult = await this.checkWithOpenAI(caption);
  // Process moderation result
}
```

## Testing

Comprehensive tests are available in `ContentSafetyService.test.ts`:

```bash
npm test -- ContentSafetyService.test.ts --run
```

The test suite covers:
- Profanity detection (standard and strict modes)
- Hate speech detection
- Spam pattern detection
- Misleading claims detection
- Personal information detection and filtering
- Brand value conflict detection
- Prohibited topics
- Controversial topics
- Safety levels (off, standard, strict)
- Real-world caption scenarios

## Performance Considerations

- **Rule-based checks** are fast and run synchronously
- **Regex patterns** are compiled once and reused
- **Safety checks run before authenticity scoring** to avoid wasted computation
- **Caching** can be added for repeated caption checks

## Future Enhancements

Potential improvements for the content safety system:

1. **Machine Learning Models** - Train custom ML models for better detection
2. **External API Integration** - Integrate with OpenAI Moderation, Google Perspective API
3. **User Feedback Loop** - Learn from user corrections of false positives
4. **Language-specific Checks** - Add support for non-English content
5. **Context-aware Detection** - Consider context to reduce false positives
6. **Confidence Scores** - Provide confidence levels for each detection
7. **Automated Pattern Updates** - Update patterns based on emerging trends

## Related Services

- **AuthenticityScorer** - Evaluates caption human-likeness (runs after safety check)
- **EngagementPredictor** - Predicts engagement metrics (runs after safety and authenticity)
- **PromptConstructorService** - Builds prompts with safety guidelines
- **AIServiceManager** - Orchestrates the caption generation pipeline

## References

- Task 22.1: Integrate content safety filters
- Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6
- Design Document: `authentic-instagram-caption-generation/design.md`
- Tests: `ContentSafetyService.test.ts`
