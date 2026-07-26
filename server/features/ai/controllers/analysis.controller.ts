import { Response } from 'express';
import OpenAI from 'openai';
import { AuthenticatedRequest } from '../../../types/express';
import { storage } from '../../../mongodb-storage';
import {
  aiCreditMeteringService,
  InsufficientAICreditsError,
} from '../../subscription/services/AICreditMeteringService';
import { fromOpenAIUsage, recordAIUsage } from '../../../services/aiUsageTracker';
import { generateCompetitorAnalysis } from '../../../competitor-analysis-ai';
import { HashtagGeneratorService } from '../../../services/HashtagGeneratorService';
import { AICreditService } from '../../../services/AICreditService';

/**
 * Analysis Controller
 * Handles competitor analysis, hashtag generation, and other analytical functions
 * Requirements: 4.2, 4.6, 12.5
 */

export class AnalysisController {
  /**
   * Analyze competitor profiles
   */
  static async analyzeCompetitor(req: AuthenticatedRequest, res: Response): Promise<void> {
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
        res.status(402).json({ error: deductResult.error || 'Failed to deduct credits' });
        return;
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

  /**
   * Generate hashtags for content
   */
  static async generateHashtags(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { title, description, type, platform } = req.body;
      const userId = req.user.id;
      
      if (!title && !description) {
        res.status(400).json({ error: 'Title or description is required' });
        return;
      }

      if (!process.env.OPENAI_API_KEY) {
        res.status(500).json({ error: 'OpenAI API key not configured' });
        return;
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

      const { result: hashtags, settlement } = await aiCreditMeteringService.runMetered(
        'hashtagGeneration',
        'hashtag.generation',
        { userId, workspaceId: req.body.workspaceId },
        async () => {
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
            throw new Error('Failed to generate hashtags');
          }

          const data = await response.json() as any;
          const hashtagText = data.choices[0].message.content?.trim() || '';
          recordAIUsage({
            provider: 'openai',
            model: 'gpt-4o',
            callType: 'text',
            usage: fromOpenAIUsage(data.usage),
            promptText: prompt,
            completionText: hashtagText,
          });
          const hashtags = hashtagText.split(/\s+/).filter((tag: string) => tag.startsWith('#'));
          if (hashtags.length < 3) {
            throw new Error('AI returned too few usable hashtags');
          }
          return hashtags;
        },
      );

      res.json({ 
        hashtags,
        creditsUsed: settlement.charged,
        remainingCredits: settlement.remaining
      });

    } catch (error: any) {
      console.error('[AI HASHTAGS] Generation failed:', error);
      const status = error instanceof InsufficientAICreditsError ? 402 : 500;
      res.status(status).json({ error: error.message || 'Failed to generate hashtags' });
    }
  }
}
