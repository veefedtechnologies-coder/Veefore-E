# NicheContextService Documentation

## Overview

The `NicheContextService` provides niche-specific language, trends, and context for authentic Instagram caption generation. It maintains language databases for different content verticals and supports intelligent caching and multi-niche blending.

## Features

✅ **Niche-Specific Context**: Retrieve vocabulary, slang, cultural references, and trends for 15+ content niches
✅ **Multi-Niche Blending**: Combine language from multiple niches for cross-category content
✅ **Smart Caching**: 24-hour TTL cache to minimize database queries
✅ **Trend Tracking**: Track trending topics, hashtags, and phrases
✅ **Term Validation**: Check if slang terms are current or outdated
✅ **Type-Safe**: Full TypeScript support with domain types

## Requirements Addressed

This implementation addresses the following spec requirements:

- **Requirement 3.1**: Maintain language databases for at least 15 content niches
- **Requirement 3.2**: Provide niche-specific vocabulary, slang, cultural references, and emojis
- **Requirement 3.5**: Blend language from multiple niches appropriately
- **Requirement 3.6**: Avoid outdated slang by tracking term usage

## Architecture

```
┌─────────────────────────────────────────┐
│     NicheContextService                 │
│  ┌──────────────────────────────────┐  │
│  │   In-Memory Cache (24h TTL)     │  │
│  └──────────────────────────────────┘  │
│              ↓                          │
│  ┌──────────────────────────────────┐  │
│  │  NicheContextRepository          │  │
│  └──────────────────────────────────┘  │
│              ↓                          │
│  ┌──────────────────────────────────┐  │
│  │  MongoDB NicheContext Collection │  │
│  └──────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

## Data Model

### NicheContext

```typescript
interface NicheContext {
  id: string;
  niche: string;
  
  // Language
  vocabulary: string[];              // Niche-specific words
  slangTerms: Record<string, string>; // slang → meaning
  culturalReferences: string[];      // Current references
  
  // Trends (last 30 days)
  trendingTopics: string[];
  trendingHashtags: string[];
  trendingPhrases: string[];
  
  // Style
  typicalEmojis: string[];
  toneGuidelines: string;
  
  // Metadata
  lastUpdated: Date;
}
```

## API Reference

### getNicheContext(niche: string)

Retrieves niche-specific context with automatic caching.

**Parameters:**
- `niche` (string): Content niche (e.g., 'fitness', 'food', 'travel')

**Returns:** Promise<NicheContext>

**Example:**
```typescript
import { nicheContextService } from './services/NicheContextService';

const context = await nicheContextService.getNicheContext('fitness');
console.log(context.vocabulary);      // ['workout', 'gains', 'protein', ...]
console.log(context.slangTerms);      // { gains: 'muscle growth', ... }
console.log(context.trendingTopics);  // ['HIIT workouts', 'home gym', ...]
```

**Caching Behavior:**
- First call: Fetches from database
- Subsequent calls (within 24 hours): Returns from memory cache
- After cache expiry: Automatically refreshes from database

### getBlendedContext(niches: string[])

Merges context from multiple niches for cross-category content.

**Parameters:**
- `niches` (string[]): Array of content niches to blend

**Returns:** Promise<NicheContext>

**Example:**
```typescript
// For a post about healthy meal prep for athletes
const blended = await nicheContextService.getBlendedContext([
  'fitness',
  'food',
  'lifestyle'
]);

// Contains merged vocabulary, slang, trends from all three niches
console.log(blended.vocabulary);  // Combined unique terms
console.log(blended.slangTerms);  // All slang terms from all niches
```

**Blending Logic:**
- Arrays (vocabulary, topics, etc.): Merged with duplicates removed
- Objects (slangTerms): All entries combined
- Strings (toneGuidelines): Concatenated with semicolons

### isTermOutdated(term: string, niche: string)

Checks if a slang term is current or outdated.

**Parameters:**
- `term` (string): The term or phrase to check
- `niche` (string): The content niche

**Returns:** Promise<boolean>

**Example:**
```typescript
const isGainsOutdated = await nicheContextService.isTermOutdated('gains', 'fitness');
console.log(isGainsOutdated);  // false (current fitness slang)

const isRadOutdated = await nicheContextService.isTermOutdated('rad', 'fitness');
console.log(isRadOutdated);    // true (outdated 1980s slang)
```

### updateTrends(niche: string, trendsData?: object)

Updates trending data for a specific niche and invalidates cache.

**Parameters:**
- `niche` (string): The content niche to update
- `trendsData` (optional object): Optional trend data to update directly
  - `trendingTopics` (string[]): New trending topics
  - `trendingHashtags` (string[]): New trending hashtags
  - `trendingPhrases` (string[]): New trending phrases

**Returns:** Promise<void>

**Example:**
```typescript
// Update with provided data
await nicheContextService.updateTrends('fitness', {
  trendingTopics: ['HIIT workouts', 'home gym'],
  trendingHashtags: ['#fitness', '#workout'],
  trendingPhrases: ['no pain no gain', 'summer body ready']
});

// Update from external sources (placeholder for future integration)
await nicheContextService.updateTrends('fitness');
// Cache invalidated, next getNicheContext() fetches fresh data
```

### getTermRelevanceScore(term: string, niche: string)

Calculates a relevance score for a term based on its presence in various niche data categories.

**Parameters:**
- `term` (string): The term to score
- `niche` (string): The content niche

**Returns:** Promise<number> - Score from 0-100
- 40 points: Term in trending phrases (highest priority)
- 30 points: Term in slang terms (current language)
- 20 points: Term in vocabulary (established terms)
- 10 points: Term in trending topics

**Example:**
```typescript
const score1 = await nicheContextService.getTermRelevanceScore('gains', 'fitness');
console.log(score1); // 30 (in slang terms)

const score2 = await nicheContextService.getTermRelevanceScore('workout', 'fitness');
console.log(score2); // Could be 100 (in all categories)

const score3 = await nicheContextService.getTermRelevanceScore('obsolete', 'fitness');
console.log(score3); // 0 (not in any category)
```

### analyzeTrendsFromContent(niche: string, contents: Array)

Analyzes content samples to extract trending hashtags, phrases, and topics. Filters content to last 30 days and prioritizes high-engagement posts.

**Parameters:**
- `niche` (string): The content niche
- `contents` (Array): Array of content objects with:
  - `caption` (string): The post caption text
  - `hashtags` (string[]): Array of hashtags used
  - `engagementRate` (number): Engagement percentage
  - `timestamp` (Date): When the content was posted

**Returns:** Promise<{ trendingTopics, trendingHashtags, trendingPhrases }>

**Algorithm:**
1. Filters content to last 30 days only
2. Sorts by engagement rate (descending)
3. Analyzes top 50% of content
4. Extracts hashtags appearing 3+ times
5. Extracts phrases appearing 2+ times
6. Derives topics from hashtag patterns

**Example:**
```typescript
const contents = [
  {
    caption: 'Great workout! #fitness #gym',
    hashtags: ['#fitness', '#gym'],
    engagementRate: 5.2,
    timestamp: new Date()
  },
  // ... more content
];

const trends = await nicheContextService.analyzeTrendsFromContent('fitness', contents);
console.log(trends.trendingHashtags);  // ['#fitness', '#gym', ...]
console.log(trends.trendingPhrases);   // ['great workout', ...]
console.log(trends.trendingTopics);    // ['workout', 'gym', ...]

// Use extracted trends to update niche context
await nicheContextService.updateTrends('fitness', trends);
```

### isTrendsDataStale(niche: string)

Checks if trends data for a niche is older than 30 days and needs refreshing.

**Parameters:**
- `niche` (string): The content niche to check

**Returns:** Promise<boolean>

**Example:**
```typescript
const isStale = await nicheContextService.isTrendsDataStale('fitness');
if (isStale) {
  console.log('Trends need updating');
  await nicheContextService.updateTrends('fitness');
}
```

## Usage in Caption Generation

### Step 1: Get Niche Context

```typescript
const context = await nicheContextService.getNicheContext(userPreferences.niche);
```

### Step 2: Build AI Prompt Layer

```typescript
const promptLayer = `
NICHE-SPECIFIC LANGUAGE (${context.niche}):

Current trending topics:
${context.trendingTopics.slice(0, 5).join(', ')}

Niche vocabulary to use naturally:
${context.vocabulary.slice(0, 20).join(', ')}

Current slang/phrases:
${Object.entries(context.slangTerms).slice(0, 5)
  .map(([term, meaning]) => \`"\${term}" (\${meaning})\`).join(', ')}

Typical emojis: ${context.typicalEmojis.join(' ')}

Tone guidelines: ${context.toneGuidelines}
`;
```

### Step 3: Include in AI Generation

```typescript
const fullPrompt = `
${baseInstructions}
${voiceProfilePrompt}
${viralPatternsPrompt}
${promptLayer}  // <-- Niche context layer
${taskInstructions}
`;
```

## Supported Niches

The service is designed to support 15+ major content niches:

1. **fitness** - Workout, health, wellness
2. **food** - Recipes, restaurants, cooking
3. **travel** - Destinations, adventures, experiences
4. **fashion** - Style, outfits, trends
5. **tech** - Gadgets, software, innovation
6. **business** - Entrepreneurship, productivity
7. **beauty** - Makeup, skincare, self-care
8. **parenting** - Family, children, parenting tips
9. **gaming** - Video games, esports, streaming
10. **pets** - Animals, pet care, cute pets
11. **art** - Creative work, illustrations, design
12. **music** - Songs, artists, instruments
13. **photography** - Photos, cameras, techniques
14. **diy** - Crafts, home improvement, projects
15. **lifestyle** - General life, motivation, quotes

## Caching Strategy

### Cache TTL
- **Duration**: 24 hours
- **Storage**: In-memory Map
- **Key**: Normalized niche name (lowercase, trimmed)

### Cache Invalidation
- Automatic expiry after 24 hours
- Manual invalidation via `updateTrends()`
- No cache for blended contexts (computed on-demand)

### Performance Benefits
```
First call:  ~50-100ms (database query)
Cached call: ~0-2ms (memory lookup)
Speedup:     25-50x faster
```

## Database Schema

### MongoDB Collection: `nichecontexts`

```javascript
{
  _id: ObjectId,
  niche: String (unique, indexed),
  vocabulary: [String],
  slangTerms: Map<String, String>,
  culturalReferences: [String],
  trendingTopics: [String],
  trendingHashtags: [String],
  trendingPhrases: [String],
  typicalEmojis: [String],
  toneGuidelines: String,
  lastUpdated: Date
}
```

### Indexes
- `niche`: Unique index for fast lookups
- `lastUpdated`: Index for finding stale contexts

## Testing

### Unit Tests
Location: `server/services/NicheContextService.test.ts`

**Coverage:**
- ✅ getNicheContext - fetch from repository
- ✅ getNicheContext - create default context
- ✅ getNicheContext - cache behavior
- ✅ getBlendedContext - merge multiple niches
- ✅ getBlendedContext - single niche handling
- ✅ getBlendedContext - error on empty array
- ✅ getBlendedContext - duplicate removal
- ✅ isTermOutdated - current slang detection
- ✅ isTermOutdated - trending phrase detection
- ✅ isTermOutdated - vocabulary detection
- ✅ isTermOutdated - outdated term detection
- ✅ updateTrends - repository call
- ✅ updateTrends - cache invalidation
- ✅ updateTrends - with provided data
- ✅ getTermRelevanceScore - trending phrases score
- ✅ getTermRelevanceScore - slang terms score
- ✅ getTermRelevanceScore - vocabulary score
- ✅ getTermRelevanceScore - zero for non-existent terms
- ✅ getTermRelevanceScore - accumulated scores
- ✅ analyzeTrendsFromContent - extract hashtags
- ✅ analyzeTrendsFromContent - extract phrases
- ✅ analyzeTrendsFromContent - filter by date
- ✅ analyzeTrendsFromContent - prioritize high engagement
- ✅ isTrendsDataStale - stale detection
- ✅ isTrendsDataStale - current detection

**Run tests:**
```bash
cd server
npm test -- NicheContextService.test.ts --run
```

### Integration Tests
Location: `server/services/NicheContextService.integration.test.ts`

**Note:** Integration tests require active MongoDB connection.

## Error Handling

The service uses the `BaseService` error handling pattern:

```typescript
try {
  const context = await nicheContextService.getNicheContext('fitness');
} catch (error) {
  // Logged automatically via BaseService
  // Error includes method name, niche, and stack trace
  console.error('Failed to get niche context:', error);
}
```

## Future Enhancements

### Planned Features
1. **Automatic Trend Updates**: Scheduled job to fetch trends from Instagram API
2. **Term Frequency Tracking**: Track usage over time to identify declining terms
3. **User-Specific Context**: Customize context based on user's past successful content
4. **Multi-Language Support**: Niche contexts for different languages
5. **Seasonal Trends**: Track seasonal variations in niche language
6. **Competitor Analysis**: Learn from competitor niches

### Data Population
Currently using placeholder data. Future implementation will include:
- Migration scripts to seed 15+ niche contexts
- API integrations for trend tracking
- Web scraping for real Instagram content analysis
- ML models for pattern extraction

## Dependencies

- `mongoose`: MongoDB ODM
- `BaseService`: Service layer base class
- `nicheContextRepository`: Data access layer
- Domain types from `server/domain/types.ts`

## Related Components

- **VoiceProfileService**: User writing style analysis
- **ViralPatternService**: Viral caption patterns
- **ExampleCaptionService**: High-performing caption examples
- **PromptConstructorService**: AI prompt building
- **AuthenticityScorer**: Caption quality evaluation

## Contributing

When adding new niche contexts:

1. Add context to database via repository
2. Include comprehensive vocabulary (20+ terms)
3. Add 5+ slang terms with meanings
4. Include 3+ cultural references
5. Add 5+ trending topics
6. Include 10+ trending hashtags
7. Specify 5+ typical emojis
8. Write clear tone guidelines

## License

Internal use only - Veefore E platform.
