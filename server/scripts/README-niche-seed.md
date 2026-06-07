# Niche Context Database Seeding

This directory contains scripts for seeding and managing the niche context database.

## Overview

The niche context database provides niche-specific language, trends, and context for authentic Instagram caption generation. It includes comprehensive data for major Instagram niches with trending topics, hashtag strategies, and language patterns.

## Scripts

### `seed-niche-contexts.ts`

Seeds the database with comprehensive niche context data for major Instagram niches.

**Included Niches:**
- **Fashion** - Style, outfit inspiration, fashion trends
- **Fitness** - Workouts, training, fitness motivation
- **Food** - Recipes, cooking, food photography
- **Travel** - Adventure, destinations, travel experiences
- **Beauty** - Skincare, makeup, beauty products
- **Business** - Entrepreneurship, productivity, business growth
- **Lifestyle** - Daily life, wellness, self-care

**Each niche includes:**
- 20-30 niche-specific vocabulary terms
- 9-10 current slang terms with definitions
- 14-16 cultural references
- 16-21 trending topics
- 20 trending hashtags
- 14-15 trending phrases
- 12 typical emojis
- Tone guidelines for content creation

**Usage:**
```bash
npx tsx server/scripts/seed-niche-contexts.ts
```

**Output:**
- Clears existing niche contexts (optional - comment out to preserve)
- Inserts comprehensive data for all 7 major niches
- Verifies data insertion with document count
- Provides detailed logging for each niche

### `verify-niche-contexts.ts`

Verifies that the seeded data is properly accessible through the NicheContextService.

**Tests performed:**
- `getNicheContext()` - Retrieves context for each niche
- `getTermRelevanceScore()` - Scores term relevance
- `isTermOutdated()` - Checks if terms are current
- `isTrendsDataStale()` - Verifies freshness of trend data
- `getBlendedContext()` - Tests multi-niche blending

**Usage:**
```bash
npx tsx server/scripts/verify-niche-contexts.ts
```

**Output:**
- Tests all service methods for each niche
- Displays vocabulary, slang, topics, and hashtag counts
- Tests blended context functionality
- Confirms all data is accessible

## Data Structure

Each niche context includes:

```typescript
{
  niche: string;                      // Lowercase niche name
  vocabulary: string[];               // Niche-specific terms
  slangTerms: Map<string, string>;    // Slang → definition
  culturalReferences: string[];       // Current references
  trendingTopics: string[];           // Hot topics (last 30 days)
  trendingHashtags: string[];         // Effective hashtags
  trendingPhrases: string[];          // Popular phrases
  typicalEmojis: string[];            // Common emojis
  toneGuidelines: string;             // Writing style guidance
  lastUpdated: Date;                  // Timestamp
}
```

## MongoDB Connection

Both scripts use the MongoDB Atlas connection string from environment variables:

```bash
MONGODB_URI=mongodb+srv://brandboost09:Arpitc8433@cluster0.mekr2dh.mongodb.net/
```

Database: `veeforedb`
Collection: `nichecontexts`

## Maintenance

### Updating Trends

Trends should be updated regularly (recommended: monthly) to keep language patterns current. The `NicheContextService.updateTrends()` method can be used to refresh trending data.

**Manual update example:**
```typescript
await nicheContextService.updateTrends('fashion', {
  trendingTopics: ['new topics'],
  trendingHashtags: ['#newhashtags'],
  trendingPhrases: ['new phrases']
});
```

### Adding New Niches

To add a new niche:

1. Add niche data to the `nicheContexts` array in `seed-niche-contexts.ts`
2. Follow the existing structure with all required fields
3. Run the seed script to add the new niche
4. Run the verification script to test accessibility

### Stale Data Detection

The system automatically detects stale data (older than 30 days) using:
```typescript
await nicheContextService.isTrendsDataStale('fashion');
```

A scheduled job can be set up to refresh stale contexts automatically.

## Integration

This seeded data is used by:
- **NicheContextService** - Provides context for caption generation
- **PromptConstructorService** - Injects niche language into AI prompts
- **Caption Generation** - Creates authentic, niche-appropriate content

## Task Reference

This implements **Task 4.3: Seed initial niche context database** from the Authentic Instagram Caption Generation spec.

**Completed:**
- ✅ Created seed data for major Instagram niches (7 niches)
- ✅ Included trending topics, hashtag strategies, and language patterns
- ✅ Added audience preferences and engagement triggers
- ✅ Created database migration/seed script
- ✅ Verified data accessibility through service layer

## Notes

- All hashtags include the `#` prefix for consistency
- Slang terms are current as of seeding date - update regularly
- Tone guidelines help maintain authentic voice in content generation
- Cultural references reflect current Instagram trends and memes
- Emojis selected based on popularity within each niche
