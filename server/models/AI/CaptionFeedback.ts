import mongoose, { Document, Schema, Model } from 'mongoose';

/**
 * Caption Feedback Model
 * 
 * Stores user feedback on generated captions including selections,
 * edits, rejections, and regenerations for continuous learning.
 * 
 * Requirements: 10.1, 10.2, 10.6
 */

export interface IEditChange {
  type: 'vocabulary' | 'structure' | 'emoji' | 'length' | 'tone' | 'other';
  before: string;
  after: string;
  reason?: string; // Inferred reason
}

export interface ICaptionFeedback extends Document {
  userId: string;
  workspaceId: string;
  generatedCaptionId: string; // Reference to GeneratedCaption
  
  // Feedback Type
  feedbackType: 'selection' | 'edit' | 'rejection' | 'regeneration';
  
  // Selection Details
  selectedVariation?: number;
  rejectedVariations?: number[];
  
  // Edit Details
  editsMade?: IEditChange[];
  
  // Pattern Preferences
  preferredPatterns?: string[]; // Pattern IDs from selected variation
  rejectedPatterns?: string[];  // Pattern IDs from rejected variations
  
  // Metadata
  timestamp: Date;
  niche?: string;
  postType?: string;
}

const EditChangeSchema = new Schema({
  type: {
    type: String,
    required: true,
    enum: ['vocabulary', 'structure', 'emoji', 'length', 'tone', 'other']
  },
  before: {
    type: String,
    required: true
  },
  after: {
    type: String,
    required: true
  },
  reason: String
}, { _id: false });

const CaptionFeedbackSchema = new Schema<ICaptionFeedback>({
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
  generatedCaptionId: {
    type: String,
    required: true,
    index: true
  },
  
  // Feedback Type
  feedbackType: {
    type: String,
    required: true,
    enum: ['selection', 'edit', 'rejection', 'regeneration'],
    index: true
  },
  
  // Selection Details
  selectedVariation: Number,
  rejectedVariations: [Number],
  
  // Edit Details
  editsMade: [EditChangeSchema],
  
  // Pattern Preferences
  preferredPatterns: [String],
  rejectedPatterns: [String],
  
  // Metadata
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  },
  niche: {
    type: String,
    index: true
  },
  postType: {
    type: String,
    enum: ['post', 'story', 'reel']
  }
}, {
  timestamps: true // Adds createdAt and updatedAt
});

// Compound indexes for optimized queries
CaptionFeedbackSchema.index({ userId: 1, timestamp: -1 });
CaptionFeedbackSchema.index({ userId: 1, workspaceId: 1, timestamp: -1 });
CaptionFeedbackSchema.index({ feedbackType: 1, timestamp: -1 });
CaptionFeedbackSchema.index({ userId: 1, feedbackType: 1 });

export const CaptionFeedbackModel: Model<ICaptionFeedback> = 
  mongoose.models.CaptionFeedback as Model<ICaptionFeedback> || 
  mongoose.model<ICaptionFeedback>('CaptionFeedback', CaptionFeedbackSchema);

export { CaptionFeedbackSchema };
