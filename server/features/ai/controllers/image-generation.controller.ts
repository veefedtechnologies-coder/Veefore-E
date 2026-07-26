import { Response } from 'express';
import OpenAI from 'openai';
import { AuthenticatedRequest } from '../../../types/express';
import { storage } from '../../../mongodb-storage';
import {
  aiCreditMeteringService,
  InsufficientAICreditsError,
} from '../../subscription/services/AICreditMeteringService';
import { fromOpenAIUsage, recordAIUsage } from '../../../services/aiUsageTracker';

/**
 * Image Generation Controller
 * Handles AI image generation with DALL-E
 * Requirements: 4.2, 4.6, 12.5
 */

export class ImageGenerationController {
  /**
   * Generate image using DALL-E 3
   */
  static async generateImage(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const user = req.user;
      const userId = user.id;
      const { prompt, platform, contentType, style, workspaceId, dimensions } = req.body;

      console.log('[AI IMAGE] Request:', { userId, platform, contentType, style });

      const openaiApiKey = process.env.OPENAI_API_KEY;
      if (!openaiApiKey) {
        res.status(500).json({ 
          error: 'OpenAI API key not configured. Please contact support to enable AI image generation.',
          requiresSetup: true 
        });
        return;
      }

      try {
        const openai = new OpenAI({ apiKey: openaiApiKey });
        const requestIdHeader = req.headers['idempotency-key'] ?? req.headers['x-request-id'];
        const requestId = Array.isArray(requestIdHeader) ? requestIdHeader[0] : requestIdHeader;
        const idempotencyKey = requestId
          ? `image-generation:${userId}:${requestId}`
          : `image-generation:${userId}:${Date.now()}:${Math.random().toString(36).slice(2)}`;

        const { result: generated, settlement } = await aiCreditMeteringService.runMetered(
          'imageGeneration',
          'image.generation',
          { userId, workspaceId, idempotencyKey },
          async () => {
        const imageResponse = await openai.images.generate({
          model: "dall-e-3",
          prompt: prompt,
          n: 1,
          size: "1024x1024",
          quality: "standard",
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

        const caption = captionResponse.choices[0]?.message?.content?.trim() || '';
        if (!caption) {
          throw new Error('AI returned no usable image caption');
        }

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
        if (hashtags.length < 3) {
          throw new Error('AI returned too few usable image hashtags');
        }

        recordAIUsage({
          provider: 'openai',
          model: 'gpt-4o',
          callType: 'text',
          usage: fromOpenAIUsage(captionResponse.usage),
          completionText: caption,
        });
        recordAIUsage({
          provider: 'openai',
          model: 'gpt-4o',
          callType: 'text',
          usage: fromOpenAIUsage(hashtagResponse.usage),
          completionText: hashtagText,
        });

        return { imageUrl, caption, hashtags };
          },
          3.4,
        );
        const { imageUrl, caption, hashtags } = generated;

        if (workspaceId) {
          try {
            await storage.createContent({
              title: `AI Generated Image: ${prompt.substring(0, 50)}...`,
              description: caption,
              type: 'image',
              platform: platform || null,
              status: 'ready',
              workspaceId: workspaceId,
              creditsUsed: settlement.charged,
              contentData: {
                imageUrl,
                caption,
                hashtags,
                prompt,
                style,
                dimensions: dimensions || { width: 1024, height: 1024 }
              }
            });
          } catch (persistenceError) {
            // The Create Post action is not successful unless its generated
            // content is durably saved. Refund the settled reservation before
            // surfacing the persistence failure.
            await aiCreditMeteringService.refundSettlement(idempotencyKey);
            throw persistenceError;
          }
        }

        console.log('[AI IMAGE] Successfully generated image and caption');

        res.json({
          success: true,
          imageUrl,
          caption,
          hashtags,
          creditsUsed: settlement.charged,
          remainingCredits: settlement.remaining
        });

      } catch (aiError: any) {
        console.error('[AI IMAGE] OpenAI API error:', aiError);
        const status = aiError instanceof InsufficientAICreditsError ? 402 : 500;
        res.status(status).json({ 
          error: aiError.message || 'AI generation failed. Please try again.',
          details: aiError.message 
        });
        return;
      }

    } catch (error: any) {
      console.error('[AI IMAGE] Generation failed:', error);
      res.status(500).json({ error: 'Failed to generate image' });
    }
  }
}
