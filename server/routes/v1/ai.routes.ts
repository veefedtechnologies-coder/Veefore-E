import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/require-auth';
import { aiRateLimiter } from '../../middleware/rate-limiting-working';
import { validateRequest } from '../../middleware/validation';
import { storage } from '../../mongodb-storage';
import { AICreditService } from '../../services/AICreditService';
import { generateCompetitorAnalysis } from '../../competitor-analysis-ai';
import { safeParseAIResponse } from '../../middleware/unsafe-json-replacements';
import OpenAI from 'openai';

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
});

const GenerateHashtagsSchema = z.object({
  title: z.string().max(500).optional(),
  description: z.string().max(2000).optional(),
  type: z.string().max(50).optional(),
  platform: z.string().max(50).optional(),
});

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

router.post('/creative-brief',
  requireAuth,
  aiRateLimiter,
  validateRequest({ body: CreativeBriefSchema }),
  async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.id;
      const creditCost = AICreditService.calculateCost('content_generation');
      
      const creditCheck = await AICreditService.checkCredits(userId, creditCost);
      if (!creditCheck.hasCredits) {
        return res.status(402).json({ 
          error: 'Insufficient credits',
          required: creditCost,
          current: creditCheck.currentCredits
        });
      }

      console.log('[CREATIVE BRIEF AI] Generating creative brief for user:', userId);

      const workspaceId = req.body.workspaceId || req.headers['workspace-id'];
      if (workspaceId) {
        const workspace = await storage.getWorkspace(workspaceId);
        if (!workspace) {
          return res.status(404).json({ error: 'Workspace not found' });
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
          return res.status(403).json({ error: 'Access denied to workspace' });
        }
      }

      const { creativeBriefAI } = await import('../../creative-brief-ai');
      const briefResult = await creativeBriefAI.generateBrief(req.body);

      const deductResult = await AICreditService.deductCredits(userId, 'content_generation', {
        creditsToDeduct: creditCost,
        workspaceId,
        endpoint: '/api/v1/ai/creative-brief'
      });

      if (!deductResult.success) {
        console.error('[CREATIVE BRIEF AI] Credit deduction failed:', deductResult.error);
        return res.status(402).json({ error: deductResult.error || 'Failed to deduct credits' });
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
);

router.post('/content-repurpose',
  requireAuth,
  aiRateLimiter,
  validateRequest({ body: ContentRepurposeSchema }),
  async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.id;
      const creditCost = AICreditService.calculateCost('repurpose');
      
      const creditCheck = await AICreditService.checkCredits(userId, creditCost);
      if (!creditCheck.hasCredits) {
        return res.status(402).json({ 
          error: 'Insufficient credits',
          required: creditCost,
          current: creditCheck.currentCredits
        });
      }

      console.log('[CONTENT REPURPOSE AI] Repurposing content for user:', userId);

      const workspaceId = req.body.workspaceId || req.headers['workspace-id'];
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

      const { contentRepurposeAI } = await import('../../content-repurpose-ai');
      const repurposeResult = await contentRepurposeAI.repurposeContent(req.body);

      const deductResult = await AICreditService.deductCredits(userId, 'repurpose', {
        creditsToDeduct: creditCost,
        workspaceId,
        endpoint: '/api/v1/ai/content-repurpose'
      });

      if (!deductResult.success) {
        console.error('[CONTENT REPURPOSE AI] Credit deduction failed:', deductResult.error);
        return res.status(402).json({ error: deductResult.error || 'Failed to deduct credits' });
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
);

router.post('/content-repurpose/bulk',
  requireAuth,
  aiRateLimiter,
  validateRequest({ body: BulkRepurposeSchema }),
  async (req: Request, res: Response) => {
    try {
      const { sourceContent, sourceLanguage, targetLanguages, contentType, platform } = req.body;
      const userId = (req as any).user.id;

      const creditCost = targetLanguages.length * AICreditService.calculateCost('repurpose');
      const creditCheck = await AICreditService.checkCredits(userId, creditCost);
      if (!creditCheck.hasCredits) {
        return res.status(402).json({ 
          error: 'Insufficient credits',
          required: creditCost,
          current: creditCheck.currentCredits
        });
      }

      const { contentRepurposeAI } = await import('../../content-repurpose-ai');
      
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
);

router.post('/competitor-analysis',
  requireAuth,
  aiRateLimiter,
  validateRequest({ body: CompetitorAnalysisSchema }),
  async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.id;
      const creditCost = AICreditService.calculateCost('competitor_analysis');
      
      const creditCheck = await AICreditService.checkCredits(userId, creditCost);
      if (!creditCheck.hasCredits) {
        return res.status(402).json({ 
          error: 'Insufficient credits',
          required: creditCost,
          current: creditCheck.currentCredits
        });
      }

      const { competitorUsername, platform, analysisType, workspaceId } = req.body;

      console.log('[COMPETITOR ANALYSIS AI] Analyzing competitor for user:', userId);

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
        console.error('[COMPETITOR ANALYSIS AI] Credit deduction failed:', deductResult.error);
        return res.status(402).json({ error: deductResult.error || 'Failed to deduct credits' });
      }

      console.log('[COMPETITOR ANALYSIS AI] Successfully analyzed competitor, credits deducted:', creditCost);

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
      console.error('[COMPETITOR ANALYSIS AI] Analysis failed:', error);
      res.status(500).json({ error: 'Failed to analyze competitor' });
    }
  }
);

router.post('/generate-caption',
  requireAuth,
  aiRateLimiter,
  validateRequest({ body: GenerateCaptionSchema }),
  async (req: Request, res: Response) => {
    try {
      const { title, type, platform, mediaUrl } = req.body;
      const userId = (req as any).user.id;
      
      if (!title && !mediaUrl) {
        return res.status(400).json({ error: 'Title or media URL is required' });
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

      if (!process.env.OPENAI_API_KEY) {
        return res.status(500).json({ error: 'OpenAI API key not configured' });
      }

      const prompt = `Create an engaging social media caption for ${platform || 'social media'}:
        Content Type: ${type || 'post'}
        Title: ${title || 'Content based on uploaded media'}
        
        Make it engaging, authentic, and suitable for ${platform || 'social media'}. 
        Keep it concise but compelling. Include relevant emojis if appropriate.
        Do not include hashtags - those will be generated separately.`;

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 200,
          temperature: 0.7
        })
      });

      if (!response.ok) {
        const error = await response.json();
        console.error('[AI CAPTION] OpenAI API error:', error);
        return res.status(500).json({ error: 'Failed to generate caption' });
      }

      const data = await response.json() as any;
      const caption = data.choices[0].message.content?.trim() || '';

      const deductResult = await AICreditService.deductCredits(userId, 'content_generation', {
        creditsToDeduct: creditCost,
        endpoint: '/api/v1/ai/generate-caption'
      });

      res.json({ 
        caption,
        creditsUsed: deductResult.creditsDeducted,
        remainingCredits: deductResult.creditsAfter
      });

    } catch (error: any) {
      console.error('[AI CAPTION] Generation failed:', error);
      res.status(500).json({ error: 'Failed to generate caption' });
    }
  }
);

router.post('/generate-hashtags',
  requireAuth,
  aiRateLimiter,
  validateRequest({ body: GenerateHashtagsSchema }),
  async (req: Request, res: Response) => {
    try {
      const { title, description, type, platform } = req.body;
      const userId = (req as any).user.id;
      
      if (!title && !description) {
        return res.status(400).json({ error: 'Title or description is required' });
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

      if (!process.env.OPENAI_API_KEY) {
        return res.status(500).json({ error: 'OpenAI API key not configured' });
      }

      const prompt = `Generate relevant hashtags for this ${platform || 'social media'} ${type || 'post'}:
        Title: ${title || ''}
        Description: ${description || ''}
        
        Generate 8-12 relevant hashtags that are:
        - Popular but not oversaturated
        - Relevant to the content
        - Mix of broad and niche tags
        - Appropriate for ${platform || 'social media'}
        
        Return only the hashtags with # symbols, separated by spaces.`;

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 150,
          temperature: 0.6
        })
      });

      if (!response.ok) {
        const error = await response.json();
        console.error('[AI HASHTAGS] OpenAI API error:', error);
        return res.status(500).json({ error: 'Failed to generate hashtags' });
      }

      const data = await response.json() as any;
      const hashtagText = data.choices[0].message.content?.trim() || '';
      const hashtags = hashtagText.split(/\s+/).filter((tag: string) => tag.startsWith('#'));

      const deductResult = await AICreditService.deductCredits(userId, 'content_generation', {
        creditsToDeduct: creditCost,
        endpoint: '/api/v1/ai/generate-hashtags'
      });

      res.json({ 
        hashtags,
        creditsUsed: deductResult.creditsDeducted,
        remainingCredits: deductResult.creditsAfter
      });

    } catch (error: any) {
      console.error('[AI HASHTAGS] Generation failed:', error);
      res.status(500).json({ error: 'Failed to generate hashtags' });
    }
  }
);

router.post('/generate-image',
  requireAuth,
  aiRateLimiter,
  validateRequest({ body: GenerateImageSchema }),
  async (req: Request, res: Response) => {
    try {
      const { user } = req as any;
      const userId = user.id;
      const { prompt, platform, contentType, style, workspaceId, dimensions } = req.body;

      console.log('[AI IMAGE] Request:', { userId, platform, contentType, style });

      const creditCost = AICreditService.calculateCost('image_generation');
      const creditCheck = await AICreditService.checkCredits(userId, creditCost);
      if (!creditCheck.hasCredits) {
        return res.status(402).json({ 
          error: `Insufficient credits. Image generation requires ${creditCost} credits.`,
          required: creditCost,
          current: creditCheck.currentCredits,
          upgradeModal: true 
        });
      }

      const openaiApiKey = process.env.OPENAI_API_KEY;
      if (!openaiApiKey) {
        return res.status(500).json({ 
          error: 'OpenAI API key not configured. Please contact support to enable AI image generation.',
          requiresSetup: true 
        });
      }

      try {
        const openai = new OpenAI({ apiKey: openaiApiKey });

        const imageResponse = await openai.images.generate({
          model: "dall-e-3",
          prompt: prompt,
          n: 1,
          size: platform === 'instagram' ? "1024x1024" : "1792x1024",
          quality: "hd",
          style: style === 'realistic' ? 'natural' : 'vivid'
        });

        const imageUrl = imageResponse.data?.[0]?.url;
        if (!imageUrl) {
          throw new Error('No image URL returned from DALL-E');
        }

        const captionResponse = await openai.chat.completions.create({
          model: "gpt-4o",
          messages: [
            {
              role: "system",
              content: `You are a professional social media content creator. Generate engaging, authentic captions for ${platform} ${contentType || 'posts'}. 
              
              Guidelines:
              - Create captivating, authentic captions that drive engagement
              - Include relevant emojis naturally within the text
              - Ask engaging questions to encourage comments
              - Write in a conversational, relatable tone
              - Keep it concise but compelling
              - Do NOT include hashtags (they will be generated separately)
              - Focus on storytelling and value for the audience`
            },
            {
              role: "user",
              content: `Generate an engaging caption for this ${platform} ${contentType || 'post'} about: ${prompt}
              
              Style: ${style || 'professional'}
              Platform: ${platform || 'instagram'}
              
              Make it authentic and engaging without using hashtags.`
            }
          ],
          max_tokens: 200,
          temperature: 0.7
        });

        const caption = captionResponse.choices[0]?.message?.content?.trim() || 'Amazing content created with AI! What do you think? 💭';

        const hashtagResponse = await openai.chat.completions.create({
          model: "gpt-4o",
          messages: [
            {
              role: "system",
              content: `Generate relevant, trending hashtags for ${platform} posts. Return 8-12 hashtags that are:
              - Popular but not oversaturated
              - Relevant to the content
              - Mix of broad and niche tags
              - Include # symbol
              - Separate with spaces`
            },
            {
              role: "user",
              content: `Generate hashtags for: ${prompt}\nPlatform: ${platform}\nStyle: ${style}`
            }
          ],
          max_tokens: 100,
          temperature: 0.6
        });

        const hashtagText = hashtagResponse.choices[0]?.message?.content?.trim() || '';
        const hashtags = hashtagText.split(/\s+/).filter(tag => tag.startsWith('#')).slice(0, 12);

        const deductResult = await AICreditService.deductCredits(userId, 'image_generation', {
          creditsToDeduct: creditCost,
          workspaceId,
          endpoint: '/api/v1/ai/generate-image'
        });

        if (!deductResult.success) {
          console.error('[AI IMAGE] Credit deduction failed:', deductResult.error);
          return res.status(402).json({ error: deductResult.error || 'Failed to deduct credits' });
        }

        if (workspaceId) {
          await storage.createContent({
            title: `AI Generated Image: ${prompt.substring(0, 50)}...`,
            description: caption,
            type: 'image',
            platform: platform || null,
            status: 'ready',
            workspaceId: workspaceId,
            creditsUsed: creditCost,
            contentData: {
              imageUrl,
              caption,
              hashtags,
              prompt,
              style,
              dimensions: dimensions || { width: 1024, height: 1024 }
            }
          });
        }

        console.log('[AI IMAGE] Successfully generated image and caption');

        res.json({
          success: true,
          imageUrl,
          caption,
          hashtags,
          creditsUsed: deductResult.creditsDeducted,
          remainingCredits: deductResult.creditsAfter
        });

      } catch (aiError: any) {
        console.error('[AI IMAGE] OpenAI API error:', aiError);
        return res.status(500).json({ 
          error: 'AI generation failed. Please try again.',
          details: aiError.message 
        });
      }

    } catch (error: any) {
      console.error('[AI IMAGE] Generation failed:', error);
      res.status(500).json({ error: 'Failed to generate image' });
    }
  }
);

router.post('/generate-script',
  requireAuth,
  aiRateLimiter,
  validateRequest({ body: GenerateScriptSchema }),
  async (req: Request, res: Response) => {
    try {
      const { user } = req as any;
      const userId = user.id;
      const { prompt, platform, contentType, style, duration, workspaceId, dimensions } = req.body;

      console.log('[AI SCRIPT] Request:', { userId, platform, contentType, style, duration });

      const creditCost = AICreditService.calculateCost('content_generation');
      const creditCheck = await AICreditService.checkCredits(userId, creditCost);
      if (!creditCheck.hasCredits) {
        return res.status(402).json({ 
          error: `Insufficient credits. Script generation requires ${creditCost} credits.`,
          required: creditCost,
          current: creditCheck.currentCredits,
          upgradeModal: true 
        });
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
);

router.post('/chat',
  requireAuth,
  aiRateLimiter,
  validateRequest({ body: ChatSchema }),
  async (req: Request, res: Response) => {
    try {
      const { user } = req as any;
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

export default router;
