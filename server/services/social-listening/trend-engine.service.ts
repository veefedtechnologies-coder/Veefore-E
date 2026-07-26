import { ListeningPostModel } from "../../models/SocialListening/ListeningPost";
import { ListeningTrendModel } from '../../models/SocialListening/ListeningTrend';
import { ListeningAggregationModel } from '../../models/SocialListening/ListeningAggregation';
import {
  normalizeTopic,
  prettyTopic,
  labelFromScore,
  SENTIMENT_POSITIVE_THRESHOLD,
  SENTIMENT_NEGATIVE_THRESHOLD,
} from './ai-extraction.service';

/**
 * A topic only counts as a real "trend" once at least this many posts mention
 * it. This stops every one-off AI topic string from inflating the trend count
 * (the old code reported ~86 "trends" from ~30 posts).
 */
const MIN_MENTIONS_FOR_TREND = 2;

export class TrendEngineService {
  /**
   * Run the trend analysis for a specific workspace.
   *
   * Produces rich trend cards (topic, description, hashtags, mentions,
   * engagement, momentum, priority, sentiment) from the ingested posts.
   * Sentiment scores throughout the pipeline are on a single -1..1 scale.
   */
  static async calculateTrends(workspaceId: string, timeframeHours: number = 24): Promise<void> {
    console.log(`[TrendEngine] Calculating trends for workspace ${workspaceId}`);

    // 1. Pull all analyzed posts for this workspace (freshly ingested set).
    const posts = await ListeningPostModel.find({
      workspaceId,
      'aiMetadata.topics': { $exists: true, $ne: [] },
    }).select('aiMetadata metrics title content url _id').lean();

    // 2. Cluster by NORMALIZED topic so "Travel Tips" and "travel tips" merge.
    interface Cluster {
      display: string;
      volume: number;
      likes: number;
      comments: number;
      views: number;
      sentimentSum: number;
      samplePosts: any[];
      hashtagCounts: Map<string, number>;
      bestPost: { engagement: number; title: string; content: string } | null;
    }
    const clusters = new Map<string, Cluster>();

    for (const post of posts) {
      const meta = (post as any).aiMetadata || {};
      const topics: string[] = meta.topics || [];
      const hashtags: string[] = meta.hashtags || [];
      const score = meta.sentimentScore;
      const metrics = (post as any).metrics || {};
      const postEngagement = (metrics.likes || 0) + (metrics.comments || 0) * 3 + (metrics.views || 0) * 0.01;
      const seenInPost = new Set<string>();

      for (const rawTopic of topics) {
        if (!rawTopic) continue;
        const key = normalizeTopic(rawTopic);
        if (!key || seenInPost.has(key)) continue; // count a topic once per post
        seenInPost.add(key);

        let c = clusters.get(key);
        if (!c) {
          c = {
            display: prettyTopic(key),
            volume: 0, likes: 0, comments: 0, views: 0, sentimentSum: 0,
            samplePosts: [], hashtagCounts: new Map(), bestPost: null,
          };
          clusters.set(key, c);
        }
        c.volume += 1;
        c.likes += metrics.likes || 0;
        c.comments += metrics.comments || 0;
        c.views += metrics.views || 0;
        c.sentimentSum += typeof score === 'number' ? score : 0;
        if (c.samplePosts.length < 5) c.samplePosts.push((post as any)._id);

        // Tally hashtags so we can surface the most common ones for this topic.
        for (const h of hashtags) {
          const tag = h.replace(/^#/, '').trim();
          if (!tag) continue;
          c.hashtagCounts.set(tag, (c.hashtagCounts.get(tag) || 0) + 1);
        }

        // Track the highest-engagement post so its text can seed a description.
        if (!c.bestPost || postEngagement > c.bestPost.engagement) {
          c.bestPost = {
            engagement: postEngagement,
            title: (post as any).title || '',
            content: (post as any).content || '',
          };
        }
      }
    }

    // 3. Determine bounds for normalization so velocity spreads 0-100
    // meaningfully relative to THIS workspace's data (not an arbitrary divisor).
    const clusterList = Array.from(clusters.values());
    const maxVolume = Math.max(1, ...clusterList.map(c => c.volume));
    const maxEngagement = Math.max(
      1,
      ...clusterList.map(c => c.likes + c.comments * 3 + c.views * 0.01)
    );

    // 4. Reset trends for this workspace, then write the qualifying ones.
    await ListeningTrendModel.deleteMany({ workspaceId });

    let written = 0;
    for (const c of clusterList) {
      if (c.volume < MIN_MENTIONS_FOR_TREND) continue; // ignore one-off noise

      const engagement = c.likes + c.comments * 3 + c.views * 0.01;
      const volumeComponent = c.volume / maxVolume;            // 0..1
      const engagementComponent = engagement / maxEngagement;   // 0..1
      const velocityScore = Math.round(
        Math.min(100, (volumeComponent * 0.6 + engagementComponent * 0.4) * 100)
      );

      const avgSentiment = c.volume > 0 ? c.sentimentSum / c.volume : 0; // -1..1
      const sentimentLabel = labelFromScore(avgSentiment);
      const opportunityScore = Math.round(
        Math.min(100, velocityScore * 0.7 + ((avgSentiment + 1) / 2) * 30)
      );

      let status: string;
      if (velocityScore >= 70) status = 'Viral';
      else if (velocityScore >= 40) status = 'Growing';
      else if (velocityScore >= 15) status = 'Early Emerging';
      else status = 'Saturated';

      // Momentum %: a readable growth figure derived from velocity (no historical
      // window yet, so we present current strength as momentum).
      const growthPercentage = Math.max(5, Math.round(velocityScore * 0.9));

      // Priority: how worth-acting-on this trend is for the creator.
      let priority: 'high' | 'medium' | 'low' = 'low';
      if (velocityScore >= 60 || opportunityScore >= 70) priority = 'high';
      else if (velocityScore >= 30 || opportunityScore >= 45) priority = 'medium';

      // Top hashtags for this topic (most frequent first). If the AI didn't
      // supply hashtags, derive sensible ones from the topic + related words.
      let hashtags = Array.from(c.hashtagCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
        .map(([tag]) => tag);
      if (hashtags.length < 2) {
        const derived = c.display
          .split(' ')
          .filter((w) => w.length >= 3)
          .map((w) => w.replace(/[^a-zA-Z0-9]/g, ''));
        const camel = c.display.replace(/\s+/g, '');
        hashtags = Array.from(new Set([camel, ...hashtags, ...derived])).filter(Boolean).slice(0, 4);
      }

      // Human-readable description: what's happening + why it matters.
      const seed = (c.bestPost?.content || c.bestPost?.title || '').trim();
      const moodWord =
        sentimentLabel === 'positive' ? 'positive buzz' :
        sentimentLabel === 'negative' ? 'critical discussion' : 'active discussion';
      const statusWord =
        status === 'Viral' ? 'going viral' :
        status === 'Growing' ? 'gaining momentum' :
        status === 'Early Emerging' ? 'starting to emerge' : 'steady';
      const cleanedSeed = seed.replace(/\s+/g, ' ').substring(0, 150);
      const description = cleanedSeed
        ? `${statusWord.charAt(0).toUpperCase() + statusWord.slice(1)} with ${moodWord} across ${c.volume} mentions. Example: "${cleanedSeed}${seed.length > 150 ? '…' : ''}"`
        : `${statusWord.charAt(0).toUpperCase() + statusWord.slice(1)} in your niche with ${moodWord} across ${c.volume} mentions.`;

      await ListeningTrendModel.create({
        workspaceId,
        topic: c.display,
        status,
        velocityScore,
        opportunityScore,
        volume: c.volume,
        averageSentiment: avgSentiment,
        sentimentLabel,
        engagement: Math.round(engagement),
        growthPercentage,
        priority,
        hashtags,
        description,
        samplePosts: c.samplePosts,
        timeframe: `${timeframeHours}h`,
        lastCalculatedAt: new Date(),
      });
      written += 1;
    }

    // 5. Daily aggregation for the mood-history chart (sentiment on -1..1 scale).
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const dailyStats = await ListeningPostModel.aggregate([
      { $match: { workspaceId } },
      {
        $group: {
          _id: null,
          totalPosts: { $sum: 1 },
          totalComments: { $sum: '$metrics.comments' },
          totalEngagement: { $sum: { $add: ['$metrics.likes', '$metrics.comments'] } },
          avgSentiment: { $avg: '$aiMetadata.sentimentScore' },
          positiveMentions: { $sum: { $cond: [{ $gte: ['$aiMetadata.sentimentScore', SENTIMENT_POSITIVE_THRESHOLD] }, 1, 0] } },
          negativeMentions: { $sum: { $cond: [{ $lte: ['$aiMetadata.sentimentScore', SENTIMENT_NEGATIVE_THRESHOLD] }, 1, 0] } },
          neutralMentions: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $lt: ['$aiMetadata.sentimentScore', SENTIMENT_POSITIVE_THRESHOLD] },
                    { $gt: ['$aiMetadata.sentimentScore', SENTIMENT_NEGATIVE_THRESHOLD] },
                  ],
                },
                1,
                0,
              ],
            },
          },
        },
      },
    ]);

    if (dailyStats.length > 0) {
      const stats = dailyStats[0];
      const topTopics = clusterList
        .filter(c => c.volume >= MIN_MENTIONS_FOR_TREND)
        .sort((a, b) => b.volume - a.volume)
        .slice(0, 5)
        .map(c => ({ topic: c.display, count: c.volume, sentimentScore: c.volume ? c.sentimentSum / c.volume : 0 }));

      await ListeningAggregationModel.findOneAndUpdate(
        { workspaceId, date: today },
        {
          $set: {
            metrics: {
              totalPosts: stats.totalPosts,
              totalComments: stats.totalComments,
              totalEngagement: stats.totalEngagement,
            },
            sentiment: {
              positive: stats.positiveMentions,
              neutral: stats.neutralMentions,
              negative: stats.negativeMentions,
              averageScore: stats.avgSentiment || 0,
            },
            topTopics,
          },
        },
        { upsert: true, new: true }
      );
    }

    console.log(`[TrendEngine] Wrote ${written} trends (from ${clusterList.length} topic clusters, ${posts.length} posts).`);
  }
}
