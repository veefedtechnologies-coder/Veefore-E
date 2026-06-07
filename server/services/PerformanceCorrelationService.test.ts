import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PerformanceCorrelationService } from './PerformanceCorrelationService';
import { generatedCaptionRepository } from '../repositories/GeneratedCaptionRepository';
import { ContentModel } from '../models/Content';
import { viralPatternService } from './ViralPatternService';

// Mock dependencies
vi.mock('../repositories/GeneratedCaptionRepository');
vi.mock('../models/Content');
vi.mock('./ViralPatternService');

describe('PerformanceCorrelationService', () => {
  let service: PerformanceCorrelationService;
  const mockUserId = 'user123';
  const mockWorkspaceId = 'workspace123';

  beforeEach(() => {
    service = new PerformanceCorrelationService();
    vi.clearAllMocks();
  });

  describe('linkCaptionsToPerformance', () => {
    it('should link captions to actual content performance', async () => {
      // Mock generated captions
      const mockCaptions = [
        {
          _id: 'caption1',
          contentId: 'content1',
          userId: mockUserId,
          workspaceId: mockWorkspaceId,
          variations: [
            {
              caption: 'Test caption',
              engagementPrediction: {
                predictedLikeRate: 5.0,
              },
            },
          ],
          selectedVariationIndex: 0,
        },
      ];

      // Mock content with metrics
      const mockContent = {
        _id: 'content1',
        metrics: {
          likes: 100,
          comments: 20,
          saves: 15,
          shares: 5,
          impressions: 2000,
        },
      };

      (generatedCaptionRepository.findByUserAndWorkspace as any).mockResolvedValue(mockCaptions);
      (ContentModel.findById as any).mockReturnValue({
        lean: vi.fn().mockReturnValue({
          exec: vi.fn().mockResolvedValue(mockContent),
        }),
      });
      (generatedCaptionRepository.updatePerformanceMetrics as any).mockResolvedValue(undefined);

      const result = await service.linkCaptionsToPerformance(mockUserId, mockWorkspaceId, 50);

      expect(result.linked).toBe(1);
      expect(result.errors).toBe(0);
      expect(result.updatedCaptions).toHaveLength(1);
      expect(generatedCaptionRepository.updatePerformanceMetrics).toHaveBeenCalledWith(
        'caption1',
        {
          likes: 100,
          comments: 20,
          saves: 15,
          shares: 5,
          impressions: 2000,
        }
      );
    });

    it('should handle errors gracefully', async () => {
      (generatedCaptionRepository.findByUserAndWorkspace as any).mockResolvedValue([
        {
          _id: 'caption1',
          contentId: 'content1',
          userId: mockUserId,
          workspaceId: mockWorkspaceId,
          variations: [],
          selectedVariationIndex: 0,
        },
      ]);
      (ContentModel.findById as any).mockReturnValue({
        lean: vi.fn().mockReturnValue({
          exec: vi.fn().mockRejectedValue(new Error('Database error')),
        }),
      });

      const result = await service.linkCaptionsToPerformance(mockUserId, mockWorkspaceId, 50);

      expect(result.errors).toBe(1);
      expect(result.linked).toBe(0);
    });
  });

  describe('analyzeSuccessCharacteristics', () => {
    it('should analyze caption characteristics', async () => {
      const mockCaptions = [
        {
          _id: 'caption1',
          actualMetrics: {
            likes: 100,
            comments: 20,
            saves: 15,
            shares: 5,
            impressions: 2000,
            engagementRate: 7.0,
          },
          variations: [
            {
              caption: 'Test caption with question? #test',
              usedPatterns: ['pattern1'],
              usedHooks: ['hook1'],
            },
          ],
          selectedVariationIndex: 0,
        },
      ];

      (generatedCaptionRepository.findWithPredictionAccuracy as any).mockResolvedValue(mockCaptions);
      (generatedCaptionRepository.calculateAverageMetrics as any).mockResolvedValue({
        avgLikeRate: 5.0,
        avgCommentRate: 1.0,
        avgSaveRate: 0.5,
      });

      const result = await service.analyzeSuccessCharacteristics(mockUserId, mockWorkspaceId);

      expect(result.highPerformers).toBeDefined();
      expect(result.lowPerformers).toBeDefined();
      expect(result.insights).toBeDefined();
      expect(Array.isArray(result.insights)).toBe(true);
    });
  });

  describe('updateViralPatternPerformance', () => {
    it('should update viral patterns with actual performance', async () => {
      const mockCaptions = [
        {
          _id: 'caption1',
          actualMetrics: {
            likes: 100,
            comments: 20,
            saves: 15,
            shares: 5,
            impressions: 2000,
            engagementRate: 7.0,
          },
          variations: [
            {
              caption: 'Test caption',
              usedPatterns: ['pattern1'],
              usedHooks: ['hook1'],
            },
          ],
          selectedVariationIndex: 0,
        },
      ];

      (generatedCaptionRepository.findWithPredictionAccuracy as any).mockResolvedValue(mockCaptions);
      (viralPatternService.updatePatternPerformance as any).mockResolvedValue(undefined);
      (viralPatternService.recordHookUsage as any).mockResolvedValue(undefined);

      const result = await service.updateViralPatternPerformance(mockUserId, mockWorkspaceId);

      expect(result.patternsUpdated).toBe(1);
      expect(result.hooksUpdated).toBe(1);
      expect(viralPatternService.updatePatternPerformance).toHaveBeenCalledWith('pattern1', 7.0);
      expect(viralPatternService.recordHookUsage).toHaveBeenCalledWith('hook1');
    });
  });

  describe('improveEngagementPredictor', () => {
    it('should calculate prediction accuracy', async () => {
      const mockCaptions = Array.from({ length: 10 }, (_, i) => ({
        _id: `caption${i}`,
        actualMetrics: {
          likes: 100 + i * 10,
          comments: 20,
          saves: 15,
          shares: 5,
          impressions: 2000,
          engagementRate: 5.0 + i * 0.5,
        },
        variations: [
          {
            caption: `Test caption ${i}`,
            engagementPrediction: {
              predictedLikeRate: 5.0 + i * 0.4,
              factors: {
                hookStrength: 7,
                readabilityScore: 8,
                ctaClarity: 6,
              },
            },
          },
        ],
        selectedVariationIndex: 0,
      }));

      (generatedCaptionRepository.findWithPredictionAccuracy as any).mockResolvedValue(mockCaptions);

      const result = await service.improveEngagementPredictor(mockUserId, mockWorkspaceId);

      expect(result.currentAccuracy).toBeGreaterThan(0);
      expect(result.factorCorrelations).toBeDefined();
      expect(result.recommendations).toBeDefined();
      expect(Array.isArray(result.recommendations)).toBe(true);
    });

    it('should return early if insufficient data', async () => {
      (generatedCaptionRepository.findWithPredictionAccuracy as any).mockResolvedValue([]);

      const result = await service.improveEngagementPredictor(mockUserId, mockWorkspaceId);

      expect(result.currentAccuracy).toBe(0);
      expect(result.recommendations).toContain('Need at least 10 captions with performance data for model improvement.');
    });
  });

  describe('runCompleteLearningCycle', () => {
    it('should run all learning steps in sequence', async () => {
      // Mock all the methods
      (generatedCaptionRepository.findByUserAndWorkspace as any).mockResolvedValue([]);
      (generatedCaptionRepository.findWithPredictionAccuracy as any).mockResolvedValue([]);
      (generatedCaptionRepository.calculateAverageMetrics as any).mockResolvedValue({
        avgLikeRate: 5.0,
        avgCommentRate: 1.0,
        avgSaveRate: 0.5,
      });

      const result = await service.runCompleteLearningCycle(mockUserId, mockWorkspaceId);

      expect(result.linkingResults).toBeDefined();
      expect(result.analysisResults).toBeDefined();
      expect(result.patternUpdateResults).toBeDefined();
      expect(result.predictorResults).toBeDefined();
    });
  });
});
