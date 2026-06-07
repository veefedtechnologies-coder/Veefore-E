# Viral Patterns Database - Seeding Scripts

## Overview

This directory contains scripts for seeding and managing the viral patterns and hooks database used by the Authentic Instagram Caption Generation system.

## Task Completion

**Task 3.3: Seed initial viral pattern database** ✅ COMPLETE

### Requirements Met

- ✅ **200+ proven caption structures** - Seeded 495 patterns
- ✅ **50+ viral hooks per major niche** - Seeded 62 hooks per niche
- ✅ **Coverage across major niches** - All 15 niches covered

## Scripts

### 1. `generate-comprehensive-viral-data.ts`

**Primary seeding script** - Generates and seeds comprehensive viral patterns and hooks.

```bash
npx tsx server/scripts/generate-comprehensive-viral-data.ts
```

**What it does:**
- Generates 400+ viral patterns across 4 categories (hook, storytelling, structure, engagement)
- Generates 50+ hooks per niche across 15 niches
- Creates niche-specific and multi-niche patterns
- Assigns realistic engagement metrics with variance

**Output:**
- ~495 viral patterns
- ~930 viral hooks  
- Organized by category and niche

### 2. `seed-viral-patterns.ts`

**Legacy seeding script** - Contains manually curated high-quality patterns and hooks.

```bash
npx tsx server/scripts/seed-viral-patterns.ts
```

**What it does:**
- Seeds 31 manually curated viral patterns with real examples
- Seeds 95 manually curated viral hooks
- Focuses on quality over quantity

**Use case:** When you want to add specific, hand-crafted patterns

### 3. `verify-viral-data.ts`

**Verification script** - Validates seeded data meets requirements.

```bash
npx tsx server/scripts/verify-viral-data.ts
```

**What it checks:**
- Total pattern count (>= 200)
- Hooks per niche count (>= 50)
- Coverage across niches
- Data distribution by category
- Sample data quality

### 4. `drop-viral-pattern-indexes.ts`

**Utility script** - Drops problematic MongoDB indexes.

```bash
npx tsx server/scripts/drop-viral-pattern-indexes.ts
```

**Use case:** When encountering parallel array index errors

## Database Schema

### ViralPattern Collection

```typescript
{
  name: string;                    // Pattern name
  category: 'hook' | 'structure' | 'engagement' | 'storytelling';
  pattern: string;                 // Template with placeholders
  description: string;             // What the pattern does
  niches: string[];               // fitness, food, travel, etc.
  postTypes: string[];            // post, story, reel
  avgEngagementRate: number;      // Historical average
  successRate: number;            // % success
  usageCount: number;             // Tracking
  trending: boolean;              // Currently trending
  exampleCaptions: string[];      // Examples
  lastUsed?: Date;
  createdAt: Date;
}
```

### ViralHook Collection

```typescript
{
  hookText: string;               // "Hot take:", "POV:", etc.
  niche: string;                  // Specific niche
  avgEngagementBoost: number;     // % engagement increase
  usageCount: number;             // Tracking
  createdAt: Date;
}
```

## Data Distribution

### Patterns by Category
- **Hook patterns**: 154 (31%)
- **Storytelling patterns**: 125 (25%)
- **Engagement patterns**: 124 (25%)
- **Structure patterns**: 92 (19%)

### Hooks by Niche
Each niche has 62 hooks including:
- 50+ universal hook variations (Hot take, POV, Stop doing this, etc.)
- 5-10 niche-specific hooks (Workout hack for fitness, Recipe hack for food, etc.)

### Covered Niches
1. Fitness
2. Food
3. Travel
4. Fashion
5. Tech
6. Business
7. Beauty
8. Parenting
9. Gaming
10. Pets
11. Art
12. Music
13. Photography
14. DIY
15. Lifestyle

## MongoDB Connection

All scripts use:
- **URI**: `process.env.MONGODB_URI` or default Atlas connection
- **Database**: `veeforedb`
- **Collections**: `viralpatterns`, `viralhooks`

## Maintenance

### Adding New Patterns

1. **Manual approach**: Edit `seed-viral-patterns.ts` and add to `VIRAL_PATTERNS` array
2. **Automated approach**: Modify `PATTERN_TEMPLATES` in `generate-comprehensive-viral-data.ts`

### Adding New Niches

1. Add niche to `NICHES` array in generator script
2. Add niche-specific hooks in `getNicheSpecificHooks()` function
3. Re-run generator script

### Updating Engagement Metrics

Use `ViralPatternService.updatePatternPerformance()` method in production to update based on actual performance.

## Troubleshooting

### Parallel Array Index Error

If you see: `cannot index parallel arrays [postTypes] [niches]`

**Solution:**
```bash
npx tsx server/scripts/drop-viral-pattern-indexes.ts
```

Then re-run seeding script.

### ES Module Errors

If you see: `__dirname is not defined in ES module scope`

**Fixed** - All scripts now use:
```typescript
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
```

## Integration

The ViralPatternService (`server/services/ViralPatternService.ts`) queries this data:

```typescript
// Get relevant patterns for caption generation
const patterns = await viralPatternService.getRelevantPatterns(
  'fitness',
  'post',
  5
);

// Get viral hooks
const hooks = await viralPatternService.getViralHooks('fitness', 5);
```

## Future Enhancements

- [ ] Add pattern versioning
- [ ] Implement A/B testing for patterns
- [ ] Add seasonal/trending pattern rotation
- [ ] Implement machine learning for pattern performance prediction
- [ ] Add multi-language support
- [ ] Create admin UI for pattern management

## References

- **Spec**: `.kiro/specs/authentic-instagram-caption-generation/`
- **Requirements**: See requirements.md section 2 (Viral Pattern Database Integration)
- **Design**: See design.md for ViralPatternService architecture
- **Tasks**: Task 3.3 in tasks.md
