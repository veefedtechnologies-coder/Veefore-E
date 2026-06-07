# AuthenticityScorer Service

## Overview

The `AuthenticityScorer` service evaluates AI-generated Instagram captions against 12 human-likeness criteria to ensure content sounds authentic and natural rather than robotic or AI-generated.

**Requirements Met:** 4.1, 4.2, 4.4, 4.5

## Purpose

This service is a critical component of the Authentic Instagram Caption Generation system. It:

- Evaluates captions on a 0-100 scale
- Identifies AI "tells" that make content sound artificial
- Provides actionable recommendations for improvement
- Ensures only high-quality captions (score ≥80) are presented to users

## 12 Scoring Criteria

Each criterion is scored 0-10. The total (out of 120) is normalized to 0-100:

### 1. Vocabulary Naturalness
- Penalizes AI-typical words (delve, leverage, optimize, etc.)
- Checks vocabulary overlap with user's voice profile
- Rewards casual contractions (it's, don't, you're)

### 2. Sentence Flow
- Analyzes sentence length variation
- Checks for natural rhythm
- Penalizes run-on sentences or monotonous structure

### 3. Emoji Placement
- Matches user's typical emoji frequency
- Validates placement style (inline vs end)
- Penalizes unnatural emoji clusters (3+ in a row)

### 4. Conversational Tone
- Checks for direct address (you, your)
- Rewards questions and conversational prompts
- Penalizes lecture-style formal writing

### 5. Platform Appropriateness
- Rewards Instagram-native terms (story, reel, swipe, DM)
- Validates mobile-friendly line breaks
- Checks appropriate caption length

### 6. Avoids Corporate Jargon
- Heavy penalties for business buzzwords
- Detects marketing speak
- Rewards casual, everyday language

### 7. Avoids Generic Phrases
- Blacklists clichés ("let's dive in", "in today's digital age")
- Rewards unique, specific openings
- Penalizes template-like structure

### 8. Voice Consistency
- Compares sentence length distribution to user's profile
- Checks for signature phrases
- Validates tone markers alignment

### 9. Mobile Readability
- Validates short paragraphs (1-2 sentences)
- Checks line break frequency
- Rewards scannable structure

### 10. Hook Strength
- Analyzes first 5 words for impact
- Rewards strong hooks (POV, Hot take, Real talk)
- Penalizes weak openings

### 11. Engagement Clarity
- Validates clear CTA or specific question
- Penalizes vague questions ("thoughts?")
- Rewards actionable engagement prompts

### 12. Emotional Resonance
- Counts emotional words
- Checks for personal/vulnerable elements
- Rewards specificity (names, numbers, moments)

## AI Tell Detection

The `detectAITells()` method identifies specific patterns that make content sound AI-generated:

### Detection Categories

**1. AI Vocabulary**
- Flags words like: delve, leverage, optimize, revolutionize, paradigm, robust, utilize, facilitate, demonstrate

**2. Corporate Jargon**
- Detects: synergy, leverage, optimize, disrupt, innovate, streamline, empower, ecosystem, bandwidth

**3. Generic Phrases**
- Catches clichés: "let's dive in", "in today's digital age", "are you ready to", "at the end of the day"

**4. Unnatural Emoji Clustering**
- Flags 3+ emojis in a row (🔥🔥🔥🔥)

**5. Overly Formal Structure**
- Detects formal list patterns: "firstly... secondly... finally"

**6. Formal Transitions**
- Flags: furthermore, moreover, additionally, consequently, nevertheless, in conclusion

**7. Excessive Passive Voice**
- Detects 3+ instances of passive voice construction

**8. Overly Long Sentences**
- Flags sentences with 40+ words without natural breaks

**9. Lack of Contractions**
- Detects captions with 30+ words that avoid contractions (sounds unnaturally formal)

**10. AI Hedging Language**
- Flags: "it is worth noting", "it should be noted", "one might", "arguably"

**11. Unnatural Enthusiasm**
- Detects forced phrases: "incredibly excited", "truly amazing", "absolutely thrilled"

**12. Overly Polished Writing**
- Identifies content that's too perfect: no casual markers, no contractions, perfect capitalization (40+ words)

### Example Usage

```typescript
const tells = authenticityScorer.detectAITells(caption);
// Returns array like:
// [
//   'Uses AI-typical word: "leverage"',
//   'Contains corporate jargon: "synergy"',
//   'No contractions used (sounds unnaturally formal)'
// ]
```

### Basic Scoring

```typescript
import { authenticityScorer, CaptionVoiceProfile } from './services/AuthenticityScorer';

const voiceProfile: CaptionVoiceProfile = {
  // ... user's voice profile data
};

const caption = "Your caption text here...";

const result = await authenticityScorer.scoreCaption(
  caption,
  voiceProfile,
  'instagram'
);

console.log(`Score: ${result.overallScore}/100`);
console.log(`Passes: ${result.passesThreshold}`); // true if ≥80
```

### Check Voice Consistency

```typescript
const consistencyScore = authenticityScorer.checkVoiceConsistency(
  caption,
  voiceProfile
);
// Returns 0-10
```

### Detect AI Tells

```typescript
const tells = authenticityScorer.detectAITells(caption);
// Returns array of detected issues
```

## Response Structure

```typescript
{
  overallScore: 85,                    // 0-100
  passesThreshold: true,               // >= 80
  criteriaScores: {
    vocabularyNaturalness: 8,
    sentenceFlow: 9,
    emojiPlacement: 7,
    // ... all 12 criteria
  },
  aiTellsDetected: [                   // Array of issues found
    'Uses AI-typical word: "leverage"'
  ],
  recommendations: [                    // Actionable improvements
    'Remove corporate jargon and business buzzwords',
    'Add a clear call-to-action or specific question'
  ]
}
```

## Integration Points

The AuthenticityScorer is used by:

1. **Caption Generation Pipeline** - Score all variations before presenting to user
2. **Quality Control** - Reject captions with score < 80
3. **Feedback Learning** - Track which scores correlate with user acceptance
4. **Voice Profile Updates** - Use scores to refine voice profiles over time

## Implementation Notes

- All scoring is synchronous (no external API calls)
- Lightweight and fast (runs in <5ms typically)
- No dependencies on external services
- Can be run multiple times without side effects
- Thread-safe and stateless

## Testing

Run tests with:

```bash
npm test -- AuthenticityScorer.test.ts --run
```

See `AuthenticityScorer.example.ts` for usage examples.

## Future Enhancements

- Machine learning model for more accurate scoring
- Language-specific scoring rules
- A/B testing to validate scoring thresholds
- Real-time scoring as user types
- Integration with actual engagement metrics for continuous improvement
