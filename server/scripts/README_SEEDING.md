# Example Caption Library Seeding

## Overview

The example caption library serves as the foundation for authentic AI-generated Instagram captions. These examples are used as few-shot learning samples to teach the AI how real, high-performing captions are structured.

## Current Status

**Initial Seed: 23 curated captions** across 14 niches
- Fitness: 4 captions
- Food: 3 captions
- Travel: 2 captions
- Fashion: 2 captions
- Tech/Business: 2 captions
- Beauty: 1 caption
- Lifestyle: 2 captions
- Parenting: 1 caption
- Pets: 1 caption
- Photography: 1 caption
- DIY: 1 caption
- Gaming: 1 caption
- Music: 1 caption
- Art: 1 caption

**Post Type Distribution:**
- Posts: 14 examples (storytelling, educational, engagement-focused)
- Reels: 3 examples (short, punchy, viral hooks)
- Stories: 6 examples (casual, relatable, quick reactions)

## Requirements

**From Specification (Requirement 7.1):**
> THE Example_Caption_Library SHALL store at least 1000 real Instagram captions per niche with verified engagement metrics

## Expansion Strategy

To reach the 1000+ captions per niche target, use the following approaches:

### 1. Curated Real Captions (Highest Quality)
- Manually collect high-performing captions from real Instagram accounts
- Verify engagement metrics are authentic
- Categorize by niche, post type, and style
- Mark as `source: 'curated'` and `verified: true`

### 2. User-Generated Examples (Growing Library)
- As users publish AI-generated captions that perform well, add them to the library
- Track actual engagement metrics from published posts
- Mark as `source: 'user'` and `verified: false` (until manually reviewed)
- This creates a self-improving feedback loop

### 3. Web Scraping (Automated Collection - Future Enhancement)
- Use Instagram Graph API or web scraping to collect captions
- Filter by engagement rate, niche, and relevance
- Requires careful compliance with Instagram's terms of service
- Mark as `source: 'scraped'` and `verified: false`
- Manual review required before setting `verified: true`

## Running the Seed Script

```bash
# From project root
npx tsx server/scripts/seedExampleCaptions.ts
```

**Note:** The script will NOT overwrite existing data. It checks for existing captions and skips seeding if data is present.

## Adding More Captions

### Manual Addition via MongoDB

```javascript
db.examplecaptions.insertOne({
  caption: "Your authentic caption here...",
  source: "curated",
  niche: "fitness",
  postType: "post",
  style: "storytelling",
  engagementRate: 10.5,
  likes: 15000,
  comments: 400,
  saves: 1200,
  shares: 200,
  captionLength: 450,
  hookType: "pov",
  hasQuestion: true,
  hasEmoji: true,
  emojiCount: 5,
  capturedAt: new Date(),
  verified: true
});
```

### Programmatic Addition via Service

```typescript
import { exampleCaptionService } from '../services/ExampleCaptionService';

await exampleCaptionService.addUserExample(
  userId,
  "Your caption text...",
  {
    engagementRate: 10.5,
    likes: 15000,
    comments: 400,
    saves: 1200
  },
  "fitness",
  "post"
);
```

## Caption Quality Guidelines

When adding captions to the library, ensure they meet these criteria:

### ✅ Good Examples
- Natural, conversational tone
- Platform-native language (Instagram-specific terms)
- Clear engagement hooks (questions, CTAs)
- Personal voice and authenticity
- Proper emoji usage (natural, not forced)
- Mobile-optimized formatting (short paragraphs, line breaks)
- Verified high engagement (8%+ engagement rate)

### ❌ Avoid These
- Corporate jargon or marketing speak
- Generic templates ("Swipe left to see...", "Link in bio!")
- AI-sounding language (overly formal, predictable patterns)
- Clickbait without substance
- Spam-like content
- Fake engagement metrics

## Data Schema

Each example caption includes:

```typescript
{
  caption: string;           // Full caption text
  source: 'user' | 'curated' | 'scraped';
  sourceAccount?: string;    // Instagram handle (if applicable)
  userId?: string;           // User ID (if source is 'user')
  niche: string;            // Content niche
  postType: 'post' | 'story' | 'reel';
  style: string;            // storytelling, question-based, list-format, etc.
  engagementRate: number;   // Percentage (likes+comments+saves)/impressions * 100
  likes: number;
  comments: number;
  saves: number;
  shares: number;
  captionLength: number;
  hookType: string;         // pov, hot-take, question, confession, etc.
  hasQuestion: boolean;
  hasEmoji: boolean;
  emojiCount: number;
  capturedAt: Date;
  verified: boolean;        // Manual quality verification
}
```

## Next Steps for Production

1. **Expand Initial Seed Data** - Add 50-100 high-quality curated examples per major niche
2. **Enable User Feedback Loop** - Track user-generated captions that perform well
3. **Implement Scraping System** - Automated collection with manual verification
4. **Regular Updates** - Monthly refresh of trending captions and patterns
5. **Quality Control** - Manual review process for verification
6. **Performance Tracking** - Monitor which examples lead to best AI outputs

## Maintenance

- **Weekly:** Review new user-generated examples for verification
- **Monthly:** Update trending captions and remove outdated examples
- **Quarterly:** Audit library for quality and performance
- **Annually:** Major refresh with current Instagram trends

## Notes

- The initial 23 captions provide a strong foundation for AI generation
- Quality > Quantity: 100 excellent examples > 1000 mediocre ones
- The library will grow organically as users publish successful AI-generated content
- Focus on authentic, high-performing captions that demonstrate real Instagram voice
