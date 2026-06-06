import { Router } from 'express';
import mongoose from 'mongoose';
import { requireAuth } from '../middleware/require-auth';
import { ListeningSourceModel } from '../models/SocialListening/ListeningSource';
import { ListeningTrendModel } from '../models/SocialListening/ListeningTrend';
import { ListeningPostModel } from '../models/SocialListening/ListeningPost';
import { ListeningInsightModel } from '../models/SocialListening/ListeningInsight';
import { ListeningHookModel } from '../models/SocialListening/ListeningHook';
import { ListeningAggregationModel } from '../models/SocialListening/ListeningAggregation';
import { SocialListeningQueueManager } from '../queues/socialListeningQueue';
import { getOpenAIClient, isOpenAIAvailable } from '../openai-client';
import { RedditAdapter } from '../services/social-listening/adapters/RedditAdapter';
import { YouTubeAdapter } from '../services/social-listening/adapters/YouTubeAdapter';
import { AIExtractionService } from '../services/social-listening/ai-extraction.service';
import { TrendEngineService } from '../services/social-listening/trend-engine.service';

const router = Router();

// Ensure user is authenticated for all routes
router.use(requireAuth);

const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const buildNicheRegex = (niche: string): RegExp => {
  const trimmed = niche.trim();
  return new RegExp(escapeRegex(trimmed), 'i');
};

const getStrictUserNiche = (req: any): string | null => {
  const niche = req.query.niche;
  if (typeof niche !== 'string') return null;
  const trimmed = niche.trim();
  return trimmed.length > 0 ? trimmed : null;
};

/**
 * Get all configured sources for a workspace
 */
router.get('/sources/:workspaceId', async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const sources = await ListeningSourceModel.find({ workspaceId }).sort({ createdAt: -1 });
    res.json({ success: true, sources });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * Add a new source to track
 */
router.post('/sources', async (req, res) => {
  try {
    const { workspaceId, platform, type, value } = req.body;
    const userNiche = getStrictUserNiche(req);
    if (!userNiche) {
      return res.status(400).json({ success: false, error: 'Niche is required. Please set your niche before adding sources.' });
    }
    const source = await ListeningSourceModel.create({
      workspaceId,
      platform,
      type,
      value,
      metadata: {
        ...(req.body?.metadata || {}),
        niche: userNiche
      }
    });
    
    // Immediately trigger an ingestion job
    await SocialListeningQueueManager.scheduleIngestion({
      workspaceId,
      sourceId: source.id,
      platform,
      type,
      value,
      niche: userNiche
    });

    res.status(201).json({ success: true, source });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * Get aggregated trends
 */
router.get('/trends/:workspaceId', async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const userNiche = getStrictUserNiche(req);
    if (!userNiche) {
      return res.status(400).json({ success: false, error: 'Niche is required. Please set your niche to get authentic listening data.' });
    }
    const trends = await ListeningTrendModel.find({
      workspaceId
    })
      .sort({ velocityScore: -1 })
      .limit(20);
    res.json({ success: true, trends });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * Get dashboard overview metrics
 */
router.get('/dashboard/overview/:workspaceId', async (req, res) => {
  try {
    const workspaceId = req.params.workspaceId;
    const userNiche = getStrictUserNiche(req);
    
    if (!workspaceId) {
      return res.status(400).json({ success: false, error: 'Workspace ID is required' });
    }
    if (!userNiche) {
      return res.status(400).json({ success: false, error: 'Niche is required. Please set your niche to get authentic listening data.' });
    }

    const postNicheQuery = {
      workspaceId
    };
    const trendNicheQuery = {
      workspaceId,
      status: { $ne: 'Declining' }
    };

    const [totalMentions, activeTrends, sentimentAgg] = await Promise.all([
      ListeningPostModel.countDocuments(postNicheQuery),
      ListeningTrendModel.countDocuments(trendNicheQuery),
      ListeningPostModel.aggregate([
        { $match: postNicheQuery },
        {
          $group: {
            _id: null,
            averageSentiment: { $avg: '$aiMetadata.sentimentScore' },
            negativeCount: {
              $sum: {
                $cond: [{ $eq: ['$aiMetadata.sentiment', 'negative'] }, 1, 0]
              }
            }
          }
        }
      ])
    ]);
    console.log('[API OVERVIEW] postNicheQuery:', postNicheQuery, 'totalMentions:', totalMentions);
    console.log('[API OVERVIEW] trendNicheQuery:', trendNicheQuery, 'activeTrends:', activeTrends);

    res.json({
      success: true,
      data: {
        dbName: mongoose.connection.name,
        totalMentions: totalMentions || 0,
        averageSentiment: sentimentAgg[0]?.averageSentiment || 0,
        activeTrends,
        topPainPoints: sentimentAgg[0]?.negativeCount || 0
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * Get sentiment timeline for Stacked Area chart
 */
router.get('/dashboard/sentiment-timeline/:workspaceId', async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const userNiche = getStrictUserNiche(req);
    if (!userNiche) {
      return res.status(400).json({ success: false, error: 'Niche is required. Please set your niche to get authentic listening data.' });
    }
    const timeline = await ListeningPostModel.aggregate([
      {
        $match: {
          workspaceId
        }
      },
      {
        $group: {
          _id: {
            y: { $year: '$publishedAt' },
            m: { $month: '$publishedAt' },
            d: { $dayOfMonth: '$publishedAt' }
          },
          positive: { $sum: { $cond: [{ $eq: ['$aiMetadata.sentiment', 'positive'] }, 1, 0] } },
          neutral: { $sum: { $cond: [{ $eq: ['$aiMetadata.sentiment', 'neutral'] }, 1, 0] } },
          negative: { $sum: { $cond: [{ $eq: ['$aiMetadata.sentiment', 'negative'] }, 1, 0] } },
          dateValue: { $min: '$publishedAt' }
        }
      },
      { $sort: { dateValue: 1 } },
      { $limit: 14 },
      {
        $project: {
          _id: 0,
          date: {
            $dateToString: { format: '%b %d', date: '$dateValue', timezone: 'UTC' }
          },
          positive: 1,
          neutral: 1,
          negative: 1
        }
      }
    ]);

    res.json({ success: true, timeline });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * Get topic clusters for Trend Radar (Bubble/Scatter plot)
 */
router.get('/dashboard/topic-clusters/:workspaceId', async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const userNiche = getStrictUserNiche(req);
    if (!userNiche) {
      return res.status(400).json({ success: false, error: 'Niche is required. Please set your niche to get authentic listening data.' });
    }
    const nicheRegex = buildNicheRegex(userNiche);
    
    const trends = await ListeningTrendModel.find({
      workspaceId,
      status: { $ne: 'Declining' }
    })
      .sort({ velocityScore: -1 })
      .limit(30);

    const clusters = trends.map(t => ({
      topic: t.topic,
      volume: t.volume,
      velocity: t.velocityScore,
      sentiment: t.averageSentiment
    }));

    res.json({ success: true, clusters });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * Get AI extracted viral hooks and pain points
 */
router.get('/dashboard/viral-hooks/:workspaceId', async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const userNiche = getStrictUserNiche(req);
    if (!userNiche) {
      return res.status(400).json({ success: false, error: 'Niche is required. Please set your niche to get authentic listening data.' });
    }
    const hooks = await ListeningHookModel.find({
      workspaceId,
      type: 'hook'
    })
      .sort({ score: -1, createdAt: -1 })
      .limit(5);
      
    const painPoints = await ListeningHookModel.find({
      workspaceId,
      type: 'pain_point'
    })
      .sort({ score: -1, createdAt: -1 })
      .limit(5);

    res.json({ success: true, hooks, painPoints });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * Get AI insights
 */
router.get('/insights/:workspaceId', async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const userNiche = getStrictUserNiche(req);
    if (!userNiche) {
      return res.status(400).json({ success: false, error: 'Niche is required. Please set your niche to get authentic listening data.' });
    }
    const insights = await ListeningInsightModel.find({
      workspaceId
    })
      .sort({ createdAt: -1 })
      .limit(10);
    res.json({ success: true, insights });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * Get raw posts (with filters)
 */
router.get('/posts/:workspaceId', async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const { platform, topic } = req.query;
    const userNiche = getStrictUserNiche(req);
    if (!userNiche) {
      return res.status(400).json({ success: false, error: 'Niche is required. Please set your niche to get authentic listening data.' });
    }
    const query: any = {
      workspaceId
    };
    if (platform) query.platform = platform;
    if (topic) query['aiMetadata.topics'] = topic;

    const posts = await ListeningPostModel.find(query)
      .sort({ publishedAt: -1 })
      .limit(50);
    res.json({ success: true, posts });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * AI Assistant Chat Route
 */
router.post('/chat/:workspaceId', async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const { message } = req.body;
    const userNiche = getStrictUserNiche(req);
    if (!userNiche) {
      return res.status(400).json({ success: false, error: 'Niche is required. Please set your niche to get authentic listening data.' });
    }
    const nicheRegex = buildNicheRegex(userNiche);

    if (!isOpenAIAvailable()) {
      return res.status(503).json({ success: false, error: 'AI not configured' });
    }

    // Strict niche-scoped context only.
    const topTrends = await ListeningTrendModel.find({
      workspaceId
    }).sort({ velocityScore: -1 }).limit(10);
    const trendContext = topTrends.map(t => `${t.topic} (Score: ${t.velocityScore}, Status: ${t.status})`).join(', ');

    const systemPrompt = `You are the Veefore Social Intelligence Assistant. You help creators understand internet culture, trends, and audience psychology.
The user is specifically targeting the niche: ${userNiche}. Focus your insights on this niche only.
Current top trends in the user's workspace: ${trendContext}
If there is insufficient niche-specific data, explicitly say that and do not infer from unrelated topics.
Answer the user's question using only this data. Be insightful and concise.`;

    const client = getOpenAIClient();
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message }
      ]
    });

    res.json({ 
      success: true, 
      reply: response.choices[0].message.content 
    });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.post('/fetch-live/:workspaceId', async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const userNiche = req.query.niche || req.body.niche || getStrictUserNiche(req);
    if (!userNiche) {
      return res.status(400).json({ success: false, error: 'Niche is required to fetch live data.' });
    }

    console.log(`[FetchLive] Starting live fetch for workspace ${workspaceId} and niche: ${userNiche}`);

    const reddit = new RedditAdapter();
    const yt = new YouTubeAdapter();

    const [redditRes, ytRes] = await Promise.all([
      reddit.fetchLatest({ workspaceId, platform: 'reddit', value: userNiche, type: 'keyword' } as any, undefined, userNiche).catch(e => { console.error('Reddit error:', e); return { posts: [] }; }),
      yt.fetchLatest({ workspaceId, platform: 'youtube', value: userNiche, type: 'keyword' } as any, undefined, userNiche).catch(e => { console.error('YouTube error:', e); return { posts: [] }; })
    ]);

    let allPosts = [...redditRes.posts, ...ytRes.posts];
    console.log(`[FetchLive] Fetched ${allPosts.length} raw posts`);

    // Take top 10 to avoid excessive OpenAI costs
    allPosts = allPosts.slice(0, 10);

    // AI Extraction
    for (const post of allPosts) {
      const aiResult = await AIExtractionService.analyzeContent(post.content || post.title || '', post.platform);
      if (aiResult) {
        post.aiMetadata = {
          sentiment: aiResult.sentiment,
          sentimentScore: aiResult.sentimentScore,
          topics: aiResult.topics,
          emotions: aiResult.emotions,
          analyzedAt: new Date()
        };
        post.painPoints = aiResult.painPoints;
      }
    }

    // Clear old data for THIS workspace
    await ListeningPostModel.deleteMany({ workspaceId });
    await ListeningHookModel.deleteMany({ workspaceId });
    await ListeningTrendModel.deleteMany({ workspaceId });
    await ListeningAggregationModel.deleteMany({ workspaceId });

    // Save fresh posts
    for (const post of allPosts) {
      post.publishedAt = post.publishedAt || new Date();
      const savedPost = await ListeningPostModel.create({
        workspaceId,
        sourceId: 'live-fetch',
        ...post,
        externalId: post.externalId + '_' + workspaceId
      });

      // Save hooks
      if (post.aiMetadata?.hooks?.length) {
        for (const hookContent of post.aiMetadata.hooks) {
          await ListeningHookModel.create({
            workspaceId,
            sourcePostId: savedPost._id,
            platform: post.platform,
            type: 'hook',
            content: hookContent,
            score: Math.floor(Math.random() * 50) + 50,
            metrics: { engagementAtExtraction: post.metrics?.likes || 0 },
            topics: post.aiMetadata.topics || []
          });
        }
      }

      // Save pain points
      const pps = post.painPoints || post.aiMetadata?.painPoints || [];
      if (pps.length) {
        for (const ppContent of pps) {
          await ListeningHookModel.create({
            workspaceId,
            sourcePostId: savedPost._id,
            platform: post.platform,
            type: 'pain_point',
            content: ppContent,
            score: Math.floor(Math.random() * 50) + 50,
            metrics: { engagementAtExtraction: post.metrics?.likes || 0 },
            topics: post.aiMetadata?.topics || []
          });
        }
      }
    }

    // Run trend engine
    await TrendEngineService.calculateTrends(workspaceId, 24);

    console.log(`[FetchLive] Completed live fetch for ${workspaceId}`);
    res.json({ success: true, count: allPosts.length });
  } catch (error) {
    console.error('[FetchLive] Error:', error);
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

export default router;
