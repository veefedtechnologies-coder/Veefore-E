# Voice Consistency Checker

**Task 7.3**: Implement voice consistency checker with multi-dimensional voice matching

## Overview

The Voice Consistency Checker is a comprehensive system that compares generated captions against a user's unique voice profile across 8+ dimensions to ensure the AI-generated content matches the user's authentic writing style. It provides a 0-100 consistency score with an 80+ threshold requirement, along with detailed deviation detection and actionable regeneration guidance.

## Features

✅ **Multi-Dimensional Analysis**: Evaluates captions across 8 distinct dimensions
✅ **0-100 Scoring Scale**: Normalized scoring with 80+ threshold for voice consistency  
✅ **Detailed Deviation Detection**: Identifies specific mismatches in each dimension
✅ **Regeneration Guidance**: Provides actionable feedback for caption regeneration
✅ **Dimension-Level Insights**: Individual 0-10 scores for each voice dimension

## Architecture

### Key Components

1. **Voice Profile Comparison** (`compareVoiceProfile`)
   - Main public API for voice consistency checking
   - Analyzes captions across all 8 dimensions
   - Returns comprehensive `VoiceConsistencyResult`

2. **Dimension Analyzers** (Private methods)
   - `analyzeVocabularyMatch`: Checks word overlap and unexpected vocabulary
   - `analyzeToneAlignment`: Compares tone markers (casual, professional, etc.)
   - `analyzeStructureMatch`: Verifies sentence/paragraph structure consistency
   - `analyzeSignaturePhraseUsage`: Detects user's signature phrases
   - `analyzePunctuationStyle`: Matches punctuation patterns
   - `analyzeEmojiConsistency`: Verifies emoji frequency and placement
   - `analyzeHookPatternMatch`: Checks if opening matches user's hooks
   - `analyzeEngagementStyleMatch`: Verifies engagement question style

3. **Feedback Generators**
   - `generateMismatches`: Summarizes key inconsistencies
   - `generateVoiceRecommendations`: Creates actionable suggestions
   - `generateRegenerationGuidance`: Provides specific adjustment instructions

## 8 Voice Dimensions

### 1. Vocabulary Match (0-10)
**What it checks:**
- Percentage overlap with user's typical vocabulary
- Missing words (user's common words not used)
- Unexpected words (words not in user's vocabulary)

**Scoring:**
- High overlap (60%+): Bonus points
- Moderate overlap (40-60%): Neutral
- Low overlap (30-40%): Penalty
- Very low overlap (<20%): Heavy penalty

**Example mismatch:**
```
Low vocabulary overlap (14%)
Using unexpected words: delighted, inform, methodology
Missing common words: love, workout, gains
```

### 2. Tone Alignment (0-10)
**What it checks:**
- Casual vs. professional tone
- Humorous tone level
- Inspirational tone level
- Educational tone level
- Conversational tone level

**Scoring:**
- Compares detected tone scores (0-1) against profile
- Weighted by importance of each tone in profile
- Flags mismatches > 0.4 difference

**Example mismatch:**
```
casual: not enough (profile: 0.90, caption: 0.00)
inspirational: too much (profile: 0.30, caption: 0.75)
```

### 3. Structure Match (0-10)
**What it checks:**
- Sentence length distribution (short/medium/long)
- Paragraph structure (single, short-breaks, long-form)

**Scoring:**
- Compares actual vs expected distribution
- Penalty for >30% deviation in distribution
- Checks if paragraph style matches profile

**Example mismatch:**
```
Sentence length distribution differs significantly (avg diff: 35%)
Paragraph structure doesn't match profile (expected: short-breaks)
```

### 4. Signature Phrase Usage (0-10)
**What it checks:**
- User's signature phrases ("let me tell you", "here's the thing")
- Phrases used vs. missed

**Scoring:**
- Strong bonus (+4) for using signature phrases
- Neutral (6-7) if signature phrases don't fit context
- Not penalized heavily for not using them

**Example match:**
```
Phrases used: ["real talk", "no excuses"]
Phrases missed: ["let me tell you"]
```

### 5. Punctuation Style (0-10)
**What it checks:**
- Exclamation mark frequency (rare/moderate/frequent)
- Question mark frequency
- Ellipsis usage

**Scoring:**
- Compares usage rates to profile expectations
- Penalty for each mismatched punctuation type

**Example mismatch:**
```
Exclamation usage mismatch (expected: frequent, actual rate: 10%)
Question usage mismatch (expected: moderate, actual rate: 0%)
```

### 6. Emoji Consistency (0-10)
**What it checks:**
- Emoji frequency (none/minimal/moderate/heavy)
- Emoji placement (inline/end/both)
- Usage of user's top emojis

**Scoring:**
- Frequency match required
- Placement style match required
- Bonus for using user's favorite emojis

**Example match:**
```
Frequency: moderate ✅
Placement: inline ✅
Top emojis used: 💪 🔥 💯
```

### 7. Hook Pattern Match (0-10)
**What it checks:**
- Opening sentence matches user's typical hooks
- Pattern word overlap (50%+ indicates match)

**Scoring:**
- Strong match (10): Opening matches a hook pattern
- Neutral (6-7): No match but opening is reasonable
- Low (5): Opening doesn't match typical style

**Example match:**
```
Matched pattern: "Real talk..."
First sentence: "Real talk... I'm crushing these workouts!"
```

### 8. Engagement Style Match (0-10)
**What it checks:**
- Ending question matches user's engagement style
- Style word overlap for questions

**Scoring:**
- Strong match (10): Question style matches exactly
- Partial (7): Has question but different style
- Neutral (6-7): No question (questions not always needed)

**Example match:**
```
Matched style: "Who's with me?"
Last sentence: "Who's with me? Drop your progress below!"
```

## API Usage

### compareVoiceProfile

```typescript
async compareVoiceProfile(
  caption: string,
  profile: CaptionVoiceProfile
): Promise<VoiceConsistencyResult>
```

**Parameters:**
- `caption`: The generated caption to evaluate
- `profile`: User's voice profile with all characteristics

**Returns:** `VoiceConsistencyResult` with:

```typescript
{
  overallScore: number;        // 0-100 (average of dimension scores)
  passesThreshold: boolean;    // true if score >= 80
  
  dimensions: {
    vocabularyMatch: {
      score: number;             // 0-10
      overlap: number;           // 0-1 percentage
      missingWords: string[];    // User's words not used
      unexpectedWords: string[]; // Words not in profile
    },
    toneAlignment: {
      score: number;
      profileTone: Record<string, number>;
      captionTone: Record<string, number>;
      mismatches: string[];
    },
    structureMatch: {
      score: number;
      sentenceLengthMatch: boolean;
      paragraphStyleMatch: boolean;
      deviations: string[];
    },
    signaturePhraseUsage: {
      score: number;
      phrasesUsed: string[];
      phrasesMissed: string[];
    },
    punctuationStyle: {
      score: number;
      exclamationMatch: boolean;
      questionMatch: boolean;
      ellipsisMatch: boolean;
      deviations: string[];
    },
    emojiConsistency: {
      score: number;
      frequencyMatch: boolean;
      placementMatch: boolean;
      topEmojisUsed: string[];
      deviations: string[];
    },
    hookPatternMatch: {
      score: number;
      matchFound: boolean;
      matchedPattern: string | null;
    },
    engagementStyleMatch: {
      score: number;
      matchFound: boolean;
      matchedStyle: string | null;
    }
  },
  
  mismatches: string[];          // Summary of key issues
  recommendations: string[];     // Actionable suggestions
  
  regenerationGuidance: {
    vocabularyAdjustments: string[];
    toneAdjustments: string[];
    structureAdjustments: string[];
    styleAdjustments: string[];
  }
}
```

## Example Usage

```typescript
import { authenticityScorer } from './AuthenticityScorer';

// User's voice profile (from VoiceProfileService)
const voiceProfile = {
  userId: 'user-123',
  workspaceId: 'workspace-456',
  vocabularyFrequency: {
    'love': 15,
    'amazing': 10,
    'excited': 8
  },
  signaturePhrases: ['real talk', 'no excuses'],
  sentenceLengthDistribution: { short: 40, medium: 45, long: 15 },
  paragraphStructure: 'short-breaks',
  emojiUsagePattern: {
    frequency: 'moderate',
    placement: 'inline',
    topEmojis: ['💪', '🔥', '💯']
  },
  punctuationStyle: {
    exclamationUsage: 'frequent',
    questionUsage: 'moderate',
    ellipsisUsage: false
  },
  toneMarkers: {
    casual: 0.9,
    professional: 0.1,
    humorous: 0.4,
    inspirational: 0.8,
    educational: 0.5,
    conversational: 0.9
  },
  hookPatterns: ['Real talk...', 'No excuses'],
  engagementQuestionStyle: ['What about you?', 'Who\'s with me?'],
  storytellingStructure: 'buildup',
  sampleSize: 50,
  confidence: 0.92
};

// Generated caption to check
const generatedCaption = `Real talk... I love these gains! 💪

The grind is paying off. No excuses!

Who's with me? 🔥`;

// Check voice consistency
const result = await authenticityScorer.compareVoiceProfile(
  generatedCaption,
  voiceProfile
);

console.log(`Score: ${result.overallScore}/100`);
console.log(`Passes: ${result.passesThreshold}`);

if (!result.passesThreshold) {
  console.log('Mismatches:', result.mismatches);
  console.log('Recommendations:', result.recommendations);
  
  // Use regeneration guidance to adjust prompt
  console.log('Guidance:', result.regenerationGuidance);
}
```

## Integration with Caption Generation

### When to Use Voice Consistency Checker

1. **After Caption Generation**: Check each generated variation
2. **Before Presenting to User**: Only show captions that score 80+
3. **For Regeneration**: Use guidance to adjust prompt parameters

### Regeneration Flow

```typescript
async function generateVoiceMatchedCaption(
  prompt: string,
  voiceProfile: CaptionVoiceProfile
): Promise<string> {
  let attempts = 0;
  const maxAttempts = 3;
  
  while (attempts < maxAttempts) {
    // Generate caption
    const caption = await aiService.generate(prompt);
    
    // Check voice consistency
    const consistency = await authenticityScorer.compareVoiceProfile(
      caption,
      voiceProfile
    );
    
    if (consistency.passesThreshold) {
      return caption; // Success!
    }
    
    // Use regeneration guidance to adjust prompt
    prompt = adjustPromptFromGuidance(prompt, consistency.regenerationGuidance);
    attempts++;
  }
  
  throw new Error('Failed to generate voice-matched caption after 3 attempts');
}
```

## Scoring Thresholds

| Score Range | Voice Consistency | Action |
|-------------|------------------|--------|
| 90-100 | Excellent match | Present to user immediately |
| 80-89 | Good match | Present to user (passes threshold) |
| 70-79 | Moderate issues | Regenerate with guidance |
| 60-69 | Significant issues | Regenerate with strong adjustments |
| < 60 | Poor match | Major regeneration needed |

## Performance Considerations

- **Fast Execution**: All dimension analysis runs in parallel
- **No External API Calls**: Pure algorithmic analysis
- **Lightweight**: Minimal memory footprint
- **Scalable**: Can check multiple variations simultaneously

## Testing

Comprehensive test suite with 51 tests covering:
- All 8 dimensions individually
- Overall score calculation
- Threshold validation
- Edge cases (minimal profiles, empty captions)
- Integration scenarios

Run tests:
```bash
npm test -- AuthenticityScorer.test.ts
```

## Future Enhancements

Potential improvements for future iterations:

1. **Machine Learning Integration**
   - Train models on user feedback to improve dimension weights
   - Learn which dimensions matter most for each user

2. **Adaptive Thresholds**
   - Allow per-user threshold configuration
   - Adjust threshold based on content type

3. **Dimension Weights**
   - Allow customization of dimension importance
   - Auto-adjust weights based on profile confidence

4. **Real-time Feedback**
   - Provide live scoring as caption is edited
   - Highlight specific sections causing issues

5. **Batch Processing**
   - Optimize for checking multiple variations
   - Parallel dimension analysis across variations

## Related Components

- **VoiceProfileService**: Creates and maintains voice profiles
- **AuthenticityScorer**: Parent class containing all scoring logic
- **PromptConstructorService**: Uses voice profiles to build prompts
- **AIContentGenerator**: Integrates voice consistency checking

## Requirements Addressed

- ✅ **Requirement 4.5**: Voice profile comparison for consistency
- ✅ **Task 7.3**: Voice consistency checker implementation
- ✅ **Multi-dimensional**: 8+ dimensions analyzed
- ✅ **0-100 Scoring**: Normalized from dimension scores
- ✅ **80+ Threshold**: Required consistency level
- ✅ **Deviation Detection**: Detailed mismatch reporting
- ✅ **Regeneration Guidance**: Actionable feedback provided
