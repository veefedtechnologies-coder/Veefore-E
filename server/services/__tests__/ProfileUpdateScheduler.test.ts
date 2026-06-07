import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MongoClient, Db, Collection } from 'mongodb';
import { ProfileUpdateScheduler, AcceptanceMetrics, RecalibrationTrigger } from '../ProfileUpdateScheduler';
import { GeneratedCaptionModel } from '../../models/AI/GeneratedCaption';
import { CaptionFeedbackModel } from '../../models/AI/CaptionFeedback';

// Mock MongoDB
vi.mock('mongodb');
vi.mock('../../models/AI/GeneratedCaption');
vi.mock('../../models/AI/CaptionFeedback');

describe('ProfileUpdateScheduler', () => {
  let scheduler: ProfileUpdateScheduler;
  let mockMongoClient: any;
  let mockDb: any;
  let mockCollection: any;

  const testUserId = 'user123';
  const testWorkspaceId = 'workspace123';
  const testDbName = 'testdb';

  beforeEach(() => {
    // Setup mocks
    mockCollection = {
      findOne: vi.fn(),
      updateOne: vi.fn(),
      find: vi.fn(),
      aggregate: vi.fn(),
    };

    mockDb = {
      collection: vi.fn().mockReturnValue(mockCollection),
    };

    mockMongoClient = {
      db: vi.fn().mockReturnValue(mockDb),
    };

    scheduler = new ProfileUpdateScheduler(mockMongoClient, testDbName);

    // Clear all timers
    vi.clearAllTimers();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('start and stop', () => {
    it('should start all scheduler jobs', () => {
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      scheduler.start();
      
      expect(consoleLogSpy).toHaveBeenCalledWith(
        '[ProfileUpdateScheduler] Starting background profile update jobs'
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        '[ProfileUpdateScheduler] All jobs scheduled successfully'
      );
      
      consoleLogSpy.mockRestore();
    });

    it('should stop all scheduler jobs', () => {
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      scheduler.start();
      scheduler.stop();
      
      expect(consoleLogSpy).toHaveBeenCalledWith(
        '[ProfileUpdateScheduler] All jobs stopped'
      );
      
      consoleLogSpy.mockRestore();
    });
  });

  describe('calculateAcceptanceMetrics', () => {
    it('should calculate acceptance metrics correctly', async () => {
      const mockGeneratedCaptions = [
        { publishedAt: new Date(), wasEdited: false, generatedAt: new Date() }, // Accepted
        { publishedAt: new Date(), wasEdited: true, editDistance: 60, generatedAt: new Date() }, // Heavy edit
        { generatedAt: new Date() }, // Not published
        { publishedAt: new Date(), wasEdited: false, generatedAt: new Date() }, // Accepted
      ];

      (GeneratedCaptionModel.find as any) = vi.fn().mockResolvedValue(mockGeneratedCaptions);

      (CaptionFeedbackModel.countDocuments as any) = vi.fn()
        .mockResolvedValueOnce(1) // totalRejected
        .mockResolvedValueOnce(0); // recentRejected

      const metrics = await scheduler.calculateAcceptanceMetrics(testUserId, testWorkspaceId);

      expect(metrics.totalGenerated).toBe(4);
      expect(metrics.totalAccepted).toBe(2);
      expect(metrics.totalEdited).toBe(1);
      expect(metrics.acceptanceRate).toBe(50); // 2/4 * 100
      expect(metrics.rejectionRate).toBe(25); // 1/4 * 100
    });

    it('should return zero metrics when no captions generated', async () => {
      (GeneratedCaptionModel.find as any) = vi.fn().mockResolvedValue([]);

      const metrics = await scheduler.calculateAcceptanceMetrics(testUserId, testWorkspaceId);

      expect(metrics.totalGenerated).toBe(0);
      expect(metrics.acceptanceRate).toBe(0);
      expect(metrics.rejectionRate).toBe(0);
      expect(metrics.trend).toBe('stable');
    });
  });

  describe('detectDecliningAcceptance', () => {
    it('should trigger recalibration when rejection rate > 30%', async () => {
      const metrics: AcceptanceMetrics = {
        totalGenerated: 100,
        totalAccepted: 50,
        totalRejected: 35,
        totalEdited: 15,
        acceptanceRate: 50,
        rejectionRate: 35,
        heavyEditRate: 15,
        trend: 'stable'
      };

      const trigger = await scheduler.detectDecliningAcceptance(metrics);

      expect(trigger.triggered).toBe(true);
      expect(trigger.reason).toContain('High rejection rate detected');
      expect(trigger.severity).toBe('low');
      expect(trigger.recommendations.length).toBeGreaterThan(0);
    });

    it('should set high severity when rejection rate > 50%', async () => {
      const metrics: AcceptanceMetrics = {
        totalGenerated: 100,
        totalAccepted: 30,
        totalRejected: 55,
        totalEdited: 15,
        acceptanceRate: 30,
        rejectionRate: 55,
        heavyEditRate: 15,
        trend: 'stable'
      };

      const trigger = await scheduler.detectDecliningAcceptance(metrics);

      expect(trigger.triggered).toBe(true);
      expect(trigger.severity).toBe('high');
      expect(trigger.recommendations[0]).toContain('URGENT');
    });

    it('should trigger when heavy edit rate > 40%', async () => {
      const metrics: AcceptanceMetrics = {
        totalGenerated: 100,
        totalAccepted: 50,
        totalRejected: 10,
        totalEdited: 45,
        acceptanceRate: 50,
        rejectionRate: 10,
        heavyEditRate: 45,
        trend: 'stable'
      };

      const trigger = await scheduler.detectDecliningAcceptance(metrics);

      expect(trigger.triggered).toBe(true);
      expect(trigger.reason).toContain('heavy edit rate');
    });

    it('should trigger on declining trend', async () => {
      const metrics: AcceptanceMetrics = {
        totalGenerated: 100,
        totalAccepted: 70,
        totalRejected: 20,
        totalEdited: 10,
        acceptanceRate: 70,
        rejectionRate: 20,
        heavyEditRate: 10,
        trend: 'declining'
      };

      const trigger = await scheduler.detectDecliningAcceptance(metrics);

      expect(trigger.triggered).toBe(true);
      expect(trigger.reason).toContain('Declining acceptance trend');
    });

    it('should not trigger when metrics are acceptable', async () => {
      const metrics: AcceptanceMetrics = {
        totalGenerated: 100,
        totalAccepted: 80,
        totalRejected: 15,
        totalEdited: 5,
        acceptanceRate: 80,
        rejectionRate: 15,
        heavyEditRate: 5,
        trend: 'improving'
      };

      const trigger = await scheduler.detectDecliningAcceptance(metrics);

      expect(trigger.triggered).toBe(false);
    });
  });

  describe('updateVoiceProfileFromFeedback', () => {
    it('should process selection and edit feedback', async () => {
      const mockFeedback = [
        {
          feedbackType: 'selection',
          generatedCaptionId: 'caption1',
          selectedVariation: 0,
          rejectedVariations: [1, 2],
          timestamp: new Date()
        },
        {
          feedbackType: 'edit',
          generatedCaptionId: 'caption2',
          timestamp: new Date()
        }
      ];

      const mockGeneratedCaption = {
        _id: 'caption1',
        variations: [
          { caption: 'Selected caption' },
          { caption: 'Rejected caption 1' },
          { caption: 'Rejected caption 2' }
        ]
      };

      vi.spyOn(scheduler['feedbackCaptureService'], 'getRecentFeedback')
        .mockResolvedValue(mockFeedback as any);

      (GeneratedCaptionModel.findById as any) = vi.fn().mockResolvedValue(mockGeneratedCaption);
      (GeneratedCaptionModel.find as any) = vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue([])
      });

      const result = await scheduler.updateVoiceProfileFromFeedback(testUserId, testWorkspaceId);

      expect(result.updateType).toBe('voice_profile');
      expect(result.updatesApplied).toBeGreaterThan(0);
      expect(result.improvements.length).toBeGreaterThan(0);
    });

    it('should handle no feedback gracefully', async () => {
      vi.spyOn(scheduler['feedbackCaptureService'], 'getRecentFeedback')
        .mockResolvedValue([]);

      const result = await scheduler.updateVoiceProfileFromFeedback(testUserId, testWorkspaceId);

      expect(result.updatesApplied).toBe(0);
      expect(result.improvements).toContain('No feedback to process this month');
    });
  });

  describe('analyzePerformanceCorrelations', () => {
    it('should analyze caption performance and update patterns', async () => {
      const mockCaptions = [
        {
          _id: 'cap1',
          actualMetrics: { likes: 100, comments: 20, saves: 10, impressions: 1000 },
          variations: [{
            caption: 'Top performing caption',
            usedPatterns: ['pattern1', 'pattern2'],
            usedHooks: ['hook1'],
            authenticityScore: 90
          }],
          selectedVariationIndex: 0
        },
        {
          _id: 'cap2',
          actualMetrics: { likes: 30, comments: 5, saves: 2, impressions: 1000 },
          variations: [{
            caption: 'Low performing caption',
            usedPatterns: ['pattern3'],
            usedHooks: ['hook2'],
            authenticityScore: 70
          }],
          selectedVariationIndex: 0
        }
      ];

      (GeneratedCaptionModel.find as any) = vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue(mockCaptions)
      });

      const result = await scheduler.analyzePerformanceCorrelations(testUserId, testWorkspaceId);

      expect(result.updateType).toBe('performance_correlation');
      expect(result.improvements.length).toBeGreaterThan(0);
    });

    it('should handle insufficient performance data', async () => {
      (GeneratedCaptionModel.find as any) = vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue([])
      });

      const result = await scheduler.analyzePerformanceCorrelations(testUserId, testWorkspaceId);

      expect(result.updatesApplied).toBe(0);
      expect(result.improvements).toContain('Insufficient performance data for correlation analysis');
    });
  });

  describe('triggerRecalibration', () => {
    it('should auto-recalibrate when sufficient recent captions exist', async () => {
      const trigger: RecalibrationTrigger = {
        triggered: true,
        reason: 'High rejection rate',
        metrics: {
          totalGenerated: 100,
          totalAccepted: 50,
          totalRejected: 40,
          totalEdited: 10,
          acceptanceRate: 50,
          rejectionRate: 40,
          heavyEditRate: 10,
          trend: 'declining'
        },
        recommendations: ['Recalibrate profile'],
        severity: 'medium'
      };

      const mockCaptions = Array(10).fill(null).map((_, i) => ({
        _id: `caption${i}`,
        variations: [{ caption: `Caption ${i}` }],
        selectedVariationIndex: 0,
        publishedAt: new Date(),
        actualMetrics: { likes: 50 }
      }));

      (GeneratedCaptionModel.find as any) = vi.fn().mockReturnValue({
        sort: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue(mockCaptions)
        })
      });

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await scheduler.triggerRecalibration(testUserId, testWorkspaceId, trigger);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Auto-recalibrating profile')
      );

      consoleLogSpy.mockRestore();
    });
  });
});
