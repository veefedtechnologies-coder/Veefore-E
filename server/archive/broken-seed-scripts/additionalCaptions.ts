/**
 * Additional Example Captions
 * 
 * This file contains 100+ more authentic Instagram captions to expand the library.
 * These captions demonstrate various styles, hooks, and engagement patterns
 * across all major niches.
 * 
 * Requirements: 7.1, 7.5
 */

export interface SeedCaption {
  caption: string;
  niche: string;
  postType: 'post' | 'story' | 'reel';
  engagementRate: number;
  likes: number;
  comments: number;
  saves: number;
  shares: number;
}

export const ADDITIONAL_CAPTIONS: SeedCaption[] = [
  // ============ FITNESS (50 examples) ============
  {
    caption: `Stop saying "I'll start tomorrow" 🚫

Tomorrow never comes. There's always another excuse.

Too tired today → Too busy tomorrow → Too sore next day → "I'll start fresh on Monday"

Here's the truth: You don't need the perfect plan. You don't need new workout clothes. You don't need a gym membership.

You need to START.

One push-up. One walk around the block. One healthy meal.

That's it. That's your workout today.

Progress doesn't care about perfect timing. It cares about action.

What's ONE thing you can do TODAY? Do that.`,
    niche: 'fitness',
