/**
 * ExampleCaptionService Unit Tests
 * 
 * Tests for the ExampleCaptionService class focusing on:
 * - Retrieving examples for generation (Requirements 7.1, 7.2)
 * - Adding user examples (Requirement 7.3)
 * - Extracting patterns from captions (Requirement 7.4)
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { ExampleCaptionService } from './ExampleCaptionService';
import { ExampleCaptionModel } from '../models/AI/ExampleCaption';

describe('ExampleCaptionService', () => {
  let service: ExampleCaptionService;

  beforeAll(async () => {
    // Connect to test database
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/veefore_test';
    await mongoose.connect(mongoUri);
  });

  afterAll(async () => {
    // Clean up and disconnect
    await ExampleCaptionModel.deleteMany({});
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    // Clean up before each test
    await ExampleCaptionModel.deleteMany({});
    service = new ExampleCaptionService();
  });

  describe('getExamplesForGeneration', () => {
    /**
     * **Validates: Requirements 7.1, 7.2**
     * 
     * Test that the service retrieves high-performing examples
     * filtered by niche and post type, prioritizing verified captions.
     */
    it('should retrieve high-performing examples for a specific niche and post type', async () => {
      // Seed test data
      await ExampleCaptionModel.create([
        {
          caption: 'Fitness example 1 with high engagement',
          source: 'curated',
          niche: 'fitness',
          postType: 'post',
          style: 'motivational',
          engagementRate: 8.5,
          likes: 1000,
          comments: 50,
          saves: 100,
          shares: 20,
          captionLength: 150,
          hookType: 'question',
          hasQuestion: true,
          hasEmoji: true,
          emojiCount: 3,
          verified: true,
        },
        {
          caption: 'Fitness example 2 with medium engagement',
          source: 'curated',
          niche: 'fitness',
          postType: 'post',
          style: 'educational',
          engagementRate: 6.0,
          likes: 500,
          comments: 25,
          saves: 50,
          shares: 10,
          captionLength: 200,
          hookType: 'list',
          hasQuestion: false,
          hasEmoji: false,
          emojiCount: 0,
          verified: false,
        },
        {
          caption: 'Food example - different niche',
          source: 'curated',
          niche: 'food',
          postType: 'post',
          style: 'conversational',
          engagementRate: 9.0,
          likes: 2000,
          comments: 100,
          saves: 200,
          shares: 50,
          captionLength: 100,
          hookType: 'direct statement',
          hasQuestion: false,
          hasEmoji: true,
          emojiCount: 5,
          verified: true,
        },
      ]);

      const examples = await service.getExamplesForGeneration('fitness', 'post', 2);

      expect(examples).toHaveLength(2);
      expect(examples[0].niche).toBe('fitness');
      expect(examples[0].postType).toBe('post');
      // Verified example should be first
      expect(examples[0].verified).toBe(true);
      expect(examples[0].engagementRate).toBe(8.5);
    });

    /**
     * **Validates: Requirements 7.1, 7.2**
     * 
     * Test that the service returns empty array when no examples match
     * the specified niche and post type.
     */
    it('should return empty array when no examples match niche and post type', async () => {
      // Seed data for different niche
      await ExampleCaptionModel.create({
        caption: 'Food example',
        source: 'curated',
        niche: 'food',
        postType: 'post',
        style: 'conversational',
        engagementRate: 7.0,
        likes: 800,
        comments: 40,
        saves: 80,
        shares: 15,
        captionLength: 120,
        hookType: 'story',
        hasQuestion: false,
        hasEmoji: true,
        emojiCount: 2,
        verified: true,
      });

      const examples = await service.getExamplesForGeneration('fitness', 'post', 3);

      expect(examples).toHaveLength(0);
    });

    /**
     * **Validates: Requirement 7.2**
     * 
     * Test that examples are sorted by verification status first,
     * then by engagement rate in descending order.
     */
    it('should prioritize verified captions with high engagement', async () => {
      await ExampleCaptionModel.create([
        {
          caption: 'Unverified high engagement',
          source: 'user',
          niche: 'travel',
          postType: 'reel',
          style: 'adventurous',
          engagementRate: 10.0,
          likes: 5000,
          comments: 200,
          saves: 500,
          shares: 100,
          captionLength: 80,
          hookType: 'pov',
          hasQuestion: false,
          hasEmoji: true,
          emojiCount: 4,
          verified: false,
        },
        {
          caption: 'Verified medium engagement',
          source: 'curated',
          niche: 'travel',
          postType: 'reel',
          style: 'inspirational',
          engagementRate: 7.5,
          likes: 1500,
          comments: 75,
          saves: 150,
          shares: 30,
          captionLength: 100,
          hookType: 'question',
          hasQuestion: true,
          hasEmoji: true,
          emojiCount: 2,
          verified: true,
        },
      ]);

      const examples = await service.getExamplesForGeneration('travel', 'reel', 2);

      // Verified caption should be first despite lower engagement
      expect(examples[0].verified).toBe(true);
      expect(examples[0].engagementRate).toBe(7.5);
      expect(examples[1].verified).toBe(false);
      expect(examples[1].engagementRate).toBe(10.0);
    });
  });

  describe('addUserExample', () => {
    /**
     * **Validates: Requirement 7.3**
     * 
     * Test that the service successfully stores user-generated captions
     * with proper metrics and characteristics.
     */
    it('should add user example with correct metrics and characteristics', async () => {
      const userId = new mongoose.Types.ObjectId().toString();
      const caption = '🔥 Hot take: Morning workouts are overrated! What works for YOU is what matters. Are you team morning or team evening? 💪';
      const metrics = {
        engagementRate: 8.2,
        likes: 1200,
        comments: 60,
        saves: 120,
      };

      await service.addUserExample(userId, caption, metrics, 'fitness', 'post');

      const savedExamples = await ExampleCaptionModel.find({ userId });
      expect(savedExamples).toHaveLength(1);

      const saved = savedExamples[0];
      expect(saved.caption).toBe(caption);
      expect(saved.source).toBe('user');
      expect(saved.userId).toBe(userId);
      expect(saved.niche).toBe('fitness');
      expect(saved.postType).toBe('post');
      expect(saved.engagementRate).toBe(8.2);
      expect(saved.likes).toBe(1200);
      expect(saved.comments).toBe(60);
      expect(saved.saves).toBe(120);
      expect(saved.captionLength).toBe(caption.length);
      expect(saved.hasEmoji).toBe(true);
      expect(saved.emojiCount).toBeGreaterThan(0);
      expect(saved.hasQuestion).toBe(true);
      expect(saved.verified).toBe(false); // User examples start unverified
    });

    /**
     * **Validates: Requirement 7.3**
     * 
     * Test that caption characteristics are correctly analyzed,
     * including emoji detection, question detection, and hook type.
     */
    it('should correctly analyze caption characteristics', async () => {
      const userId = new mongoose.Types.ObjectId().toString();
      
      // Caption with POV hook
      const povCaption = 'POV: You just discovered the secret to perfect captions 😎';
      await service.addUserExample(
        userId,
        povCaption,
        { engagementRate: 7.0, likes: 800, comments: 40, saves: 80 },
        'marketing',
        'reel'
      );

      const povExample = await ExampleCaptionModel.findOne({ caption: povCaption });
      expect(povExample?.hookType).toBe('pov');
      expect(povExample?.hasEmoji).toBe(true);
      expect(povExample?.hasQuestion).toBe(false);

      // Caption with question hook
      const questionCaption = 'What if I told you there was an easier way?';
      await service.addUserExample(
        userId,
        questionCaption,
        { engagementRate: 6.5, likes: 600, comments: 30, saves: 60 },
        'marketing',
        'post'
      );

      const questionExample = await ExampleCaptionModel.findOne({ caption: questionCaption });
      expect(questionExample?.hookType).toBe('question');
      expect(questionExample?.hasQuestion).toBe(true);
      expect(questionExample?.hasEmoji).toBe(false);
    });
  });

  describe('extractPatterns', () => {
    /**
     * **Validates: Requirement 7.4**
     * 
     * Test that the service correctly extracts hook structure
     * from example captions.
     */
    it('should extract hook structure from caption', async () => {
      const caption = {
        id: '1',
        caption: 'POV: You wake up and realize it\'s Friday! 🎉\n\nBest feeling ever, right?\n\nWhat are your weekend plans?',
        source: 'curated' as const,
        niche: 'lifestyle',
        postType: 'post' as const,
        style: 'conversational',
        engagementRate: 8.0,
        likes: 1000,
        comments: 50,
        saves: 100,
        shares: 20,
        captionLength: 100,
        hookType: 'pov',
        hasQuestion: true,
        hasEmoji: true,
        emojiCount: 1,
        capturedAt: new Date(),
        verified: true,
      };

      const patterns = await service.extractPatterns(caption);

      expect(patterns.hookStructure).toBe('POV hook');
      expect(patterns.storytellingTechnique).toBeDefined();
      expect(patterns.engagementFormat).toBeDefined();
    });

    /**
     * **Validates: Requirement 7.4**
     * 
     * Test that the service identifies storytelling techniques
     * like problem-solution, chronological, or emotional journey.
     */
    it('should identify storytelling technique', async () => {
      const problemSolutionCaption = {
        id: '2',
        caption: 'I struggled with consistency for years.\n\nThen I discovered this simple trick.\n\nNow I never miss a workout!',
        source: 'curated' as const,
        niche: 'fitness',
        postType: 'post' as const,
        style: 'storytelling',
        engagementRate: 9.0,
        likes: 2000,
        comments: 100,
        saves: 200,
        shares: 50,
        captionLength: 120,
        hookType: 'story',
        hasQuestion: false,
        hasEmoji: false,
        emojiCount: 0,
        capturedAt: new Date(),
        verified: true,
      };

      const patterns = await service.extractPatterns(problemSolutionCaption);

      expect(patterns.storytellingTechnique).toBe('problem-solution');
    });

    /**
     * **Validates: Requirement 7.4**
     * 
     * Test that the service identifies engagement formats
     * like direct-question, poll-choice, or comment-cta.
     */
    it('should identify engagement format', async () => {
      const directQuestionCaption = {
        id: '3',
        caption: 'Just finished an amazing workout session!\n\nWhat do you think about morning exercises?',
        source: 'user' as const,
        niche: 'fitness',
        postType: 'post' as const,
        style: 'question-based',
        engagementRate: 7.5,
        likes: 1500,
        comments: 75,
        saves: 150,
        shares: 30,
        captionLength: 100,
        hookType: 'question',
        hasQuestion: true,
        hasEmoji: false,
        emojiCount: 0,
        capturedAt: new Date(),
        verified: false,
      };

      const patterns = await service.extractPatterns(directQuestionCaption);

      expect(patterns.engagementFormat).toBe('direct-question');
    });
  });
});
