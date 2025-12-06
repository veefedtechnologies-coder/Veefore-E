import mongoose, { Document, Schema, Model } from 'mongoose';

export interface ICompetitorAnalysis extends Document {
  workspaceId: any;
  userId: any;
  competitorUsername: string;
  platform: string;
  analysisType: string;
  scrapedData: any;
  analysisResults: any;
  topPerformingPosts?: any;
  contentPatterns?: any;
  hashtags?: any;
  postingSchedule?: any;
  engagementRate?: number;
  growthRate?: number;
  recommendations: string;
  competitorScore?: number;
  lastScraped: Date;
  creditsUsed: number;
  createdAt: Date;
  updatedAt: Date;
}

export const CompetitorAnalysisSchema = new Schema<ICompetitorAnalysis>({
  workspaceId: { type: Schema.Types.Mixed, required: true },
  userId: { type: Schema.Types.Mixed, required: true },
  competitorUsername: { type: String, required: true },
  platform: { type: String, required: true },
  analysisType: { type: String, required: true },
  scrapedData: { type: Schema.Types.Mixed, required: true },
  analysisResults: { type: Schema.Types.Mixed, required: true },
  topPerformingPosts: { type: Schema.Types.Mixed },
  contentPatterns: { type: Schema.Types.Mixed },
  hashtags: { type: Schema.Types.Mixed },
  postingSchedule: { type: Schema.Types.Mixed },
  engagementRate: Number,
  growthRate: Number,
  recommendations: { type: String, required: true },
  competitorScore: Number,
  lastScraped: { type: Date, default: Date.now },
  creditsUsed: { type: Number, default: 8 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

export const CompetitorAnalysisModel: Model<ICompetitorAnalysis> = mongoose.model<ICompetitorAnalysis>('CompetitorAnalysis', CompetitorAnalysisSchema);
