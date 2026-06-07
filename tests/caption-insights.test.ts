/**
 * Caption Insights Endpoint Tests
 * 
 * Tests for GET /api/v1/ai/caption-insights/:captionId
 * Verifies the endpoint returns comprehensive insights including:
 * - Predicted vs actual performance comparison
 * - Pattern and hook performance analysis
 * - Insights for future generations
 * 
 * Requirements: 9.5, Task 16.2
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import request from 'supertest';
import { app } from '../server';
import { GeneratedCaptionModel } from '../server/models/GeneratedCaption';
import { storage } from '../server/mongodb-storage';

describe('Caption Insights API', () => {
  let authToken: string;
  let testUserId: string;
  let testWorkspaceId: string;
  let testCaptionId: string;

  beforeAll(async () => {
    // Connect to test database
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/veefore-test');
    }

    // Create test user and workspace
    const testUser = await storage.createUser({
      email: 'test-caption-insights@example.com',
      passwordHash: 'test-hash',
      firebaseUid: 'test-uid-caption-insights'
    });
    testUserId = testUser._id.toString();

    const testWorkspace = await storage.createWorkspace({
      name: 'Test Workspace for Caption Insights',
      userId: testUserId
    });
    testWorkspaceId = testWorkspace._id.toString();

    // Create test generated caption with performance data
    const testCaption = await GeneratedCaptionModel.create({
      userId: testUserId,
      workspaceId: testWorkspaceId,
      contentId: new mongoose.Types.ObjectId().toString(),
      postType: 'post',
      platform: 'instagram',
      niche: 'fitness',
      variations: [
        {
          caption: 'Test caption with high engagement',
          hashtagsGenerated: ['#fitness', '#workout', '#health'],
          authenticityScore: 85,
          engagementPrediction: {
            predictedLikeRate: 5.0,
            predictedCommentRate: 1.0,
            predictedSaveRate: 2.0,
            predictedShareRate: 0.5,
            confidence: 0.8,
            factors: {
              hookStrength: 8,
              readabilityScore: 9,
              ctaClarity: 7,
              emotionalResonance: 8,
              lengthOptimality: 8,
              trendingTopicBonus: 6
            }
          },
          usedPatterns: ['story-insight-question'],
          usedHooks: ['hot-take']
        }
      ],
      selectedVariationIndex: 0,
      wasEdited: false,
      actualMetrics: {
        likes: 500,
        comments: 100,
        saves: 200,
        shares: 50,
        impressions: 10000,
        engagementRate: 8.5
      },
      generatedAt: new Date(),
      publishedAt: new Date(),
      performanceRecordedAt: new Date()
    });
    testCaptionId = testCaption._id.toString();

    // Mock auth token (in real test, would authenticate)
    authToken = 'mock-auth-token';
  });

  afterAll(async () => {
    // Cleanup
    await GeneratedCaptionModel.deleteMany({ userId: testUserId });
    await storage.deleteWorkspace(testWorkspaceId);
    await storage.deleteUser(testUserId);
    await mongoose.connection.close();
  });

  describe('GET /api/v1/ai/caption-insights/:captionId', () => {
    it('should return comprehensive caption insights', async () => {
      const response = await request(app)
        .get(`/api/v1/ai/caption-insights/${testCaptionId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('insights');

      const insights = response.body.insights;

      // Verify basic caption data
      expect(insights).toHaveProperty('captionId', testCaptionId);
      expect(insights).toHaveProperty('caption');
      expect(insights.caption).toHaveProperty('text');

      // Verify metadata
      expect(insights).toHaveProperty('metadata');
      expect(insights.metadata).toHaveProperty('postType', 'post');
      expect(insights.metadata).toHaveProperty('platform', 'instagram');
      expect(insights.metadata).toHaveProperty('niche', 'fitness');

      // Verify authenticity score
      expect(insights).toHaveProperty('authenticityScore');
      expect(insights.authenticityScore).toHaveProperty('overall', 85);
      expect(insights.authenticityScore).toHaveProperty('threshold', 80);
      expect(insights.authenticityScore).toHaveProperty('passed', true);

      // Verify engagement prediction
      expect(insights).toHaveProperty('engagementPrediction');
      expect(insights.engagementPrediction).toHaveProperty('predictedLikeRate');
      expect(insights.engagementPrediction).toHaveProperty('confidence');

      // Verify patterns used (Requirement: Show which patterns/hooks performed well)
      expect(insights).toHaveProperty('patternsUsed');
      expect(insights.patternsUsed).toHaveProperty('patterns');
      expect(insights.patternsUsed).toHaveProperty('hooks');
      expect(insights.patternsUsed.patterns).toContain('story-insight-question');
      expect(insights.patternsUsed.hooks).toContain('hot-take');
    });

    it('should return predicted vs actual performance comparison when available', async () => {
      const response = await request(app)
        .get(`/api/v1/ai/caption-insights/${testCaptionId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const insights = response.body.insights;

      // Verify performance comparison (Requirement: Return predicted vs actual performance comparison)
      expect(insights).toHaveProperty('performanceComparison');
      expect(insights.performanceComparison).not.toBeNull();

      const comparison = insights.performanceComparison;
      expect(comparison).toHaveProperty('predicted');
      expect(comparison).toHaveProperty('actual');
      expect(comparison).toHaveProperty('accuracy');

      // Verify predicted metrics
      expect(comparison.predicted).toHaveProperty('likeRate');
      expect(comparison.predicted).toHaveProperty('commentRate');
      expect(comparison.predicted).toHaveProperty('saveRate');
      expect(comparison.predicted).toHaveProperty('shareRate');
      expect(comparison.predicted).toHaveProperty('confidence');

      // Verify actual metrics
      expect(comparison.actual).toHaveProperty('likeRate');
      expect(comparison.actual).toHaveProperty('commentRate');
      expect(comparison.actual).toHaveProperty('saveRate');
      expect(comparison.actual).toHaveProperty('shareRate');
      expect(comparison.actual).toHaveProperty('engagementRate');

      // Verify accuracy metrics
      expect(comparison.accuracy).toHaveProperty('likeRateDiff');
      expect(comparison.accuracy).toHaveProperty('commentRateDiff');
      expect(comparison.accuracy).toHaveProperty('overallAccuracy');
    });

    it('should provide insights for future generations', async () => {
      const response = await request(app)
        .get(`/api/v1/ai/caption-insights/${testCaptionId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const insights = response.body.insights;

      // Verify insights (Requirement: Provide insights for future generations)
      expect(insights).toHaveProperty('insights');
      expect(insights.insights).toHaveProperty('recommendations');
      expect(insights.insights).toHaveProperty('learnings');

      expect(Array.isArray(insights.insights.recommendations)).toBe(true);
      expect(Array.isArray(insights.insights.learnings)).toBe(true);

      // Should have learnings since caption outperformed predictions
      expect(insights.insights.learnings.length).toBeGreaterThan(0);
    });

    it('should return 404 for non-existent caption', async () => {
      const fakeId = new mongoose.Types.ObjectId().toString();
      
      await request(app)
        .get(`/api/v1/ai/caption-insights/${fakeId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });

    it('should include hashtag strategy information', async () => {
      const response = await request(app)
        .get(`/api/v1/ai/caption-insights/${testCaptionId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const insights = response.body.insights;

      expect(insights).toHaveProperty('hashtagStrategy');
      expect(insights.hashtagStrategy).toHaveProperty('hashtags');
      expect(insights.hashtagStrategy).toHaveProperty('count');
      expect(insights.hashtagStrategy).toHaveProperty('strategy');
      expect(Array.isArray(insights.hashtagStrategy.hashtags)).toBe(true);
    });

    it('should include voice profile match indicators', async () => {
      const response = await request(app)
        .get(`/api/v1/ai/caption-insights/${testCaptionId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const insights = response.body.insights;

      expect(insights).toHaveProperty('voiceProfileMatch');
      expect(insights.voiceProfileMatch).toHaveProperty('wasEdited');
      expect(insights.voiceProfileMatch).toHaveProperty('matchQuality');
    });

    it('should include all caption variations for comparison', async () => {
      const response = await request(app)
        .get(`/api/v1/ai/caption-insights/${testCaptionId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const insights = response.body.insights;

      expect(insights).toHaveProperty('allVariations');
      expect(Array.isArray(insights.allVariations)).toBe(true);
      expect(insights.allVariations.length).toBeGreaterThan(0);
      
      const variation = insights.allVariations[0];
      expect(variation).toHaveProperty('index');
      expect(variation).toHaveProperty('caption');
      expect(variation).toHaveProperty('authenticityScore');
      expect(variation).toHaveProperty('engagementPrediction');
      expect(variation).toHaveProperty('selected');
    });
  });
});
