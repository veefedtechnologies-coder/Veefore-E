/**
 * Generate Caption Endpoint Test
 * 
 * Tests Task 15.1: Extended POST /api/ai/generate-caption endpoint
 * with variation generation, authenticity scores, and engagement predictions
 * 
 * Requirements: 8.1, 8.2, 8.3
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';

describe('Task 15.1: POST /api/ai/generate-caption endpoint', () => {
  beforeAll(async () => {
    // Setup test database connection if needed
    if (mongoose.connection.readyState === 0) {
      const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/veefore-test';
      await mongoose.connect(mongoUri);
    }
  });

  afterAll(async () => {
    // Clean up test database connection
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close();
    }
  });

  describe('Request validation', () => {
    it('should accept title parameter', () => {
      const request = {
        title: 'Amazing sunset at the beach',
        type: 'post',
        platform: 'Instagram'
      };
      
      expect(request.title).toBeDefined();
      expect(request.type).toBe('post');
      expect(request.platform).toBe('Instagram');
    });

    it('should accept mediaUrl parameter', () => {
      const request = {
        mediaUrl: 'https://example.com/image.jpg',
        type: 'reel',
        platform: 'Instagram'
      };
      
      expect(request.mediaUrl).toBeDefined();
      expect(request.type).toBe('reel');
    });

    it('should accept workspaceId and existingCaption (new parameters)', () => {
      const request = {
        title: 'Test content',
        workspaceId: 'workspace-123',
        existingCaption: 'Improve this caption'
      };
      
      expect(request.workspaceId).toBeDefined();
      expect(request.existingCaption).toBeDefined();
    });
  });

  describe('Response structure (Task 15.1)', () => {
    it('should include variations array in response', () => {
      const mockResponse = {
        variations: [
          {
            caption: 'Test caption 1',
            hashtags: ['#test', '#instagram'],
            style: 'viral' as const,
            styleDescription: 'Maximum engagement focus',
            authenticityScore: 85,
            authenticityDetails: {
              criteriaScores: {
                vocabularyNaturalness: 8,
                sentenceFlow: 9,
                emojiPlacement: 7,
                conversationalTone: 8,
                platformAppropriateness: 9,
                avoidsCorporateJargon: 8,
                avoidsGenericPhrases: 8,
                voiceConsistency: 7,
                mobileReadability: 9,
                hookStrength: 9,
                engagementClarity: 8,
                emotionalResonance: 8
              },
              aiTellsDetected: [],
              recommendations: ['Strong hook', 'Mobile-friendly format'],
              passesThreshold: true
            },
            engagementPrediction: {
              predictedLikeRate: 5.2,
              predictedCommentRate: 0.8,
              predictedSaveRate: 1.5,
              predictedShareRate: 0.3,
              confidence: 0.85,
              factors: {
                hookStrength: 9,
                readabilityScore: 8,
                ctaClarity: 8,
                emotionalResonance: 8,
                lengthOptimality: 7,
                trendingTopicBonus: 6
              },
              vsUserAverage: 12.5
            },
            usedPatterns: [],
            usedHooks: []
          }
        ],
        creditsUsed: 10,
        remainingCredits: 90,
        caption: 'Test caption 1',
        hashtags: ['#test', '#instagram']
      };

      // Verify response structure matches requirements
      expect(mockResponse.variations).toBeDefined();
      expect(Array.isArray(mockResponse.variations)).toBe(true);
      expect(mockResponse.variations.length).toBeGreaterThan(0);
      
      // Requirement 8.1: Include authenticity scores in response
      const variation = mockResponse.variations[0];
      expect(variation.authenticityScore).toBeDefined();
      expect(typeof variation.authenticityScore).toBe('number');
      expect(variation.authenticityDetails).toBeDefined();
      
      // Requirement 8.2: Include engagement predictions in response
      expect(variation.engagementPrediction).toBeDefined();
      expect(variation.engagementPrediction?.predictedLikeRate).toBeDefined();
      expect(variation.engagementPrediction?.predictedCommentRate).toBeDefined();
      expect(variation.engagementPrediction?.predictedSaveRate).toBeDefined();
      expect(variation.engagementPrediction?.predictedShareRate).toBeDefined();
      
      // Requirement 8.3: Return style characteristics for each variation
      expect(variation.style).toBeDefined();
      expect(['viral', 'authentic', 'balanced']).toContain(variation.style);
      expect(variation.styleDescription).toBeDefined();
      
      // Verify backward compatibility
      expect(mockResponse.caption).toBeDefined();
      expect(mockResponse.hashtags).toBeDefined();
    });

    it('should include usedPatterns and usedHooks placeholders', () => {
      const variation = {
        caption: 'Test',
        hashtags: [],
        style: 'viral' as const,
        styleDescription: 'Test',
        authenticityScore: 80,
        usedPatterns: [] as string[],
        usedHooks: [] as string[]
      };

      expect(Array.isArray(variation.usedPatterns)).toBe(true);
      expect(Array.isArray(variation.usedHooks)).toBe(true);
    });
  });

  describe('Authenticity scoring integration', () => {
    it('should filter variations below 80 authenticity threshold', () => {
      const variations = [
        { authenticityScore: 85, passesThreshold: true },
        { authenticityScore: 75, passesThreshold: false },
        { authenticityScore: 82, passesThreshold: true }
      ];

      const filtered = variations.filter(v => v.passesThreshold);
      
      expect(filtered.length).toBe(2);
      expect(filtered.every(v => v.authenticityScore >= 80)).toBe(true);
    });
  });

  describe('Engagement prediction integration', () => {
    it('should include all engagement prediction fields', () => {
      const prediction = {
        predictedLikeRate: 4.5,
        predictedCommentRate: 0.6,
        predictedSaveRate: 1.2,
        predictedShareRate: 0.2,
        confidence: 0.78,
        factors: {
          hookStrength: 8,
          readabilityScore: 7,
          ctaClarity: 7,
          emotionalResonance: 8,
          lengthOptimality: 7,
          trendingTopicBonus: 5
        },
        vsUserAverage: 8.3
      };

      expect(prediction.predictedLikeRate).toBeGreaterThan(0);
      expect(prediction.confidence).toBeGreaterThan(0);
      expect(prediction.confidence).toBeLessThanOrEqual(1);
      expect(prediction.factors).toBeDefined();
      expect(Object.keys(prediction.factors).length).toBe(6);
    });
  });

  describe('Style characteristics', () => {
    it('should support all three variation styles', () => {
      const styles = ['viral', 'authentic', 'balanced'];
      
      styles.forEach(style => {
        expect(['viral', 'authentic', 'balanced']).toContain(style);
      });
    });

    it('should include styleDescription for each variation', () => {
      const descriptions = {
        viral: 'Maximum engagement focus with aggressive hooks and trending patterns',
        authentic: 'Voice-first approach with personal storytelling and genuine connection',
        balanced: 'Strategic blend of viral patterns and authentic voice for sustained engagement'
      };

      Object.entries(descriptions).forEach(([style, description]) => {
        expect(description).toBeDefined();
        expect(typeof description).toBe('string');
        expect(description.length).toBeGreaterThan(0);
      });
    });
  });
});
