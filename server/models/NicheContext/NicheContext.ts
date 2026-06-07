import mongoose, { Document, Schema } from 'mongoose';

export interface INicheContext extends Document {
  niche: string;
  
  // Language
  vocabulary: string[];
  slangTerms: Map<string, string>;
  culturalReferences: string[];
  
  // Trends (last 30 days)
  trendingTopics: string[];
  trendingHashtags: string[];
  trendingPhrases: string[];
  
  // Style
  typicalEmojis: string[];
  toneGuidelines: string;
  
  // Metadata
  lastUpdated: Date;
}

export const NicheContextSchema = new Schema<INicheContext>({
  niche: { type: String, required: true, unique: true, index: true },
  
  // Language
  vocabulary: { type: [String], default: [] },
  slangTerms: { type: Map, of: String, default: new Map() },
  culturalReferences: { type: [String], default: [] },
  
  // Trends
  trendingTopics: { type: [String], default: [] },
  trendingHashtags: { type: [String], default: [] },
  trendingPhrases: { type: [String], default: [] },
  
  // Style
  typicalEmojis: { type: [String], default: [] },
  toneGuidelines: { type: String, default: '' },
  
  // Metadata
  lastUpdated: { type: Date, default: Date.now }
});

// Indexes for efficient querying
NicheContextSchema.index({ niche: 1 });
NicheContextSchema.index({ lastUpdated: -1 });

export const NicheContextModel = mongoose.models.NicheContext as mongoose.Model<INicheContext> || mongoose.model<INicheContext>('NicheContext', NicheContextSchema);
