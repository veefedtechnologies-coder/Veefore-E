import { Response } from 'express';
import { AuthenticatedRequest } from '../../../types/express';
import { storage } from '../../../mongodb-storage';
import {
  aiCreditMeteringService,
  InsufficientAICreditsError,
} from '../../subscription/services/AICreditMeteringService';
import { AIServiceManager } from '../../../services/AIServiceManager';
import { hashtagGeneratorService } from '../../../services/HashtagGeneratorService';
import { resolveNiche } from '../../../services/niche.util';

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
    // Ensure the niche is always available to the prompt builder, even for
    // users whose preferences predate niche centralization.
    if (userObj && !preferences.contentNiche) {
      const niche = resolveNiche(userObj);
      if (niche) preferences.contentNiche = niche;
    }
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
      const { title, type, platform, mediaUrl, workspaceId, existingCaption, singleVariation } = req.body;
      const userId = req.user.id;
      
      if (!title && !mediaUrl) {
        res.status(400).json({ error: 'Title or media URL is required' });
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

      const aiServiceManager = AIServiceManager.getInstance();

      // Reserve the caption ceiling before every provider call, including
      // optional vision analysis and strategic hashtag generation.
      const { result: variationsWithHashtags, settlement } = await aiCreditMeteringService.runMetered(
        'captionGeneration',
        'caption.generation',
        { userId, workspaceId: finalWorkspaceId },
        async () => {
      // Vision: actually LOOK at the uploaded media (image or video) so captions
      // and hashtags are grounded in what's shown — not just the title text.
      let mediaAnalysis: string | undefined;
      if (mediaUrl) {
        try {
          const isVideo = /\.(mp4|mov|webm|m4v)(\?|$)/i.test(String(mediaUrl)) || /video/i.test(String(type));
          const description = await aiServiceManager.analyzeMedia(
            mediaUrl,
            isVideo ? 'video' : 'image',
            preferences,
          );
          if (description) {
            mediaAnalysis = `Visual analysis of the ${isVideo ? 'video' : 'image'}: ${description}`;
            console.log('[AI CAPTION] Media analyzed for grounding:', description.slice(0, 120));
          } else {
            mediaAnalysis = `Media URL: ${mediaUrl}`;
          }
        } catch (e) {
          console.warn('[AI CAPTION] Media analysis failed, continuing text-only:', (e as Error).message);
          mediaAnalysis = `Media URL: ${mediaUrl}`;
        }
      }

      // Use AIServiceManager to generate caption variations with authenticity scoring
      const variations = await aiServiceManager.generateInstagramCaptions({
          userId,
          workspaceId: finalWorkspaceId || userId,
          topic: title || 'Content based on uploaded media',
          mediaAnalysis,
          existingCaption,
          postType: (type === 'story' || type === 'reel') ? type : 'post',
          platform: platform || 'Instagram',
          preferences,
          singleVariation: !!singleVariation
        });
      if (!Array.isArray(variations) || !variations.some((variation) => String(variation?.caption || '').trim())) {
        throw new Error('AI returned no usable caption variations');
      }

      // Generate hashtags for each variation
      const enrichedVariations = await Promise.all(
        variations.map(async (variation) => {
          try {
            const hashtagResult = await hashtagGeneratorService.generateStrategicHashtags({
              caption: variation.caption,
              mediaAnalysis,
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
      return enrichedVariations;
        },
      );

      console.log('[AI CAPTION] Successfully generated caption variations with authenticity scoring', {
        variationCount: variationsWithHashtags.length,
        avgAuthenticityScore: variationsWithHashtags.reduce((sum, v) => sum + v.authenticityScore, 0) / variationsWithHashtags.length,
        creditsUsed: settlement.charged
      });

      res.json({ 
        variations: variationsWithHashtags,
        creditsUsed: settlement.charged,
        remainingCredits: settlement.remaining,
        caption: variationsWithHashtags[0]?.caption || '',
        hashtags: variationsWithHashtags[0]?.hashtags || []
      });

    } catch (error: any) {
      console.error('[AI CAPTION] Generation failed:', error);
      const status = error instanceof InsufficientAICreditsError ? 402 : 500;
      res.status(status).json({ error: error.message || 'Failed to generate caption', details: error.message });
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
      const { result: validVariations, settlement: captionSettlement } = await aiCreditMeteringService.runMetered(
        'captionGeneration',
        'caption.regenerate',
        { userId, workspaceId },
        async () => {
          const generated = await aiServiceManager.generateInstagramCaptions({
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
          const valid = generated.filter((variation) =>
            variation.authenticityScore?.passesThreshold && String(variation.caption || '').trim()
          );
          if (valid.length === 0) {
            throw new Error('AI returned no caption meeting authenticity standards');
          }
          return valid;
        },
      );

      // Generate hashtags for the new variation
      const newVariation = validVariations[0];
      
      let hashtags: string[] = [];
      let hashtagSettlement: { charged: number; remaining: number } | undefined;
      try {
        const meteredHashtags = await aiCreditMeteringService.runMetered(
          'hashtagGeneration',
          'hashtag.regenerate',
          { userId, workspaceId },
          async () => {
            const result = await hashtagGeneratorService.generateStrategicHashtags({
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
            if (!Array.isArray(result.hashtags) || result.hashtags.length === 0) {
              throw new Error('AI returned no usable hashtags');
            }
            return result;
          },
        );
        hashtags = meteredHashtags.result.hashtags;
        hashtagSettlement = meteredHashtags.settlement;
      } catch (error) {
        console.error('[AI REGENERATE CAPTIONS] Failed to generate hashtags:', error);
      }

      console.log('[AI REGENERATE CAPTIONS] Successfully regenerated caption', {
        authenticityScore: newVariation.authenticityScore?.overallScore,
        hashtagCount: hashtags.length,
        creditsUsed: captionSettlement.charged + (hashtagSettlement?.charged ?? 0)
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
        creditsUsed: captionSettlement.charged + (hashtagSettlement?.charged ?? 0),
        remainingCredits: hashtagSettlement?.remaining ?? captionSettlement.remaining
      });

    } catch (error: any) {
      console.error('[AI REGENERATE CAPTIONS] Regeneration failed:', error);
      const status = error instanceof InsufficientAICreditsError ? 402 : 500;
      res.status(status).json({ 
        error: error.message || 'Failed to regenerate caption', 
        details: error.message 
      });
    }
  }
}
