import mongoose, { Document, Schema, Model } from 'mongoose';

/**
 * Hashtag Performance Tracking Model
 * 
 * Tracks individual hashtag performance across posts for learning and optimization.
 * Used to build engagement-based ranking and niche-specific performance metrics.
 * 
 * Requirements:
 * - 6.6: Track hashtag performance for niche-specific optimization
 * - Enable engagement-based hashtag ranking
 * - Support continuous learning from actual performance data
 */

export interface IHashtagPerformance extends Document {
  // Hashtag identification
  hashtag: string; // Normalized hashtag (lowercase, no #)
  niche: string;   // Content niche
  
  // Usage tracking
  usageCount: number;          // Total times used
  lastUsedAt: Date;            // Most recent usage
  
  // Performance metrics (aggregated)
  totalImpressions: number;    // Sum of impressions across all uses
  totalReach: number;          // Sum of reach across all uses
  totalLikes: number;          // Sum of likes
  totalComments: number;       // Sum of comments
  totalSaves: number;          // Sum of saves
  totalShares: number;         // Sum of shares
  
  // Calculated metrics
  avgEngagementRate: number;   // Average engagement rate
  avgDiscoverability: number;  // Average discoverability score (0-100)
  avgRankingPosition: number;  // Average ranking in hashtag feed
  
  // Competition estimate
  estimatedCompetition: 'high' | 'medium' | 'low';
  estimatedPostCount: number;  // Estimated total posts using this hashtag
  
  // Performance by post type
  performanceByType: {
    post: {
      count: number;
      avgEngagementRate: number;
    };
    story: {
      count: number;
      avgEngagementRate: number;
    };
    reel: {
      count: number;
      avgEngagementRate: number;
    };
  };
  
  // Individual usage records (limited to last 50)
  usageHistory: Array<{
    postId: string;
    postType: 'post' | 'story' | 'reel';
    impressions: number;
    reach: number;
    engagementRate: number;
    recordedAt: Date;
  }>;
  
  // Metadata
  createdAt: Date;
  updatedAt: Date;
}

const HashtagPerformanceSchema = new Schema<IHashtagPerformance>(
  {
    hashtag: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true
    },
    niche: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true
    },
    usageCount: {
      type: Number,
      default: 0
    },
    lastUsedAt: {
      type: Date,
      default: Date.now
    },
    totalImpressions: {
      type: Number,
      default: 0
    },
    totalReach: {
      type: Number,
      default: 0
    },
    totalLikes: {
      type: Number,
      default: 0
    },
    totalComments: {
      type: Number,
      default: 0
    },
    totalSaves: {
      type: Number,
      default: 0
    },
    totalShares: {
      type: Number,
      default: 0
    },
    avgEngagementRate: {
      type: Number,
      default: 0
    },
    avgDiscoverability: {
      type: Number,
      default: 0
    },
    avgRankingPosition: {
      type: Number,
      default: 0
    },
    estimatedCompetition: {
      type: String,
      enum: ['high', 'medium', 'low'],
      default: 'medium'
    },
    estimatedPostCount: {
      type: Number,
      default: 0
    },
    performanceByType: {
      post: {
        count: { type: Number, default: 0 },
        avgEngagementRate: { type: Number, default: 0 }
      },
      story: {
        count: { type: Number, default: 0 },
        avgEngagementRate: { type: Number, default: 0 }
      },
      reel: {
        count: { type: Number, default: 0 },
        avgEngagementRate: { type: Number, default: 0 }
      }
    },
    usageHistory: [{
      postId: { type: String, required: true },
      postType: { 
        type: String, 
        enum: ['post', 'story', 'reel'],
        required: true 
      },
      impressions: { type: Number, default: 0 },
      reach: { type: Number, default: 0 },
      engagementRate: { type: Number, default: 0 },
      recordedAt: { type: Date, default: Date.now }
    }]
  },
  {
    timestamps: true
  }
);

// Compound index for efficient queries
HashtagPerformanceSchema.index({ hashtag: 1, niche: 1 }, { unique: true });
HashtagPerformanceSchema.index({ niche: 1, avgEngagementRate: -1 });
HashtagPerformanceSchema.index({ niche: 1, estimatedCompetition: 1, avgEngagementRate: -1 });

// Model
export const HashtagPerformance: Model<IHashtagPerformance> = 
  mongoose.models.HashtagPerformance || 
  mongoose.model<IHashtagPerformance>('HashtagPerformance', HashtagPerformanceSchema);
