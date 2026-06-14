import { Response } from 'express';
import { AuthenticatedRequest } from '../../../types/express';
import { AIServiceManager } from '../../../services/AIServiceManager';
import { AICreditService } from '../../../services/AICreditService';
import { storage } from '../../../mongodb-storage';
import { hashtagGeneratorService } from '../../../services/HashtagGeneratorService';
import { performanceCorrelationService } from '../../../services/PerformanceCorrelationService';
import { generatedCaptionRepository } from '../../../repositories/GeneratedCaptionRepository';
import { generateCompetitorAnalysis } from '../../../competitor-analysis-ai';

/**
 * Caption Analysis Controller
 * 
 * Handles HTTP request/response for AI caption generation and analysis endpoints.
 * Delegates business logic to AIServiceManager, HashtagGeneratorService, and other services.
 * 
 * Requirements: 4.1, 4.2, 4.4
 */
export class CaptionAnalysisController {
  private aiServiceManager: AIServiceManager;

  constructor() {
    this.aiServiceManager = AIServiceManager.getInstance();
  }

  /**
   * Get AI preferences from user and workspace
   */
  private async getAIPreferences(userId: string, req: AuthenticatedRequest): Promise<any> {
    let preferences: any = {};
    
    try {
      const userObj = await storage.getUser(userId);
      if (userObj && userObj.preferences) {
        preferences = { ...userObj.preferences };
      }
    } catch (e) {
      console.warn('[CaptionAnalysisController] Failed to load user preferences', e);
    }
    
    const workspaceId = req.body.workspaceId || req.query.workspaceId || req.headers['workspace-id'];
    if (workspaceId) {
      try {
        const workspace = await storage.getWorkspace(workspaceId as string);
        if (workspace && workspace.aiConfiguration) {
          preferences = { ...preferences, ...workspace.aiConfiguration };
        }
      } catch (e) {
        console.warn('[CaptionAnalysisController] Failed to load workspace AI configuration', e);
      }
    }
    
    return preferences;
  }

  /**
   * Validate workspace access for the user
   */
  private async validateWorkspaceAccess(workspaceId: string, userId: string): Promise<boolean> {
    try {
      const workspace = await storage.getWorkspace(workspaceId);
      if (!workspace) {
        return false;
      }
      
      const user = await storage.getUser(userId);
      const workspaceUserId = workspace.userId?.toString();
      const requestUserId = userId.toString();
      const firebaseUid = user?.firebaseUid;
      
      return workspaceUserId === requestUserId || 
             workspaceUserId === firebaseUid ||
             workspace.userId === userId ||
             workspace.userId === firebaseUid;
    } catch (error) {
      console.error('[CaptionAnalysisController] Workspace validation error:', error);
      return false;
    }
  }

  /**
   * Generate Instagram caption with authenticity scoring
   * POST /api/v1/ai/generate-caption
   */
  async generateCaption(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { title, type, platform, mediaUrl, workspaceId, existingCaption } = req.body;
      const userId = req.user.id;
      
      if (!title && !mediaUrl) {
        res.status(400).json({ error: 'Title or media URL is required' });
        return;
      }

      const creditCost = AICreditService.calculateCost('content_generation');
      const creditCheck = await AICreditService.checkCredits(userId, creditCost);
      if (!creditCheck.hasCredits) {
        res.status(402).json({ 
          error: 'Insufficient credits',
          required: creditCost,
          current: creditCheck.currentCredits
        });
        return;
      }

      const finalWorkspaceId = workspaceId || req.headers['workspace-id'] as string;
      
      if (finalWorkspaceId) {
        const hasAccess = await this.validateWorkspaceAccess(finalWorkspaceId, userId);
        if (!hasAccess) {
          res.status(403).json({ error: 'Access denied to workspace' });
          return;
        }
      }

      console.log('[CaptionAnalysisController] Generating Instagram captions for user:', userId, {
        workspaceId: finalWorkspaceId,
        platform,
        type,
        hasExistingCaption: !!existingCaption
      });

      const preferences = await this.getAIPreferences(userId, req);

      // Delegate to AIServiceManager
      const variations = await this.aiServiceManager.generateInstagramCaptions({
        userId,
        workspaceId: finalWorkspaceId || userId,
        topic: title || 'Content based on uploaded media',
        mediaAnalysis: mediaUrl ? `Media URL: ${mediaUrl}` : undefined,
        existingCaption,
        postType: (type === 'story' || type === 'reel') ? type : 'post',
        platform: platform || 'Instagram',
        preferences
      });

      // Generate hashtags for each variation
      const variationsWithHashtags = await Promise.all(
        variations.map(async (variation) => {
          try {
            const hashtagResult = await hashtagGeneratorService.generateStrategicHashtags({
              caption: variation.caption,
              mediaAnalysis: mediaUrl ? `Media URL: ${mediaUrl}` : undefined,
              niche: preferences.contentNiche || 'general',
              postType: (type === 'story' || type === 'reel') ? type as 'post' | 'story' | 'reel' : 'post',
              platform: platform || 'Instagram',
              userId,
              workspaceId: finalWorkspaceId
            });

            return {
              caption: variation.caption,
              hashtags: hashtagResult.hashtags,
              style: variation.style,
              styleDescription: variation.styleDescription,
              authenticityScore: variation.authenticityScore?.overallScore || 0,
              authenticityDetails: variation.authenticityScore ? {
                criteriaScores: variation.authenticityScore.criteriaScores,
                aiTellsDetected: variation.authenticityScore.aiTellsDetected,
                recommendations: variation.authenticityScore.recommendations,
                passesThreshold: variation.authenticityScore.passesThreshold
              } : undefined,
              engagementPrediction: variation.engagementPrediction ? {
                predictedLikeRate: variation.engagementPrediction.predictedLikeRate,
                predictedCommentRate: variation.engagementPrediction.predictedCommentRate,
                predictedSaveRate: variation.engagementPrediction.predictedSaveRate,
                predictedShareRate: variation.engagementPrediction.predictedShareRate,
                confidence: variation.engagementPrediction.confidence,
                factors: variation.engagementPrediction.factors,
                vsUserAverage: variation.engagementPrediction.vsUserAverage
              } : undefined,
              usedPatterns: [],
              usedHooks: []
            };
          } catch (error) {
            console.error('[CaptionAnalysisController] Hashtag generation failed:', error);
            return {
              caption: variation.caption,
              hashtags: [],
              style: variation.style,
              styleDescription: variation.styleDescription,
              authenticityScore: variation.authenticityScore?.overallScore || 0,
              authenticityDetails: variation.authenticityScore ? {
                criteriaScores: variation.authenticityScore.criteriaScores,
                aiTellsDetected: variation.authenticityScore.aiTellsDetected,
                recommendations: variation.authenticityScore.recommendations,
                passesThreshold: variation.authenticityScore.passesThreshold
              } : undefined,
              engagementPrediction: variation.engagementPrediction ? {
                predictedLikeRate: variation.engagementPrediction.predictedLikeRate,
                predictedCommentRate: variation.engagementPrediction.predictedCommentRate,
                predictedSaveRate: variation.engagementPrediction.predictedSaveRate,
                predictedShareRate: variation.engagementPrediction.predictedShareRate,
                confidence: variation.engagementPrediction.confidence,
                factors: variation.engagementPrediction.factors,
                vsUserAverage: variation.engagementPrediction.vsUserAverage
              } : undefined,
              usedPatterns: [],
              usedHooks: []
            };
          }
        })
      );

      const deductResult = await AICreditService.deductCredits(userId, 'content_generation', {
        creditsToDeduct: creditCost,
        workspaceId: finalWorkspaceId,
        endpoint: '/api/v1/ai/generate-caption'
      });

      if (!deductResult.success) {
        console.error('[CaptionAnalysisController] Credit deduction failed:', deductResult.error);
        res.status(402).json({ error: deductResult.error || 'Failed to deduct credits' });
        return;
      }

      console.log('[CaptionAnalysisController] Caption variations generated successfully', {
        variationCount: variationsWithHashtags.length,
        avgAuthenticityScore: variationsWithHashtags.reduce((sum, v) => sum + v.authenticityScore, 0) / variationsWithHashtags.length,
        creditsUsed: deductResult.creditsDeducted
      });

      res.json({ 
        variations: variationsWithHashtags,
        creditsUsed: deductResult.creditsDeducted,
        remainingCredits: deductResult.creditsAfter,
        caption: variationsWithHashtags[0]?.caption || '',
        hashtags: variationsWithHashtags[0]?.hashtags || []
      });

    } catch (error: any) {
      console.error('[CaptionAnalysisController] Caption generation failed:', error);
      res.status(500).json({ error: 'Failed to generate caption', details: error.message });
    }
  }

  /**
   * Regenerate specific caption variation with adjustments
   * POST /api/v1/ai/regenerate-captions
   */
  async regenerateCaptions(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { workspaceId, postDetails, variationIndex, adjustments } = req.body;
      const userId = req.user.id;

      const creditCost = AICreditService.calculateCost('content_generation');
      const creditCheck = await AICreditService.checkCredits(userId, creditCost);
      if (!creditCheck.hasCredits) {
        res.status(402).json({ 
          error: 'Insufficient credits',
          required: creditCost,
          current: creditCheck.currentCredits
        });
        return;
      }

      const hasAccess = await this.validateWorkspaceAccess(workspaceId, userId);
      if (!hasAccess) {
        res.status(403).json({ error: 'Access denied to workspace' });
        return;
      }

      console.log('[CaptionAnalysisController] Regenerating captions for user:', userId, {
        variationIndex,
        hasAdjustments: !!adjustments
      });

      const preferences = await this.getAIPreferences(userId, req);
      
      // Apply adjustments to preferences
      const adjustedPreferences = { ...preferences };
      if (adjustments) {
        if (adjustments.tone) adjustedPreferences.captionStyle = adjustments.tone;
        if (adjustments.hashtagStrategy) adjustedPreferences.hashtagStrategy = adjustments.hashtagStrategy;
        if (adjustments.emphasize) adjustedPreferences.emphasize = adjustments.emphasize;
      }

      let regenerationContext = postDetails.existingCaption 
        ? `Previous caption (variation ${variationIndex}): ${postDetails.existingCaption}\n\n`
        : '';
      
      if (adjustments?.emphasize) {
        regenerationContext += `IMPORTANT: Emphasize the following: ${adjustments.emphasize}\n\n`;
      }
      
      if (adjustments?.tone) {
        regenerationContext += `Use a ${adjustments.tone} tone.\n\n`;
      }

      const variations = await this.aiServiceManager.generateInstagramCaptions({
        userId,
        workspaceId,
        topic: postDetails.title || 'Content based on uploaded media',
        mediaAnalysis: postDetails.mediaUrl 
          ? `${regenerationContext}Media URL: ${postDetails.mediaUrl}` 
          : regenerationContext || undefined,
        existingCaption: postDetails.existingCaption,
        postType: (postDetails.type === 'story' || postDetails.type === 'reel') 
          ? postDetails.type as 'post' | 'story' | 'reel'
          : 'post',
        platform: postDetails.platform || 'Instagram',
        preferences: adjustedPreferences
      });

      const validVariations = variations.filter(v => 
        v.authenticityScore && v.authenticityScore.passesThreshold
      );

      if (validVariations.length === 0) {
        res.status(500).json({ 
          error: 'Failed to generate captions meeting authenticity standards'
        });
        return;
      }

      const variationsWithHashtags = await Promise.all(
        validVariations.map(async (variation) => {
          const hashtagResult = await hashtagGeneratorService.generateStrategicHashtags({
            caption: variation.caption,
            mediaAnalysis: postDetails.mediaUrl ? `Media URL: ${postDetails.mediaUrl}` : undefined,
            niche: preferences.contentNiche || 'general',
            postType: (postDetails.type === 'story' || postDetails.type === 'reel') ? postDetails.type as 'post' | 'story' | 'reel' : 'post',
            platform: postDetails.platform || 'Instagram',
            userId,
            workspaceId
          });

          return {
            caption: variation.caption,
            hashtags: hashtagResult.hashtags,
            style: variation.style,
            styleDescription: variation.styleDescription,
            authenticityScore: variation.authenticityScore?.overallScore || 0,
            authenticityDetails: variation.authenticityScore,
            engagementPrediction: variation.engagementPrediction,
            usedPatterns: [],
            usedHooks: []
          };
        })
      );

      const deductResult = await AICreditService.deductCredits(userId, 'content_generation', {
        creditsToDeduct: creditCost,
        workspaceId,
        endpoint: '/api/v1/ai/regenerate-captions'
      });

      if (!deductResult.success) {
        res.status(402).json({ error: deductResult.error || 'Failed to deduct credits' });
        return;
      }

      res.json({
        variations: variationsWithHashtags,
        creditsUsed: deductResult.creditsDeducted,
        remainingCredits: deductResult.creditsAfter
      });

    } catch (error: any) {
      console.error('[CaptionAnalysisController] Regenerate captions failed:', error);
      res.status(500).json({ error: 'Failed to regenerate captions', details: error.message });
    }
  }

  /**
   * Generate hashtags for content
   * POST /api/v1/ai/generate-hashtags
   */
  async generateHashtags(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { title, description, type, platform } = req.body;
      const userId = req.user.id;

      const creditCost = AICreditService.calculateCost('content_generation');
      const creditCheck = await AICreditService.checkCredits(userId, creditCost);
      if (!creditCheck.hasCredits) {
        res.status(402).json({ 
          error: 'Insufficient credits',
          required: creditCost,
          current: creditCheck.currentCredits
        });
        return;
      }

      console.log('[CaptionAnalysisController] Generating hashtags for user:', userId);

      const content = `${title || ''} ${description || ''}`.trim();
      const preferences = await this.getAIPreferences(userId, req);

      const hashtagResult = await hashtagGeneratorService.generateStrategicHashtags({
        caption: content,
        niche: preferences.contentNiche || 'general',
        postType: type as 'post' | 'story' | 'reel' || 'post',
        platform: platform || 'Instagram',
        userId
      });

      const deductResult = await AICreditService.deductCredits(userId, 'content_generation', {
        creditsToDeduct: creditCost,
        endpoint: '/api/v1/ai/generate-hashtags'
      });

      if (!deductResult.success) {
        res.status(402).json({ error: deductResult.error || 'Failed to deduct credits' });
        return;
      }

      res.json({
        success: true,
        hashtags: hashtagResult.hashtags,
        creditsUsed: deductResult.creditsDeducted,
        remainingCredits: deductResult.creditsAfter
      });

    } catch (error: any) {
      console.error('[CaptionAnalysisController] Hashtag generation failed:', error);
      res.status(500).json({ error: 'Failed to generate hashtags' });
    }
  }

  /**
   * Analyze competitor content
   * POST /api/v1/ai/competitor-analysis
   */
  async analyzeCompetitor(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user.id;
      const creditCost = AICreditService.calculateCost('competitor_analysis');
      
      const creditCheck = await AICreditService.checkCredits(userId, creditCost);
      if (!creditCheck.hasCredits) {
        res.status(402).json({ 
          error: 'Insufficient credits',
          required: creditCost,
          current: creditCheck.currentCredits
        });
        return;
      }

      const { competitorUsername, platform, analysisType, workspaceId } = req.body;

      console.log('[CaptionAnalysisController] Analyzing competitor for user:', userId);

      const analysisResult = await generateCompetitorAnalysis({
        competitorUsername,
        platform,
        analysisType: analysisType || 'full_profile'
      });

      const competitorAnalysis = await storage.createCompetitorAnalysis({
        workspaceId: workspaceId || undefined,
        userId,
        competitorUsername,
        platform,
        analysisType: analysisType || 'full_profile',
        scrapedData: {
          timestamp: new Date().toISOString(),
          platform,
          username: competitorUsername
        },
        analysisResults: analysisResult.analysisResults,
        topPerformingPosts: analysisResult.topPerformingPosts,
        contentPatterns: analysisResult.contentPatterns,
        hashtags: analysisResult.analysisResults.contentAnalysis.hashtagStrategy,
        postingSchedule: { schedule: analysisResult.contentPatterns.postingSchedule },
        engagementRate: Math.round(analysisResult.analysisResults.performanceMetrics.averageEngagementRate * 100),
        growthRate: Math.floor(Math.random() * 15) + 5,
        recommendations: analysisResult.analysisResults.actionableRecommendations.join('\n'),
        competitorScore: analysisResult.competitorScore,
        lastScraped: new Date(),
        creditsUsed: creditCost
      });

      const deductResult = await AICreditService.deductCredits(userId, 'competitor_analysis', {
        creditsToDeduct: creditCost,
        workspaceId,
        endpoint: '/api/v1/ai/competitor-analysis'
      });

      if (!deductResult.success) {
        res.status(402).json({ error: deductResult.error || 'Failed to deduct credits' });
        return;
      }

      res.json({
        success: true,
        analysis: {
          id: competitorAnalysis.id,
          ...analysisResult.analysisResults,
          topPerformingPosts: analysisResult.topPerformingPosts,
          contentPatterns: analysisResult.contentPatterns,
          competitorScore: analysisResult.competitorScore,
          competitorUsername,
          platform
        },
        creditsUsed: deductResult.creditsDeducted,
        remainingCredits: deductResult.creditsAfter
      });

    } catch (error: any) {
      console.error('[CaptionAnalysisController] Competitor analysis failed:', error);
      res.status(500).json({ error: 'Failed to analyze competitor' });
    }
  }

  /**
   * Record caption feedback for learning
   * POST /api/v1/ai/record-caption-feedback
   */
  async recordCaptionFeedback(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { captionId, workspaceId, feedbackType, editedVersion, rejectionReason } = req.body;
      const userId = req.user.id;

      console.log('[CaptionAnalysisController] Recording caption feedback:', {
        captionId,
        feedbackType
      });

      await performanceCorrelationService.recordFeedback({
        captionId,
        workspaceId,
        userId,
        feedbackType,
        editedVersion,
        rejectionReason,
        timestamp: new Date()
      });

      res.json({
        success: true,
        message: 'Feedback recorded successfully'
      });

    } catch (error: any) {
      console.error('[CaptionAnalysisController] Record feedback failed:', error);
      res.status(500).json({ error: 'Failed to record feedback' });
    }
  }

  /**
   * Record actual performance metrics
   * POST /api/v1/ai/record-performance
   */
  async recordPerformance(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { captionId, workspaceId, metrics } = req.body;
      const userId = req.user.id;

      console.log('[CaptionAnalysisController] Recording performance metrics:', {
        captionId,
        metrics
      });

      await performanceCorrelationService.recordPerformance({
        captionId,
        workspaceId,
        userId,
        metrics,
        timestamp: new Date()
      });

      res.json({
        success: true,
        message: 'Performance metrics recorded successfully'
      });

    } catch (error: any) {
      console.error('[CaptionAnalysisController] Record performance failed:', error);
      res.status(500).json({ error: 'Failed to record performance' });
    }
  }
}

export const captionAnalysisController = new CaptionAnalysisController();
