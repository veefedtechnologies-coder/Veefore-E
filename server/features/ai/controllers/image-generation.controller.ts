import { Response } from 'express';
import OpenAI from 'openai';
import { AuthenticatedRequest } from '../../../types/express';
import { storage } from '../../../mongodb-storage';
import { AICreditService } from '../../../services/AICreditService';

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

      const creditCost = AICreditService.calculateCost('image_generation');
      const creditCheck = await AICreditService.checkCredits(userId, creditCost);
      if (!creditCheck.hasCredits) {
        res.status(402).json({ 
          error: `Insufficient credits. Image generation requires ${creditCost} credits.`,
          required: creditCost,
          current: creditCheck.currentCredits,
          upgradeModal: true 
        });
        return;
      }

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
          res.status(402).json({ error: deductResult.error || 'Failed to deduct credits' });
          return;
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
        res.status(500).json({ 
          error: 'AI generation failed. Please try again.',
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
