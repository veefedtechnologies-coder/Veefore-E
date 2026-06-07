import { BaseService } from './BaseService';
import {
  EngagementPrediction,
  UserAverageMetrics,
  ActualPerformanceMetrics,
} from '../domain/types';
import { generatedCaptionRepository } from '../repositories/GeneratedCaptionRepository';

/**
 * EngagementPredictor Service
 * 
 * Analyzes caption characteristics to predict engagement metrics including
 * like rate, comment rate, save rate, and share rate. Uses multi-factor
 * analysis considering hook strength, readability, CTA clarity, and
 * emotional resonance.
 * 
 * Requirements: 9.1, 9.2, 9.4
 */
export class EngagementPredictor extends BaseService {
  // Hook patterns that typically drive engagement
  private readonly STRONG_HOOKS = [
    'hot take:', 'pov:', 'unpopular opinion:', 'real talk:', 'truth bomb:',
    'let\'s normalize', 'reminder:', 'plot twist:', 'fun fact:', 'story time:',
    'confession:', 'here\'s why', 'the truth about', 'nobody talks about'
  ];

  // Emotional words that increase resonance
  private readonly EMOTIONAL_WORDS = [
    'love', 'hate', 'amazing', 'incredible', 'struggle', 'journey', 'dream',
    'fear', 'hope', 'proud', 'excited', 'grateful', 'blessed', 'heartbroken',
    'inspired', 'shocked', 'overwhelmed', 'frustrated', 'joy', 'pain'
  ];

  // CTA patterns that drive action
  private readonly STRONG_CTAS = [
    'comment', 'share', 'save', 'tag', 'thoughts?', 'agree?', 'relate?',
    'dm me', 'let me know', 'tell me', 'drop', 'what do you think',
    'double tap', 'swipe', 'click', 'follow for more'
  ];

  constructor() {
    super('EngagementPredictor');
  }

  /**
   * Predict engagement for a caption
   * Requirements: 9.1, 9.2, 9.4
   */
  async predictEngagement(
    caption: string,
    userId: string,
    workspaceId: string,
    postType: string,
    platform: string
  ): Promise<EngagementPrediction> {
    return this.withErrorHandling('predictEngagement', async () => {
      this.log('predictEngagement', 'Analyzing caption for engagement prediction', {
        captionLength: caption.length,
        postType,
        platform,
      });

      // Calculate all contributing factors
      const hookStrength = this.analyzeHookStrength(caption);
      const readabilityScore = this.analyzeReadability(caption);
      const ctaClarity = this.analyzeCTAClarity(caption);
      const emotionalResonance = this.analyzeEmotionalResonance(caption);
      const lengthOptimality = this.analyzeLengthOptimality(caption, postType);
      const trendingTopicBonus = this.analyzeTrendingTopics(caption);

      const factors = {
        hookStrength,
        readabilityScore,
        ctaClarity,
        emotionalResonance,
        lengthOptimality,
        trendingTopicBonus,
      };

      // Calculate base prediction scores (0-100%)
      const baseScore = this.calculateBaseScore(factors);
      
      // Apply platform-specific multipliers
      const platformMultiplier = this.getPlatformMultiplier(platform);
      
      // Apply post-type specific adjustments
      const postTypeAdjustment = this.getPostTypeAdjustment(postType);

      // Calculate predicted rates
      const predictedLikeRate = this.calculateLikeRate(baseScore, platformMultiplier, postTypeAdjustment);
      const predictedCommentRate = this.calculateCommentRate(factors, platformMultiplier);
      const predictedSaveRate = this.calculateSaveRate(factors, platformMultiplier);
      const predictedShareRate = this.calculateShareRate(factors, platformMultiplier);

      // Get user's historical average
      const userAverage = await this.getUserAverageMetrics(userId, workspaceId);
      
      // Calculate vs user average
      const vsUserAverage = this.calculateVsUserAverage(
        { predictedLikeRate, predictedCommentRate, predictedSaveRate, predictedShareRate },
        userAverage
      );

      // Calculate confidence based on factor consistency AND historical accuracy
      // Requirements: 9.3, 9.6
      const baseConfidence = this.calculateConfidence(factors);
      const historicalAccuracy = await this.getHistoricalAccuracyScore(userId, workspaceId);
      const confidence = this.calibrateConfidenceWithHistory(baseConfidence, historicalAccuracy);

      this.log('predictEngagement', 'Prediction completed', {
        predictedLikeRate,
        predictedCommentRate,
        baseConfidence,
        historicalAccuracy,
        finalConfidence: confidence,
      });

      // Check if performance is below user average and generate improvement suggestions
      const performanceFlag = this.checkPerformanceFlag(
        vsUserAverage,
        factors,
        caption
      );

      return {
        predictedLikeRate,
        predictedCommentRate,
        predictedSaveRate,
        predictedShareRate,
        confidence,
        factors,
        vsUserAverage,
        performanceFlag,
      };
    });
  }

  /**
   * Analyze hook strength (0-10)
   * Checks for strong opening patterns and engaging first words
   */
  private analyzeHookStrength(caption: string): number {
    const firstLine = caption.split('\n')[0].toLowerCase().trim();
    const firstWords = firstLine.split(' ').slice(0, 5).join(' ');

    let score = 5; // Base score

    // Check for strong hook patterns
    for (const hook of this.STRONG_HOOKS) {
      if (firstWords.includes(hook.toLowerCase())) {
        score += 3;
        break;
      }
    }

    // Check for question hook
    if (firstLine.includes('?')) {
      score += 1.5;
    }

    // Check for number hook (e.g., "5 ways to...")
    if (/^\d+/.test(firstLine)) {
      score += 1;
    }

    // Check for emotional hook
    for (const emotion of this.EMOTIONAL_WORDS) {
      if (firstWords.includes(emotion)) {
        score += 0.5;
        break;
      }
    }

    // Penalize weak openings
    const weakOpenings = ['today', 'so', 'just', 'i want to', 'hey everyone'];
    for (const weak of weakOpenings) {
      if (firstWords.startsWith(weak)) {
        score -= 1;
        break;
      }
    }

    return Math.max(0, Math.min(10, score));
  }

  /**
   * Analyze readability (0-10)
   * Checks sentence length, paragraph structure, and mobile readability
   */
  private analyzeReadability(caption: string): number {
    let score = 5; // Base score

    const sentences = caption.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const paragraphs = caption.split('\n\n').filter(p => p.trim().length > 0);
    const lines = caption.split('\n').filter(l => l.trim().length > 0);

    // Check average sentence length
    const avgSentenceLength = sentences.reduce((sum, s) => sum + s.split(' ').length, 0) / sentences.length;
    if (avgSentenceLength >= 10 && avgSentenceLength <= 20) {
      score += 2; // Optimal range
    } else if (avgSentenceLength > 30) {
      score -= 2; // Too long
    }

    // Check paragraph structure
    if (paragraphs.length >= 2 && paragraphs.length <= 5) {
      score += 1.5; // Good structure
    }

    // Check line breaks (mobile readability)
    if (lines.length >= 3) {
      score += 1; // Frequent line breaks are good for mobile
    }

    // Check for overly long single paragraph
    const longestParagraph = Math.max(...paragraphs.map(p => p.length));
    if (longestParagraph > 400) {
      score -= 1.5; // Wall of text
    }

    // Bonus for short, punchy sentences
    const shortSentences = sentences.filter(s => s.split(' ').length <= 8).length;
    if (shortSentences / sentences.length > 0.3) {
      score += 0.5;
    }

    return Math.max(0, Math.min(10, score));
  }

  /**
   * Analyze CTA clarity (0-10)
   * Checks for clear calls-to-action and engagement prompts
   */
  private analyzeCTAClarity(caption: string): number {
    const lowerCaption = caption.toLowerCase();
    let score = 3; // Base score

    // Check for strong CTAs
    let foundCTA = false;
    for (const cta of this.STRONG_CTAS) {
      if (lowerCaption.includes(cta)) {
        score += 3;
        foundCTA = true;
        break;
      }
    }

    // Check for question (implicit CTA)
    if (caption.includes('?')) {
      score += 2;
    }

    // Check for emoji near end (draws attention to CTA)
    const lastLine = caption.split('\n').slice(-1)[0];
    if (/[\u{1F300}-\u{1F9FF}]/u.test(lastLine)) {
      score += 0.5;
    }

    // Bonus for specific, actionable CTAs
    const specificCTAs = ['comment below', 'share this with', 'save this post', 'tag someone'];
    for (const specific of specificCTAs) {
      if (lowerCaption.includes(specific)) {
        score += 1.5;
        break;
      }
    }

    // Penalize if no clear CTA
    if (!foundCTA && !caption.includes('?')) {
      score -= 2;
    }

    return Math.max(0, Math.min(10, score));
  }

  /**
   * Analyze emotional resonance (0-10)
   * Checks for emotional words, personal stories, vulnerability
   */
  private analyzeEmotionalResonance(caption: string): number {
    const lowerCaption = caption.toLowerCase();
    let score = 5; // Base score

    // Count emotional words
    let emotionalWordCount = 0;
    for (const word of this.EMOTIONAL_WORDS) {
      if (lowerCaption.includes(word)) {
        emotionalWordCount++;
      }
    }

    // Add points for emotional words (max 3 points)
    score += Math.min(3, emotionalWordCount * 0.5);

    // Check for personal pronouns (increases relatability)
    const personalPronouns = ['i', 'me', 'my', 'we', 'our'];
    let pronounCount = 0;
    for (const pronoun of personalPronouns) {
      const regex = new RegExp(`\\b${pronoun}\\b`, 'gi');
      const matches = lowerCaption.match(regex);
      if (matches) pronounCount += matches.length;
    }
    
    if (pronounCount >= 3) {
      score += 1.5; // Personal story
    }

    // Check for vulnerability indicators
    const vulnerabilityWords = ['struggle', 'failed', 'learned', 'mistake', 'journey', 'real', 'honest', 'truth'];
    for (const word of vulnerabilityWords) {
      if (lowerCaption.includes(word)) {
        score += 0.5;
        break;
      }
    }

    // Check for specific details (increases authenticity)
    const hasNumbers = /\b\d+\b/.test(caption);
    const hasTimeReference = /yesterday|today|last week|this morning|ago/i.test(caption);
    if (hasNumbers || hasTimeReference) {
      score += 1;
    }

    return Math.max(0, Math.min(10, score));
  }

  /**
   * Analyze length optimality (0-10)
   * Checks if caption length is appropriate for post type
   */
  private analyzeLengthOptimality(caption: string, postType: string): number {
    const wordCount = caption.split(/\s+/).length;
    let score = 5;

    switch (postType) {
      case 'story':
        // Stories: 5-30 words optimal
        if (wordCount >= 5 && wordCount <= 30) {
          score = 10;
        } else if (wordCount < 5) {
          score = 3;
        } else if (wordCount > 50) {
          score = 2;
        }
        break;

      case 'reel':
        // Reels: 50-150 words optimal
        if (wordCount >= 50 && wordCount <= 150) {
          score = 10;
        } else if (wordCount < 30) {
          score = 4;
        } else if (wordCount > 200) {
          score = 3;
        }
        break;

      case 'post':
      default:
        // Feed posts: 100-300 words optimal
        if (wordCount >= 100 && wordCount <= 300) {
          score = 10;
        } else if (wordCount < 50) {
          score = 4;
        } else if (wordCount > 400) {
          score = 3;
        }
        break;
    }

    return score;
  }

  /**
   * Analyze trending topics (0-10)
   * Placeholder for future trending topic analysis
   */
  private analyzeTrendingTopics(caption: string): number {
    // TODO: Implement trending topic detection
    // This would check against a database of trending topics, hashtags, and phrases
    // For now, return a neutral score
    return 5;
  }

  /**
   * Calculate base engagement score from factors
   */
  private calculateBaseScore(factors: {
    hookStrength: number;
    readabilityScore: number;
    ctaClarity: number;
    emotionalResonance: number;
    lengthOptimality: number;
    trendingTopicBonus: number;
  }): number {
    // Weighted average of all factors
    const weights = {
      hookStrength: 0.25,
      readabilityScore: 0.15,
      ctaClarity: 0.20,
      emotionalResonance: 0.20,
      lengthOptimality: 0.10,
      trendingTopicBonus: 0.10,
    };

    return (
      factors.hookStrength * weights.hookStrength +
      factors.readabilityScore * weights.readabilityScore +
      factors.ctaClarity * weights.ctaClarity +
      factors.emotionalResonance * weights.emotionalResonance +
      factors.lengthOptimality * weights.lengthOptimality +
      factors.trendingTopicBonus * weights.trendingTopicBonus
    ) * 10; // Scale to 0-100
  }

  /**
   * Get platform-specific multiplier
   */
  private getPlatformMultiplier(platform: string): number {
    const multipliers: Record<string, number> = {
      instagram: 1.0,
      tiktok: 1.2,   // Higher engagement on TikTok
      twitter: 0.8,  // Lower engagement typically
      linkedin: 0.7, // Professional platform, lower casual engagement
    };

    return multipliers[platform.toLowerCase()] || 1.0;
  }

  /**
   * Get post-type specific adjustment
   */
  private getPostTypeAdjustment(postType: string): number {
    const adjustments: Record<string, number> = {
      reel: 1.3,   // Reels get higher engagement
      story: 0.7,  // Stories get lower engagement but higher reach
      post: 1.0,   // Standard
    };

    return adjustments[postType.toLowerCase()] || 1.0;
  }

  /**
   * Calculate predicted like rate
   */
  private calculateLikeRate(
    baseScore: number,
    platformMultiplier: number,
    postTypeAdjustment: number
  ): number {
    // Like rate typically ranges from 2% to 10% for good content
    const baseLikeRate = 2 + (baseScore / 100) * 8; // 2-10% range
    return Math.round(baseLikeRate * platformMultiplier * postTypeAdjustment * 100) / 100;
  }

  /**
   * Calculate predicted comment rate
   */
  private calculateCommentRate(
    factors: { ctaClarity: number; emotionalResonance: number; hookStrength: number },
    platformMultiplier: number
  ): number {
    // Comment rate is heavily influenced by CTA and emotional resonance
    // Typically 0.5% to 3% for good content
    const ctaWeight = 0.4;
    const emotionWeight = 0.4;
    const hookWeight = 0.2;

    const commentScore =
      factors.ctaClarity * ctaWeight +
      factors.emotionalResonance * emotionWeight +
      factors.hookStrength * hookWeight;

    const baseCommentRate = 0.5 + (commentScore / 10) * 2.5; // 0.5-3% range
    return Math.round(baseCommentRate * platformMultiplier * 100) / 100;
  }

  /**
   * Calculate predicted save rate
   */
  private calculateSaveRate(
    factors: { readabilityScore: number; emotionalResonance: number },
    platformMultiplier: number
  ): number {
    // Save rate is influenced by content value and readability
    // Typically 0.3% to 2% for good content
    const readabilityWeight = 0.5;
    const emotionWeight = 0.5;

    const saveScore =
      factors.readabilityScore * readabilityWeight +
      factors.emotionalResonance * emotionWeight;

    const baseSaveRate = 0.3 + (saveScore / 10) * 1.7; // 0.3-2% range
    return Math.round(baseSaveRate * platformMultiplier * 100) / 100;
  }

  /**
   * Calculate predicted share rate
   */
  private calculateShareRate(
    factors: { emotionalResonance: number; hookStrength: number },
    platformMultiplier: number
  ): number {
    // Share rate is driven by emotional impact and viral potential
    // Typically 0.1% to 1% for good content
    const emotionWeight = 0.6;
    const hookWeight = 0.4;

    const shareScore =
      factors.emotionalResonance * emotionWeight +
      factors.hookStrength * hookWeight;

    const baseShareRate = 0.1 + (shareScore / 10) * 0.9; // 0.1-1% range
    return Math.round(baseShareRate * platformMultiplier * 100) / 100;
  }

  /**
   * Calculate confidence score (0-1)
   * Higher confidence when factors are consistently strong or weak
   */
  private calculateConfidence(factors: {
    hookStrength: number;
    readabilityScore: number;
    ctaClarity: number;
    emotionalResonance: number;
    lengthOptimality: number;
    trendingTopicBonus: number;
  }): number {
    const values = Object.values(factors);
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    
    // Calculate standard deviation
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);

    // Lower standard deviation = higher confidence
    // Map stdDev (0-5) to confidence (0.5-1.0)
    const normalizedStdDev = Math.min(stdDev, 5) / 5; // Normalize to 0-1
    const confidence = 1.0 - (normalizedStdDev * 0.5); // Map to 0.5-1.0 range

    return Math.round(confidence * 100) / 100;
  }

  /**
   * Get historical accuracy score for confidence calibration
   * Returns a score from 0-1 representing how accurate predictions have been
   * Requirements: 9.3, 9.6
   */
  private async getHistoricalAccuracyScore(
    userId: string,
    workspaceId: string
  ): Promise<number> {
    try {
      // Get recent prediction accuracy (last 20 predictions)
      const accuracy = await this.getPredictionAccuracy(userId, workspaceId, 20);
      
      // If no historical data, return neutral score
      if (accuracy.sampleSize === 0) {
        return 0.7; // Default to moderately confident with no history
      }

      // Calculate overall accuracy from individual metrics
      // Weight like rate more heavily as it's most reliable
      const overallAccuracy = (
        accuracy.accuracyByMetric.likeRateAccuracy * 0.4 +
        accuracy.accuracyByMetric.commentRateAccuracy * 0.3 +
        accuracy.accuracyByMetric.saveRateAccuracy * 0.2 +
        accuracy.accuracyByMetric.shareRateAccuracy * 0.1
      ) / 100; // Convert from percentage to 0-1 scale

      // Factor in sample size - need at least 10 samples for reliable calibration
      const sampleSizeWeight = Math.min(accuracy.sampleSize / 10, 1.0);
      
      // Blend default confidence with historical accuracy based on sample size
      const historicalScore = (overallAccuracy * sampleSizeWeight) + (0.7 * (1 - sampleSizeWeight));

      return Math.max(0.3, Math.min(0.95, historicalScore)); // Clamp between 0.3 and 0.95
    } catch (error) {
      this.log('getHistoricalAccuracyScore', 'Error calculating historical accuracy', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return 0.7; // Default to moderate confidence on error
    }
  }

  /**
   * Calibrate base confidence with historical accuracy
   * Combines factor-based confidence with historical prediction accuracy
   * Requirements: 9.3, 9.6
   */
  private calibrateConfidenceWithHistory(
    baseConfidence: number,
    historicalAccuracy: number
  ): number {
    // Blend base confidence (from factors) with historical accuracy
    // Weight historical accuracy more heavily as it's based on real data
    const calibratedConfidence = (baseConfidence * 0.4) + (historicalAccuracy * 0.6);

    // Apply adjustment based on agreement between base and historical
    const agreement = 1 - Math.abs(baseConfidence - historicalAccuracy);
    
    // If base confidence and historical accuracy agree, boost confidence slightly
    // If they disagree, reduce confidence
    const agreementBonus = (agreement - 0.5) * 0.1; // -0.05 to +0.05
    
    const finalConfidence = calibratedConfidence + agreementBonus;

    return Math.round(Math.max(0.3, Math.min(0.95, finalConfidence)) * 100) / 100;
  }

  /**
   * Calculate vs user average percentage
   */
  private calculateVsUserAverage(
    predicted: {
      predictedLikeRate: number;
      predictedCommentRate: number;
      predictedSaveRate: number;
      predictedShareRate: number;
    },
    userAverage: UserAverageMetrics
  ): number {
    // If no user average data, return 0 (neutral)
    if (userAverage.avgLikeRate === 0) {
      return 0;
    }

    // Calculate weighted average difference
    const likeDiff = ((predicted.predictedLikeRate - userAverage.avgLikeRate) / userAverage.avgLikeRate) * 100;
    const commentDiff = userAverage.avgCommentRate > 0 
      ? ((predicted.predictedCommentRate - userAverage.avgCommentRate) / userAverage.avgCommentRate) * 100
      : 0;
    const saveDiff = userAverage.avgSaveRate > 0
      ? ((predicted.predictedSaveRate - userAverage.avgSaveRate) / userAverage.avgSaveRate) * 100
      : 0;

    // Weight like rate more heavily as it's most reliable
    const weightedDiff = (likeDiff * 0.5) + (commentDiff * 0.3) + (saveDiff * 0.2);

    return Math.round(weightedDiff * 10) / 10;
  }

  /**
   * Check if caption performance is below user average and generate improvement flags
   * Requirements: 9.3, 9.6
   */
  private checkPerformanceFlag(
    vsUserAverage: number,
    factors: {
      hookStrength: number;
      readabilityScore: number;
      ctaClarity: number;
      emotionalResonance: number;
      lengthOptimality: number;
      trendingTopicBonus: number;
    },
    caption: string
  ): {
    isBelowAverage: boolean;
    severity: 'none' | 'minor' | 'moderate' | 'major';
    suggestions: string[];
    weakestFactors: Array<{ factor: string; score: number; suggestion: string }>;
  } {
    const suggestions: string[] = [];
    const weakestFactors: Array<{ factor: string; score: number; suggestion: string }> = [];

    // Determine severity based on how far below average
    let severity: 'none' | 'minor' | 'moderate' | 'major' = 'none';
    const isBelowAverage = vsUserAverage < -10; // More than 10% below average

    if (isBelowAverage) {
      if (vsUserAverage < -30) {
        severity = 'major';
      } else if (vsUserAverage < -20) {
        severity = 'moderate';
      } else {
        severity = 'minor';
      }
    }

    // Identify weakest factors (score < 6)
    const factorEntries = Object.entries(factors) as Array<[string, number]>;
    const sortedFactors = factorEntries
      .map(([factor, score]) => ({ factor, score }))
      .sort((a, b) => a.score - b.score);

    // Analyze each weak factor and provide specific suggestions
    for (const { factor, score } of sortedFactors) {
      if (score >= 6) continue; // Only flag weak factors

      let suggestion = '';
      
      switch (factor) {
        case 'hookStrength':
          if (score < 4) {
            suggestion = 'Start with a strong hook like "Hot take:", "POV:", or an intriguing question to stop scrollers';
          } else {
            suggestion = 'Strengthen your opening line - make it more emotionally engaging or controversial';
          }
          weakestFactors.push({ factor: 'Hook Strength', score, suggestion });
          break;

        case 'readabilityScore':
          if (score < 4) {
            suggestion = 'Break caption into shorter paragraphs (1-2 sentences each) with more line breaks for mobile readability';
          } else {
            suggestion = 'Improve sentence flow - mix short punchy sentences with longer ones for better rhythm';
          }
          weakestFactors.push({ factor: 'Readability', score, suggestion });
          break;

        case 'ctaClarity':
          if (score < 4) {
            suggestion = 'Add a clear call-to-action - ask a specific question or tell readers exactly what to do (comment, share, save)';
          } else {
            suggestion = 'Make your CTA more specific - instead of "thoughts?", ask something that prompts detailed responses';
          }
          weakestFactors.push({ factor: 'CTA Clarity', score, suggestion });
          break;

        case 'emotionalResonance':
          if (score < 4) {
            suggestion = 'Add emotional depth - share a personal story, struggle, or vulnerable moment to connect with readers';
          } else {
            suggestion = 'Increase emotional impact - use more vivid emotional words or add specific details (numbers, names, moments)';
          }
          weakestFactors.push({ factor: 'Emotional Resonance', score, suggestion });
          break;

        case 'lengthOptimality':
          if (score < 4) {
            suggestion = 'Adjust caption length - current length is not optimal for this post type';
          } else {
            suggestion = 'Fine-tune caption length to hit the sweet spot for maximum engagement';
          }
          weakestFactors.push({ factor: 'Length', score, suggestion });
          break;

        case 'trendingTopicBonus':
          suggestion = 'Consider incorporating trending topics or viral phrases relevant to your niche';
          weakestFactors.push({ factor: 'Trending Topics', score, suggestion });
          break;
      }
    }

    // Generate overall improvement suggestions based on severity
    if (isBelowAverage) {
      if (severity === 'major') {
        suggestions.push('⚠️ This caption is predicted to perform significantly below your average. Consider regenerating with different parameters.');
      } else if (severity === 'moderate') {
        suggestions.push('⚠️ This caption may underperform compared to your typical posts. Review the suggestions below.');
      } else {
        suggestions.push('💡 This caption could be improved - see specific suggestions below for better performance.');
      }

      // Add top 3 specific suggestions from weakest factors
      weakestFactors.slice(0, 3).forEach(({ suggestion }) => {
        suggestions.push(suggestion);
      });

      // Additional contextual suggestions
      if (factors.hookStrength < 6 && factors.ctaClarity < 6) {
        suggestions.push('Focus on both your opening hook and closing CTA - these are critical for engagement');
      }

      if (factors.emotionalResonance < 5) {
        suggestions.push('Add more personality and authenticity - share your real experience or perspective');
      }

      if (vsUserAverage < -25) {
        suggestions.push('💡 Tip: Review your past high-performing captions and analyze what made them successful');
      }
    }

    return {
      isBelowAverage,
      severity,
      suggestions,
      weakestFactors,
    };
  }

  /**
   * Get user's average performance metrics
   * Requirements: 9.4
   */
  async getUserAverageMetrics(
    userId: string,
    workspaceId: string
  ): Promise<UserAverageMetrics> {
    return this.withErrorHandling('getUserAverageMetrics', async () => {
      this.log('getUserAverageMetrics', 'Fetching user average metrics from database', {
        userId,
        workspaceId,
      });

      try {
        // Query database for user's historical performance
        const averages = await generatedCaptionRepository.calculateAverageMetrics(
          userId,
          workspaceId
        );

        if (averages.sampleSize === 0) {
          // No historical data - return industry baseline defaults
          this.log('getUserAverageMetrics', 'No historical data, using defaults', {
            userId,
            workspaceId,
          });

          return {
            avgLikeRate: 5.0,    // 5% average like rate (industry baseline)
            avgCommentRate: 1.5, // 1.5% average comment rate
            avgSaveRate: 1.0,    // 1% average save rate
            avgShareRate: 0.5,   // 0.5% average share rate
          };
        }

        this.log('getUserAverageMetrics', 'Successfully calculated user averages', {
          userId,
          workspaceId,
          sampleSize: averages.sampleSize,
          avgLikeRate: averages.avgLikeRate,
        });

        return {
          avgLikeRate: averages.avgLikeRate,
          avgCommentRate: averages.avgCommentRate,
          avgSaveRate: averages.avgSaveRate,
          avgShareRate: averages.avgShareRate,
        };
      } catch (error) {
        this.log('getUserAverageMetrics', 'Error fetching metrics, using defaults', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });

        // Fallback to defaults on error
        return {
          avgLikeRate: 5.0,
          avgCommentRate: 1.5,
          avgSaveRate: 1.0,
          avgShareRate: 0.5,
        };
      }
    });
  }

  /**
   * Record actual performance for learning
   * Requirements: 9.5, 9.6
   */
  async recordActualPerformance(
    captionId: string,
    actualMetrics: ActualPerformanceMetrics
  ): Promise<void> {
    return this.withErrorHandling('recordActualPerformance', async () => {
      this.log('recordActualPerformance', 'Recording actual performance metrics', {
        captionId,
        metrics: actualMetrics,
      });

      try {
        // Calculate actual rates
        const actualLikeRate = actualMetrics.impressions > 0
          ? (actualMetrics.likes / actualMetrics.impressions) * 100
          : 0;
        const actualCommentRate = actualMetrics.impressions > 0
          ? (actualMetrics.comments / actualMetrics.impressions) * 100
          : 0;
        const actualSaveRate = actualMetrics.impressions > 0
          ? (actualMetrics.saves / actualMetrics.impressions) * 100
          : 0;
        const actualShareRate = actualMetrics.impressions > 0
          ? (actualMetrics.shares / actualMetrics.impressions) * 100
          : 0;

        this.log('recordActualPerformance', 'Calculated actual rates', {
          actualLikeRate: actualLikeRate.toFixed(2),
          actualCommentRate: actualCommentRate.toFixed(2),
          actualSaveRate: actualSaveRate.toFixed(2),
          actualShareRate: actualShareRate.toFixed(2),
        });

        // Store actual metrics in database
        const updatedCaption = await generatedCaptionRepository.updatePerformanceMetrics(
          captionId,
          actualMetrics
        );

        if (!updatedCaption) {
          this.log('recordActualPerformance', 'Caption not found', { captionId });
          return;
        }

        // Compare predicted vs actual for learning
        const selectedVariation = updatedCaption.selectedVariationIndex !== undefined
          ? updatedCaption.variations[updatedCaption.selectedVariationIndex]
          : updatedCaption.variations[0];

        if (selectedVariation?.engagementPrediction) {
          const prediction = selectedVariation.engagementPrediction;

          // Calculate prediction errors
          const likeRateError = Math.abs(prediction.likeRate - actualLikeRate);
          const commentRateError = Math.abs(prediction.commentRate - actualCommentRate);
          const saveRateError = Math.abs(prediction.saveRate - actualSaveRate);
          const shareRateError = Math.abs(prediction.shareRate - actualShareRate);

          // Calculate average error percentage
          const avgError = (
            (likeRateError / Math.max(actualLikeRate, 0.1)) +
            (commentRateError / Math.max(actualCommentRate, 0.1)) +
            (saveRateError / Math.max(actualSaveRate, 0.1)) +
            (shareRateError / Math.max(actualShareRate, 0.1))
          ) / 4 * 100;

          this.log('recordActualPerformance', 'Prediction accuracy analysis', {
            captionId,
            predictedLikeRate: prediction.likeRate.toFixed(2),
            actualLikeRate: actualLikeRate.toFixed(2),
            likeRateError: likeRateError.toFixed(2),
            avgErrorPercentage: avgError.toFixed(2),
            confidence: prediction.confidence,
          });

          // Learning insights
          const insights = this.generateLearningInsights(
            prediction,
            {
              actualLikeRate,
              actualCommentRate,
              actualSaveRate,
              actualShareRate,
            },
            updatedCaption
          );

          this.log('recordActualPerformance', 'Generated learning insights', {
            captionId,
            insights: insights.slice(0, 3), // Log first 3 insights
          });

          // Learn from prediction errors and update model understanding
          // Requirements: 9.5, 9.6
          await this.learnFromPredictionError(
            captionId,
            prediction,
            {
              actualLikeRate,
              actualCommentRate,
              actualSaveRate,
              actualShareRate,
            },
            selectedVariation,
            userId,
            workspaceId
          );
        }

        this.log('recordActualPerformance', 'Successfully recorded performance', {
          captionId,
        });
      } catch (error) {
        this.log('recordActualPerformance', 'Error recording performance', {
          captionId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        throw error;
      }
    });
  }

  /**
   * Generate learning insights from prediction vs actual comparison
   * Requirements: 9.6
   */
  private generateLearningInsights(
    prediction: {
      likeRate: number;
      commentRate: number;
      saveRate: number;
      shareRate: number;
      confidence: number;
    },
    actual: {
      actualLikeRate: number;
      actualCommentRate: number;
      actualSaveRate: number;
      actualShareRate: number;
    },
    caption: any
  ): string[] {
    const insights: string[] = [];

    // Like rate insights
    const likeDiff = actual.actualLikeRate - prediction.likeRate;
    if (Math.abs(likeDiff) > 1.0) {
      if (likeDiff > 0) {
        insights.push(`Like rate exceeded prediction by ${likeDiff.toFixed(1)}% - caption performed better than expected`);
      } else {
        insights.push(`Like rate below prediction by ${Math.abs(likeDiff).toFixed(1)}% - consider stronger hooks`);
      }
    }

    // Comment rate insights
    const commentDiff = actual.actualCommentRate - prediction.commentRate;
    if (Math.abs(commentDiff) > 0.5) {
      if (commentDiff > 0) {
        insights.push(`Comment rate exceeded prediction by ${commentDiff.toFixed(2)}% - strong CTA performance`);
      } else {
        insights.push(`Comment rate below prediction by ${Math.abs(commentDiff).toFixed(2)}% - CTA could be clearer`);
      }
    }

    // Save rate insights
    const saveDiff = actual.actualSaveRate - prediction.saveRate;
    if (Math.abs(saveDiff) > 0.3) {
      if (saveDiff > 0) {
        insights.push(`Save rate exceeded prediction by ${saveDiff.toFixed(2)}% - high-value content`);
      } else {
        insights.push(`Save rate below prediction by ${Math.abs(saveDiff).toFixed(2)}% - content utility unclear`);
      }
    }

    // Confidence calibration
    if (prediction.confidence > 0.8 && Math.abs(likeDiff) > 2.0) {
      insights.push(`High confidence prediction was off - model may need recalibration`);
    }

    // Pattern performance (if available)
    if (caption.variations && caption.selectedVariationIndex !== undefined) {
      const selectedVariation = caption.variations[caption.selectedVariationIndex];
      if (selectedVariation.usedPatterns && selectedVariation.usedPatterns.length > 0) {
        if (actual.actualLikeRate > prediction.likeRate) {
          insights.push(`Patterns ${selectedVariation.usedPatterns.join(', ')} performed well`);
        } else if (actual.actualLikeRate < prediction.likeRate - 1.0) {
          insights.push(`Patterns ${selectedVariation.usedPatterns.join(', ')} underperformed`);
        }
      }
    }

    // Overall performance
    const totalEngagement = actual.actualLikeRate + actual.actualCommentRate + 
                           actual.actualSaveRate + actual.actualShareRate;
    const predictedTotal = prediction.likeRate + prediction.commentRate + 
                          prediction.saveRate + prediction.shareRate;
    
    if (totalEngagement > predictedTotal * 1.2) {
      insights.push(`Overall engagement 20%+ above prediction - caption was a hit!`);
    } else if (totalEngagement < predictedTotal * 0.8) {
      insights.push(`Overall engagement 20%+ below prediction - review caption strategy`);
    }

    return insights;
  }

  /**
   * Learn from prediction errors to improve future predictions
   * Analyzes which factors had the highest impact on actual performance
   * and stores learning data for model improvement
   * Requirements: 9.5, 9.6
   */
  private async learnFromPredictionError(
    captionId: string,
    prediction: {
      likeRate: number;
      commentRate: number;
      saveRate: number;
      shareRate: number;
      confidence: number;
    },
    actual: {
      actualLikeRate: number;
      actualCommentRate: number;
      actualSaveRate: number;
      actualShareRate: number;
    },
    captionVariation: any,
    userId: string,
    workspaceId: string
  ): Promise<void> {
    try {
      this.log('learnFromPredictionError', 'Analyzing prediction error', {
        captionId,
        userId,
        workspaceId,
      });

      // Calculate prediction errors
      const likeRateError = Math.abs(prediction.likeRate - actual.actualLikeRate);
      const commentRateError = Math.abs(prediction.commentRate - actual.actualCommentRate);
      const saveRateError = Math.abs(prediction.saveRate - actual.actualSaveRate);
      const shareRateError = Math.abs(prediction.shareRate - actual.actualShareRate);

      // Calculate relative errors (percentage of actual value)
      const relativeLikeError = actual.actualLikeRate > 0 
        ? (likeRateError / actual.actualLikeRate) * 100 
        : 0;
      const relativeCommentError = actual.actualCommentRate > 0 
        ? (commentRateError / actual.actualCommentRate) * 100 
        : 0;

      // Identify if this was a major miss
      const isMajorMiss = relativeLikeError > 50 || likeRateError > 3.0;

      // Extract factor analysis from caption variation
      if (captionVariation.engagementPrediction?.factors) {
        const factors = captionVariation.engagementPrediction.factors;

        // Analyze which factors were overestimated or underestimated
        const factorImpactAnalysis = this.analyzeFactorImpact(
          factors,
          prediction,
          actual
        );

        this.log('learnFromPredictionError', 'Factor impact analysis', {
          captionId,
          factorImpactAnalysis,
          isMajorMiss,
        });

        // Store learning insights for future model calibration
        // In a production system, this would:
        // 1. Store factor impact data in a learning database
        // 2. Periodically retrain model weights based on accumulated learnings
        // 3. Adjust prediction algorithms for specific user segments
        // 4. Update pattern performance scores
        
        // For now, we log the insights for monitoring
        if (isMajorMiss) {
          this.log('learnFromPredictionError', 'MAJOR PREDICTION MISS DETECTED', {
            captionId,
            predictedLikeRate: prediction.likeRate,
            actualLikeRate: actual.actualLikeRate,
            error: likeRateError,
            relativeError: `${relativeLikeError.toFixed(1)}%`,
            factors,
          });
        }

        // Update pattern performance if patterns were used
        if (captionVariation.usedPatterns && captionVariation.usedPatterns.length > 0) {
          await this.updatePatternPerformance(
            captionVariation.usedPatterns,
            actual,
            prediction
          );
        }
      }

      this.log('learnFromPredictionError', 'Learning analysis completed', {
        captionId,
      });
    } catch (error) {
      this.log('learnFromPredictionError', 'Error during learning analysis', {
        captionId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      // Don't throw - learning is secondary to recording performance
    }
  }

  /**
   * Analyze which factors were most impactful on actual performance
   * Compares factor scores with actual engagement to understand
   * which factors were correctly weighted and which need adjustment
   * Requirements: 9.6
   */
  private analyzeFactorImpact(
    factors: {
      hookStrength: number;
      readabilityScore: number;
      ctaClarity: number;
      emotionalResonance: number;
      lengthOptimality: number;
      trendingTopicBonus: number;
    },
    prediction: {
      likeRate: number;
      commentRate: number;
      saveRate: number;
      shareRate: number;
    },
    actual: {
      actualLikeRate: number;
      actualCommentRate: number;
      actualSaveRate: number;
      actualShareRate: number;
    }
  ): {
    overestimatedFactors: string[];
    underestimatedFactors: string[];
    accurateFactors: string[];
    dominantFactor: string;
  } {
    const overestimated: string[] = [];
    const underestimated: string[] = [];
    const accurate: string[] = [];

    // Overall performance direction
    const overperformed = actual.actualLikeRate > prediction.likeRate;
    const performanceGap = Math.abs(actual.actualLikeRate - prediction.likeRate);

    // Only analyze if there's a significant gap (> 1%)
    if (performanceGap > 1.0) {
      // Analyze hook strength impact
      if (factors.hookStrength < 5 && overperformed) {
        underestimated.push('hookStrength');
      } else if (factors.hookStrength > 7 && !overperformed) {
        overestimated.push('hookStrength');
      } else {
        accurate.push('hookStrength');
      }

      // Analyze CTA clarity impact (primarily affects comments)
      const commentPerformance = actual.actualCommentRate - prediction.commentRate;
      if (factors.ctaClarity < 5 && commentPerformance > 0.5) {
        underestimated.push('ctaClarity');
      } else if (factors.ctaClarity > 7 && commentPerformance < -0.5) {
        overestimated.push('ctaClarity');
      } else {
        accurate.push('ctaClarity');
      }

      // Analyze emotional resonance (affects all metrics)
      if (factors.emotionalResonance < 5 && overperformed) {
        underestimated.push('emotionalResonance');
      } else if (factors.emotionalResonance > 7 && !overperformed) {
        overestimated.push('emotionalResonance');
      } else {
        accurate.push('emotionalResonance');
      }

      // Analyze readability (affects saves)
      const savePerformance = actual.actualSaveRate - prediction.saveRate;
      if (factors.readabilityScore < 5 && savePerformance > 0.3) {
        underestimated.push('readabilityScore');
      } else if (factors.readabilityScore > 7 && savePerformance < -0.3) {
        overestimated.push('readabilityScore');
      } else {
        accurate.push('readabilityScore');
      }
    }

    // Find dominant factor (highest score that aligns with performance)
    const factorScores = Object.entries(factors) as Array<[string, number]>;
    const sortedFactors = factorScores.sort((a, b) => b[1] - a[1]);
    const dominantFactor = sortedFactors[0][0];

    return {
      overestimatedFactors: overestimated,
      underestimatedFactors: underestimated,
      accurateFactors: accurate,
      dominantFactor,
    };
  }

  /**
   * Update pattern performance based on actual results
   * Records how well patterns performed to improve future pattern selection
   * Requirements: 9.6
   */
  private async updatePatternPerformance(
    patternIds: string[],
    actual: {
      actualLikeRate: number;
      actualCommentRate: number;
      actualSaveRate: number;
      actualShareRate: number;
    },
    predicted: {
      likeRate: number;
      commentRate: number;
      saveRate: number;
      shareRate: number;
    }
  ): Promise<void> {
    try {
      // Calculate overall engagement for both actual and predicted
      const actualTotalEngagement = 
        actual.actualLikeRate + actual.actualCommentRate + 
        actual.actualSaveRate + actual.actualShareRate;
      
      const predictedTotalEngagement = 
        predicted.likeRate + predicted.commentRate + 
        predicted.saveRate + predicted.shareRate;

      // Determine if patterns performed well
      const performanceRatio = predictedTotalEngagement > 0
        ? actualTotalEngagement / predictedTotalEngagement
        : 1.0;

      const performedWell = performanceRatio >= 0.9; // Within 10% or better

      this.log('updatePatternPerformance', 'Pattern performance evaluation', {
        patternIds,
        actualEngagement: actualTotalEngagement.toFixed(2),
        predictedEngagement: predictedTotalEngagement.toFixed(2),
        performanceRatio: performanceRatio.toFixed(2),
        performedWell,
      });

      // TODO: In production, this would update the viralpatterns collection
      // For each pattern in patternIds:
      // 1. Increment usageCount
      // 2. Update avgEngagementRate with rolling average
      // 3. Update successRate based on performedWell
      // 4. Update trending flag if recent performance is high
      
      // This requires ViralPatternService integration which would be:
      // await viralPatternService.updatePatternPerformance(patternId, actualEngagement);
      
    } catch (error) {
      this.log('updatePatternPerformance', 'Error updating pattern performance', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      // Don't throw - this is a learning enhancement
    }
  }

  /**
   * Compare multiple caption variations and rank them by predicted engagement
   * Requirements: 9.3
   */
  async compareVariations(
    variations: Array<{
      caption: string;
      prediction: EngagementPrediction;
    }>,
    rankingStrategy: 'overall' | 'likes' | 'comments' | 'saves' | 'balanced' = 'balanced'
  ): Promise<Array<{
    index: number;
    caption: string;
    prediction: EngagementPrediction;
    overallScore: number;
    rank: number;
    strengths: string[];
    weaknesses: string[];
  }>> {
    return this.withErrorHandling('compareVariations', async () => {
      this.log('compareVariations', 'Comparing caption variations', {
        variationCount: variations.length,
        rankingStrategy,
      });

      const scored = variations.map((variation, index) => {
        const prediction = variation.prediction;
        
        // Calculate overall engagement score based on strategy
        let overallScore = 0;
        
        switch (rankingStrategy) {
          case 'likes':
            overallScore = prediction.predictedLikeRate * 10;
            break;
          case 'comments':
            overallScore = prediction.predictedCommentRate * 20; // Weight comments higher
            break;
          case 'saves':
            overallScore = prediction.predictedSaveRate * 25; // Weight saves highest
            break;
          case 'overall':
            // Sum all metrics
            overallScore = 
              prediction.predictedLikeRate +
              prediction.predictedCommentRate * 2 +
              prediction.predictedSaveRate * 3 +
              prediction.predictedShareRate * 4;
            break;
          case 'balanced':
          default:
            // Weighted combination considering all factors and confidence
            overallScore = (
              prediction.predictedLikeRate * 0.3 +
              prediction.predictedCommentRate * 0.25 +
              prediction.predictedSaveRate * 0.25 +
              prediction.predictedShareRate * 0.2
            ) * 10 * prediction.confidence;
            break;
        }

        // Identify strengths (factors >= 7)
        const strengths: string[] = [];
        const weaknesses: string[] = [];
        
        Object.entries(prediction.factors).forEach(([factor, score]) => {
          const factorName = this.formatFactorName(factor);
          if (score >= 7) {
            strengths.push(`Strong ${factorName}`);
          } else if (score < 5) {
            weaknesses.push(`Weak ${factorName}`);
          }
        });

        // Add performance comparison as strength/weakness
        if (prediction.vsUserAverage > 10) {
          strengths.push(`${Math.round(prediction.vsUserAverage)}% above your average`);
        } else if (prediction.vsUserAverage < -10) {
          weaknesses.push(`${Math.abs(Math.round(prediction.vsUserAverage))}% below your average`);
        }

        return {
          index,
          caption: variation.caption,
          prediction,
          overallScore,
          rank: 0, // Will be assigned after sorting
          strengths,
          weaknesses,
        };
      });

      // Sort by overall score (highest first)
      scored.sort((a, b) => b.overallScore - a.overallScore);

      // Assign ranks
      scored.forEach((item, idx) => {
        item.rank = idx + 1;
      });

      this.log('compareVariations', 'Variations ranked successfully', {
        topScore: scored[0].overallScore.toFixed(2),
        topVariationIndex: scored[0].index,
      });

      return scored;
    });
  }

  /**
   * Format factor name for display
   */
  private formatFactorName(factor: string): string {
    const names: Record<string, string> = {
      hookStrength: 'Hook',
      readabilityScore: 'Readability',
      ctaClarity: 'Call-to-Action',
      emotionalResonance: 'Emotional Impact',
      lengthOptimality: 'Length',
      trendingTopicBonus: 'Trending Topics',
    };
    return names[factor] || factor;
  }

  /**
   * Get prediction accuracy statistics for a user
   * Used to track model improvement over time
   * Requirements: 9.5, 9.6
   */
  async getPredictionAccuracy(
    userId: string,
    workspaceId: string,
    limit: number = 50
  ): Promise<{
    averageError: number;
    sampleSize: number;
    accuracyByMetric: {
      likeRateAccuracy: number;
      commentRateAccuracy: number;
      saveRateAccuracy: number;
      shareRateAccuracy: number;
    };
    confidenceCalibration: number;
  }> {
    return this.withErrorHandling('getPredictionAccuracy', async () => {
      this.log('getPredictionAccuracy', 'Calculating prediction accuracy', {
        userId,
        workspaceId,
        limit,
      });

      try {
        // Get captions with both predictions and actual metrics
        const captions = await generatedCaptionRepository.findWithPredictionAccuracy(
          userId,
          workspaceId,
          limit
        );

        if (captions.length === 0) {
          this.log('getPredictionAccuracy', 'No data available for accuracy calculation', {
            userId,
            workspaceId,
          });

          return {
            averageError: 0,
            sampleSize: 0,
            accuracyByMetric: {
              likeRateAccuracy: 0,
              commentRateAccuracy: 0,
              saveRateAccuracy: 0,
              shareRateAccuracy: 0,
            },
            confidenceCalibration: 0,
          };
        }

        let totalLikeError = 0;
        let totalCommentError = 0;
        let totalSaveError = 0;
        let totalShareError = 0;
        let totalConfidenceError = 0;

        for (const caption of captions) {
          if (!caption.actualMetrics || caption.actualMetrics.impressions === 0) {
            continue;
          }

          const selectedVariation = caption.selectedVariationIndex !== undefined
            ? caption.variations[caption.selectedVariationIndex]
            : caption.variations[0];

          if (!selectedVariation?.engagementPrediction) {
            continue;
          }

          const prediction = selectedVariation.engagementPrediction;
          const impressions = caption.actualMetrics.impressions;

          // Calculate actual rates
          const actualLikeRate = (caption.actualMetrics.likes / impressions) * 100;
          const actualCommentRate = (caption.actualMetrics.comments / impressions) * 100;
          const actualSaveRate = (caption.actualMetrics.saves / impressions) * 100;
          const actualShareRate = (caption.actualMetrics.shares / impressions) * 100;

          // Calculate errors (percentage point differences)
          totalLikeError += Math.abs(prediction.likeRate - actualLikeRate);
          totalCommentError += Math.abs(prediction.commentRate - actualCommentRate);
          totalSaveError += Math.abs(prediction.saveRate - actualSaveRate);
          totalShareError += Math.abs(prediction.shareRate - actualShareRate);

          // Confidence calibration: high confidence should mean low error
          const combinedError = (
            Math.abs(prediction.likeRate - actualLikeRate) +
            Math.abs(prediction.commentRate - actualCommentRate)
          ) / 2;
          
          // If confidence is high but error is also high, that's a calibration issue
          if (prediction.confidence > 0.8 && combinedError > 2.0) {
            totalConfidenceError += 1;
          }
        }

        const sampleSize = captions.length;
        const avgLikeError = totalLikeError / sampleSize;
        const avgCommentError = totalCommentError / sampleSize;
        const avgSaveError = totalSaveError / sampleSize;
        const avgShareError = totalShareError / sampleSize;

        const averageError = (avgLikeError + avgCommentError + avgSaveError + avgShareError) / 4;

        // Calculate accuracy percentages (100% - error%)
        const likeRateAccuracy = Math.max(0, 100 - avgLikeError * 10); // Scale error to percentage
        const commentRateAccuracy = Math.max(0, 100 - avgCommentError * 20);
        const saveRateAccuracy = Math.max(0, 100 - avgSaveError * 25);
        const shareRateAccuracy = Math.max(0, 100 - avgShareError * 50);

        // Confidence calibration: lower is better (% of high-confidence predictions that were wrong)
        const confidenceCalibration = (totalConfidenceError / sampleSize) * 100;

        this.log('getPredictionAccuracy', 'Accuracy calculated successfully', {
          userId,
          workspaceId,
          sampleSize,
          averageError: averageError.toFixed(2),
          likeRateAccuracy: likeRateAccuracy.toFixed(1),
        });

        return {
          averageError: Math.round(averageError * 100) / 100,
          sampleSize,
          accuracyByMetric: {
            likeRateAccuracy: Math.round(likeRateAccuracy * 10) / 10,
            commentRateAccuracy: Math.round(commentRateAccuracy * 10) / 10,
            saveRateAccuracy: Math.round(saveRateAccuracy * 10) / 10,
            shareRateAccuracy: Math.round(shareRateAccuracy * 10) / 10,
          },
          confidenceCalibration: Math.round(confidenceCalibration * 10) / 10,
        };
      } catch (error) {
        this.log('getPredictionAccuracy', 'Error calculating accuracy', {
          userId,
          workspaceId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });

        return {
          averageError: 0,
          sampleSize: 0,
          accuracyByMetric: {
            likeRateAccuracy: 0,
            commentRateAccuracy: 0,
            saveRateAccuracy: 0,
            shareRateAccuracy: 0,
          },
          confidenceCalibration: 0,
        };
      }
    });
  }
}

// Export singleton instance
export const engagementPredictor = new EngagementPredictor();
