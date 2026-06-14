import { Response } from 'express';
import OpenAI from 'openai';
import { AuthenticatedRequest } from '../../../types/express';
import { storage } from '../../../mongodb-storage';
import { AICreditService } from '../../../services/AICreditService';
import { safeParseAIResponse } from '../../../middleware/unsafe-json-replacements';

/**
 * Content Generation Controller
 * Handles creative briefs, repurposing, scripts, images
 * Requirements: 4.2, 4.6, 12.5
 */

export class ContentGenerationController {
  /**
   * Generate creative brief
   */
  static async generateCreativeBrief(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
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

      console.log('[CREATIVE BRIEF AI] Generating creative brief for user:', userId);

      const workspaceId = req.body.workspaceId || req.headers['workspace-id'];
      if (workspaceId) {
        const workspace = await storage.getWorkspace(workspaceId);
        if (!workspace) {
          res.status(404).json({ error: 'Workspace not found' });
          return;
        }
        
        const workspaceIdStr = (workspace._id || workspace.id)?.toString();
        const user = await storage.getUser(userId);
        const requestUserId = userId.toString();
        const firebaseUid = user?.firebaseUid;
        const workspaceUserId = workspace.userId?.toString();
        
        const userOwnsWorkspace = workspaceUserId === requestUserId || 
                                 workspaceUserId === firebaseUid ||
                                 workspace.userId === userId ||
                                 workspace.userId === firebaseUid;
        
        if (!userOwnsWorkspace) {
          res.status(403).json({ error: 'Access denied to workspace' });
          return;
        }
      }

      const { creativeBriefAI } = await import('../../../creative-brief-ai');
      const briefResult = await creativeBriefAI.generateBrief(req.body);

      const deductResult = await AICreditService.deductCredits(userId, 'content_generation', {
        creditsToDeduct: creditCost,
        workspaceId,
        endpoint: '/api/v1/ai/creative-brief'
      });

      if (!deductResult.success) {
        console.error('[CREATIVE BRIEF AI] Credit deduction failed:', deductResult.error);
        res.status(402).json({ error: deductResult.error || 'Failed to deduct credits' });
        return;
      }

      console.log('[CREATIVE BRIEF AI] Successfully generated brief, credits deducted:', creditCost);

      res.json({
        success: true,
        generated: briefResult,
        creditsUsed: deductResult.creditsDeducted,
        remainingCredits: deductResult.creditsAfter
      });

    } catch (error: any) {
      console.error('[CREATIVE BRIEF AI] Generation failed:', error);
      res.status(500).json({ error: 'Failed to generate creative brief' });
    }
  }

  /**
   * Repurpose content for different platforms/languages
   */
  static async repurposeContent(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user.id;
      const creditCost = AICreditService.calculateCost('repurpose');
      
      const creditCheck = await AICreditService.checkCredits(userId, creditCost);
      if (!creditCheck.hasCredits) {
        res.status(402).json({ 
          error: 'Insufficient credits',
          required: creditCost,
          current: creditCheck.currentCredits
        });
        return;
      }

      console.log('[CONTENT REPURPOSE AI] Repurposing content for user:', userId);

      const workspaceId = req.body.workspaceId || req.headers['workspace-id'];
      if (workspaceId) {
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
      }

      const { contentRepurposeAI } = await import('../../../content-repurpose-ai');
      const repurposeResult = await contentRepurposeAI.repurposeContent(req.body);

      const deductResult = await AICreditService.deductCredits(userId, 'repurpose', {
        creditsToDeduct: creditCost,
        workspaceId,
        endpoint: '/api/v1/ai/content-repurpose'
      });

      if (!deductResult.success) {
        console.error('[CONTENT REPURPOSE AI] Credit deduction failed:', deductResult.error);
        res.status(402).json({ error: deductResult.error || 'Failed to deduct credits' });
        return;
      }

      console.log('[CONTENT REPURPOSE AI] Successfully repurposed content, credits deducted:', creditCost);

      res.json({
        success: true,
        repurposed: repurposeResult,
        creditsUsed: deductResult.creditsDeducted,
        remainingCredits: deductResult.creditsAfter
      });

    } catch (error: any) {
      console.error('[CONTENT REPURPOSE AI] Repurposing failed:', error);
      res.status(500).json({ error: 'Failed to repurpose content' });
    }
  }

  /**
   * Bulk repurpose content for multiple languages
   */
  static async bulkRepurposeContent(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { sourceContent, sourceLanguage, targetLanguages, contentType, platform } = req.body;
      const userId = req.user.id;

      const creditCost = targetLanguages.length * AICreditService.calculateCost('repurpose');
      const creditCheck = await AICreditService.checkCredits(userId, creditCost);
      if (!creditCheck.hasCredits) {
        res.status(402).json({ 
          error: 'Insufficient credits',
          required: creditCost,
          current: creditCheck.currentCredits
        });
        return;
      }

      const { contentRepurposeAI } = await import('../../../content-repurpose-ai');
      
      const bulkResults = await contentRepurposeAI.bulkRepurpose(
        sourceContent,
        sourceLanguage,
        targetLanguages,
        contentType,
        platform
      );

      const deductResult = await AICreditService.deductCredits(userId, 'repurpose', {
        creditsToDeduct: creditCost,
        endpoint: '/api/v1/ai/content-repurpose/bulk'
      });

      res.json({
        results: bulkResults,
        generated: bulkResults,
        creditsUsed: deductResult.creditsDeducted,
        remainingCredits: deductResult.creditsAfter,
        successCount: Object.keys(bulkResults).length,
        requestedCount: targetLanguages.length
      });

    } catch (error: any) {
      console.error('[BULK REPURPOSE AI] Processing failed:', error);
      res.status(500).json({ error: 'Failed to process bulk repurposing' });
    }
  }

  /**
   * Generate script for video content
   */
  static async generateScript(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const user = req.user;
      const userId = user.id;
      const { prompt, platform, contentType, style, duration, workspaceId, dimensions } = req.body;

      console.log('[AI SCRIPT] Request:', { userId, platform, contentType, style, duration });

      const creditCost = AICreditService.calculateCost('content_generation');
      const creditCheck = await AICreditService.checkCredits(userId, creditCost);
      if (!creditCheck.hasCredits) {
        res.status(402).json({ 
          error: `Insufficient credits. Script generation requires ${creditCost} credits.`,
          required: creditCost,
          current: creditCheck.currentCredits,
          upgradeModal: true 
        });
        return;
      }

      const openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY
      });

      const systemPrompt = `You are an expert content creator and scriptwriter. Generate professional scripts optimized for ${platform} ${contentType}.

Platform specs:
- ${platform} ${contentType}: ${dimensions ? `${dimensions.width}x${dimensions.height} (${dimensions.ratio})` : 'Standard dimensions'}
- Duration: ${duration} seconds
- Style: ${style}

Create engaging, platform-optimized content that drives engagement and views.`;

      const userPrompt = `Create a ${duration}-second ${style} script for ${platform} ${contentType} about: "${prompt}"

Include:
1. Hook (first 3 seconds)
2. Main content structure
3. Call-to-action
4. Engaging caption with emojis
5. 10-15 trending hashtags for ${platform}

Format as JSON with: script, caption, hashtags`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        response_format: { type: "json_object" },
        max_tokens: 1500,
        temperature: 0.7
      });

      let result: any;
      try {
        const aiContent = response.choices[0].message.content || '{}';
        const aiResult = safeParseAIResponse(aiContent);
        if (!aiResult.success) {
          console.error('[AI SECURITY] Invalid AI response format:', aiResult.error);
          result = { error: 'AI response parsing failed', fallback: true };
        } else {
          result = aiResult.data;
        }
      } catch (parseError) {
        console.error('[AI SCRIPT] JSON parse failed:', parseError);
        result = {
          script: response.choices[0].message.content || "Generated script content",
          caption: "🎬 AI-generated content",
          hashtags: ['#ai', '#content', '#viral']
        };
      }

      const deductResult = await AICreditService.deductCredits(userId, 'content_generation', {
        creditsToDeduct: creditCost,
        workspaceId,
        endpoint: '/api/v1/ai/generate-script'
      });

      const scriptResponse = {
        script: result.script || `Professional ${contentType} script for ${platform}:\n\nHook: Start with an attention-grabbing opening\nMain Content: Deliver your key message with engaging visuals\nCall to Action: End with a clear next step for viewers\n\nThis script is optimized for ${platform} ${contentType} format.`,
        caption: result.caption || "🎬 AI-generated content for your audience",
        hashtags: result.hashtags || ['#ai', '#content', '#viral'],
        creditsUsed: deductResult.creditsDeducted,
        remainingCredits: deductResult.creditsAfter,
        platform,
        contentType,
        dimensions
      };

      res.json(scriptResponse);

    } catch (error: any) {
      console.error('[AI SCRIPT] Error:', error);
      res.status(500).json({ error: error.message || 'Failed to generate script' });
    }
  }

  /**
   * Generate unified content (captions, media analysis)
   */
  static async generateContent(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user.id;
      const { mediaUrl, mediaType, postType, platform, existingCaption, workspaceId } = req.body;

      console.log('[AI GENERATE CONTENT][START] Request:', { userId, mediaUrl: !!mediaUrl, mediaType, postType, platform, workspaceId: !!workspaceId });

      // Early validation: Check if AI service is configured before credit checks
      const { aiServiceManager } = await import('../../../services/AIServiceManager');
      const isConfigured = await aiServiceManager.isConfigured();
      if (!isConfigured) {
        console.error('[AI GENERATE CONTENT][ERROR] AI service not configured');
        res.status(503).json({ 
          error: 'AI service is not configured. Please contact support.',
          requiresSetup: true,
          details: 'The AI content generation service requires configuration. Please reach out to support for assistance.'
        });
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

      // Validate workspace access if provided
      if (workspaceId) {
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
      }

      // Import and use AI content generator
      const { aiContentGenerator } = await import('../../../ai-content-generator');
      
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
        res.status(402).json({ error: deductResult.error || 'Failed to deduct credits' });
        return;
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
}
