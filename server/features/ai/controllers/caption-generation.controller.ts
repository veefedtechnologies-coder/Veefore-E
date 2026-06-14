import { Response } from 'express';
import { AuthenticatedRequest } from '../../../types/express';
import { storage } from '../../../mongodb-storage';
import { AICreditService } from '../../../services/AICreditService';
import { AIServiceManager } from '../../../services/AIServiceManager';
import { hashtagGeneratorService } from '../../../services/HashtagGeneratorService';

/**
 * Caption Generation Controller
 * Slim controller delegating to AI services
 * Requirements: 4.2, 4.6, 12.5
 */

async function getAIPreferences(userId: string, req: any): Promise<any> {
  let preferences: any = {};
  try {
    const userObj = await storage.getUser(userId);
    if (userObj && userObj.preferences) preferences = { ...userObj.preferences };
  } catch (e) {
    console.warn('Failed to load user preferences');
  }
  
  const workspaceId = req.body.workspaceId || req.query.workspaceId || req.headers['workspace-id'];
  if (workspaceId) {
    try {
      const workspace = await storage.getWorkspace(workspaceId);
      if (workspace && workspace.aiConfiguration) {
        preferences = { ...preferences, ...workspace.aiConfiguration };
      }
    } catch (e) {
      console.warn('Failed to load workspace AI configuration');
    }
  }
  return preferences;
}

export class CaptionGenerationController {
  /**
   * Generate Instagram caption variations with authenticity scoring
   */
  static async generateCaption(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { title, type, platform, mediaUrl, workspaceId, existingCaption } = req.body;
      const userId = req.user.id;
      
      if (!title && !mediaUrl) {
        res.status(400).json({ error: 'Title or media URL is required' });
        return;
      }

      // Check credits
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

      // Get workspace ID from multiple sources
      const finalWorkspaceId = workspaceId || req.headers['workspace-id'] as string;
      
      // Validate workspace access if provided
      if (finalWorkspaceId) {
        const workspace = await storage.getWorkspace(finalWorkspaceId);
        if (!workspace) {
          res.status(404).json({ error: 'Workspace not found' });
          return;
        }
        
        const user = await storage.getUser(userId);
        const workspaceUserId = workspace.userId?.toString();
        const requestUserId = userId.toString();
        const firebaseUid = user?.firebaseUid;
        
        const userOwnsWorkspace = workspaceUserId === requestUserId || 
                                 workspaceUserId === firebaseUid ||
                                 workspace.userId === userId ||
                                 workspace.userId === firebaseUid;
        
        if (!userOwnsWorkspace) {
          res.status(403).json({ error: 'Access denied to workspace' });
          return;
        }
      }

      console.log('[AI CAPTION] Generating Instagram caption variations for user:', userId, {
        workspaceId: finalWorkspaceId,
        platform,
        type,
        hasExistingCaption: !!existingCaption
      });

      // Get AI preferences for the user and workspace
      const preferences = await getAIPreferences(userId, req);

      // Use AIServiceManager to generate caption variations with authenticity scoring
      const aiServiceManager = AIServiceManager.getInstance();
      const variations = await aiServiceManager.generateInstagramCaptions({
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
            console.error('[AI CAPTION] Failed to generate hashtags for variation:', error);
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

      // Deduct credits
      const deductResult = await AICreditService.deductCredits(userId, 'content_generation', {
        creditsToDeduct: creditCost,
        workspaceId: finalWorkspaceId,
        endpoint: '/api/v1/ai/generate-caption'
      });

      if (!deductResult.success) {
        console.error('[AI CAPTION] Credit deduction failed:', deductResult.error);
        res.status(402).json({ error: deductResult.error || 'Failed to deduct credits' });
        return;
      }

      console.log('[AI CAPTION] Successfully generated caption variations with authenticity scoring', {
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
      console.error('[AI CAPTION] Generation failed:', error);
      res.status(500).json({ error: 'Failed to generate caption', details: error.message });
    }
  }

  /**
   * Regenerate caption with adjustments
   */
  static async regenerateCaptions(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { workspaceId, postDetails, variationIndex, adjustments } = req.body;
      const userId = req.user.id;
      
      console.log('[AI REGENERATE CAPTIONS] Request received:', {
        userId,
        workspaceId,
        variationIndex,
        hasAdjustments: !!adjustments,
        adjustments: adjustments || {}
      });

      // Check credits
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

      // Validate workspace access
      const workspace = await storage.getWorkspace(workspaceId);
      if (!workspace) {
        res.status(404).json({ error: 'Workspace not found' });
        return;
      }
      
      const user = await storage.getUser(userId);
      const workspaceUserId = workspace.userId?.toString();
      const requestUserId = userId.toString();
      const firebaseUid = user?.firebaseUid;
      
      const userOwnsWorkspace = workspaceUserId === requestUserId || 
                               workspaceUserId === firebaseUid ||
                               workspace.userId === userId ||
                               workspace.userId === firebaseUid;
      
      if (!userOwnsWorkspace) {
        res.status(403).json({ error: 'Access denied to workspace' });
        return;
      }

      // Get AI preferences
      const preferences = await getAIPreferences(userId, req);
      
      // Apply adjustments to preferences if provided
      const adjustedPreferences = { ...preferences };
      if (adjustments) {
        if (adjustments.tone) {
          adjustedPreferences.captionStyle = adjustments.tone;
        }
        if (adjustments.hashtagStrategy) {
          adjustedPreferences.hashtagStrategy = adjustments.hashtagStrategy;
        }
        if (adjustments.emphasize) {
          adjustedPreferences.emphasize = adjustments.emphasize;
        }
      }

      console.log('[AI REGENERATE CAPTIONS] Generating new variation with adjustments', {
        originalVariationIndex: variationIndex,
        adjustedPreferences: {
          tone: adjustedPreferences.captionStyle,
          hashtagStrategy: adjustedPreferences.hashtagStrategy,
          emphasize: adjustedPreferences.emphasize
        }
      });

      // Generate a single new variation using AIServiceManager
      const aiServiceManager = AIServiceManager.getInstance();
      
      // Build context for regeneration
      let regenerationContext = postDetails.existingCaption 
        ? `Previous caption (variation ${variationIndex}): ${postDetails.existingCaption}\n\n`
        : '';
      
      if (adjustments?.emphasize) {
        regenerationContext += `IMPORTANT: Emphasize the following in the new caption: ${adjustments.emphasize}\n\n`;
      }
      
      if (adjustments?.tone) {
        regenerationContext += `Use a ${adjustments.tone} tone for this caption.\n\n`;
      }

      // Generate new caption variations
      const variations = await aiServiceManager.generateInstagramCaptions({
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

      // Filter variations that pass authenticity threshold (80+)
      const validVariations = variations.filter(v => 
        v.authenticityScore && v.authenticityScore.passesThreshold
      );

      if (validVariations.length === 0) {
        console.warn('[AI REGENERATE CAPTIONS] No variations passed authenticity threshold');
        res.status(500).json({ 
          error: 'Failed to generate captions meeting authenticity standards',
          details: 'All generated variations scored below the 80 authenticity threshold. Please try again.' 
        });
        return;
      }

      // Generate hashtags for the new variation
      const newVariation = validVariations[0];
      
      let hashtags: string[] = [];
      try {
        const hashtagResult = await hashtagGeneratorService.generateStrategicHashtags({
          caption: newVariation.caption,
          mediaAnalysis: postDetails.mediaUrl ? `Media URL: ${postDetails.mediaUrl}` : undefined,
          niche: adjustedPreferences.contentNiche || 'general',
          postType: (postDetails.type === 'story' || postDetails.type === 'reel') 
            ? postDetails.type as 'post' | 'story' | 'reel'
            : 'post',
          platform: postDetails.platform || 'Instagram',
          userId,
          workspaceId
        });
        hashtags = hashtagResult.hashtags;
      } catch (error) {
        console.error('[AI REGENERATE CAPTIONS] Failed to generate hashtags:', error);
      }

      // Deduct credits
      const deductResult = await AICreditService.deductCredits(userId, 'content_generation', {
        creditsToDeduct: creditCost,
        workspaceId,
        endpoint: '/api/v1/ai/regenerate-captions'
      });

      if (!deductResult.success) {
        console.error('[AI REGENERATE CAPTIONS] Credit deduction failed:', deductResult.error);
        res.status(402).json({ error: deductResult.error || 'Failed to deduct credits' });
        return;
      }

      console.log('[AI REGENERATE CAPTIONS] Successfully regenerated caption', {
        authenticityScore: newVariation.authenticityScore?.overallScore,
        hashtagCount: hashtags.length,
        creditsUsed: deductResult.creditsDeducted
      });

      // Save regenerated caption to database with metadata
      const { aiContentGenerator } = await import('../../../ai-content-generator');
      try {
        await aiContentGenerator.saveGeneratedCaption({
          userId,
          workspaceId,
          variations: [{
            caption: newVariation.caption,
            hashtags,
            authenticityScore: newVariation.authenticityScore?.overallScore,
            engagementPrediction: newVariation.engagementPrediction ? {
              likeRate: newVariation.engagementPrediction.predictedLikeRate,
              commentRate: newVariation.engagementPrediction.predictedCommentRate,
              saveRate: newVariation.engagementPrediction.predictedSaveRate,
              shareRate: newVariation.engagementPrediction.predictedShareRate,
              confidence: newVariation.engagementPrediction.confidence
            } : undefined,
            usedPatterns: [],
            usedHooks: []
          }],
          postType: (postDetails.type === 'story' || postDetails.type === 'reel') 
            ? postDetails.type as 'post' | 'story' | 'reel'
            : 'post',
          platform: postDetails.platform || 'Instagram',
          niche: adjustedPreferences.contentNiche || 'general'
        });
        console.log('[AI REGENERATE CAPTIONS] Caption saved to database');
      } catch (saveError) {
        console.error('[AI REGENERATE CAPTIONS] Failed to save caption to database:', saveError);
      }

      res.json({ 
        variation: {
          caption: newVariation.caption,
          hashtags,
          style: newVariation.style,
          styleDescription: newVariation.styleDescription,
          authenticityScore: newVariation.authenticityScore?.overallScore || 0,
          authenticityDetails: newVariation.authenticityScore ? {
            criteriaScores: newVariation.authenticityScore.criteriaScores,
            aiTellsDetected: newVariation.authenticityScore.aiTellsDetected,
            recommendations: newVariation.authenticityScore.recommendations,
            passesThreshold: newVariation.authenticityScore.passesThreshold
          } : undefined,
          engagementPrediction: newVariation.engagementPrediction ? {
            predictedLikeRate: newVariation.engagementPrediction.predictedLikeRate,
            predictedCommentRate: newVariation.engagementPrediction.predictedCommentRate,
            predictedSaveRate: newVariation.engagementPrediction.predictedSaveRate,
            predictedShareRate: newVariation.engagementPrediction.predictedShareRate,
            confidence: newVariation.engagementPrediction.confidence,
            factors: newVariation.engagementPrediction.factors,
            vsUserAverage: newVariation.engagementPrediction.vsUserAverage
          } : undefined,
          regenerationMetadata: {
            originalVariationIndex: variationIndex,
            adjustmentsApplied: adjustments || {},
            regeneratedAt: new Date().toISOString()
          }
        },
        creditsUsed: deductResult.creditsDeducted,
        remainingCredits: deductResult.creditsAfter
      });

    } catch (error: any) {
      console.error('[AI REGENERATE CAPTIONS] Regeneration failed:', error);
      res.status(500).json({ 
        error: 'Failed to regenerate caption', 
        details: error.message 
      });
    }
  }
}
