import mongoose, { Document, Schema, Model } from 'mongoose';

export interface IExampleCaption extends Document {
  caption: string;
  
  // Source
  source: 'user' | 'curated' | 'scraped';
  sourceAccount?: string;
  userId?: string; // if source is user
  
  // Classification
  niche: string;
  postType: 'post' | 'story' | 'reel';
  style: string; // storytelling, question-based, etc.
  
  // Performance
  engagementRate: number;
  likes: number;
  comments: number;
  saves: number;
  shares: number;
  
  // Characteristics
  captionLength: number;
  hookType: string;
  hasQuestion: boolean;
  hasEmoji: boolean;
  emojiCount: number;
  
  // Metadata
  capturedAt: Date;
  verified: boolean; // Manually verified as high quality
}

const ExampleCaptionSchema = new Schema<IExampleCaption>({
  caption: { 
    type: String, 
    required: true,
    index: 'text' // Text index for search
  },
  
  // Source
  source: { 
    type: String, 
    required: true,
    enum: ['user', 'curated', 'scraped'],
    index: true
  },
  sourceAccount: String,
  userId: { 
    type: String,
    index: true
  },
  
  // Classification
  niche: { 
    type: String, 
    required: true,
    index: true
  },
  postType: { 
    type: String, 
    required: true,
    enum: ['post', 'story', 'reel'],
    index: true
  },
  style: { 
    type: String, 
    required: true 
  },
  
  // Performance
  engagementRate: { 
    type: Number, 
    required: true,
    index: true
  },
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
  
  // Characteristics
  captionLength: { 
    type: Number, 
    required: true 
  },
  hookType: String,
  hasQuestion: { 
    type: Boolean, 
    default: false 
  },
  hasEmoji: { 
    type: Boolean, 
    default: false 
  },
  emojiCount: { 
    type: Number, 
    default: 0 
  },
  
  // Metadata
  capturedAt: { 
    type: Date, 
    default: Date.now 
  },
  verified: { 
    type: Boolean, 
    default: false,
    index: true
  }
});

// Compound indexes for optimized queries
ExampleCaptionSchema.index({ niche: 1, postType: 1, engagementRate: -1 });
ExampleCaptionSchema.index({ verified: 1, engagementRate: -1 });
ExampleCaptionSchema.index({ source: 1, niche: 1 });

export const ExampleCaptionModel: Model<IExampleCaption> = 
  mongoose.models.ExampleCaption as Model<IExampleCaption> || 
  mongoose.model<IExampleCaption>('ExampleCaption', ExampleCaptionSchema);

export { ExampleCaptionSchema };
