import { BaseService } from './BaseService';
import { generatedCaptionRepository } from '../repositories/GeneratedCaptionRepository';
import { ContentModel } from '../models/Content';
import { viralPatternService } from './ViralPatternService';
import { Logger } from '../utils/logger';

/**
 * Performance Correlation Service
 * 
 * Links generated captions to actual engagement metrics, identifies
 * characteristics of successful vs unsuccessful captions, and updates
 * viral pattern database with learnings to improve future predictions.
 * 
 * Requirements: 10.3, 10.5
 */
export class PerformanceCorrelationService extends BaseService {
  // Performance thresholds for classification
  private readonly HIGH_PERFORMANCE_THRESHOLD = 1.2; // 20% above average
  private readonly LOW_PERFORMANCE_THRESHOLD = 0.8;  // 20% below average

  constructor() {
    super('PerformanceCorrelationService');
  }

  /**
   * Link generated captions to actual content performance
   * Fetches captions with contentId and correlates with Content collection metrics
   * 
   * Requirements: 10.3
   */
  async linkCaptionsToPerformance(
    userId: string,
    workspaceId: string,
    limit: number = 50
  ): Promise<{
    linked: number;
    errors: number;
    updatedCaptions: string[];
  }> {
    return this.withErrorHandling('linkCaptionsToPerformance', async () => {
      this.log('linkCaptionsToPerformance', 'Starting caption-performance linking', {
        userId,
        workspaceId,
        limit,
      });

      const results = {
        linked: 0,
        errors: 0,
        updatedCaptions: [] as string[],
      };

      // Get generated captions that have contentId but no performance data yet
      const captions = await generatedCaptionRepository.findByUserAndWorkspace(
        userId,
        workspaceId,
        limit * 2 // Get more to find unpublished ones
      );

      for (const caption of captions) {
        try {
          // Skip if already has performance data
          if (caption.performanceRecordedAt) {
            continue;
          }

          // Skip if no contentId
          if (!caption.contentId) {
            continue;
          }

          // Fetch actual content performance from Content collection
          const content = await ContentModel.findById(caption.contentId).lean().exec();

          if (!content) {
            this.log('linkCaptionsToPerformance', 'Content not found', {
              captionId: caption._id.toString(),
              contentId: caption.contentId,
            });
            results.errors++;
            continue;
          }

          // Check if content has metrics
          if (!content.metrics || content.metrics.impressions === 0) {
            this.log('linkCaptionsToPerformance', 'Content has no metrics yet', {
              captionId: caption._id.toString(),
              contentId: caption.contentId,
            });
            continue;
          }

          // Update caption with actual performance metrics
          await generatedCaptionRepository.updatePerformanceMetrics(
            caption._id.toString(),
            {
              likes: content.metrics.likes || 0,
              comments: content.metrics.comments || 0,
              saves: content.metrics.saves || 0,
              shares: content.metrics.shares || 0,
              impressions: content.metrics.impressions || 0,
            }
          );

          results.linked++;
          results.updatedCaptions.push(caption._id.toString());

          this.log('linkCaptionsToPerformance', 'Linked caption to performance', {
            captionId: caption._id.toString(),
            contentId: caption.contentId,
            engagementRate: content.metrics.engagement?.toFixed(2) || 'N/A',
          });

        } catch (error) {
          this.log('linkCaptionsToPerformance', 'Error linking caption', {
            captionId: caption._id.toString(),
            error: error instanceof Error ? error.message : 'Unknown error',
          });
          results.errors++;
        }
      }

      this.log('linkCaptionsToPerformance', 'Completed caption-performance linking', results);
      return results;
    });
  }

  /**
   * Analyze characteristics of successful vs unsuccessful captions
   * Identifies patterns, hooks, and styles that correlate with performance
   * 
   * Requirements: 10.3
   */
  async analyzeSuccessCharacteristics(
    userId: string,
    workspaceId: string
  ): Promise<{
    highPerformers: CaptionCharacteristics[];
    lowPerformers: CaptionCharacteristics[];
    insights: string[];
  }> {
    return this.withErrorHandling('analyzeSuccessCharacteristics', async () => {
      this.log('analyzeSuccessCharacteristics', 'Starting success analysis', {
        userId,
        workspaceId,
      });

      // Get captions with performance data
      const captions = await generatedCaptionRepository.findWithPredictionAccuracy(
        userId,
        workspaceId,
        100
      );

      if (captions.length < 5) {
        this.log('analyzeSuccessCharacteristics', 'Insufficient data for analysis', {
          sampleSize: captions.length,
        });
        return {
          highPerformers: [],
          lowPerformers: [],
          insights: ['Insufficient data for analysis. Need at least 5 published captions with performance data.'],
        };
      }

      // Get user's average performance for comparison
      const userAverage = await generatedCaptionRepository.calculateAverageMetrics(
        userId,
        workspaceId
      );

      // Classify captions into high, average, and low performers
      const highPerformers: CaptionCharacteristics[] = [];
      const lowPerformers: CaptionCharacteristics[] = [];

      for (const caption of captions) {
        if (!caption.actualMetrics || !caption.actualMetrics.impressions) {
          continue;
        }

        // Calculate actual engagement rate
        const actualEngagementRate = caption.actualMetrics.engagementRate || 0;

        // Get selected variation
        const selectedVariation = caption.selectedVariationIndex !== undefined
          ? caption.variations[caption.selectedVariationIndex]
          : caption.variations[0];

        if (!selectedVariation) {
          continue;
        }

        // Extract characteristics
        const characteristics = this.extractCaptionCharacteristics(
          selectedVariation.caption,
          selectedVariation.usedPatterns || [],
          selectedVariation.usedHooks || [],
          actualEngagementRate
        );

        // Classify based on performance vs average
        if (actualEngagementRate >= userAverage.avgLikeRate * this.HIGH_PERFORMANCE_THRESHOLD) {
          highPerformers.push(characteristics);
        } else if (actualEngagementRate <= userAverage.avgLikeRate * this.LOW_PERFORMANCE_THRESHOLD) {
          lowPerformers.push(characteristics);
        }
      }

      // Generate insights
      const insights = this.generateInsights(highPerformers, lowPerformers, userAverage);

      this.log('analyzeSuccessCharacteristics', 'Completed success analysis', {
        totalAnalyzed: captions.length,
        highPerformers: highPerformers.length,
        lowPerformers: lowPerformers.length,
        insights: insights.length,
      });

      return {
        highPerformers,
        lowPerformers,
        insights,
      };
    });
  }

  /**
   * Update viral pattern database with new learnings
   * Adjusts pattern performance scores based on actual results
   * 
   * Requirements: 10.5
   */
  async updateViralPatternPerformance(
    userId: string,
    workspaceId: string
  ): Promise<{
    patternsUpdated: number;
    hooksUpdated: number;
    newPatternsExtracted: number;
  }> {
    return this.withErrorHandling('updateViralPatternPerformance', async () => {
      this.log('updateViralPatternPerformance', 'Starting viral pattern updates', {
        userId,
        workspaceId,
      });

      const results = {
        patternsUpdated: 0,
        hooksUpdated: 0,
        newPatternsExtracted: 0,
      };

      // Get captions with performance data
      const captions = await generatedCaptionRepository.findWithPredictionAccuracy(
        userId,
        workspaceId,
        100
      );

      for (const caption of captions) {
        if (!caption.actualMetrics || !caption.actualMetrics.impressions) {
          continue;
        }

        const actualEngagementRate = caption.actualMetrics.engagementRate || 0;

        // Get selected variation
        const selectedVariation = caption.selectedVariationIndex !== undefined
          ? caption.variations[caption.selectedVariationIndex]
          : caption.variations[0];

        if (!selectedVariation) {
          continue;
        }

        // Update pattern performance for used patterns
        if (selectedVariation.usedPatterns && selectedVariation.usedPatterns.length > 0) {
          for (const patternId of selectedVariation.usedPatterns) {
            try {
              await viralPatternService.updatePatternPerformance(
                patternId,
                actualEngagementRate
              );
              results.patternsUpdated++;
            } catch (error) {
              this.log('updateViralPatternPerformance', 'Error updating pattern', {
                patternId,
                error: error instanceof Error ? error.message : 'Unknown error',
              });
            }
          }
        }

        // Update hook usage tracking
        if (selectedVariation.usedHooks && selectedVariation.usedHooks.length > 0) {
          for (const hookId of selectedVariation.usedHooks) {
            try {
              await viralPatternService.recordHookUsage(hookId);
              results.hooksUpdated++;
            } catch (error) {
              this.log('updateViralPatternPerformance', 'Error recording hook usage', {
                hookId,
                error: error instanceof Error ? error.message : 'Unknown error',
              });
            }
          }
        }

        // Extract new patterns from high-performing captions
        if (actualEngagementRate > 8.0) { // Above 8% is considered high performance
          try {
            // Get content type from caption metadata or default to 'post'
            const postType = 'post'; // TODO: Get from caption metadata

            // Get niche from caption metadata or use default
            const niche = 'general'; // TODO: Get from caption metadata or user profile

            await viralPatternService.extractAndAddPattern(
              selectedVariation.caption,
              actualEngagementRate,
              niche,
              postType
            );
            results.newPatternsExtracted++;
          } catch (error) {
            this.log('updateViralPatternPerformance', 'Error extracting pattern', {
              captionId: caption._id.toString(),
              error: error instanceof Error ? error.message : 'Unknown error',
            });
          }
        }
      }

      this.log('updateViralPatternPerformance', 'Completed viral pattern updates', results);
      return results;
    });
  }

  /**
   * Improve engagement predictor model weights based on actual performance
   * Analyzes prediction accuracy and suggests weight adjustments
   * 
   * Requirements: 10.5
   */
  async improveEngagementPredictor(
    userId: string,
    workspaceId: string
  ): Promise<{
    currentAccuracy: number;
    factorCorrelations: Record<string, number>;
    recommendations: string[];
  }> {
    return this.withErrorHandling('improveEngagementPredictor', async () => {
      this.log('improveEngagementPredictor', 'Starting predictor improvement analysis', {
        userId,
        workspaceId,
      });

      // Get captions with both predictions and actual performance
      const captions = await generatedCaptionRepository.findWithPredictionAccuracy(
        userId,
        workspaceId,
        50
      );

      if (captions.length < 10) {
        this.log('improveEngagementPredictor', 'Insufficient data for predictor improvement', {
          sampleSize: captions.length,
        });
        return {
          currentAccuracy: 0,
          factorCorrelations: {},
          recommendations: ['Need at least 10 captions with performance data for model improvement.'],
        };
      }

      // Calculate prediction accuracy
      let totalAccuracy = 0;
      const factorScores: Record<string, number[]> = {};
      const actualRates: number[] = [];

      for (const caption of captions) {
        const selectedVariation = caption.selectedVariationIndex !== undefined
          ? caption.variations[caption.selectedVariationIndex]
          : caption.variations[0];

        if (!selectedVariation || !selectedVariation.engagementPrediction || !caption.actualMetrics) {
          continue;
        }

        const predicted = selectedVariation.engagementPrediction.predictedLikeRate;
        const actual = caption.actualMetrics.engagementRate || 0;

        // Calculate prediction error (percentage difference)
        const error = Math.abs(predicted - actual) / Math.max(actual, 1);
        const accuracy = Math.max(0, 1 - error);
        totalAccuracy += accuracy;

        // Track factor scores vs actual performance
        if (selectedVariation.engagementPrediction.factors) {
          const factors = selectedVariation.engagementPrediction.factors;
          
          for (const [factorName, score] of Object.entries(factors)) {
            if (typeof score === 'number') {
              if (!factorScores[factorName]) {
                factorScores[factorName] = [];
              }
              factorScores[factorName].push(score);
            }
          }
        }

        actualRates.push(actual);
      }

      const currentAccuracy = totalAccuracy / captions.length;

      // Calculate correlation between factors and actual performance
      const factorCorrelations: Record<string, number> = {};
      for (const [factorName, scores] of Object.entries(factorScores)) {
        if (scores.length === actualRates.length) {
          factorCorrelations[factorName] = this.calculateCorrelation(scores, actualRates);
        }
      }

      // Generate recommendations based on correlations
      const recommendations = this.generatePredictorRecommendations(
        currentAccuracy,
        factorCorrelations
      );

      this.log('improveEngagementPredictor', 'Completed predictor improvement analysis', {
        sampleSize: captions.length,
        currentAccuracy: (currentAccuracy * 100).toFixed(2) + '%',
        recommendations: recommendations.length,
      });

      return {
        currentAccuracy: Math.round(currentAccuracy * 100) / 100,
        factorCorrelations,
        recommendations,
      };
    });
  }

  /**
   * Run complete performance correlation and learning cycle
   * Links captions, analyzes patterns, updates database, improves predictor
   * 
   * Requirements: 10.3, 10.5
   */
  async runCompleteLearningCycle(
    userId: string,
    workspaceId: string
  ): Promise<{
    linkingResults: any;
    analysisResults: any;
    patternUpdateResults: any;
    predictorResults: any;
  }> {
    return this.withErrorHandling('runCompleteLearningCycle', async () => {
      this.log('runCompleteLearningCycle', 'Starting complete learning cycle', {
        userId,
        workspaceId,
      });

      // Step 1: Link captions to performance
      const linkingResults = await this.linkCaptionsToPerformance(userId, workspaceId);

      // Step 2: Analyze success characteristics
      const analysisResults = await this.analyzeSuccessCharacteristics(userId, workspaceId);

      // Step 3: Update viral patterns
      const patternUpdateResults = await this.updateViralPatternPerformance(userId, workspaceId);

      // Step 4: Improve engagement predictor
      const predictorResults = await this.improveEngagementPredictor(userId, workspaceId);

      this.log('runCompleteLearningCycle', 'Completed learning cycle', {
        captionsLinked: linkingResults.linked,
        patternsUpdated: patternUpdateResults.patternsUpdated,
        predictorAccuracy: (predictorResults.currentAccuracy * 100).toFixed(2) + '%',
      });

      return {
        linkingResults,
        analysisResults,
        patternUpdateResults,
        predictorResults,
      };
    });
  }

  // ==================== PRIVATE HELPER METHODS ====================


  /**
   * Extract characteristics from a caption for analysis
   */
  private extractCaptionCharacteristics(
    caption: string,
    usedPatterns: string[],
    usedHooks: string[],
    actualEngagementRate: number
  ): CaptionCharacteristics {
    const words = caption.split(/\s+/);
    const sentences = caption.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const lines = caption.split('\n').filter(l => l.trim().length > 0);

    // Extract emojis
    const emojiRegex = /[\u{1F300}-\u{1F9FF}]/gu;
    const emojis = caption.match(emojiRegex) || [];

    // Check for question
    const hasQuestion = caption.includes('?');

    // Check for CTA words
    const ctaWords = ['comment', 'share', 'save', 'tag', 'dm', 'follow', 'swipe', 'click'];
    const hasCTA = ctaWords.some(word => caption.toLowerCase().includes(word));

    // Check hook type (first line)
    const firstLine = lines[0]?.toLowerCase() || '';
    let hookType = 'none';
    if (firstLine.includes('hot take') || firstLine.includes('unpopular opinion')) {
      hookType = 'controversial';
    } else if (firstLine.includes('pov:')) {
      hookType = 'pov';
    } else if (firstLine.startsWith('why') || firstLine.startsWith('how') || firstLine.startsWith('what')) {
      hookType = 'question';
    } else if (/^\d+/.test(firstLine)) {
      hookType = 'numbered';
    } else if (firstLine.includes('story time') || firstLine.includes('confession')) {
      hookType = 'story';
    }

    return {
      wordCount: words.length,
      sentenceCount: sentences.length,
      lineCount: lines.length,
      avgSentenceLength: words.length / sentences.length,
      emojiCount: emojis.length,
      hasQuestion,
      hasCTA,
      hookType,
      usedPatterns,
      usedHooks,
      actualEngagementRate,
    };
  }

  /**
   * Generate insights from high and low performers
   */
  private generateInsights(
    highPerformers: CaptionCharacteristics[],
    lowPerformers: CaptionCharacteristics[],
    userAverage: any
  ): string[] {
    const insights: string[] = [];

    if (highPerformers.length === 0 && lowPerformers.length === 0) {
      insights.push('No clear performance patterns detected yet. Continue publishing to gather more data.');
      return insights;
    }

    // Analyze word count differences
    if (highPerformers.length > 0 && lowPerformers.length > 0) {
      const highAvgWords = highPerformers.reduce((sum, c) => sum + c.wordCount, 0) / highPerformers.length;
      const lowAvgWords = lowPerformers.reduce((sum, c) => sum + c.wordCount, 0) / lowPerformers.length;

      if (highAvgWords > lowAvgWords * 1.2) {
        insights.push(`💡 Longer captions (avg ${Math.round(highAvgWords)} words) perform better for you than shorter ones (avg ${Math.round(lowAvgWords)} words).`);
      } else if (lowAvgWords > highAvgWords * 1.2) {
        insights.push(`💡 Shorter captions (avg ${Math.round(highAvgWords)} words) perform better for you than longer ones (avg ${Math.round(lowAvgWords)} words).`);
      }

      // Analyze CTA presence
      const highCTARate = highPerformers.filter(c => c.hasCTA).length / highPerformers.length;
      const lowCTARate = lowPerformers.filter(c => c.hasCTA).length / lowPerformers.length;

      if (highCTARate > lowCTARate + 0.2) {
        insights.push(`✅ Including clear calls-to-action significantly improves your engagement (${(highCTARate * 100).toFixed(0)}% of high performers vs ${(lowCTARate * 100).toFixed(0)}% of low performers).`);
      }

      // Analyze question usage
      const highQuestionRate = highPerformers.filter(c => c.hasQuestion).length / highPerformers.length;
      const lowQuestionRate = lowPerformers.filter(c => c.hasQuestion).length / lowPerformers.length;

      if (highQuestionRate > lowQuestionRate + 0.2) {
        insights.push(`❓ Questions drive engagement for your audience (${(highQuestionRate * 100).toFixed(0)}% of high performers include questions).`);
      }

      // Analyze hook types
      const hookTypeCounts: Record<string, { high: number; low: number }> = {};
      
      highPerformers.forEach(c => {
        if (!hookTypeCounts[c.hookType]) {
          hookTypeCounts[c.hookType] = { high: 0, low: 0 };
        }
        hookTypeCounts[c.hookType].high++;
      });

      lowPerformers.forEach(c => {
        if (!hookTypeCounts[c.hookType]) {
          hookTypeCounts[c.hookType] = { high: 0, low: 0 };
        }
        hookTypeCounts[c.hookType].low++;
      });

      // Find best performing hook types
      const bestHooks = Object.entries(hookTypeCounts)
        .filter(([type]) => type !== 'none')
        .filter(([_, counts]) => counts.high > counts.low)
        .sort((a, b) => b[1].high - a[1].high);

      if (bestHooks.length > 0) {
        const [bestHookType, counts] = bestHooks[0];
        insights.push(`🎯 "${bestHookType}" hooks work well for you (used in ${counts.high} high performers vs ${counts.low} low performers).`);
      }

      // Analyze emoji usage
      const highAvgEmojis = highPerformers.reduce((sum, c) => sum + c.emojiCount, 0) / highPerformers.length;
      const lowAvgEmojis = lowPerformers.reduce((sum, c) => sum + c.emojiCount, 0) / lowPerformers.length;

      if (highAvgEmojis > lowAvgEmojis + 1) {
        insights.push(`😊 More emoji usage correlates with better performance (avg ${highAvgEmojis.toFixed(1)} vs ${lowAvgEmojis.toFixed(1)}).`);
      } else if (lowAvgEmojis > highAvgEmojis + 1) {
        insights.push(`📝 Less emoji usage seems to work better for your audience (avg ${highAvgEmojis.toFixed(1)} in high performers).`);
      }
    }

    // Add performance summary
    if (highPerformers.length > 0) {
      const avgPerformance = highPerformers.reduce((sum, c) => sum + c.actualEngagementRate, 0) / highPerformers.length;
      insights.push(`🚀 Your top-performing captions average ${avgPerformance.toFixed(2)}% engagement rate, which is ${((avgPerformance / userAverage.avgLikeRate - 1) * 100).toFixed(0)}% above your baseline.`);
    }

    return insights;
  }

  /**
   * Calculate Pearson correlation coefficient between two arrays
   */
  private calculateCorrelation(x: number[], y: number[]): number {
    if (x.length !== y.length || x.length === 0) {
      return 0;
    }

    const n = x.length;
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
    const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);
    const sumY2 = y.reduce((sum, yi) => sum + yi * yi, 0);

    const numerator = (n * sumXY) - (sumX * sumY);
    const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));

    if (denominator === 0) {
      return 0;
    }

    return numerator / denominator;
  }

  /**
   * Generate predictor improvement recommendations
   */
  private generatePredictorRecommendations(
    currentAccuracy: number,
    factorCorrelations: Record<string, number>
  ): string[] {
    const recommendations: string[] = [];

    // Overall accuracy assessment
    if (currentAccuracy >= 0.8) {
      recommendations.push(`✅ Prediction model is performing well with ${(currentAccuracy * 100).toFixed(0)}% accuracy.`);
    } else if (currentAccuracy >= 0.6) {
      recommendations.push(`⚠️ Prediction model has moderate accuracy (${(currentAccuracy * 100).toFixed(0)}%). Continuing to collect data will improve predictions.`);
    } else {
      recommendations.push(`❌ Prediction model needs improvement (${(currentAccuracy * 100).toFixed(0)}% accuracy). More published content with performance data needed.`);
    }

    // Analyze factor correlations
    const sortedFactors = Object.entries(factorCorrelations)
      .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));

    // Identify strongest positive correlations
    const strongPositive = sortedFactors.filter(([_, corr]) => corr > 0.5);
    if (strongPositive.length > 0) {
      const [factorName] = strongPositive[0];
      recommendations.push(`📈 "${factorName}" shows strong positive correlation with engagement. Increase weight in future predictions.`);
    }

    // Identify weak correlations (factors that don't predict well)
    const weakCorrelations = sortedFactors.filter(([_, corr]) => Math.abs(corr) < 0.2);
    if (weakCorrelations.length > 0) {
      const [factorName] = weakCorrelations[0];
      recommendations.push(`📊 "${factorName}" shows weak correlation with engagement. Consider reducing weight or removing from model.`);
    }

    // Identify negative correlations (factors inversely related to engagement)
    const strongNegative = sortedFactors.filter(([_, corr]) => corr < -0.3);
    if (strongNegative.length > 0) {
      const [factorName] = strongNegative[0];
      recommendations.push(`⚠️ "${factorName}" is negatively correlated with engagement. Review how this factor is being scored.`);
    }

    return recommendations;
  }
}

// ==================== TYPE DEFINITIONS ====================

interface CaptionCharacteristics {
  wordCount: number;
  sentenceCount: number;
  lineCount: number;
  avgSentenceLength: number;
  emojiCount: number;
  hasQuestion: boolean;
  hasCTA: boolean;
  hookType: string;
  usedPatterns: string[];
  usedHooks: string[];
  actualEngagementRate: number;
}

// Export singleton instance
export const performanceCorrelationService = new PerformanceCorrelationService();
