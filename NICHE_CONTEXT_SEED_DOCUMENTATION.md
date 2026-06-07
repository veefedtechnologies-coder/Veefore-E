# Niche Context Database Seeding - Documentation

## Overview

Task 4.3 has been completed successfully. The niche context database has been populated with comprehensive training data for AI caption generation across 7 major Instagram niches.

## What is Niche Context Data?

This is **TRAINING DATA** - vocabulary and language patterns the AI learns from to understand how real Instagram creators communicate in each niche. The data helps the AI generate authentic, niche-specific captions that resonate with target audiences.

## Seeded Niches

### 1. Fitness (81 vocabulary terms, 15 slang terms)
- **Vocabulary**: gains, reps, sets, pump, shredded, progressive overload, HIIT, etc.
- **Slang**: gains (muscle growth), shredded (lean with definition), doms (muscle soreness)
- **Trending Topics**: rest day importance, gym anxiety, progressive overload, protein myths
- **Hashtags**: #FitnessMotivation, #GymLife, #GainsOnGains, #LegDay
- **Tone**: Motivational yet real. Acknowledges struggle while celebrating progress
- **Engagement Triggers**: Before/after comparisons, gym fail stories, unpopular opinions

### 2. Food (84 vocabulary terms, 11 slang terms)
- **Vocabulary**: recipe, ingredients, mise en place, al dente, umami, meal prep, etc.
- **Slang**: mise en place (prep everything), dump and go (easy cooking), emulsify
- **Trending Topics**: air fryer everything, budget meals, cooking without recipes
- **Hashtags**: #FoodPorn, #Foodie, #InstaFood, #HomeMade, #RecipeOfTheDay
- **Tone**: Warm and inviting like cooking for friends. Practical and accessible
- **Engagement Triggers**: Recipe reveal videos, cooking fails, unpopular food opinions

### 3. Travel (43 vocabulary terms, 9 slang terms)
- **Vocabulary**: wanderlust, adventure, backpacking, solo travel, digital nomad, etc.
- **Slang**: wanderlust (travel desire), tourist trap (overpriced places), bucket list
- **Trending Topics**: solo travel safety, budget travel hacks, digital nomad lifestyle
- **Hashtags**: #Travel, #Wanderlust, #SoloTravel, #BucketList, #DigitalNomad
- **Tone**: Inspiring yet practical. Balances wanderlust with real advice
- **Engagement Triggers**: Solo travel stories, travel scam warnings, budget vs luxury

### 4. Fashion (36 vocabulary terms, 8 slang terms)
- **Vocabulary**: ootd, style, capsule wardrobe, sustainable fashion, thrift, etc.
- **Slang**: ootd (outfit of the day), dupe (affordable alternative), capsule wardrobe
- **Trending Topics**: capsule wardrobe building, sustainable fashion, thrift shopping
- **Hashtags**: #OOTD, #FashionInspo, #StreetStyle, #SustainableFashion
- **Tone**: Confident yet inclusive. Celebrates individual style over conformity
- **Engagement Triggers**: Outfit transformations, fast fashion debates, thrift flips

### 5. Beauty (47 vocabulary terms, 9 slang terms)
- **Vocabulary**: skincare, glow, radiant, holy grail, glass skin, retinol, etc.
- **Slang**: holy grail (best product), glass skin (flawless complexion), skin purge
- **Trending Topics**: simple skincare routines, expensive vs drugstore, skin barrier repair
- **Hashtags**: #Skincare, #GlowingSkin, #SkincareRoutine, #CleanBeauty
- **Tone**: Informative yet approachable. Emphasizes self-care over perfection
- **Engagement Triggers**: Product dupe reveals, skincare routines, transformation stories

### 6. Business (50 vocabulary terms, 10 slang terms)
- **Vocabulary**: entrepreneur, hustle, side hustle, passive income, solopreneur, etc.
- **Slang**: side hustle (extra income), passive income, solopreneur, bootstrap, pivot
- **Trending Topics**: sustainable growth, anti-hustle culture, authentic marketing
- **Hashtags**: #Entrepreneur, #SmallBusiness, #SideHustle, #PassiveIncome
- **Tone**: Motivational but realistic. Celebrates wins while acknowledging struggles
- **Engagement Triggers**: Income reports, first sale stories, business mistakes

### 7. Lifestyle (44 vocabulary terms, 8 slang terms)
- **Vocabulary**: mindfulness, self-care, wellness, romanticize your life, that girl routine
- **Slang**: romanticize your life (find joy in everyday), soft life (prioritize ease)
- **Trending Topics**: romanticizing life, slow living movement, rest as productive
- **Hashtags**: #Lifestyle, #SelfCare, #SlowLiving, #RomanticizeYourLife
- **Tone**: Warm and nurturing. Aspirational yet relatable
- **Engagement Triggers**: Morning routine reveals, Sunday reset rituals, cozy space tours

## Data Structure

Each niche context includes:

```typescript
{
  niche: string                           // e.g., 'fitness', 'food'
  vocabulary: string[]                    // 30-80+ niche-specific terms
  slangTerms: Map<string, string>         // 8-15 terms with definitions
  culturalReferences: string[]            // 10-15 relevant references
  trendingTopics: string[]                // 12-18 current trending topics
  trendingHashtags: string[]              // 20-30 strategic hashtags
  trendingPhrases: string[]               // 10-15 popular phrases
  typicalEmojis: string[]                 // 15 commonly used emojis
  toneGuidelines: string                  // Tone/style description
  lastUpdated: Date                       // Tracking freshness
}
```

## Usage

### Running the Seed Script

```bash
npx tsx seed-niche-contexts.ts
```

### Verifying the Data

```bash
npx tsx verify-niche-contexts.ts
```

### Testing Data Quality

```bash
npx tsx test-niche-service.ts
```

## How AI Uses This Data

The NicheContextService provides this data to the AI prompt constructor:

1. **Vocabulary Learning**: AI learns niche-specific terminology
2. **Language Patterns**: Understands how creators in each niche communicate
3. **Trending Topics**: Knows what's currently relevant
4. **Hashtag Strategy**: Provides context for hashtag selection
5. **Tone Matching**: Guides appropriate communication style
6. **Emoji Usage**: Learns natural emoji placement patterns

## Database Location

- **Connection**: MongoDB Atlas
- **URI**: `mongodb+srv://brandboost09:Arpitc8433@cluster0.mekr2dh.mongodb.net/`
- **Database**: `veeforedb`
- **Collection**: `nichecontexts`

## Maintenance

### Updating Trends

Niche contexts should be refreshed monthly to keep trending topics, hashtags, and phrases current:

```typescript
await nicheContextService.updateTrends('fitness', {
  trendingTopics: [...new topics...],
  trendingHashtags: [...new hashtags...],
  trendingPhrases: [...new phrases...]
});
```

### Adding New Niches

To add a new niche, create a new entry in `seed-niche-contexts.ts` following the same structure, then re-run the seed script.

## Integration Points

This seed data integrates with:

1. **NicheContextService** (Task 4.1) - Service layer for data access
2. **PromptConstructorService** (Task 9.1) - Incorporates niche context into AI prompts
3. **AIContentGenerator** (Task 11.1) - Uses context for caption generation
4. **Trend Tracking System** (Task 4.2) - Updates trending data

## Files Created

- `seed-niche-contexts.ts` - Main seeding script
- `verify-niche-contexts.ts` - Verification script
- `test-niche-service.ts` - Data quality tests
- `NICHE_CONTEXT_SEED_DOCUMENTATION.md` - This documentation

## Completion Status

✅ Task 4.3 Complete

### Sub-tasks Completed:
- ✅ Created seed data for 7 major Instagram niches
- ✅ Included trending topics, hashtag strategies, language patterns
- ✅ Added audience preferences and engagement triggers
- ✅ Created database migration/seed script
- ✅ Verified all data properly seeded to MongoDB Atlas
- ✅ Tested data structure and completeness

## Next Steps

1. Run `seed-example-captions.ts` to populate example caption library (Task 5.3)
2. Test integration with PromptConstructorService
3. Verify AI-generated captions use niche-specific language
4. Set up monthly trend refresh automation
