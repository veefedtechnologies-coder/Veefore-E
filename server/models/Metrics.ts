import mongoose from 'mongoose';

export interface IMetrics extends mongoose.Document {
  workspaceId: string;
  instagramAccountId: string;
  instagramUsername: string;
  metricsType: 'account' | 'media' | 'story' | 'insights';
  
  // Account metrics
  followers: number;
  following: number;
  mediaCount: number;
  
  // Engagement metrics
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  
  // Reach and impression metrics
  reach: number;
  reachDay?: number;
  reachWeek?: number;
  reachDays28?: number;
  impressions: number;
  profileViews: number;
  websiteClicks: number;
  
  // Calculated metrics
  engagementRate: number;
  averageLikesPerPost: number;
  averageCommentsPerPost: number;
  reachRate: number;
  
  // Story metrics (if applicable)
  storyViews?: number;
  storyReplies?: number;
  storyTaps?: number;
  
  // Media-specific metrics (if mediaId is provided)
  mediaId?: string;
  mediaType?: 'image' | 'video' | 'carousel' | 'reel' | 'story';
  mediaLikes?: number;
  mediaComments?: number;
  mediaShares?: number;
  mediaSaves?: number;
  mediaReach?: number;
  mediaImpressions?: number;
  
  // Insights time period
  period: 'day' | 'week' | 'month' | 'lifetime';
  startDate: Date;
  endDate: Date;
  
  // Metadata
  lastUpdated: Date;
  fetchedAt: Date;
  source: 'api' | 'webhook' | 'manual';
  dataStatus: 'fresh' | 'stale' | 'error';
  
  // Change tracking
  previousValues?: {
    followers?: number;
    likes?: number;
    comments?: number;
    reach?: number;
    impressions?: number;
    engagementRate?: number;
  };
  
  changesSince?: {
    followers?: number;
    likes?: number;
    comments?: number;
    reach?: number;
    impressions?: number;
    engagementRate?: number;
  };
  
  createdAt: Date;
  updatedAt: Date;
}

const MetricsSchema = new mongoose.Schema({
  workspaceId: {
    type: String,
    required: true,
    index: true
  },
  instagramAccountId: {
    type: String,
    required: true,
    index: true
  },
  instagramUsername: {
    type: String,
    required: true
  },
  metricsType: {
    type: String,
    enum: ['account', 'media', 'story', 'insights'],
    required: true,
    default: 'account'
  },
  
  // Account metrics
  followers: {
    type: Number,
    default: 0
  },
  following: {
    type: Number,
    default: 0
  },
  mediaCount: {
    type: Number,
    default: 0
  },
  
  // Engagement metrics
  likes: {
    type: Number,
    default: 0
  },
  comments: {
    type: Number,
    default: 0
  },
  shares: {
    type: Number,
    default: 0
  },
  saves: {
    type: Number,
    default: 0
  },
  
  // Reach and impression metrics
  reach: {
    type: Number,
    default: 0
  },
  reachDay: {
    type: Number,
    default: undefined
  },
  reachWeek: {
    type: Number,
    default: undefined
  },
  reachDays28: {
    type: Number,
    default: undefined
  },
  impressions: {
    type: Number,
    default: 0
  },
  profileViews: {
    type: Number,
    default: 0
  },
  websiteClicks: {
    type: Number,
    default: 0
  },
  
  // Calculated metrics
  engagementRate: {
    type: Number,
    default: 0
  },
  averageLikesPerPost: {
    type: Number,
    default: 0
  },
  averageCommentsPerPost: {
    type: Number,
    default: 0
  },
  reachRate: {
    type: Number,
    default: 0
  },
  
  // Story metrics
  storyViews: {
    type: Number,
    default: null
  },
  storyReplies: {
    type: Number,
    default: null
  },
  storyTaps: {
    type: Number,
    default: null
  },
  
  // Media-specific metrics
  mediaId: {
    type: String,
    default: null,
    index: true
  },
  mediaType: {
    type: String,
    enum: ['image', 'video', 'carousel', 'reel', 'story'],
    default: null
  },
  mediaLikes: {
    type: Number,
    default: null
  },
  mediaComments: {
    type: Number,
    default: null
  },
  mediaShares: {
    type: Number,
    default: null
  },
  mediaSaves: {
    type: Number,
    default: null
  },
  mediaReach: {
    type: Number,
    default: null
  },
  mediaImpressions: {
    type: Number,
    default: null
  },
  
  // Insights time period
  period: {
    type: String,
    enum: ['day', 'week', 'month', 'lifetime'],
    default: 'day'
  },
  startDate: {
    type: Date,
    required: true
  },
  endDate: {
    type: Date,
    required: true
  },
  
  // Metadata
  lastUpdated: {
    type: Date,
    default: Date.now
  },
  fetchedAt: {
    type: Date,
    default: Date.now
  },
  source: {
    type: String,
    enum: ['api', 'webhook', 'manual'],
    default: 'api'
  },
  dataStatus: {
    type: String,
    enum: ['fresh', 'stale', 'error'],
    default: 'fresh'
  },
  
  // Change tracking
  previousValues: {
    followers: { type: Number, default: null },
    likes: { type: Number, default: null },
    comments: { type: Number, default: null },
    reach: { type: Number, default: null },
    impressions: { type: Number, default: null },
    engagementRate: { type: Number, default: null }
  },
  
  changesSince: {
    followers: { type: Number, default: null },
    likes: { type: Number, default: null },
    comments: { type: Number, default: null },
    reach: { type: Number, default: null },
    impressions: { type: Number, default: null },
    engagementRate: { type: Number, default: null }
  },
  
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  collection: 'metrics'
});

// Compound indexes for efficient queries
MetricsSchema.index({ workspaceId: 1, instagramAccountId: 1, fetchedAt: -1 });
MetricsSchema.index({ workspaceId: 1, metricsType: 1, period: 1 });
MetricsSchema.index({ instagramAccountId: 1, mediaId: 1, fetchedAt: -1 });
MetricsSchema.index({ workspaceId: 1, dataStatus: 1, lastUpdated: -1 });
MetricsSchema.index({ startDate: 1, endDate: 1 });

// TTL index to automatically clean old metrics (optional - 90 days)
MetricsSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7776000 }); // 90 days

export default mongoose.model<IMetrics>('Metrics', MetricsSchema);