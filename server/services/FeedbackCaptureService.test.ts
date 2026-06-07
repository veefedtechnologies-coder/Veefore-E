import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { MongoClient, Db, ObjectId } from 'mongodb';
import { FeedbackCaptureService, SelectionFeedback } from './FeedbackCaptureService';
import { CaptionFeedbackModel } from '../models/AI/CaptionFeedback';
import { GeneratedCaptionModel, IGeneratedCaption } from '../models/AI/GeneratedCaption';
import mongoose from 'mongoose';

/**
 * FeedbackCaptureService Unit Tests
 * 
 * Tests for the FeedbackCaptureService class focusing on:
 * - Recording caption selections (Requirements 10.1, 10.2)
 * - Analyzing caption edits (Requirements 10.1, 10.2)
 * - Analyzing rejection patterns (Requirement 10.6)
 */

describe('FeedbackCaptureService', () => {
  let mongoClient: MongoClient;
  let feedbackService: FeedbackCaptureService;
  let db: Db;

  const userId = 'test-user-123';
  const workspaceId = 'test-workspace-456';

  beforeAll(async () => {
    // Connect to test database
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/veefore_test';
    
    // Connect mongoose
    await mongoose.connect(mongoUri);
    
    // Connect native client for service
    mongoClient = new MongoClient(mongoUri);
    await mongoClient.connect();
    
    db = mongoClient.db();
    feedbackService = new FeedbackCaptureService(mongoClient, db.databaseName);
  });

  afterAll(async () => {
    // Clean up test data
    await CaptionFeedbackModel.deleteMany({ userId });
    await GeneratedCaptionModel.deleteMany({ userId });
    
    await mongoose.disconnect();
    await mongoClient.close();
  });

  beforeEach(async () => {
    // Clear collections before each test
    await CaptionFeedbackModel.deleteMany({});
    await GeneratedCaptionModel.deleteMany({});
  });

  describe('recordSelection', () => {
    it('should record caption selection with pattern preferences', async () => {
      // Create a generated caption
      const generatedCaption = await GeneratedCaptionModel.create({
        userId,
        workspaceId,
        postType: 'post',
        platform: 'instagram',
        niche: 'fitness',
        variations: [
          {
            caption: 'Variation 1',
            hashtagsGenerated: ['#fitness'],
            authenticityScore: 85,
            engagementPrediction: {
              likeRate: 5.5,
              commentRate: 1.2,
              saveRate: 2.0,
              shareRate: 0.5,
              confidence: 0.85
            },
            usedPatterns: ['pattern-1', 'pattern-2'],
            usedHooks: ['hook-1']
          },
          {
            caption: 'Variation 2',
            hashtagsGenerated: ['#fitness'],
            authenticityScore: 82,
            engagementPrediction: {
              likeRate: 4.8,
              commentRate: 1.0,
              saveRate: 1.8,
              shareRate: 0.4,
              confidence: 0.80
            },
            usedPatterns: ['pattern-3'],
            usedHooks: ['hook-2']
          },
          {
            caption: 'Variation 3',
            hashtagsGenerated: ['#fitness'],
            authenticityScore: 80,
            engagementPrediction: {
              likeRate: 4.5,
              commentRate: 0.9,
              saveRate: 1.5,
              shareRate: 0.3,
              confidence: 0.75
            },
            usedPatterns: ['pattern-4'],
            usedHooks: ['hook-3']
          }
        ],
        generatedAt: new Date()
      });

      const selectionFeedback: SelectionFeedback = {
        generatedCaptionId: generatedCaption._id.toString(),
        selectedVariationIndex: 0,
        rejectedVariationIndices: [1, 2]
      };

      await feedbackService.recordSelection(userId, workspaceId, selectionFeedback);

      // Verify feedback was stored
      const feedback = await CaptionFeedbackModel.findOne({
        generatedCaptionId: generatedCaption._id.toString()
      });

      expect(feedback).toBeDefined();
      expect(feedback?.feedbackType).toBe('selection');
      expect(feedback?.selectedVariation).toBe(0);
      expect(feedback?.rejectedVariations).toEqual([1, 2]);
      expect(feedback?.preferredPatterns).toContain('pattern-1');
      expect(feedback?.preferredPatterns).toContain('pattern-2');
      expect(feedback?.preferredPatterns).toContain('hook-1');
      expect(feedback?.rejectedPatterns).toContain('pattern-3');
      expect(feedback?.rejectedPatterns).toContain('pattern-4');
      expect(feedback?.niche).toBe('fitness');
      expect(feedback?.postType).toBe('post');

      // Verify generated caption was updated
      const updatedCaption = await GeneratedCaptionModel.findById(generatedCaption._id);
      expect(updatedCaption?.selectedVariationIndex).toBe(0);
    });

    it('should handle missing generated caption gracefully', async () => {
      const selectionFeedback: SelectionFeedback = {
        generatedCaptionId: new ObjectId().toString(),
        selectedVariationIndex: 0,
        rejectedVariationIndices: [1, 2]
      };

      await expect(
        feedbackService.recordSelection(userId, workspaceId, selectionFeedback)
      ).rejects.toThrow('Generated caption not found');
    });
  });

  describe('analyzeEdit', () => {
    it('should detect vocabulary changes', async () => {
      const generatedCaption = await GeneratedCaptionModel.create({
        userId,
        workspaceId,
        postType: 'post',
        platform: 'instagram',
        niche: 'fitness',
        variations: [{
          caption: 'Original caption',
          hashtagsGenerated: [],
          authenticityScore: 85,
          engagementPrediction: {
            likeRate: 5.0,
            commentRate: 1.0,
            saveRate: 2.0,
            shareRate: 0.5,
            confidence: 0.85
          },
          usedPatterns: [],
          usedHooks: []
        }],
        generatedAt: new Date()
      });

      const original = 'Check out this amazing workout routine! 💪';
      const edited = 'Look at this incredible training session! 💪';

      const analysis = await feedbackService.analyzeEdit(
        userId,
        workspaceId,
        generatedCaption._id.toString(),
        original,
        edited
      );

      expect(analysis.editDistance).toBeGreaterThan(0);
      expect(analysis.changes.length).toBeGreaterThan(0);
      expect(analysis.changeTypes.vocabulary).toBeGreaterThan(0);

      // Verify feedback was stored
      const feedback = await CaptionFeedbackModel.findOne({
        generatedCaptionId: generatedCaption._id.toString()
      });

      expect(feedback).toBeDefined();
      expect(feedback?.feedbackType).toBe('edit');
      expect(feedback?.editsMade).toBeDefined();
      expect(feedback?.editsMade!.length).toBeGreaterThan(0);

      // Verify generated caption was updated
      const updatedCaption = await GeneratedCaptionModel.findById(generatedCaption._id);
      expect(updatedCaption?.wasEdited).toBe(true);
      expect(updatedCaption?.originalCaption).toBe(original);
      expect(updatedCaption?.editedCaption).toBe(edited);
      expect(updatedCaption?.editDistance).toBe(analysis.editDistance);
    });

    it('should detect emoji changes', async () => {
      const generatedCaption = await GeneratedCaptionModel.create({
        userId,
        workspaceId,
        postType: 'post',
        platform: 'instagram',
        niche: 'fitness',
        variations: [{
          caption: 'Test caption',
          hashtagsGenerated: [],
          authenticityScore: 85,
          engagementPrediction: {
            likeRate: 5.0,
            commentRate: 1.0,
            saveRate: 2.0,
            shareRate: 0.5,
            confidence: 0.85
          },
          usedPatterns: [],
          usedHooks: []
        }],
        generatedAt: new Date()
      });

      const original = 'Great workout today!';
      const edited = 'Great workout today! 💪🔥✨';

      const analysis = await feedbackService.analyzeEdit(
        userId,
        workspaceId,
        generatedCaption._id.toString(),
        original,
        edited
      );

      const emojiChange = analysis.changes.find(c => c.type === 'emoji');
      expect(emojiChange).toBeDefined();
      expect(emojiChange?.reason).toContain('Added emojis');
    });

    it('should detect structure changes', async () => {
      const generatedCaption = await GeneratedCaptionModel.create({
        userId,
        workspaceId,
        postType: 'post',
        platform: 'instagram',
        niche: 'fitness',
        variations: [{
          caption: 'Test caption',
          hashtagsGenerated: [],
          authenticityScore: 85,
          engagementPrediction: {
            likeRate: 5.0,
            commentRate: 1.0,
            saveRate: 2.0,
            shareRate: 0.5,
            confidence: 0.85
          },
          usedPatterns: [],
          usedHooks: []
        }],
        generatedAt: new Date()
      });

      const original = 'Great workout today! Really pushed myself hard.';
      const edited = 'Great workout today!\n\nReally pushed myself hard.\n\nFeeling amazing!';

      const analysis = await feedbackService.analyzeEdit(
        userId,
        workspaceId,
        generatedCaption._id.toString(),
        original,
        edited
      );

      const structureChange = analysis.changes.find(c => c.type === 'structure');
      expect(structureChange).toBeDefined();
      expect(structureChange?.reason).toContain('Added line breaks');
    });

    it('should detect length changes', async () => {
      const generatedCaption = await GeneratedCaptionModel.create({
        userId,
        workspaceId,
        postType: 'post',
        platform: 'instagram',
        niche: 'fitness',
        variations: [{
          caption: 'Test caption',
          hashtagsGenerated: [],
          authenticityScore: 85,
          engagementPrediction: {
            likeRate: 5.0,
            commentRate: 1.0,
            saveRate: 2.0,
            shareRate: 0.5,
            confidence: 0.85
          },
          usedPatterns: [],
          usedHooks: []
        }],
        generatedAt: new Date()
      });

      const original = 'Short caption.';
      const edited = 'This is a much longer caption that includes a lot more detail about the workout, the exercises performed, and how great I feel after completing the session.';

      const analysis = await feedbackService.analyzeEdit(
        userId,
        workspaceId,
        generatedCaption._id.toString(),
        original,
        edited
      );

      const lengthChange = analysis.changes.find(c => c.type === 'length');
      expect(lengthChange).toBeDefined();
      expect(lengthChange?.reason).toContain('Expanded content');
    });

    it('should detect tone changes', async () => {
      const generatedCaption = await GeneratedCaptionModel.create({
        userId,
        workspaceId,
        postType: 'post',
        platform: 'instagram',
        niche: 'fitness',
        variations: [{
          caption: 'Test caption',
          hashtagsGenerated: [],
          authenticityScore: 85,
          engagementPrediction: {
            likeRate: 5.0,
            commentRate: 1.0,
            saveRate: 2.0,
            shareRate: 0.5,
            confidence: 0.85
          },
          usedPatterns: [],
          usedHooks: []
        }],
        generatedAt: new Date()
      });

      const original = 'Great workout today. Really pushed myself.';
      const edited = 'Great workout today!!! Really pushed myself!!!';

      const analysis = await feedbackService.analyzeEdit(
        userId,
        workspaceId,
        generatedCaption._id.toString(),
        original,
        edited
      );

      const toneChange = analysis.changes.find(c => c.type === 'tone');
      expect(toneChange).toBeDefined();
      expect(toneChange?.reason).toContain('Tone adjustment');
    });
  });

  describe('analyzeRejections', () => {
    it('should analyze rejection patterns and trends', async () => {
      // Create multiple generated captions and feedback
      const now = new Date();
      const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      // Create 5 generated captions
      for (let i = 0; i < 5; i++) {
        const caption = await GeneratedCaptionModel.create({
          userId,
          workspaceId,
          postType: 'post',
          platform: 'instagram',
          niche: 'fitness',
          variations: [{
            caption: `Caption ${i}`,
            hashtagsGenerated: [],
            authenticityScore: 85,
            engagementPrediction: {
              likeRate: 5.0,
              commentRate: 1.0,
              saveRate: 2.0,
              shareRate: 0.5,
              confidence: 0.85
            },
            usedPatterns: [`pattern-${i % 3}`],
            usedHooks: [`hook-${i % 2}`]
          }],
          generatedAt: new Date()
        });

        // Create selection feedback (with rejections)
        await CaptionFeedbackModel.create({
          userId,
          workspaceId,
          generatedCaptionId: caption._id.toString(),
          feedbackType: 'selection',
          selectedVariation: 0,
          rejectedVariations: [1],
          preferredPatterns: [`pattern-${i % 3}`],
          rejectedPatterns: [`pattern-${(i + 1) % 3}`],
          timestamp: i < 3 ? oneWeekAgo : now,
          niche: 'fitness',
          postType: 'post'
        });
      }

      const analysis = await feedbackService.analyzeRejections(userId, workspaceId);

      expect(analysis.userId).toBe(userId);
      expect(analysis.workspaceId).toBe(workspaceId);
      expect(analysis.totalRejections).toBe(5);
      expect(analysis.rejectionTrends.rejectionsLastWeek).toBeGreaterThan(0);
      expect(analysis.rejectionTrends.rejectionsLastMonth).toBe(5);
      expect(analysis.rejectionTrends.rejectionRate).toBeGreaterThan(0);
      expect(analysis.mostRejectedPatterns.length).toBeGreaterThan(0);
    });

    it('should identify most rejected patterns', async () => {
      // Create feedback with pattern-1 rejected 3 times
      for (let i = 0; i < 3; i++) {
        const caption = await GeneratedCaptionModel.create({
          userId,
          workspaceId,
          postType: 'post',
          platform: 'instagram',
          niche: 'fitness',
          variations: [{
            caption: `Caption ${i}`,
            hashtagsGenerated: [],
            authenticityScore: 85,
            engagementPrediction: {
              likeRate: 5.0,
              commentRate: 1.0,
              saveRate: 2.0,
              shareRate: 0.5,
              confidence: 0.85
            },
            usedPatterns: ['pattern-1'],
            usedHooks: []
          }],
          generatedAt: new Date()
        });

        await CaptionFeedbackModel.create({
          userId,
          workspaceId,
          generatedCaptionId: caption._id.toString(),
          feedbackType: 'selection',
          rejectedPatterns: ['pattern-1'],
          timestamp: new Date()
        });
      }

      const analysis = await feedbackService.analyzeRejections(userId, workspaceId);

      const mostRejected = analysis.mostRejectedPatterns[0];
      expect(mostRejected.pattern).toBe('pattern-1');
      expect(mostRejected.rejectionCount).toBe(3);
    });
  });

  describe('getPreferredPatterns', () => {
    it('should return most frequently selected patterns', async () => {
      // Create feedback with pattern preferences
      const patterns = ['pattern-A', 'pattern-B', 'pattern-A', 'pattern-C', 'pattern-A'];
      
      for (let i = 0; i < patterns.length; i++) {
        await CaptionFeedbackModel.create({
          userId,
          workspaceId,
          generatedCaptionId: new ObjectId().toString(),
          feedbackType: 'selection',
          preferredPatterns: [patterns[i]],
          timestamp: new Date()
        });
      }

      const preferredPatterns = await feedbackService.getPreferredPatterns(
        userId,
        workspaceId
      );

      expect(preferredPatterns[0]).toBe('pattern-A'); // Most frequent
      expect(preferredPatterns).toContain('pattern-B');
      expect(preferredPatterns).toContain('pattern-C');
    });
  });

  describe('Levenshtein distance calculation', () => {
    it('should calculate edit distance correctly', async () => {
      const generatedCaption = await GeneratedCaptionModel.create({
        userId,
        workspaceId,
        postType: 'post',
        platform: 'instagram',
        niche: 'fitness',
        variations: [{
          caption: 'Test',
          hashtagsGenerated: [],
          authenticityScore: 85,
          engagementPrediction: {
            likeRate: 5.0,
            commentRate: 1.0,
            saveRate: 2.0,
            shareRate: 0.5,
            confidence: 0.85
          },
          usedPatterns: [],
          usedHooks: []
        }],
        generatedAt: new Date()
      });

      // Test cases: same strings should have distance 0
      const analysis1 = await feedbackService.analyzeEdit(
        userId,
        workspaceId,
        generatedCaption._id.toString(),
        'hello',
        'hello'
      );
      expect(analysis1.editDistance).toBe(0);

      // Single character difference should have distance 1
      const analysis2 = await feedbackService.analyzeEdit(
        userId,
        workspaceId,
        generatedCaption._id.toString(),
        'hello',
        'hallo'
      );
      expect(analysis2.editDistance).toBe(1);

      // Complete replacement should have larger distance
      const analysis3 = await feedbackService.analyzeEdit(
        userId,
        workspaceId,
        generatedCaption._id.toString(),
        'hello',
        'world'
      );
      expect(analysis3.editDistance).toBeGreaterThan(1);
    });
  });
});
