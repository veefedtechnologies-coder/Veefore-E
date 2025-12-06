import { Router, Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/require-auth';
import { aiRateLimiter } from '../../middleware/rate-limiting-working';
import { validateRequest } from '../../middleware/validation';
import { storage } from '../../mongodb-storage';
import { TrendingTopicsAPI } from '../../trending-topics-api';
import { generateAIGrowthInsights, generateVisualInsights } from '../../ai-growth-insights';

const router = Router();
const trendingTopicsAPI = TrendingTopicsAPI.getInstance();

const TrendingTopicsQuerySchema = z.object({
  category: z.string().max(100).default('Business and Finance'),
  clearCache: z.enum(['true', 'false']).optional(),
});

const TrendingHashtagsQuerySchema = z.object({
  category: z.string().max(100).default('all'),
});

router.get('/trending-topics',
  validateRequest({ query: TrendingTopicsQuerySchema }),
  async (req: any, res: Response) => {
    try {
      const { category = 'Business and Finance', clearCache } = req.query;
      
      console.log(`[TRENDING TOPICS API] Fetching trending topics for category: ${category}`);
      
      if (clearCache === 'true') {
        console.log(`[TRENDING TOPICS API] Clearing cache as requested`);
        trendingTopicsAPI.clearCache();
      }
      
      const trendingData = await trendingTopicsAPI.getTrendingTopics(category);
      
      console.log(`[TRENDING TOPICS API] ✅ Successfully fetched ${trendingData.topics.length} trending topics for ${category}`);
      console.log(`[TRENDING TOPICS API] Topics preview:`, trendingData.topics.map(t => t.topic));
      
      res.json(trendingData);
      
    } catch (error) {
      console.error('[TRENDING TOPICS API] Error:', error);
      res.status(500).json({ 
        error: 'Failed to fetch trending topics',
        fallback: true
      });
    }
  }
);

router.post('/trending-topics/clear-cache',
  async (req: any, res: Response) => {
    try {
      trendingTopicsAPI.clearCache();
      console.log('[TRENDING TOPICS API] Cache cleared successfully');
      res.json({ success: true, message: 'Cache cleared successfully' });
    } catch (error) {
      console.error('[TRENDING TOPICS API] Error clearing cache:', error);
      res.status(500).json({ error: 'Failed to clear cache' });
    }
  }
);

router.get('/hashtags/trending',
  requireAuth,
  validateRequest({ query: TrendingHashtagsQuerySchema }),
  async (req: any, res: Response) => {
    try {
      const { category = 'all' } = req.query;
      console.log(`[LEGACY HASHTAGS] Redirecting to authentic trend analyzer for category: ${category}`);
      
      const { authenticTrendAnalyzer } = await import('../../authentic-trend-analyzer');
      const trendingData = await authenticTrendAnalyzer.getAuthenticTrendingData(category);
      
      console.log(`[LEGACY HASHTAGS] Retrieved ${trendingData.trends.hashtags.length} authentic trending hashtags`);
      res.json(trendingData.trends.hashtags);
    } catch (error) {
      console.error('[LEGACY HASHTAGS] Error fetching hashtags:', error);
      res.status(500).json({ error: 'Failed to fetch trending hashtags' });
    }
  }
);

function calculateContentScore(platforms: any[]): number {
  let score = 60;
  
  platforms.forEach(platform => {
    if (platform.posts > 10) score += 5;
    if (platform.engagement > 3) score += 10;
    if (platform.followers > 100) score += 5;
    if (platform.recentPosts?.length > 0) score += 5;
  });
  
  return Math.min(score, 95);
}

router.get('/ai-growth-insights',
  requireAuth,
  aiRateLimiter,
  async (req: any, res: Response) => {
    try {
      console.log('[AI INSIGHTS API] Generating comprehensive growth insights for user:', req.user.id);
      
      const workspaces = await storage.getWorkspacesByUserId(req.user.id);
      if (!workspaces || workspaces.length === 0) {
        return res.status(404).json({ error: 'No workspaces found' });
      }

      const workspace = workspaces[0];
      
      const socialAccounts = await storage.getSocialAccountsByWorkspace(workspace.id);
      
      if (!socialAccounts || socialAccounts.length === 0) {
        return res.json({
          insights: [],
          message: 'Connect social accounts to get AI growth insights'
        });
      }
      
      const analysisData: {
        platforms: any[];
        overallMetrics: {
          totalReach: number;
          avgEngagement: number;
          totalFollowers: number;
          contentScore: number;
        };
      } = {
        platforms: [],
        overallMetrics: {
          totalReach: 0,
          avgEngagement: 0,
          totalFollowers: 0,
          contentScore: 75
        }
      };
      
      let totalFollowers = 0;
      let totalEngagement = 0;
      let platformCount = 0;
      
      for (const account of socialAccounts) {
        platformCount++;
        const followers = account.followersCount || account.subscriberCount || 0;
        const posts = account.mediaCount || account.videoCount || 0;
        totalFollowers += followers;
        
        let engagementRate = 0;
        if (account.platform === 'instagram' && followers > 0) {
          engagementRate = followers < 1000 ? 8.5 : followers < 10000 ? 4.2 : 2.1;
        } else if (account.platform === 'youtube' && followers > 0) {
          engagementRate = followers < 1000 ? 12.0 : followers < 10000 ? 6.5 : 3.2;
        }
        
        totalEngagement += engagementRate;
        
        let recentPosts: any[] = [];
        try {
          if (account.platform === 'instagram') {
            console.log('[AI INSIGHTS] Skipping Instagram media analysis - using account metadata only');
            
            recentPosts = [{
              id: `${account.username}_recent_1`,
              caption: 'Recent Instagram post',
              hashtags: [],
              likes: Math.round((account.followersCount || 0) * 0.05),
              comments: Math.round((account.followersCount || 0) * 0.01),
              mediaUrl: null,
              mediaType: 'image',
              timestamp: new Date().toISOString()
            }];
          }
        } catch (error) {
          console.error('[AI INSIGHTS] Error fetching recent posts for', account.platform, error);
        }
        
        analysisData.platforms.push({
          platform: account.platform,
          username: account.username,
          followers,
          posts,
          engagement: engagementRate,
          recentPosts
        });
      }
      
      analysisData.overallMetrics = {
        totalReach: Math.round(totalFollowers * 2.5),
        avgEngagement: platformCount > 0 ? totalEngagement / platformCount : 0,
        totalFollowers,
        contentScore: calculateContentScore(analysisData.platforms)
      };
      
      console.log('[AI INSIGHTS API] Generating AI analysis with data:', {
        platforms: analysisData.platforms.length,
        metrics: analysisData.overallMetrics
      });
      
      const [generalInsights, visualInsights] = await Promise.all([
        generateAIGrowthInsights(analysisData),
        generateVisualInsights(analysisData)
      ]);
      
      console.log('[AI INSIGHTS API] AI analysis completed:', {
        generalInsights: generalInsights.length,
        visualInsights: visualInsights.length
      });
      
      const allInsights = [...generalInsights, ...visualInsights]
        .sort((a, b) => {
          const priorityOrder: Record<string, number> = { high: 3, medium: 2, low: 1 };
          return (priorityOrder[b.priority] || 0) - (priorityOrder[a.priority] || 0);
        })
        .slice(0, 8);
      
      console.log('[AI INSIGHTS] Generated', allInsights.length, 'total insights');
      
      res.json({
        insights: allInsights,
        metadata: {
          analysisDate: new Date().toISOString(),
          platformsAnalyzed: analysisData.platforms.length,
          totalContent: analysisData.platforms.reduce((sum, p) => sum + (p.recentPosts?.length || 0), 0),
          overallScore: analysisData.overallMetrics.contentScore
        }
      });
      
    } catch (error) {
      console.error('[AI INSIGHTS API] Error:', error);
      res.status(500).json({ error: 'Failed to generate AI insights' });
    }
  }
);

export default router;
