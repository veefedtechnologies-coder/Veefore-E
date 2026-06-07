import mongoose, { Document, Schema, Model } from 'mongoose';

/**
 * Generated Caption Model
 * 
 * Stores AI-generated captions with their variations, predictions,
 * user selections, and actual performance metrics for learning.
 * 
 * Requirements: 8.3, 10.1, 10.2, 10.3
 */

export interface ICaptionVariation {
  caption: string;
  hashtagsGenerated: string[];
  authenticityScore: number;
  engagementPrediction: {
    likeRate: number;
    commentRate: number;
    saveRate: number;
    shareRate: number;
    confidence: number;
  };
  usedPatterns: string[]; // Pattern IDs
  usedHooks: string[];    // Hook IDs
}

export interface IGeneratedCaption extends Document {
  userId: string;
  workspaceId: string;
  contentId?: string; // Reference to Content collection
  
  // Generation Context
  variations: ICaptionVariation[];
  
  // User Interaction
  selectedVariationIndex?: number;
  wasEdited: boolean;
  originalCaption?: string; // Before user edit
  editedCaption?: string;   // After user edit
  editDistance?: number;    // Levenshtein distance
  
  // Actual Performance (filled in later)
  actualMetrics?: {
    likes: number;
    comments: number;
    saves: number;
    shares: number;
    impressions: number;
    engagementRate: number;
  };
  performanceRecordedAt?: Date;
  
  // Metadata
  postType: 'post' | 'story' | 'reel';
  platform: string;
  niche: string;
  generatedAt: Date;
  publishedAt?: Date;
}

const CaptionVariationSchema = new Schema({
  caption: { 
    type: String, 
    required: true 
  },
  hashtagsGenerated: [String],
  authenticityScore: { 
    type: Number, 
    required: true 
  },
  engagementPrediction: {
    likeRate: Number,
    commentRate: Number,
    saveRate: Number,
    shareRate: Number,
    confidence: Number,
  },
  usedPatterns: [String],
  usedHooks: [String],
}, { _id: false });

const ActualMetricsSchema = new Schema({
  likes: { 
    type: Number, 
    default: 0 
  },
  comments: { 
    type: Number, 
    default: 0 
  },
  saves: { 
    type: Number, 
    default: 0 
  },
  shares: { 
    type: Number, 
    default: 0 
  },
  impressions: { 
    type: Number, 
    default: 0 
  },
  engagementRate: { 
    type: Number, 
    default: 0 
  },
}, { _id: false });

const GeneratedCaptionSchema = new Schema<IGeneratedCaption>({
  userId: { 
    type: String, 
    required: true,
    index: true
  },
  workspaceId: { 
    type: String, 
    required: true,
    index: true
  },
  contentId: { 
    type: String,
    index: true
  },
  
  // Generation Context
  variations: {
    type: [CaptionVariationSchema],
    required: true,
    validate: {
      validator: (v: ICaptionVariation[]) => v.length > 0,
      message: 'At least one variation is required'
    }
  },
  
  // User Interaction
  selectedVariationIndex: Number,
  wasEdited: { 
    type: Boolean, 
    default: false 
  },
  originalCaption: String,
  editedCaption: String,
  editDistance: Number,
  
  // Actual Performance
  actualMetrics: ActualMetricsSchema,
  performanceRecordedAt: Date,
  
  // Metadata
  postType: {
    type: String,
    required: true,
    enum: ['post', 'story', 'reel'],
    index: true
  },
  platform: {
    type: String,
    required: true,
    default: 'instagram'
  },
  niche: {
    type: String,
    required: true,
    index: true
  },
  generatedAt: { 
    type: Date, 
    default: Date.now,
    index: true
  },
  publishedAt: {
    type: Date,
    index: true
  },
}, {
  timestamps: true // Adds createdAt and updatedAt
});

// Compound indexes for optimized queries
GeneratedCaptionSchema.index({ userId: 1, workspaceId: 1, generatedAt: -1 });
GeneratedCaptionSchema.index({ contentId: 1 });
GeneratedCaptionSchema.index({ publishedAt: -1 });
GeneratedCaptionSchema.index({ userId: 1, publishedAt: -1 });
GeneratedCaptionSchema.index({ performanceRecordedAt: -1 });

// Index for learning queries
GeneratedCaptionSchema.index({ 
  userId: 1, 
  workspaceId: 1, 
  performanceRecordedAt: 1 
});

export const GeneratedCaptionModel: Model<IGeneratedCaption> = 
  mongoose.models.GeneratedCaption as Model<IGeneratedCaption> || 
  mongoose.model<IGeneratedCaption>('GeneratedCaption', GeneratedCaptionSchema);

export { GeneratedCaptionSchema };
