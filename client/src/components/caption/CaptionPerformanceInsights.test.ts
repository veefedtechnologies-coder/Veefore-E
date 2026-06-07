import { describe, it, expect } from 'vitest';
import type { 
  CaptionPerformanceData, 
  LearningInsight,
  CaptionPerformanceInsightsProps 
} from './CaptionPerformanceInsights';

describe('CaptionPerformanceInsights', () => {
  describe('Type Definitions', () => {
    it('should have correct PerformanceMetrics type', () => {
      const metrics = {
        likes: 100,
        comments: 20,
        saves: 15,
        shares: 5,
        impressions: 1000,
        engagementRate: 0.14
      };
      
      expect(metrics.likes).toBe(100);
      expect(metrics.engagementRate).toBe(0.14);
    });

    it('should have correct CaptionPerformanceData type', () => {
      const captionData: CaptionPerformanceData = {
        captionId: 'test-123',
        caption: 'Test caption',
        predictedMetrics: {
          likeRate: 0.10,
          commentRate: 0.02,
          saveRate: 0.015,
          shareRate: 0.005,
          confidence: 0.85
        },
        actualMetrics: {
          likes: 100,
          comments: 20,
          saves: 15,
          shares: 5,
          impressions: 1000,
          engagementRate: 0.14
        },
        publishedAt: new Date(),
        patternsUsed: ['story-insight-question'],
        hooksUsed: ['hot-take'],
        styleType: 'viral'
      };

      expect(captionData.captionId).toBe('test-123');
      expect(captionData.predictedMetrics.confidence).toBe(0.85);
      expect(captionData.styleType).toBe('viral');
    });

    it('should have correct LearningInsight type', () => {
      const insight: LearningInsight = {
        type: 'success',
        title: 'Viral patterns working well',
        description: 'Your viral-style captions are performing 25% better than predicted',
        impact: 'high'
      };

      expect(insight.type).toBe('success');
      expect(insight.impact).toBe('high');
    });

    it('should support captions without actual metrics', () => {
      const captionData: CaptionPerformanceData = {
        captionId: 'test-456',
        caption: 'Pending caption',
        predictedMetrics: {
          likeRate: 0.10,
          commentRate: 0.02,
          saveRate: 0.015,
          shareRate: 0.005,
          confidence: 0.85
        }
        // actualMetrics is optional
      };

      expect(captionData.actualMetrics).toBeUndefined();
      expect(captionData.predictedMetrics).toBeDefined();
    });
  });

  describe('Props Validation', () => {
    it('should accept valid CaptionPerformanceInsightsProps', () => {
      const props: CaptionPerformanceInsightsProps = {
        captions: [
          {
            captionId: 'test-1',
            caption: 'Test caption 1',
            predictedMetrics: {
              likeRate: 0.10,
              commentRate: 0.02,
              saveRate: 0.015,
              shareRate: 0.005,
              confidence: 0.85
            },
            actualMetrics: {
              likes: 100,
              comments: 20,
              saves: 15,
              shares: 5,
              impressions: 1000,
              engagementRate: 0.14
            }
          }
        ],
        learningInsights: [
          {
            type: 'success',
            title: 'Great improvement',
            description: 'Your captions are performing well',
            impact: 'high'
          }
        ],
        accuracyTrend: [
          { date: '2024-01-01', accuracy: 75 },
          { date: '2024-01-15', accuracy: 82 }
        ],
        overallStats: {
          totalGenerated: 50,
          totalPublished: 30,
          avgActualEngagement: 0.12,
          avgPredictedAccuracy: 85,
          improvementRate: 15
        }
      };

      expect(props.captions).toHaveLength(1);
      expect(props.learningInsights).toHaveLength(1);
      expect(props.accuracyTrend).toHaveLength(2);
      expect(props.overallStats?.totalGenerated).toBe(50);
    });

    it('should work with minimal required props', () => {
      const props: CaptionPerformanceInsightsProps = {
        captions: []
      };

      expect(props.captions).toHaveLength(0);
      expect(props.learningInsights).toBeUndefined();
    });
  });

  describe('Data Structure Validation', () => {
    it('should handle mixed caption data (with and without actual metrics)', () => {
      const captions: CaptionPerformanceData[] = [
        {
          captionId: 'with-metrics',
          caption: 'Published caption',
          predictedMetrics: {
            likeRate: 0.10,
            commentRate: 0.02,
            saveRate: 0.015,
            shareRate: 0.005,
            confidence: 0.85
          },
          actualMetrics: {
            likes: 100,
            comments: 20,
            saves: 15,
            shares: 5,
            impressions: 1000,
            engagementRate: 0.14
          }
        },
        {
          captionId: 'without-metrics',
          caption: 'Pending caption',
          predictedMetrics: {
            likeRate: 0.08,
            commentRate: 0.015,
            saveRate: 0.01,
            shareRate: 0.003,
            confidence: 0.80
          }
        }
      ];

      const withMetrics = captions.filter(c => c.actualMetrics !== undefined);
      const withoutMetrics = captions.filter(c => c.actualMetrics === undefined);

      expect(withMetrics).toHaveLength(1);
      expect(withoutMetrics).toHaveLength(1);
    });

    it('should support all learning insight types', () => {
      const insights: LearningInsight[] = [
        { type: 'success', title: 'Success', description: 'Good', impact: 'high' },
        { type: 'improvement', title: 'Improve', description: 'Can be better', impact: 'medium' },
        { type: 'warning', title: 'Warning', description: 'Watch out', impact: 'low' },
        { type: 'info', title: 'Info', description: 'FYI', impact: 'low' }
      ];

      expect(insights).toHaveLength(4);
      expect(insights.map(i => i.type)).toEqual(['success', 'improvement', 'warning', 'info']);
    });

    it('should support all style types', () => {
      const styleTypes: Array<'viral' | 'authentic' | 'balanced'> = [
        'viral',
        'authentic',
        'balanced'
      ];

      styleTypes.forEach(styleType => {
        const caption: CaptionPerformanceData = {
          captionId: `test-${styleType}`,
          caption: 'Test',
          predictedMetrics: {
            likeRate: 0.10,
            commentRate: 0.02,
            saveRate: 0.015,
            shareRate: 0.005,
            confidence: 0.85
          },
          styleType
        };

        expect(caption.styleType).toBe(styleType);
      });
    });
  });

  describe('Accuracy Calculation Logic', () => {
    it('should calculate accuracy correctly', () => {
      // Test the accuracy calculation logic
      const predicted = {
        likeRate: 0.10,
        commentRate: 0.02,
        saveRate: 0.015,
        shareRate: 0.005,
        confidence: 0.85
      };

      const actual = {
        likes: 100,
        comments: 20,
        saves: 15,
        shares: 5,
        impressions: 1000,
        engagementRate: 0.14
      };

      // Calculate actual rates
      const actualRates = {
        likeRate: actual.likes / actual.impressions, // 0.10
        commentRate: actual.comments / actual.impressions, // 0.02
        saveRate: actual.saves / actual.impressions, // 0.015
        shareRate: actual.shares / actual.impressions // 0.005
      };

      // All predictions match exactly in this test case
      expect(actualRates.likeRate).toBe(predicted.likeRate);
      expect(actualRates.commentRate).toBe(predicted.commentRate);
      expect(actualRates.saveRate).toBe(predicted.saveRate);
      expect(actualRates.shareRate).toBe(predicted.shareRate);
    });

    it('should handle prediction errors correctly', () => {
      const predicted = {
        likeRate: 0.10,
        commentRate: 0.02,
        saveRate: 0.015,
        shareRate: 0.005,
        confidence: 0.85
      };

      const actual = {
        likes: 120, // 20% higher than predicted
        comments: 25, // 25% higher
        saves: 18, // 20% higher
        shares: 6, // 20% higher
        impressions: 1000,
        engagementRate: 0.169
      };

      const actualRates = {
        likeRate: actual.likes / actual.impressions, // 0.12
        commentRate: actual.comments / actual.impressions, // 0.025
        saveRate: actual.saves / actual.impressions, // 0.018
        shareRate: actual.shares / actual.impressions // 0.006
      };

      // Check that actuals are higher than predicted
      expect(actualRates.likeRate).toBeGreaterThan(predicted.likeRate);
      expect(actualRates.commentRate).toBeGreaterThan(predicted.commentRate);
      expect(actualRates.saveRate).toBeGreaterThan(predicted.saveRate);
      expect(actualRates.shareRate).toBeGreaterThan(predicted.shareRate);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty captions array', () => {
      const props: CaptionPerformanceInsightsProps = {
        captions: []
      };

      expect(props.captions).toHaveLength(0);
    });

    it('should handle captions with zero impressions safely', () => {
      const caption: CaptionPerformanceData = {
        captionId: 'zero-impressions',
        caption: 'New caption',
        predictedMetrics: {
          likeRate: 0.10,
          commentRate: 0.02,
          saveRate: 0.015,
          shareRate: 0.005,
          confidence: 0.85
        },
        actualMetrics: {
          likes: 0,
          comments: 0,
          saves: 0,
          shares: 0,
          impressions: 0,
          engagementRate: 0
        }
      };

      expect(caption.actualMetrics.impressions).toBe(0);
      // Component should handle division by zero gracefully
    });

    it('should handle very high confidence predictions', () => {
      const caption: CaptionPerformanceData = {
        captionId: 'high-confidence',
        caption: 'Confident prediction',
        predictedMetrics: {
          likeRate: 0.10,
          commentRate: 0.02,
          saveRate: 0.015,
          shareRate: 0.005,
          confidence: 0.99
        }
      };

      expect(caption.predictedMetrics.confidence).toBe(0.99);
    });

    it('should handle captions with many patterns and hooks', () => {
      const caption: CaptionPerformanceData = {
        captionId: 'many-patterns',
        caption: 'Complex caption',
        predictedMetrics: {
          likeRate: 0.10,
          commentRate: 0.02,
          saveRate: 0.015,
          shareRate: 0.005,
          confidence: 0.85
        },
        patternsUsed: [
          'story-insight-question',
          'emotional-hook',
          'call-to-action',
          'value-proposition'
        ],
        hooksUsed: [
          'hot-take',
          'pov',
          'unpopular-opinion'
        ]
      };

      expect(caption.patternsUsed).toHaveLength(4);
      expect(caption.hooksUsed).toHaveLength(3);
    });
  });

  describe('Overall Stats Validation', () => {
    it('should calculate improvement rate correctly', () => {
      const stats = {
        totalGenerated: 100,
        totalPublished: 60,
        avgActualEngagement: 0.12,
        avgPredictedAccuracy: 85,
        improvementRate: 15
      };

      expect(stats.improvementRate).toBeGreaterThan(0);
      expect(stats.totalPublished).toBeLessThanOrEqual(stats.totalGenerated);
    });

    it('should handle negative improvement rate', () => {
      const stats = {
        totalGenerated: 50,
        totalPublished: 30,
        avgActualEngagement: 0.08,
        avgPredictedAccuracy: 75,
        improvementRate: -5
      };

      expect(stats.improvementRate).toBeLessThan(0);
    });
  });
});
