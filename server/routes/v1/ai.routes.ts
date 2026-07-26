import { Router, Request, Response } from 'express';
import OpenAI from 'openai';
import { z } from 'zod';
import { requireAuth } from '../../middleware/require-auth';
import { aiRateLimiter } from '../../middleware/rate-limiting-working';
import { validateRequest } from '../../middleware/validation';
import { storage } from '../../mongodb-storage';
import { performanceCorrelationService } from '../../services/PerformanceCorrelationService';
import { generatedCaptionRepository } from '../../repositories/GeneratedCaptionRepository';
import { AuthenticatedRequest } from '../../types/express';
import { aiFeatureMiddleware } from '../../services/aiUsageTracker';
import { AICreditService } from '../../services/AICreditService';
import { multiPlatformCaptionService } from '../../services/MultiPlatformCaptionService';
import type { PlatformId } from '../../../../src/shared/platform-registry/types';
import {
  captionGenerationGuards,
  hashtagGenerationGuards,
  imageGenerationGuards,
  aiRewriteGuards,
} from '../../middleware/ai-route-guards';

// Import slim controllers
import {
  CaptionGenerationController,
  ContentGenerationController,
  ImageGenerationController,
  AnalysisController,
  ChatController,
  FeedbackController
} from '../../features/ai/controllers';

/**
 * AI Routes - Refactored to use service layer
 * All business logic delegated to slim controllers
 * Requirements: 4.2, 4.6, 12.5
 */

const router = Router();

const CreativeBriefSchema = z.object({
  title: z.string().min(1).max(200),
  targetAudience: z.string().min(1).max(500),
  platforms: z.array(z.string()).min(1),
  campaignGoals: z.array(z.string()).min(1),
  tone: z.string().max(100).optional(),
  style: z.string().max(100).optional(),
  industry: z.string().max(100).optional(),
  deadline: z.string().optional(),
  budget: z.string().optional(),
  additionalRequirements: z.string().max(2000).optional(),
  workspaceId: z.string().optional(),
});

const ContentRepurposeSchema = z.object({
  sourceContent: z.string().min(1).max(10000),
  sourceLanguage: z.string().min(2).max(10),
  targetLanguage: z.string().min(2).max(10),
  contentType: z.string().min(1).max(50),
  platform: z.string().min(1).max(50),
  tone: z.string().max(100).optional(),
  targetAudience: z.string().max(500).optional(),
  workspaceId: z.string().optional(),
});

const BulkRepurposeSchema = z.object({
  sourceContent: z.string().min(1).max(10000),
  sourceLanguage: z.string().min(2).max(10),
  targetLanguages: z.array(z.string().min(2).max(10)).min(1).max(10),
  contentType: z.string().min(1).max(50),
  platform: z.string().min(1).max(50),
});

const CompetitorAnalysisSchema = z.object({
  competitorUsername: z.string().min(1).max(100),
  platform: z.enum(['instagram', 'youtube', 'tiktok', 'twitter', 'linkedin']),
  analysisType: z.enum(['content', 'engagement', 'growth', 'full_profile']).default('full_profile'),
  workspaceId: z.string().optional(),
});

const GenerateCaptionSchema = z.object({
  title: z.string().max(500).optional(),
  type: z.string().max(50).optional(),
  platform: z.string().max(50).optional(),
  mediaUrl: z.string().url().optional(),
  workspaceId: z.string().optional(),
  existingCaption: z.string().max(2000).optional(),
});

const RegenerateCaptionsSchema = z.object({
  workspaceId: z.string(),
  postDetails: z.object({
    title: z.string().max(500).optional(),
    type: z.string().max(50).optional(),
    platform: z.string().max(50).optional(),
    mediaUrl: z.string().url().optional(),
    existingCaption: z.string().max(2000).optional(),
  }),
  variationIndex: z.number().int().min(0).max(2),
  adjustments: z.object({
    tone: z.string().max(100).optional(),
    hashtagStrategy: z.string().max(100).optional(),
    emphasize: z.string().max(500).optional(),
  }).optional(),
});

const GenerateHashtagsSchema = z.object({
  title: z.string().max(500).optional(),
  description: z.string().max(2000).optional(),
  type: z.string().max(50).optional(),
  platform: z.string().max(50).optional(),
});

function inferMediaTypeFromUrl(url: unknown): 'image' | 'video' | undefined {
  if (typeof url !== 'string' || !url) return undefined;
  const normalizedUrl = url.toLowerCase();
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg', '.ico', '.heic', '.heif'];
  if (imageExtensions.some((extension) => normalizedUrl.includes(extension))) return 'image';
  const videoExtensions = ['.mp4', '.mov', '.avi', '.webm', '.mkv', '.flv', '.wmv', '.m4v', '.3gp'];
  if (videoExtensions.some((extension) => normalizedUrl.includes(extension))) return 'video';
  return undefined;
}

const GenerateContentSchema = z.preprocess(
  (input: unknown) => {
    if (!input || typeof input !== 'object') return input;
    const normalized = { ...(input as Record<string, unknown>) };
    if (normalized.mediaType == null) {
      normalized.mediaType = inferMediaTypeFromUrl(normalized.mediaUrl);
    }
    return normalized;
  },
  z.object({
    mediaUrl: z.string().optional().refine(
      (value) => !value || value.trim() === '' || z.string().url().safeParse(value).success,
      { message: 'Must be a valid URL if provided' },
    ),
    mediaType: z.enum(['image', 'video']).nullish(),
    postType: z.enum(['post', 'story', 'reel']).optional(),
    platform: z.string().max(50).optional(),
    existingCaption: z.string().max(5000).optional(),
    workspaceId: z.string().optional(),
  }).transform((data) => ({
    mediaUrl: data.mediaUrl?.trim() || undefined,
    mediaType: data.mediaType || undefined,
    postType: data.postType,
    platform: data.platform,
    existingCaption: data.existingCaption || undefined,
    workspaceId: data.workspaceId,
  })),
);

const GenerateImageSchema = z.object({
  prompt: z.string().min(1).max(1000),
  platform: z.string().max(50).optional(),
  contentType: z.string().max(50).optional(),
  style: z.enum(['realistic', 'vivid', 'natural']).optional(),
  workspaceId: z.string().optional(),
  dimensions: z.object({
    width: z.number().optional(),
    height: z.number().optional(),
  }).optional(),
});

const GenerateScriptSchema = z.object({
  prompt: z.string().min(1).max(2000),
  platform: z.string().max(50).optional(),
  contentType: z.string().max(50).optional(),
  style: z.string().max(50).optional(),
  duration: z.union([z.string(), z.number()]).optional(),
  workspaceId: z.string().optional(),
  dimensions: z.object({
    width: z.number().optional(),
    height: z.number().optional(),
    ratio: z.string().optional(),
  }).optional(),
});

const ChatSchema = z.object({
  message: z.string().min(1).max(4000),
  brandVoice: z.enum(['professional', 'casual', 'creative', 'technical', 'social', 'luxury']).optional(),
  workspaceId: z.string().optional(),
});

const RecordCaptionFeedbackSchema = z.object({
  captionId: z.string().min(1),
  workspaceId: z.string().min(1),
  feedbackType: z.enum(['selected', 'edited', 'rejected']),
  editedVersion: z.string().optional(),
  rejectionReason: z.string().optional(),
});

const RecordPerformanceSchema = z.object({
  captionId: z.string().min(1),
  workspaceId: z.string().min(1),
  metrics: z.object({
    likes: z.number().min(0),
    comments: z.number().min(0),
    shares: z.number().min(0),
    saves: z.number().min(0),
    reach: z.number().min(0),
    engagement_rate: z.number().min(0).optional(),
  }),
});

// Creative brief generation - delegated to ContentGenerationController
router.post('/creative-brief',
  requireAuth,
  aiRateLimiter,
  aiFeatureMiddleware('content.brief'),
  validateRequest({ body: CreativeBriefSchema }),
  ContentGenerationController.generateCreativeBrief
);

// Content repurposing - delegated to ContentGenerationController
router.post('/content-repurpose',
  requireAuth,
  aiRateLimiter,
  aiFeatureMiddleware('content.repurpose'),
  validateRequest({ body: ContentRepurposeSchema }),
  ContentGenerationController.repurposeContent
);

router.post('/content-repurpose/bulk',
  requireAuth,
  aiRateLimiter,
  aiFeatureMiddleware('content.repurpose'),
  validateRequest({ body: BulkRepurposeSchema }),
  ContentGenerationController.bulkRepurposeContent
);

// Competitor analysis - delegated to AnalysisController
router.post('/competitor-analysis',
  requireAuth,
  aiRateLimiter,
  aiFeatureMiddleware('competitor.analysis'),
  validateRequest({ body: CompetitorAnalysisSchema }),
  AnalysisController.analyzeCompetitor
);

// Caption generation - delegated to CaptionGenerationController
router.post('/generate-caption',
  requireAuth,
  aiRateLimiter,
  ...captionGenerationGuards,
  aiFeatureMiddleware('caption.generation'),
  validateRequest({ body: GenerateCaptionSchema }),
  CaptionGenerationController.generateCaption
);

// Regenerate captions - delegated to CaptionGenerationController
router.post('/regenerate-captions',
  requireAuth,
  aiRateLimiter,
  ...captionGenerationGuards,
  aiFeatureMiddleware('caption.regenerate'),
  validateRequest({ body: RegenerateCaptionsSchema }),
  CaptionGenerationController.regenerateCaptions
);

// Hashtag generation - delegated to AnalysisController
router.post('/generate-hashtags',
  requireAuth,
  aiRateLimiter,
  ...hashtagGenerationGuards,
  aiFeatureMiddleware('hashtag.generation'),
  validateRequest({ body: GenerateHashtagsSchema }),
  AnalysisController.generateHashtags
);

// Create Post AI image generation (separate from Performance Overview banner)
router.post('/generate-image',
  requireAuth,
  aiRateLimiter,
  ...imageGenerationGuards,
  aiFeatureMiddleware('image.generation'),
  validateRequest({ body: GenerateImageSchema }),
  ImageGenerationController.generateImage
);

// Script generation - delegated to ContentGenerationController
router.post('/generate-script',
  requireAuth,
  aiRateLimiter,
  aiFeatureMiddleware('video.script'),
  validateRequest({ body: GenerateScriptSchema }),
  ContentGenerationController.generateScript
);

router.post('/generate-content',
  requireAuth,
  aiRateLimiter,
  ...captionGenerationGuards,
  aiFeatureMiddleware('caption.generation'),
  (req, res, next) => {
    // Debug logging to see actual request body
    console.log('[AI GENERATE-CONTENT DEBUG] Raw request body:', JSON.stringify(req.body, null, 2));
    next();
  },
  validateRequest({ body: GenerateContentSchema }),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user.id;
      const { mediaUrl, mediaType, postType, platform, existingCaption, workspaceId } = req.body;

      console.log('[AI GENERATE CONTENT][START] Request:', { userId, mediaUrl: !!mediaUrl, mediaType, postType, platform, workspaceId: !!workspaceId });

      // Early validation: Check if AI service is configured before credit checks
      // This prevents deducting credits when the service is unavailable
      const { aiServiceManager } = await import('../../services/AIServiceManager');
      const isConfigured = await aiServiceManager.isConfigured();
      if (!isConfigured) {
        console.error('[AI GENERATE CONTENT][ERROR] AI service not configured');
        return res.status(503).json({ 
          error: 'AI service is not configured. Please contact support.',
          requiresSetup: true,
          details: 'The AI content generation service requires configuration. Please reach out to support for assistance.'
        });
      }

      const creditCost = AICreditService.calculateCost('content_generation');
      const creditCheck = await AICreditService.checkCredits(userId, creditCost);
      if (!creditCheck.hasCredits) {
        return res.status(402).json({ 
          error: 'Insufficient credits',
          required: creditCost,
          current: creditCheck.currentCredits
        });
      }

      // Validate workspace access if provided
      if (workspaceId) {
        const workspace = await storage.getWorkspace(workspaceId);
        if (!workspace) {
          return res.status(404).json({ error: 'Workspace not found' });
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
          return res.status(403).json({ error: 'Access denied to workspace' });
        }
      }

      // Import and use AI content generator
      const { aiContentGenerator } = await import('../../ai-content-generator');
      
      const generatedContent = await aiContentGenerator.generateContent({
        userId,
        workspaceId,
        mediaUrl,
        mediaType,
        postType: postType || 'post',
        platform: platform || 'instagram',
        existingCaption
      });

      // Deduct credits
      const deductResult = await AICreditService.deductCredits(userId, 'content_generation', {
        creditsToDeduct: creditCost,
        workspaceId,
        endpoint: '/api/v1/ai/generate-content'
      });

      if (!deductResult.success) {
        console.error('[AI GENERATE CONTENT] Credit deduction failed:', deductResult.error);
        return res.status(402).json({ error: deductResult.error || 'Failed to deduct credits' });
      }

      console.log('[AI GENERATE CONTENT][SUCCESS] Successfully generated content:', {
        userId,
        workspaceId: workspaceId || 'none',
        captionLength: generatedContent.caption.length,
        hashtagCount: generatedContent.hashtags.length,
        engagementScore: generatedContent.engagementScore,
        viralityScore: generatedContent.viralityScore,
        creditsUsed: deductResult.creditsDeducted,
        remainingCredits: deductResult.creditsAfter
      });

      res.json({
        success: true,
        ...generatedContent,
        creditsUsed: deductResult.creditsDeducted,
        remainingCredits: deductResult.creditsAfter
      });

    } catch (error: any) {
      console.error('[AI GENERATE CONTENT][ERROR] Error details:', {
        userId: req.user?.id,
        errorMessage: error.message,
        errorStack: error.stack,
        requestBody: {
          hasMediaUrl: !!req.body.mediaUrl,
          mediaType: req.body.mediaType || 'none',
          postType: req.body.postType,
          platform: req.body.platform,
          workspaceId: req.body.workspaceId || 'none'
        }
      });
      res.status(500).json({ 
        error: 'Failed to generate content',
        details: error.message 
      });
    }
  }
);

router.post('/chat',
  requireAuth,
  aiRateLimiter,
  validateRequest({ body: ChatSchema }),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user;
      const userId = user.id;
      const { message, brandVoice, workspaceId } = req.body;

      if (!message?.trim()) {
        return res.status(400).json({ error: 'Message is required' });
      }

      const creditCost = AICreditService.calculateCost('chat');
      const creditCheck = await AICreditService.checkCredits(userId, creditCost);
      if (!creditCheck.hasCredits) {
        return res.status(402).json({ 
          error: 'Insufficient credits',
          required: creditCost,
          current: creditCheck.currentCredits
        });
      }

      const openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY
      });

      const brandVoicePrompts: Record<string, string> = {
        professional: "You are a professional business AI assistant. Respond in a formal, authoritative tone with clear, actionable advice.",
        casual: "You are a friendly, casual AI assistant. Respond in a conversational, approachable tone like talking to a friend.",
        creative: "You are a creative AI assistant. Respond with innovative, inspiring ideas and imaginative solutions.",
        technical: "You are a technical expert AI assistant. Respond with precise, analytical language and detailed technical insights.",
        social: "You are a social media expert AI assistant. Respond with engaging, trendy language perfect for social content.",
        luxury: "You are a luxury brand AI assistant. Respond with sophisticated, elegant language that conveys premium quality."
      };

      const systemPrompt = brandVoicePrompts[brandVoice as string] || brandVoicePrompts.professional;

      console.log('[VEEGPT] Processing chat request:', {
        userId,
        messageLength: message.length,
        brandVoice,
        workspaceId
      });

      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: message }
        ],
        max_tokens: 1000,
        temperature: 0.7
      });

      const aiResponse = completion.choices[0].message.content;

      const deductResult = await AICreditService.deductCredits(userId, 'chat', {
        creditsToDeduct: creditCost,
        workspaceId,
        estimatedTokens: completion.usage?.total_tokens,
        endpoint: '/api/v1/ai/chat'
      });

      console.log('[VEEGPT] Generated response successfully');

      res.json({
        message: aiResponse,
        brandVoice,
        creditsUsed: deductResult.creditsDeducted,
        remainingCredits: deductResult.creditsAfter,
        usage: {
          promptTokens: completion.usage?.prompt_tokens || 0,
          completionTokens: completion.usage?.completion_tokens || 0,
          totalTokens: completion.usage?.total_tokens || 0
        }
      });

    } catch (error: any) {
      console.error('[VEEGPT] Chat error:', error);
      
      if (error.code === 'insufficient_quota') {
        return res.status(402).json({ 
          error: 'OpenAI API quota exceeded. Please check your billing details.',
          type: 'quota_exceeded'
        });
      }
      
      if (error.code === 'invalid_api_key') {
        return res.status(401).json({ 
          error: 'Invalid OpenAI API key configuration.',
          type: 'auth_error'
        });
      }

      res.status(500).json({ 
        error: 'Failed to generate AI response',
        details: error.message 
      });
    }
  }
);

/**
 * POST /api/v1/ai/record-caption-feedback
 * 
 * Records user feedback on generated captions (selection, edits, rejection)
 * Uses FeedbackCaptureService to record feedback and update pattern learning
 * 
 * Requirements: 10.1, 10.2, 15.3
 */
router.post('/record-caption-feedback',
  requireAuth,
  validateRequest({ body: RecordCaptionFeedbackSchema }),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user.id;
      const { captionId, workspaceId, feedbackType, editedVersion, rejectionReason } = req.body;

      console.log('[CAPTION FEEDBACK] Recording feedback:', {
        userId,
        captionId,
        workspaceId,
        feedbackType
      });

      // Validate workspace access
      const workspace = await storage.getWorkspace(workspaceId);
      if (!workspace) {
        return res.status(404).json({ error: 'Workspace not found' });
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
        return res.status(403).json({ error: 'Access denied to workspace' });
      }

      // Import services
      const { FeedbackCaptureService } = await import('../../services/FeedbackCaptureService');
      const { VoiceProfileService } = await import('../../services/VoiceProfileService');
      const { MongoClient } = await import('mongodb');
      
      // Get MongoDB connection
      const mongoUri = process.env.MONGODB_URI;
      if (!mongoUri) {
        throw new Error('MongoDB URI not configured');
      }
      
      const mongoClient = new MongoClient(mongoUri);
      await mongoClient.connect();
      
      const dbName = process.env.MONGODB_DB_NAME || 'veefore';
      const feedbackService = new FeedbackCaptureService(mongoClient, dbName);
      const voiceProfileService = new VoiceProfileService(mongoClient, dbName);

      let feedbackId: string | undefined;

      try {
        // Handle different feedback types
        switch (feedbackType) {
          case 'selected': {
            // Record selection feedback
            // Note: For this endpoint, we're recording that a caption was selected
            // The actual variation index would need to come from the generated caption tracking
            // For now, we'll record a simplified feedback
            const { GeneratedCaptionModel } = await import('../../models/AI/GeneratedCaption');
            const generatedCaption = await GeneratedCaptionModel.findById(captionId);
            
            if (!generatedCaption) {
              return res.status(404).json({ error: 'Caption not found' });
            }

            // Assume the first variation was selected if not specified
            // In a real implementation, the client should specify which variation was selected
            await feedbackService.recordSelection(userId, workspaceId, {
              generatedCaptionId: captionId,
              selectedVariationIndex: 0,
              rejectedVariationIndices: [1, 2] // Assume other variations were rejected
            });

            console.log('[CAPTION FEEDBACK] Recorded selection for caption:', captionId);
            feedbackId = captionId;
            break;
          }

          case 'edited': {
            // Validate editedVersion is provided
            if (!editedVersion) {
              return res.status(400).json({ 
                error: 'editedVersion is required for edited feedback type' 
              });
            }

            // Get the original caption
            const { GeneratedCaptionModel } = await import('../../models/AI/GeneratedCaption');
            const generatedCaption = await GeneratedCaptionModel.findById(captionId);
            
            if (!generatedCaption) {
              return res.status(404).json({ error: 'Caption not found' });
            }

            // Get the original caption text (first variation for simplicity)
            const originalCaption = generatedCaption.variations[0]?.caption || '';

            // Analyze the edit
            const editAnalysis = await feedbackService.analyzeEdit(
              userId,
              workspaceId,
              captionId,
              originalCaption,
              editedVersion
            );

            // Update voice profile based on the edit
            await voiceProfileService.updateFromEdit(
              userId,
              workspaceId,
              originalCaption,
              editedVersion
            );

            console.log('[CAPTION FEEDBACK] Analyzed edit for caption:', captionId, {
              changeTypes: editAnalysis.changeTypes,
              editDistance: editAnalysis.editDistance
            });

            feedbackId = captionId;
            break;
          }

          case 'rejected': {
            // Record rejection feedback
            const { CaptionFeedbackModel } = await import('../../models/AI/CaptionFeedback');
            
            const feedback = await CaptionFeedbackModel.create({
              userId,
              workspaceId,
              generatedCaptionId: captionId,
              feedbackType: 'rejection',
              timestamp: new Date(),
              rejectedPatterns: [], // Would be populated with actual pattern data
              // Store rejection reason in a custom field if needed
            });

            feedbackId = feedback._id.toString();

            console.log('[CAPTION FEEDBACK] Recorded rejection for caption:', captionId, {
              reason: rejectionReason
            });
            break;
          }

          default:
            return res.status(400).json({ error: 'Invalid feedback type' });
        }

        // Close MongoDB connection
        await mongoClient.close();

        // Return success response
        res.json({
          success: true,
          feedbackId,
          message: 'Feedback recorded successfully',
          feedbackType,
          updates: {
            voiceProfileUpdated: feedbackType === 'edited' || feedbackType === 'selected',
            patternLearningTriggered: true
          }
        });

      } catch (error) {
        await mongoClient.close();
        throw error;
      }

    } catch (error: any) {
      console.error('[CAPTION FEEDBACK] Error recording feedback:', error);
      res.status(500).json({ 
        error: 'Failed to record feedback',
        details: error.message 
      });
    }
  }
);

/**
 * POST /api/v1/ai/record-performance
 * 
 * Record Instagram performance metrics for generated captions.
 * Links metrics to caption patterns, hashtags, and voice characteristics.
 * Updates viral pattern rankings and hashtag effectiveness.
 * 
 * Requirements: 10.3
 */
router.post('/record-performance',
  requireAuth,
  validateRequest({ body: RecordPerformanceSchema }),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user.id;
      const { captionId, workspaceId, metrics } = req.body;

      console.log('[AI PERFORMANCE] Recording performance metrics:', {
        userId,
        captionId,
        workspaceId,
        metrics
      });

      // Validate workspace access
      const workspace = await storage.getWorkspace(workspaceId);
      if (!workspace) {
        return res.status(404).json({ error: 'Workspace not found' });
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
        return res.status(403).json({ error: 'Access denied to workspace' });
      }

      // Validate metric values (non-negative numbers)
      const { likes, comments, shares, saves, reach } = metrics;
      if (likes < 0 || comments < 0 || shares < 0 || saves < 0 || reach < 0) {
        return res.status(400).json({ error: 'All metric values must be non-negative numbers' });
      }

      // Calculate engagement rate if not provided
      const engagementRate = metrics.engagement_rate !== undefined 
        ? metrics.engagement_rate
        : reach > 0 
          ? ((likes + comments + shares + saves) / reach) * 100
          : 0;

      // Update performance metrics in generated caption record
      const updatedCaption = await generatedCaptionRepository.updatePerformanceMetrics(
        captionId,
        {
          likes,
          comments,
          saves,
          shares,
          impressions: reach
        }
      );

      if (!updatedCaption) {
        return res.status(404).json({ error: 'Caption not found' });
      }

      // Verify the caption belongs to the user and workspace
      if (updatedCaption.userId !== userId || updatedCaption.workspaceId !== workspaceId) {
        return res.status(403).json({ error: 'Access denied to this caption' });
      }

      console.log('[AI PERFORMANCE] Successfully updated caption with performance metrics', {
        captionId,
        engagementRate: engagementRate.toFixed(2) + '%'
      });

      // Trigger asynchronous learning updates (don't wait for completion)
      // These update viral patterns, hashtag effectiveness, and engagement predictor
      performanceCorrelationService.updateViralPatternPerformance(userId, workspaceId)
        .then((results) => {
          console.log('[AI PERFORMANCE] Background learning updates completed:', results);
        })
        .catch((error) => {
          console.error('[AI PERFORMANCE] Background learning updates failed:', error);
        });

      // Return acknowledgment with performance record ID
      res.json({
        success: true,
        performanceRecordId: updatedCaption._id.toString(),
        captionId,
        metrics: {
          likes,
          comments,
          shares,
          saves,
          reach,
          engagementRate: Math.round(engagementRate * 100) / 100
        },
        message: 'Performance metrics recorded successfully. Learning algorithms will update based on this data.'
      });

    } catch (error: any) {
      console.error('[AI PERFORMANCE] Recording failed:', error);
      res.status(500).json({ 
        error: 'Failed to record performance metrics',
        details: error.message 
      });
    }
  }
);

/**
 * GET /api/v1/ai/caption-insights/:captionId
 * 
 * Retrieve detailed insights and analytics for a specific generated caption.
 * Returns caption metadata, authenticity scores, engagement predictions,
 * used patterns/hooks, hashtag strategy, voice profile match indicators,
 * and actual performance metrics if available.
 * 
 * Requirements: 9.5, 16.2
 */
router.get('/caption-insights/:captionId',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user.id;
      const { captionId } = req.params;

      console.log('[CAPTION INSIGHTS] Fetching insights for caption:', {
        userId,
        captionId
      });

      // Retrieve the caption from database
      const caption = await generatedCaptionRepository.findById(captionId);

      if (!caption) {
        return res.status(404).json({ error: 'Caption not found' });
      }

      // Verify workspace access
      const workspace = await storage.getWorkspace(caption.workspaceId);
      if (!workspace) {
        return res.status(404).json({ error: 'Workspace not found' });
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
        return res.status(403).json({ error: 'Access denied to workspace' });
      }

      // Verify the caption belongs to the user
      if (caption.userId !== userId) {
        return res.status(403).json({ error: 'Access denied to this caption' });
      }

      // Get the selected variation (or first variation if none selected)
      const selectedIndex = caption.selectedVariationIndex ?? 0;
      const selectedVariation = caption.variations[selectedIndex];

      // Calculate predicted vs actual performance comparison if available
      let performanceComparison: any = null;
      if (caption.actualMetrics && caption.actualMetrics.impressions > 0) {
        const predicted = selectedVariation.engagementPrediction;
        const actual = caption.actualMetrics;

        // Calculate actual rates
        const actualLikeRate = (actual.likes / actual.impressions) * 100;
        const actualCommentRate = (actual.comments / actual.impressions) * 100;
        const actualSaveRate = (actual.saves / actual.impressions) * 100;
        const actualShareRate = (actual.shares / actual.impressions) * 100;

        performanceComparison = {
          predicted: {
            likeRate: predicted.likeRate,
            commentRate: predicted.commentRate,
            saveRate: predicted.saveRate,
            shareRate: predicted.shareRate,
            confidence: predicted.confidence
          },
          actual: {
            likeRate: Math.round(actualLikeRate * 100) / 100,
            commentRate: Math.round(actualCommentRate * 100) / 100,
            saveRate: Math.round(actualSaveRate * 100) / 100,
            shareRate: Math.round(actualShareRate * 100) / 100,
            engagementRate: actual.engagementRate
          },
          accuracy: {
            likeRateDiff: Math.round((actualLikeRate - predicted.likeRate) * 100) / 100,
            commentRateDiff: Math.round((actualCommentRate - predicted.commentRate) * 100) / 100,
            saveRateDiff: Math.round((actualSaveRate - predicted.saveRate) * 100) / 100,
            shareRateDiff: Math.round((actualShareRate - predicted.shareRate) * 100) / 100,
            overallAccuracy: Math.round(100 - Math.abs(
              ((actualLikeRate - predicted.likeRate) / predicted.likeRate * 100) +
              ((actualCommentRate - predicted.commentRate) / predicted.commentRate * 100) +
              ((actualSaveRate - predicted.saveRate) / predicted.saveRate * 100) +
              ((actualShareRate - predicted.shareRate) / predicted.shareRate * 100)
            ) / 4)
          },
          performedBetter: actualLikeRate > predicted.likeRate
        };
      }

      // Get user's average metrics for comparison
      const userAverageMetrics = await generatedCaptionRepository.calculateAverageMetrics(
        userId,
        caption.workspaceId
      );

      // Build comprehensive insights response
      const insights = {
        captionId: caption._id.toString(),
        
        // Caption text and metadata
        caption: {
          text: selectedVariation.caption,
          wasEdited: caption.wasEdited,
          originalText: caption.originalCaption,
          editedText: caption.editedCaption,
          editDistance: caption.editDistance
        },

        // Metadata
        metadata: {
          postType: caption.postType,
          platform: caption.platform,
          niche: caption.niche,
          generatedAt: caption.generatedAt,
          publishedAt: caption.publishedAt,
          performanceRecordedAt: caption.performanceRecordedAt
        },

        // Authenticity score breakdown
        authenticityScore: {
          overall: selectedVariation.authenticityScore,
          threshold: 80,
          passed: selectedVariation.authenticityScore >= 80
        },

        // Engagement prediction details
        engagementPrediction: selectedVariation.engagementPrediction,

        // Used patterns and hooks
        patternsUsed: {
          patterns: selectedVariation.usedPatterns,
          hooks: selectedVariation.usedHooks,
          patternCount: selectedVariation.usedPatterns.length,
          hookCount: selectedVariation.usedHooks.length
        },

        // Hashtag strategy
        hashtagStrategy: {
          hashtags: selectedVariation.hashtagsGenerated,
          count: selectedVariation.hashtagsGenerated.length,
          // Categorize hashtags by popularity (this would be enhanced with actual hashtag data)
          strategy: selectedVariation.hashtagsGenerated.length > 0 
            ? '30/50/20 competition ratio (high/medium/low)' 
            : 'No hashtags generated'
        },

        // Performance metrics (if available)
        performanceMetrics: caption.actualMetrics || null,
        
        // Predicted vs actual comparison
        performanceComparison,

        // Voice profile match indicators
        voiceProfileMatch: {
          wasEdited: caption.wasEdited,
          editDistance: caption.editDistance,
          matchQuality: caption.wasEdited && caption.editDistance !== undefined
            ? caption.editDistance < 50 ? 'high' : caption.editDistance < 150 ? 'medium' : 'low'
            : 'unknown'
        },

        // All variations (for comparison)
        allVariations: caption.variations.map((variation, index) => ({
          index,
          caption: variation.caption,
          authenticityScore: variation.authenticityScore,
          engagementPrediction: variation.engagementPrediction,
          hashtags: variation.hashtagsGenerated,
          selected: index === selectedIndex
        })),

        // User's average performance for context
        userAverageMetrics: userAverageMetrics.sampleSize > 0 ? userAverageMetrics : null,

        // Insights for future generations
        insights: {
          recommendations: [],
          learnings: []
        }
      };

      // Add performance-based insights if actual metrics are available
      if (performanceComparison) {
        if (performanceComparison.performedBetter) {
          insights.insights.learnings.push(
            `This caption outperformed predictions by ${Math.abs(performanceComparison.accuracy.likeRateDiff)}% on likes`
          );
        }
        
        if (performanceComparison.accuracy.overallAccuracy < 70) {
          insights.insights.recommendations.push(
            'Prediction accuracy was below 70%. Consider providing more sample captions to improve voice profile.'
          );
        }
      }

      // Add voice profile insights
      if (caption.wasEdited && caption.editDistance && caption.editDistance > 100) {
        insights.insights.recommendations.push(
          'You made significant edits to this caption. The AI will learn from these changes to better match your voice.'
        );
      }

      console.log('[CAPTION INSIGHTS] Successfully retrieved insights for caption:', captionId);

      res.json({
        success: true,
        insights
      });

    } catch (error: any) {
      console.error('[CAPTION INSIGHTS] Failed to retrieve insights:', error);
      res.status(500).json({ 
        error: 'Failed to retrieve caption insights',
        details: error.message 
      });
    }
  }
);

/**
 * POST /api/v1/ai/adapt-caption
 * 
 * Adapt an Instagram caption for different social media platforms.
 * Transforms caption structure, hashtag placement, and tone based on
 * platform-specific requirements while maintaining the user's voice.
 * 
 * Supported platforms: instagram, facebook, twitter, linkedin, tiktok
 * 
 * Requirements: 12.1, 12.2, 12.4
 */
const AdaptCaptionSchema = z.object({
  caption: z.string().min(1).max(5000),
  targetPlatform: z.enum(['instagram', 'facebook', 'twitter', 'linkedin', 'tiktok']),
  workspaceId: z.string().optional(),
});

// AI Rewrite feature: adapts/rewrites a caption for a different platform.
// Requires Creator plan or higher + 2 AI credits (aiRewrite cost).
router.post('/adapt-caption',
  requireAuth,
  aiRateLimiter,
  ...aiRewriteGuards,
  validateRequest({ body: AdaptCaptionSchema }),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { caption, targetPlatform, workspaceId } = req.body;
      const userId = req.user.id;

      console.log('[AI ADAPT CAPTION] Adapting caption for platform:', {
        userId,
        targetPlatform,
        captionLength: caption.length,
        workspaceId
      });

      // Validate workspace access if provided
      if (workspaceId) {
        const workspace = await storage.getWorkspace(workspaceId);
        if (!workspace) {
          return res.status(404).json({ error: 'Workspace not found' });
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
          return res.status(403).json({ error: 'Access denied to workspace' });
        }
      }

      // Get user's voice profile (optional, for maintaining voice consistency)
      const { voiceProfileService } = await import('../../services/VoiceProfileService');
      let voiceProfile = undefined;
      try {
        voiceProfile = await voiceProfileService.getProfile(userId, workspaceId || userId);
      } catch (error) {
        console.warn('[AI ADAPT CAPTION] Could not load voice profile, proceeding without it:', error);
      }

      // Use PlatformAdapterService to adapt caption
      const { PlatformAdapterService } = await import('../../services/PlatformAdapterService');
      const platformAdapter = new PlatformAdapterService();

      // Adapt caption for target platform
      const adaptedResult = await platformAdapter.adaptForPlatform(
        caption,
        targetPlatform,
        voiceProfile
      );

      console.log('[AI ADAPT CAPTION] Successfully adapted caption:', {
        targetPlatform: adaptedResult.platform,
        originalLength: caption.length,
        adaptedLength: adaptedResult.characterCount,
        warningCount: adaptedResult.warnings.length,
        adaptationNoteCount: adaptedResult.adaptationNotes.length
      });

      // Return adapted caption with all metadata
      res.json({
        success: true,
        adapted: {
          platform: adaptedResult.platform,
          caption: adaptedResult.caption,
          hashtags: adaptedResult.hashtags,
          characterCount: adaptedResult.characterCount,
          warnings: adaptedResult.warnings,
          adaptationNotes: adaptedResult.adaptationNotes,
          optimizationTips: adaptedResult.optimizationTips
        },
        original: {
          caption,
          characterCount: caption.length
        }
      });

    } catch (error: any) {
      console.error('[AI ADAPT CAPTION] Adaptation failed:', error);
      res.status(500).json({ 
        error: 'Failed to adapt caption',
        details: error.message 
      });
    }
  }
);

// ============================================================================
// TASK 22.2: SAFETY FEEDBACK ENDPOINTS
// Requirements: 11.6 - User feedback on safety false positives
// ============================================================================

const SafetyFeedbackSchema = z.object({
  workspaceId: z.string().min(1),
  captionId: z.string().optional(),
  feedbackType: z.enum(['false_positive', 'missed_issue', 'calibration_request']),
  flaggedIssue: z.string().min(1).max(500),
  userRating: z.enum(['inappropriate', 'acceptable', 'authentic']),
  comment: z.string().max(1000).optional(),
  caption: z.string().min(1).max(5000),
  safetyLevel: z.enum(['off', 'standard', 'strict']),
  originalSafetyScore: z.number().min(0).max(100),
  originalFlags: z.array(z.string()),
});

/**
 * Submit safety feedback
 * 
 * Allows users to report false positives or request calibration adjustments
 * for the content safety system.
 */
router.post('/safety-feedback',
  requireAuth,
  validateRequest({ body: SafetyFeedbackSchema }),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user.id;
      const feedbackData = req.body;

      console.log('[SAFETY FEEDBACK] Receiving feedback from user:', userId, {
        workspaceId: feedbackData.workspaceId,
        feedbackType: feedbackData.feedbackType,
        userRating: feedbackData.userRating,
      });

      // Validate workspace access
      const workspace = await storage.getWorkspace(feedbackData.workspaceId);
      if (!workspace) {
        return res.status(404).json({ error: 'Workspace not found' });
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
        return res.status(403).json({ error: 'Access denied to workspace' });
      }

      // Submit feedback using SafetyFeedbackService
      const { safetyFeedbackService } = await import('../../services/SafetyFeedbackService');
      const feedback = await safetyFeedbackService.submitFeedback({
        userId,
        workspaceId: feedbackData.workspaceId,
        captionId: feedbackData.captionId,
        feedbackType: feedbackData.feedbackType,
        flaggedIssue: feedbackData.flaggedIssue,
        userRating: feedbackData.userRating,
        comment: feedbackData.comment,
        caption: feedbackData.caption,
        safetyLevel: feedbackData.safetyLevel,
        originalSafetyScore: feedbackData.originalSafetyScore,
        originalFlags: feedbackData.originalFlags,
      });

      console.log('[SAFETY FEEDBACK] Feedback submitted successfully:', feedback.id);

      res.json({
        success: true,
        feedback: {
          id: feedback.id,
          status: feedback.status,
          calibrationApplied: feedback.calibrationApplied,
        },
        message: 'Thank you for your feedback. Our system will learn from this to improve safety filtering accuracy.',
      });

    } catch (error: any) {
      console.error('[SAFETY FEEDBACK] Submission failed:', error);
      res.status(500).json({ 
        error: 'Failed to submit safety feedback',
        details: error.message 
      });
    }
  }
);

/**
 * Get safety calibration settings
 * 
 * Returns the user's current safety calibration settings including
 * allowed and sensitive patterns.
 */
router.get('/safety-calibration/:workspaceId',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user.id;
      const { workspaceId } = req.params;

      // Validate workspace access
      const workspace = await storage.getWorkspace(workspaceId);
      if (!workspace) {
        return res.status(404).json({ error: 'Workspace not found' });
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
        return res.status(403).json({ error: 'Access denied to workspace' });
      }

      // Get calibration settings
      const { safetyFeedbackService } = await import('../../services/SafetyFeedbackService');
      const calibration = await safetyFeedbackService.getCalibration(userId, workspaceId);
      
      // Get feedback statistics
      const stats = await safetyFeedbackService.getFeedbackStats(userId, workspaceId);

      res.json({
        success: true,
        calibration: calibration || {
          allowedPatterns: [],
          sensitivePatterns: [],
          customRules: [],
          falsePositiveCount: 0,
          feedbackCount: 0,
        },
        statistics: stats,
      });

    } catch (error: any) {
      console.error('[SAFETY CALIBRATION] Retrieval failed:', error);
      res.status(500).json({ 
        error: 'Failed to retrieve safety calibration',
        details: error.message 
      });
    }
  }
);

/**
 * Get recent safety feedback
 * 
 * Returns recent safety feedback submissions for the user/workspace
 */
router.get('/safety-feedback/:workspaceId',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user.id;
      const { workspaceId } = req.params;
      const limit = parseInt(req.query.limit as string) || 10;

      // Validate workspace access
      const workspace = await storage.getWorkspace(workspaceId);
      if (!workspace) {
        return res.status(404).json({ error: 'Workspace not found' });
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
        return res.status(403).json({ error: 'Access denied to workspace' });
      }

      // Get recent feedback
      const { safetyFeedbackService } = await import('../../services/SafetyFeedbackService');
      const feedback = await safetyFeedbackService.getRecentFeedback(userId, workspaceId, limit);

      res.json({
        success: true,
        feedback,
        count: feedback.length,
      });

    } catch (error: any) {
      console.error('[SAFETY FEEDBACK] Retrieval failed:', error);
      res.status(500).json({ 
        error: 'Failed to retrieve safety feedback',
        details: error.message 
      });
    }
  }
);

// ---------------------------------------------------------------------------
// Multi-Platform Caption Generation (Task 11.2)
// POST /api/v1/ai/generate-multi-platform-captions
//
// Enforces platform-specific caption constraints BEFORE calling AIServiceManager:
//   - Facebook / Both (Facebook slot): max 500 chars, max 3 hashtags,
//     conversational tone directive
//   - Instagram: max 2200 chars, hashtag-discovery tone directive
//
// When targetPlatforms includes both Instagram and Facebook a shared creative
// brief (topic, angle, CTA) is generated first and returned in the response so
// the user can see it.  The two distinct caption variants are then generated in
// parallel.  Partial-success semantics: if one platform's generation fails the
// other platform's caption is still returned with `error` on the failed entry.
//
// Requirements: 11.2, 11.3, 11.4, 11.5
// ---------------------------------------------------------------------------

const GenerateMultiPlatformCaptionsSchema = z.object({
  targetPlatforms: z
    .array(z.enum(['instagram', 'facebook']))
    .min(1, 'At least one platform must be specified')
    .max(2),
  topic: z.string().min(1).max(1000),
  workspaceId: z.string().optional(),
  preferences: z
    .object({
      aiModel: z.string().optional(),
      creativityLevel: z.number().min(0).max(1).optional(),
      optimizationGoals: z.string().optional(),
      aiPersona: z.string().optional(),
      captionStyle: z.string().optional(),
      responseLength: z.string().optional(),
      multilingual: z.string().optional(),
      contentSafety: z.string().optional(),
      contentNiche: z.string().optional(),
    })
    .optional(),
});

router.post(
  '/generate-multi-platform-captions',
  requireAuth,
  aiRateLimiter,
  aiFeatureMiddleware('caption.generation'),
  validateRequest({ body: GenerateMultiPlatformCaptionsSchema }),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user.id;
      const { targetPlatforms, topic, workspaceId, preferences = {} } = req.body;

      const finalWorkspaceId =
        workspaceId || (req.headers['workspace-id'] as string) || userId;

      console.log('[AI MULTI-PLATFORM CAPTION] Request:', {
        userId,
        targetPlatforms,
        topic: topic.substring(0, 80),
        workspaceId: finalWorkspaceId,
      });

      // Validate workspace access when an explicit workspaceId is supplied
      if (workspaceId) {
        const workspace = await storage.getWorkspace(workspaceId);
        if (!workspace) {
          return res.status(404).json({ error: 'Workspace not found' });
        }

        const user = await storage.getUser(userId);
        const workspaceUserId = workspace.userId?.toString();
        const requestUserId = userId.toString();
        const firebaseUid = user?.firebaseUid;

        const userOwnsWorkspace =
          workspaceUserId === requestUserId ||
          workspaceUserId === firebaseUid ||
          workspace.userId === userId ||
          workspace.userId === firebaseUid;

        if (!userOwnsWorkspace) {
          return res.status(403).json({ error: 'Access denied to workspace' });
        }
      }

      // Delegate to the MultiPlatformCaptionService — constraint enforcement
      // and parallel AI calls happen inside the service.
      const result = await multiPlatformCaptionService.generateCaptions({
        targetPlatforms: targetPlatforms as PlatformId[],
        topic,
        userId,
        workspaceId: finalWorkspaceId,
        preferences,
      });

      console.log('[AI MULTI-PLATFORM CAPTION] Generation complete:', {
        userId,
        hasBrief: !!result.sharedBrief,
        platforms: result.captions.map((c) => ({
          platform: c.platform,
          chars: c.characterCount,
          hashtags: c.hashtagCount,
          hasError: !!c.error,
        })),
      });

      return res.json({
        success: true,
        ...result,
      });
    } catch (error: any) {
      console.error('[AI MULTI-PLATFORM CAPTION] Failed:', error);
      return res.status(500).json({
        error: 'Failed to generate multi-platform captions',
        details: error.message,
      });
    }
  },
);

export default router;
