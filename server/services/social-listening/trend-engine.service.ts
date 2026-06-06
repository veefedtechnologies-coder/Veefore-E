import { ListeningPostModel } from "../../models/SocialListening/ListeningPost";

import { ListeningTrendModel } from '../../models/SocialListening/ListeningTrend';
import { ListeningAggregationModel } from '../../models/SocialListening/ListeningAggregation';

export class TrendEngineService {
  /**
   * Run the trend analysis for a specific workspace over a timeframe
   */
  static async calculateTrends(workspaceId: string, timeframeHours: number = 24): Promise<void> {
    console.log(`[TrendEngine] Calculating trends for workspace ${workspaceId} over last ${timeframeHours}h`);
    
    const timeLimit = new Date();
    timeLimit.setHours(timeLimit.getHours() - timeframeHours);

    // 1. Aggregate topics from recent posts
    const topicAggregation = await ListeningPostModel.aggregate([
      { $match: { workspaceId, publishedAt: { $gte: timeLimit }, "aiMetadata.topics": { $exists: true, $ne: [] } } },
      { $unwind: "$aiMetadata.topics" },
      {
        $group: {
          _id: "$aiMetadata.topics",
          volume: { $sum: 1 },
          likes: { $sum: "$metrics.likes" },
          comments: { $sum: "$metrics.comments" },
          avgSentiment: { $avg: "$aiMetadata.sentimentScore" },
          samplePosts: { $push: "$_id" }
        }
      },
      { $sort: { volume: -1 } }
    ]);

    // 2. Calculate scores and update Trend models
    for (const agg of topicAggregation) {
      const topicName = agg._id;
      if (!topicName) continue;

      // Base formula for velocity (simplified)
      // Velocity = (Volume * 1) + (Comments * 2) + (Likes * 0.5)
      const rawVelocity = (agg.volume * 1) + (agg.comments * 2) + (agg.likes * 0.5);
      
      // Normalize velocity score 0-100 (naive normalization for demo)
      const velocityScore = Math.min(Math.round(rawVelocity / 10), 100);
      
      // Calculate opportunity (high velocity, lower overall saturation)
      // Just a placeholder calculation
      const opportunityScore = Math.min(velocityScore * 1.2, 100);

      // Determine Status
      let status = 'Early Emerging';
      if (velocityScore > 80) status = 'Viral';
      else if (velocityScore > 50) status = 'Growing';
      else if (velocityScore < 20) status = 'Saturated'; // Needs better heuristic

      const samples = agg.samplePosts.slice(0, 5); // Keep up to 5 samples

      await ListeningTrendModel.findOneAndUpdate(
        { workspaceId, topic: topicName },
        {
          $set: {
            status,
            velocityScore,
            opportunityScore,
            mentionVolume: agg.volume,
            averageSentiment: agg.avgSentiment || 0,
            samplePosts: samples,
            timeframe: `${timeframeHours}h`,
            lastCalculatedAt: new Date()
          }
        },
        { upsert: true, new: true }
      );
    }

    // 3. Aggregate Daily Dashboard Metrics (ListeningAggregation)
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const dailyStats = await ListeningPostModel.aggregate([
      { $match: { workspaceId, publishedAt: { $gte: today } } },
      {
        $group: {
          _id: null,
          totalPosts: { $sum: 1 },
          totalComments: { $sum: "$metrics.comments" },
          totalEngagement: { $sum: { $add: ["$metrics.likes", "$metrics.comments"] } },
          avgSentiment: { $avg: "$aiMetadata.sentimentScore" },
          positiveMentions: { $sum: { $cond: [{ $gt: ["$aiMetadata.sentimentScore", 0.3] }, 1, 0] } },
          negativeMentions: { $sum: { $cond: [{ $lt: ["$aiMetadata.sentimentScore", -0.3] }, 1, 0] } },
          neutralMentions: { $sum: { $cond: [{ $and: [{ $lte: ["$aiMetadata.sentimentScore", 0.3] }, { $gte: ["$aiMetadata.sentimentScore", -0.3] }] }, 1, 0] } }
        }
      }
    ]);

    if (dailyStats.length > 0) {
      const stats = dailyStats[0];
      
      const topTopics = topicAggregation.slice(0, 5).map(t => ({
        topic: t._id,
        count: t.volume,
        sentimentScore: t.avgSentiment || 0
      }));

      await ListeningAggregationModel.findOneAndUpdate(
        { workspaceId, date: today },
        {
          $set: {
            metrics: {
              totalPosts: stats.totalPosts,
              totalComments: stats.totalComments,
              totalEngagement: stats.totalEngagement
            },
            sentiment: {
              positive: stats.positiveMentions,
              neutral: stats.neutralMentions,
              negative: stats.negativeMentions,
              averageScore: stats.avgSentiment || 0
            },
            topTopics
          }
        },
        { upsert: true, new: true }
      );
    }
    
    console.log(`[TrendEngine] Finished calculating ${topicAggregation.length} trends and daily aggregation.`);
  }
}
