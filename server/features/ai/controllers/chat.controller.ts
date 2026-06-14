import { Response } from 'express';
import OpenAI from 'openai';
import { AuthenticatedRequest } from '../../../types/express';
import { AICreditService } from '../../../services/AICreditService';

/**
 * Chat Controller
 * Handles AI chat conversations with brand voice support
 * Requirements: 4.2, 4.6, 12.5
 */

export class ChatController {
  /**
   * Handle AI chat messages
   */
  static async chat(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const user = req.user;
      const userId = user.id;
      const { message, brandVoice, workspaceId } = req.body;

      if (!message?.trim()) {
        res.status(400).json({ error: 'Message is required' });
        return;
      }

      const creditCost = AICreditService.calculateCost('chat');
      const creditCheck = await AICreditService.checkCredits(userId, creditCost);
      if (!creditCheck.hasCredits) {
        res.status(402).json({ 
          error: 'Insufficient credits',
          required: creditCost,
          current: creditCheck.currentCredits
        });
        return;
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
        res.status(402).json({ 
          error: 'OpenAI API quota exceeded. Please check your billing details.',
          type: 'quota_exceeded'
        });
        return;
      }
      
      if (error.code === 'invalid_api_key') {
        res.status(401).json({ 
          error: 'Invalid OpenAI API key configuration.',
          type: 'auth_error'
        });
        return;
      }

      res.status(500).json({ 
        error: 'Failed to generate AI response',
        details: error.message 
      });
    }
  }
}
