# EngagementPredictor Service

## Overview

The `EngagementPredictor` service analyzes Instagram caption characteristics to predict engagement metrics. It uses multi-factor analysis to provide data-driven insights about caption performance.

**Requirements Implemented:** 9.1, 9.2, 9.4

## Features

### Core Prediction

The service analyzes 6 key factors:

1. **Hook Strength (0-10)** - Evaluates opening lines for impact
   - Detects strong hook patterns (POV, Hot take, etc.)
   - Rewards questions and emotional openings
   - Penalizes weak generic openings

2. **Readability Score (0-10)** - Assesses mobile-friendly formatting
   - Checks sentence length distribution
   - Evaluates paragraph structure
   - Verifies line break frequency
   - Penalizes walls of text

3. **CTA Clarity (0-10)** - Measures call-to-action effectiveness
   - Detects strong CTAs (comment, share, save, etc.)
   - Rewards specific actionable requests
   - Checks for engagement questions

4. **Emotional Resonance (0-10)** - Evaluates emotional connection
   - Counts emotional words (love, struggle, grateful, etc.)
   - Checks for personal pronouns (increases relatability)
   - Detects vulnerability indicators
   - Rewards specific details (numbers, time references)

5. **Length Optimality (0-10)** - Ensures appropriate length for post type
   - Stories: 5-30 words optimal
   - Reels: 50-150 words optimal
   - Posts: 100-300 words optimal

6. **Trending Topic Bonus (0-10)** - Future trending topic detection
   - Currently returns neutral score
   - Will integrate with trending topic database

### Engagement Rate Predictions

The service predicts:

- **Like Rate** (2-10% range) - Based on overall caption quality
- **Comment Rate** (0.5-3% range) - Heavily influenced by CTA and emotional resonance
- **Save Rate** (0.3-2% range) - Driven by content value and readability
- **Share Rate** (0.1-1% range) - Driven by emotional impact and viral potential

### Platform & Post Type Adjustments

- **Platform Multipliers:**
  - Instagram: 1.0x (baseline)
  - TikTok: 1.2x (higher engagement)
  - Twitter: 0.8x (lower casual engagement)
  - LinkedIn: 0.7x (professional platform)

- **Post Type Adjustments:**
  - Reels: 1.3x (highest engagement)
  - Posts: 1.0x (standard)
  - Stories: 0.7x (lower but higher reach)

### Confidence Scoring

The service calculates a confidence score (0-1) based on factor consistency:
- Higher confidence when all factors are consistently strong or weak
- Lower confidence when factors are inconsistent
- Uses standard deviation of factor scores

### User Comparison

The service compares predictions against user's historical average:
- Calculates % difference from user average
- Weighted by reliability (like rate 50%, comment rate 30%, save rate 20%)
- Helps identify content that will over/underperform

## Usage

```typescript
import { engagementPredictor } from './services/EngagementPredictor';

// Predict engagement for a caption
const prediction = await engagementPredictor.predictEngagement(
  caption,
  userId,
  workspaceId,
  'post',  // 'post' | 'story' | 'reel'
  'instagram'  // platform
);

console.log('Predicted Like Rate:', prediction.predictedLikeRate);
console.log('Hook Strength:', prediction.factors.hookStrength);
console.log('Confidence:', prediction.confidence);
console.log('vs User Average:', prediction.vsUserAverage);
```

## API Response Structure

```typescript
interface EngagementPrediction {
  // Predicted Rates (%)
  predictedLikeRate: number;
  predictedCommentRate: number;
  predictedSaveRate: number;
  predictedShareRate: number;
  
  // Confidence (0-1)
  confidence: number;
  
  // Contributing Factors (0-10 each)
  factors: {
    hookStrength: number;
    readabilityScore: number;
    ctaClarity: number;
    emotionalResonance: number;
    lengthOptimality: number;
    trendingTopicBonus: number;
  };
  
  // Comparison (% difference)
  vsUserAverage: number;
}
```

## Performance Tracking

```typescript
// Record actual performance for learning (future enhancement)
await engagementPredictor.recordActualPerformance(
  captionId,
  {
    likes: 100,
    comments: 10,
    saves: 5,
    shares: 2,
    impressions: 1000
  }
);
```

## Examples

### High Engagement Caption

```
POV: You finally figured out the Instagram algorithm 🤯

Here's what nobody tells you:

1. Consistency > Perfection
2. Engagement > Followers
3. Value > Vanity metrics

Save this if you need the reminder 📌

Drop a 🔥 if this hit different!
```

**Predicted Results:**
- Hook Strength: 8+
- CTA Clarity: 8+
- Predicted Like Rate: 6-8%
- Predicted Save Rate: 1.5-2%

### Low Engagement Caption

```
Today I want to talk about something. It's important and I think you should know about it.
```

**Predicted Results:**
- Hook Strength: <5
- CTA Clarity: <5
- Predicted Like Rate: 2-4%
- Predicted Comment Rate: 0.5-1%

## Testing

The service includes comprehensive unit tests covering:
- All factor analysis methods
- Engagement rate calculations
- Platform and post type adjustments
- Confidence scoring
- Edge cases (empty, long, emoji-only captions)
- Real-world examples

Run tests:
```bash
npm test -- EngagementPredictor.test.ts
```

## Future Enhancements

1. **Machine Learning Integration**
   - Train on actual performance data
   - Improve prediction accuracy over time
   - User-specific model adaptation

2. **Trending Topic Detection**
   - Integrate with trending hashtag database
   - Detect viral topic patterns
   - Real-time trend bonus calculation

3. **Database Integration**
   - Store predictions with generated captions
   - Track prediction accuracy
   - Build user-specific performance history

4. **A/B Testing Support**
   - Compare predictions across variations
   - Identify best-performing patterns
   - Recommend optimal caption structure

## Integration Points

The EngagementPredictor integrates with:

1. **AIContentGenerator** - Provides engagement predictions for caption variations
2. **Voice Profile Service** - Uses user patterns for better predictions
3. **Viral Pattern Service** - Incorporates proven patterns into scoring
4. **Analytics Service** - Tracks actual performance vs predictions

## Notes

- Currently returns default user averages (to be replaced with database queries)
- Trending topic bonus is placeholder (to be implemented with trending data)
- Prediction accuracy will improve with machine learning integration
- All predictions are estimates based on caption characteristics, not guarantees
