/**
 * Unit tests for MultiPlatformCaptionService — Task 11.3
 *
 * Tests caption constraint enforcement (character limits, hashtag limits,
 * partial failure handling) without making real AI calls.
 *
 * Requirements: 11.2, 11.3, 11.5
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock AIServiceManager BEFORE importing the service under test.
// Use vi.hoisted so the mock fn reference is available at factory evaluation time.
// ---------------------------------------------------------------------------
const { mockGenerateText } = vi.hoisted(() => {
  return { mockGenerateText: vi.fn<[string, object?], Promise<string>>() };
});

vi.mock('./AIServiceManager', () => {
  return {
    AIServiceManager: {
      getInstance: () => ({
        generateText: mockGenerateText,
      }),
    },
  };
});

// Import AFTER mocking
import { MultiPlatformCaptionService } from './MultiPlatformCaptionService';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Builds a string of `n` 'a' characters. */
const repeat = (n: number) => 'a'.repeat(n);

/** Builds a string with `n` hashtags. */
const buildHashtags = (n: number) =>
  Array.from({ length: n }, (_, i) => `#tag${i + 1}`).join(' ');

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MultiPlatformCaptionService — caption constraint enforcement', () => {
  let service: MultiPlatformCaptionService;

  const baseParams = {
    userId: 'user-test',
    workspaceId: 'ws-test',
    topic: 'Morning coffee tips',
    preferences: { contentNiche: 'lifestyle' },
  };

  beforeEach(() => {
    service = new MultiPlatformCaptionService();
    mockGenerateText.mockReset();
  });

  // ------------------------------------------------------------------
  // Facebook constraint: max 500 characters
  // ------------------------------------------------------------------
  describe('Facebook caption — character limit', () => {
    it('returns caption unchanged when it is within 500 characters', async () => {
      const shortCaption = 'Great post! Check it out. #coffee #morning';
      mockGenerateText.mockResolvedValueOnce(shortCaption);

      const result = await service.generateCaptions({
        ...baseParams,
        targetPlatforms: ['facebook'],
      });

      expect(result.captions).toHaveLength(1);
      const fb = result.captions[0];
      expect(fb.error).toBeUndefined();
      expect(fb.caption).toBe(shortCaption);
      expect(fb.characterCount).toBeLessThanOrEqual(500);
    });

    it('truncates a Facebook caption exceeding 500 characters', async () => {
      // Caption that is 600 characters long (plus some hashtags)
      const longCaption = repeat(590) + ' #coffee #mornings';
      mockGenerateText.mockResolvedValueOnce(longCaption);

      const result = await service.generateCaptions({
        ...baseParams,
        targetPlatforms: ['facebook'],
      });

      const fb = result.captions[0];
      expect(fb.error).toBeUndefined();
      expect(fb.characterCount).toBeLessThanOrEqual(500);
    });

    it('truncated Facebook caption ends with an ellipsis', async () => {
      const longCaption = repeat(600) + ' #test';
      mockGenerateText.mockResolvedValueOnce(longCaption);

      const result = await service.generateCaptions({
        ...baseParams,
        targetPlatforms: ['facebook'],
      });

      const fb = result.captions[0];
      expect(fb.caption).toBeDefined();
      expect(fb.caption!.endsWith('…')).toBe(true);
    });
  });

  // ------------------------------------------------------------------
  // Facebook constraint: max 3 hashtags
  // ------------------------------------------------------------------
  describe('Facebook caption — hashtag limit', () => {
    it('returns caption unchanged when it has 3 or fewer hashtags', async () => {
      const caption = 'Great post! #coffee #morning #tips';
      mockGenerateText.mockResolvedValueOnce(caption);

      const result = await service.generateCaptions({
        ...baseParams,
        targetPlatforms: ['facebook'],
      });

      const fb = result.captions[0];
      expect(fb.error).toBeUndefined();
      expect(fb.hashtagCount).toBeLessThanOrEqual(3);
    });

    it('strips excess hashtags so a Facebook caption has at most 3', async () => {
      // 8 hashtags — way over the limit
      const caption = 'Check this out! ' + buildHashtags(8);
      mockGenerateText.mockResolvedValueOnce(caption);

      const result = await service.generateCaptions({
        ...baseParams,
        targetPlatforms: ['facebook'],
      });

      const fb = result.captions[0];
      expect(fb.error).toBeUndefined();
      expect(fb.hashtagCount).toBeLessThanOrEqual(3);
    });

    it('preserves the caption text for the allowed hashtags after stripping', async () => {
      const caption = 'Hello world #keep1 #keep2 #keep3 #remove1 #remove2';
      mockGenerateText.mockResolvedValueOnce(caption);

      const result = await service.generateCaptions({
        ...baseParams,
        targetPlatforms: ['facebook'],
      });

      const fb = result.captions[0];
      expect(fb.caption).toContain('#keep1');
      expect(fb.caption).toContain('#keep2');
      expect(fb.caption).toContain('#keep3');
      expect(fb.caption).not.toContain('#remove1');
      expect(fb.caption).not.toContain('#remove2');
    });
  });

  // ------------------------------------------------------------------
  // Instagram constraint: max 2200 characters
  // ------------------------------------------------------------------
  describe('Instagram caption — character limit', () => {
    it('returns caption unchanged when it is within 2200 characters', async () => {
      const caption = 'Short Instagram caption! #hashtag #fun';
      mockGenerateText.mockResolvedValueOnce(caption);

      const result = await service.generateCaptions({
        ...baseParams,
        targetPlatforms: ['instagram'],
      });

      const ig = result.captions[0];
      expect(ig.error).toBeUndefined();
      expect(ig.characterCount).toBeLessThanOrEqual(2200);
    });

    it('truncates an Instagram caption exceeding 2200 characters', async () => {
      const longCaption = repeat(2300) + ' #test';
      mockGenerateText.mockResolvedValueOnce(longCaption);

      const result = await service.generateCaptions({
        ...baseParams,
        targetPlatforms: ['instagram'],
      });

      const ig = result.captions[0];
      expect(ig.error).toBeUndefined();
      expect(ig.characterCount).toBeLessThanOrEqual(2200);
    });

    it('does NOT enforce a hashtag limit on Instagram captions', async () => {
      // Instagram allows many hashtags (discovery tone) — we should not strip them
      const caption = 'Great post! ' + buildHashtags(20);
      mockGenerateText.mockResolvedValueOnce(caption);

      const result = await service.generateCaptions({
        ...baseParams,
        targetPlatforms: ['instagram'],
      });

      const ig = result.captions[0];
      expect(ig.error).toBeUndefined();
      // 20 hashtags should all be present (not stripped)
      expect(ig.hashtagCount).toBe(20);
    });
  });

  // ------------------------------------------------------------------
  // "Both" flow — shared creative brief
  // ------------------------------------------------------------------
  describe('"Both" platform selection — shared creative brief', () => {
    it('generates a shared brief when both platforms are requested', async () => {
      // First call = brief, second = instagram, third = facebook
      mockGenerateText
        .mockResolvedValueOnce('Angle: productivity. Message: coffee fuels focus. CTA: comment below.')
        .mockResolvedValueOnce('Instagram caption #coffee #morning #productivity')
        .mockResolvedValueOnce('Facebook caption. Great post! #coffee');

      const result = await service.generateCaptions({
        ...baseParams,
        targetPlatforms: ['instagram', 'facebook'],
      });

      expect(result.sharedBrief).toBeDefined();
      expect(typeof result.sharedBrief).toBe('string');
      expect(result.sharedBrief!.length).toBeGreaterThan(0);
    });

    it('returns two caption entries when both platforms are requested', async () => {
      mockGenerateText
        .mockResolvedValueOnce('Creative brief')
        .mockResolvedValueOnce('Instagram caption #hashtag1 #hashtag2')
        .mockResolvedValueOnce('Facebook caption. #tag1');

      const result = await service.generateCaptions({
        ...baseParams,
        targetPlatforms: ['instagram', 'facebook'],
      });

      expect(result.captions).toHaveLength(2);
      const platforms = result.captions.map((c) => c.platform);
      expect(platforms).toContain('instagram');
      expect(platforms).toContain('facebook');
    });

    it('applies constraints to both captions independently', async () => {
      const longFbCaption = repeat(600) + ' ' + buildHashtags(8);
      const longIgCaption = repeat(2300) + ' #tag1';

      // Brief, instagram, facebook
      mockGenerateText
        .mockResolvedValueOnce('Brief content')
        .mockResolvedValueOnce(longIgCaption)
        .mockResolvedValueOnce(longFbCaption);

      const result = await service.generateCaptions({
        ...baseParams,
        targetPlatforms: ['instagram', 'facebook'],
      });

      const ig = result.captions.find((c) => c.platform === 'instagram')!;
      const fb = result.captions.find((c) => c.platform === 'facebook')!;

      expect(ig.error).toBeUndefined();
      expect(ig.characterCount).toBeLessThanOrEqual(2200);

      expect(fb.error).toBeUndefined();
      expect(fb.characterCount).toBeLessThanOrEqual(500);
      expect(fb.hashtagCount).toBeLessThanOrEqual(3);
    });
  });

  // ------------------------------------------------------------------
  // Partial failure — Requirement 11.5
  // ------------------------------------------------------------------
  describe('Partial failure handling', () => {
    it('returns the successful platform caption when Instagram generation fails', async () => {
      // Brief, instagram (fails), facebook (succeeds)
      mockGenerateText
        .mockResolvedValueOnce('Creative brief text')
        .mockRejectedValueOnce(new Error('Instagram AI quota exceeded'))
        .mockResolvedValueOnce('Facebook works fine. #coffee');

      const result = await service.generateCaptions({
        ...baseParams,
        targetPlatforms: ['instagram', 'facebook'],
      });

      const ig = result.captions.find((c) => c.platform === 'instagram')!;
      const fb = result.captions.find((c) => c.platform === 'facebook')!;

      // Facebook should succeed
      expect(fb.error).toBeUndefined();
      expect(fb.caption).toBeDefined();
      expect(fb.caption!.length).toBeGreaterThan(0);

      // Instagram should have an error
      expect(ig.error).toBeDefined();
      expect(ig.caption).toBeUndefined();
    });

    it('returns the successful platform caption when Facebook generation fails', async () => {
      // Brief, instagram (succeeds), facebook (fails)
      mockGenerateText
        .mockResolvedValueOnce('Brief text')
        .mockResolvedValueOnce('Instagram caption #hashtag #morning')
        .mockRejectedValueOnce(new Error('Facebook AI model unavailable'));

      const result = await service.generateCaptions({
        ...baseParams,
        targetPlatforms: ['instagram', 'facebook'],
      });

      const ig = result.captions.find((c) => c.platform === 'instagram')!;
      const fb = result.captions.find((c) => c.platform === 'facebook')!;

      // Instagram should succeed
      expect(ig.error).toBeUndefined();
      expect(ig.caption).toBeDefined();

      // Facebook should have an error
      expect(fb.error).toBeDefined();
      expect(fb.caption).toBeUndefined();
      expect(fb.characterCount).toBe(0);
      expect(fb.hashtagCount).toBe(0);
    });

    it('still returns a sharedBrief even when one platform fails', async () => {
      mockGenerateText
        .mockResolvedValueOnce('Shared brief')
        .mockResolvedValueOnce('Instagram caption')
        .mockRejectedValueOnce(new Error('Failure'));

      const result = await service.generateCaptions({
        ...baseParams,
        targetPlatforms: ['instagram', 'facebook'],
      });

      expect(result.sharedBrief).toBe('Shared brief');
      expect(result.captions).toHaveLength(2);
    });

    it('continues without sharedBrief when brief generation itself fails', async () => {
      // Brief fails, then instagram and facebook succeed
      mockGenerateText
        .mockRejectedValueOnce(new Error('Brief generation failed'))
        .mockResolvedValueOnce('Instagram caption #tag')
        .mockResolvedValueOnce('Facebook caption. #fb');

      const result = await service.generateCaptions({
        ...baseParams,
        targetPlatforms: ['instagram', 'facebook'],
      });

      // Brief is absent — captions are still generated
      expect(result.sharedBrief).toBeUndefined();
      expect(result.captions).toHaveLength(2);
      const ig = result.captions.find((c) => c.platform === 'instagram')!;
      const fb = result.captions.find((c) => c.platform === 'facebook')!;
      expect(ig.error).toBeUndefined();
      expect(fb.error).toBeUndefined();
    });

    it('returns single-platform result with no brief for single-platform request', async () => {
      mockGenerateText.mockResolvedValueOnce('Only Instagram. #tag1 #tag2');

      const result = await service.generateCaptions({
        ...baseParams,
        targetPlatforms: ['instagram'],
      });

      expect(result.sharedBrief).toBeUndefined();
      expect(result.captions).toHaveLength(1);
      expect(result.captions[0].platform).toBe('instagram');
      expect(result.captions[0].error).toBeUndefined();
    });
  });

  // ------------------------------------------------------------------
  // Metadata: characterCount and hashtagCount
  // ------------------------------------------------------------------
  describe('Result metadata', () => {
    it('reports correct characterCount in the result', async () => {
      const caption = 'Hello world'; // 11 chars
      mockGenerateText.mockResolvedValueOnce(caption);

      const result = await service.generateCaptions({
        ...baseParams,
        targetPlatforms: ['instagram'],
      });

      expect(result.captions[0].characterCount).toBe([...caption].length);
    });

    it('reports correct hashtagCount for a caption with multiple hashtags', async () => {
      const caption = 'Nice post! #one #two #three';
      mockGenerateText.mockResolvedValueOnce(caption);

      const result = await service.generateCaptions({
        ...baseParams,
        targetPlatforms: ['instagram'],
      });

      expect(result.captions[0].hashtagCount).toBe(3);
    });

    it('reports hashtagCount = 0 for a caption with no hashtags', async () => {
      const caption = 'No hashtags here at all.';
      mockGenerateText.mockResolvedValueOnce(caption);

      const result = await service.generateCaptions({
        ...baseParams,
        targetPlatforms: ['instagram'],
      });

      expect(result.captions[0].hashtagCount).toBe(0);
    });
  });
});
