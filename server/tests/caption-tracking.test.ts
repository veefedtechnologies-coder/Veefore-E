/**
 * Tests for Caption Tracking and Storage
 * 
 * Task 11.3: Implement caption tracking and storage
 * Tests the saveGeneratedCaption, recordCaptionSelection, recordCaptionEdit,
 * and linkCaptionToContent methods.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { aiContentGenerator } from '../ai-content-generator';
import { generatedCaptionRepository } from '../repositories/GeneratedCaptionRepository';
import { calculateLevenshteinDistance, calculateSimilarityPercentage } from '../utils/levenshtein';

describe('Caption Tracking and Storage', () => {
  describe('Levenshtein Distance Calculation', () => {
    it('should calculate distance for identical strings', () => {
      const distance = calculateLevenshteinDistance('hello', 'hello');
      expect(distance).toBe(0);
    });

    it('should calculate distance for completely different strings', () => {
      const distance = calculateLevenshteinDistance('hello', 'world');
      expect(distance).toBeGreaterThan(0);
    });

    it('should calculate distance for single character change', () => {
      const distance = calculateLevenshteinDistance('kitten', 'sitten');
      expect(distance).toBe(1);
    });

    it('should calculate similarity percentage correctly', () => {
      const similarity = calculateSimilarityPercentage('hello', 'hello');
      expect(similarity).toBe(100);
    });

    it('should handle empty strings', () => {
      const distance = calculateLevenshteinDistance('', 'hello');
      expect(distance).toBe(5);
    });
  });

  describe('saveGeneratedCaption', () => {
    it('should save caption with all variations and metadata', async () => {
      const testData = {
        userId: 'test-user-123',
        workspaceId: 'test-workspace-456',
        variations: [
          {
            caption: 'This is a test caption for Instagram!',
            hashtags: ['test', 'instagram', 'caption'],
            authenticityScore: 85,
            engagementPrediction: {
              likeRate: 5.2,
              commentRate: 1.8,
              saveRate: 2.1,
              shareRate: 0.5,
              confidence: 0.75
            },
            usedPatterns: ['storytelling-hook'],
            usedHooks: ['hot-take']
          }
        ],
        postType: 'post' as const,
        platform: 'instagram',
        niche: 'fitness'
      };

      const captionId = await aiContentGenerator.saveGeneratedCaption(testData);
      
      expect(captionId).toBeDefined();
      expect(typeof captionId).toBe('string');

      // Verify saved data
      const savedCaption = await generatedCaptionRepository.findById(captionId);
      expect(savedCaption).toBeDefined();
      expect(savedCaption?.userId).toBe(testData.userId);
      expect(savedCaption?.workspaceId).toBe(testData.workspaceId);
      expect(savedCaption?.variations).toHaveLength(1);
      expect(savedCaption?.variations[0].caption).toBe(testData.variations[0].caption);
      expect(savedCaption?.postType).toBe('post');
      expect(savedCaption?.platform).toBe('instagram');
      expect(savedCaption?.niche).toBe('fitness');
    }, 10000);

    it('should calculate edit distance when caption is edited', async () => {
      const originalCaption = 'This is the original AI-generated caption.';
      const editedCaption = 'This is my edited caption with changes!';
      
      const testData = {
        userId: 'test-user-123',
        workspaceId: 'test-workspace-456',
        variations: [
          {
            caption: originalCaption,
            hashtags: ['test'],
            authenticityScore: 80,
            engagementPrediction: {
              likeRate: 5.0,
              commentRate: 1.5,
              saveRate: 2.0,
              shareRate: 0.3,
              confidence: 0.7
            }
          }
        ],
        postType: 'post' as const,
        platform: 'instagram',
        niche: 'tech',
        wasEdited: true,
        originalCaption,
        editedCaption
      };

      const captionId = await aiContentGenerator.saveGeneratedCaption(testData);
      
      const savedCaption = await generatedCaptionRepository.findById(captionId);
      expect(savedCaption?.wasEdited).toBe(true);
      expect(savedCaption?.originalCaption).toBe(originalCaption);
      expect(savedCaption?.editedCaption).toBe(editedCaption);
      expect(savedCaption?.editDistance).toBeDefined();
      expect(savedCaption?.editDistance).toBeGreaterThan(0);
    }, 10000);
  });

  describe('recordCaptionSelection', () => {
    it('should record which variation user selected', async () => {
      // First save a caption with multiple variations
      const testData = {
        userId: 'test-user-123',
        workspaceId: 'test-workspace-456',
        variations: [
          {
            caption: 'Variation 1 caption',
            hashtags: ['test1'],
            authenticityScore: 80
          },
          {
            caption: 'Variation 2 caption',
            hashtags: ['test2'],
            authenticityScore: 85
          },
          {
            caption: 'Variation 3 caption',
            hashtags: ['test3'],
            authenticityScore: 90
          }
        ],
        postType: 'post' as const,
        platform: 'instagram',
        niche: 'lifestyle'
      };

      const captionId = await aiContentGenerator.saveGeneratedCaption(testData);
      
      // Record selection of variation 2 (index 1)
      await aiContentGenerator.recordCaptionSelection(captionId, 1);
      
      // Verify selection was recorded
      const savedCaption = await generatedCaptionRepository.findById(captionId);
      expect(savedCaption?.selectedVariationIndex).toBe(1);
    }, 10000);
  });

  describe('recordCaptionEdit', () => {
    it('should record user edits with edit distance', async () => {
      // First save a caption
      const originalCaption = 'Original AI caption for testing';
      const testData = {
        userId: 'test-user-123',
        workspaceId: 'test-workspace-456',
        variations: [
          {
            caption: originalCaption,
            hashtags: ['test'],
            authenticityScore: 80
          }
        ],
        postType: 'post' as const,
        platform: 'instagram',
        niche: 'food'
      };

      const captionId = await aiContentGenerator.saveGeneratedCaption(testData);
      
      // Record edit
      const editedCaption = 'Original AI caption but with my edits';
      await aiContentGenerator.recordCaptionEdit(captionId, originalCaption, editedCaption);
      
      // Verify edit was recorded
      const savedCaption = await generatedCaptionRepository.findById(captionId);
      expect(savedCaption?.wasEdited).toBe(true);
      expect(savedCaption?.originalCaption).toBe(originalCaption);
      expect(savedCaption?.editedCaption).toBe(editedCaption);
      expect(savedCaption?.editDistance).toBeDefined();
      expect(savedCaption?.editDistance).toBeGreaterThan(0);
    }, 10000);
  });

  describe('linkCaptionToContent', () => {
    it('should link caption to published content', async () => {
      // First save a caption
      const testData = {
        userId: 'test-user-123',
        workspaceId: 'test-workspace-456',
        variations: [
          {
            caption: 'Caption to be published',
            hashtags: ['test', 'publish'],
            authenticityScore: 85
          }
        ],
        postType: 'post' as const,
        platform: 'instagram',
        niche: 'travel'
      };

      const captionId = await aiContentGenerator.saveGeneratedCaption(testData);
      
      // Link to content
      const contentId = 'content-123';
      const publishedAt = new Date();
      await aiContentGenerator.linkCaptionToContent(captionId, contentId, publishedAt);
      
      // Verify link was created
      const savedCaption = await generatedCaptionRepository.findById(captionId);
      expect(savedCaption?.contentId).toBe(contentId);
      expect(savedCaption?.publishedAt).toBeDefined();
    }, 10000);
  });

  describe('Integration - Full Caption Lifecycle', () => {
    it('should track complete caption lifecycle from generation to publish', async () => {
      // Step 1: Generate and save caption with variations
      const testData = {
        userId: 'test-user-lifecycle',
        workspaceId: 'test-workspace-lifecycle',
        variations: [
          {
            caption: 'First variation - viral hook style',
            hashtags: ['fitness', 'workout', 'motivation'],
            authenticityScore: 88,
            engagementPrediction: {
              likeRate: 6.2,
              commentRate: 2.1,
              saveRate: 3.0,
              shareRate: 0.8,
              confidence: 0.82
            },
            usedPatterns: ['viral-hook'],
            usedHooks: ['hot-take']
          },
          {
            caption: 'Second variation - storytelling style',
            hashtags: ['fitness', 'transformation', 'journey'],
            authenticityScore: 92,
            engagementPrediction: {
              likeRate: 7.1,
              commentRate: 2.8,
              saveRate: 3.5,
              shareRate: 1.2,
              confidence: 0.87
            },
            usedPatterns: ['storytelling'],
            usedHooks: ['story-opener']
          }
        ],
        postType: 'post' as const,
        platform: 'instagram',
        niche: 'fitness'
      };

      const captionId = await aiContentGenerator.saveGeneratedCaption(testData);
      expect(captionId).toBeDefined();

      // Step 2: User selects variation 2
      await aiContentGenerator.recordCaptionSelection(captionId, 1);

      // Step 3: User edits the selected caption
      const originalCaption = testData.variations[1].caption;
      const editedCaption = 'Second variation - storytelling style (but with my personal touch!)';
      await aiContentGenerator.recordCaptionEdit(captionId, originalCaption, editedCaption);

      // Step 4: User publishes content
      const contentId = 'published-content-123';
      await aiContentGenerator.linkCaptionToContent(captionId, contentId, new Date());

      // Step 5: Verify complete lifecycle was tracked
      const savedCaption = await generatedCaptionRepository.findById(captionId);
      
      expect(savedCaption).toBeDefined();
      expect(savedCaption?.variations).toHaveLength(2);
      expect(savedCaption?.selectedVariationIndex).toBe(1);
      expect(savedCaption?.wasEdited).toBe(true);
      expect(savedCaption?.originalCaption).toBe(originalCaption);
      expect(savedCaption?.editedCaption).toBe(editedCaption);
      expect(savedCaption?.editDistance).toBeGreaterThan(0);
      expect(savedCaption?.contentId).toBe(contentId);
      expect(savedCaption?.publishedAt).toBeDefined();

      console.log('\n✅ Full lifecycle tracking verified:', {
        captionId,
        variationCount: savedCaption?.variations.length,
        selectedVariation: savedCaption?.selectedVariationIndex,
        wasEdited: savedCaption?.wasEdited,
        editDistance: savedCaption?.editDistance,
        linkedToContent: savedCaption?.contentId,
        published: !!savedCaption?.publishedAt
      });
    }, 15000);
  });
});
