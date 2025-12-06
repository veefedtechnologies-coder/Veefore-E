import mongoose, { Document, Schema, Model } from 'mongoose';

export interface IAIUsageLog extends Document {
  userId: string;
  workspaceId?: string;
  operationType: 'content_generation' | 'image_generation' | 'video_generation' | 'analysis' | 'chat' | 'trend_analysis' | 'competitor_analysis' | 'repurpose' | 'other';
  aiProvider: 'openai' | 'anthropic' | 'google' | 'replicate' | 'elevenlabs' | 'other';
  aiModel?: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  creditsUsed: number;
  creditsBefore: number;
  creditsAfter: number;
  requestMetadata?: {
    promptLength?: number;
    responseLength?: number;
    imageSize?: string;
    videoDuration?: number;
    endpoint?: string;
  };
  success: boolean;
  errorMessage?: string;
  responseTimeMs?: number;
  createdAt: Date;
}

const AIUsageLogSchema = new Schema<IAIUsageLog>({
  userId: { 
    type: String, 
    required: true,
    index: true
  },
  workspaceId: { 
    type: String,
    index: true
  },
  operationType: { 
    type: String, 
    required: true,
    enum: ['content_generation', 'image_generation', 'video_generation', 'analysis', 'chat', 'trend_analysis', 'competitor_analysis', 'repurpose', 'other'],
    index: true
  },
  aiProvider: { 
    type: String, 
    required: true,
    enum: ['openai', 'anthropic', 'google', 'replicate', 'elevenlabs', 'other']
  },
  aiModel: String,
  inputTokens: Number,
  outputTokens: Number,
  totalTokens: Number,
  creditsUsed: { 
    type: Number, 
    required: true,
    default: 0
  },
  creditsBefore: { 
    type: Number, 
    required: true 
  },
  creditsAfter: { 
    type: Number, 
    required: true 
  },
  requestMetadata: {
    promptLength: Number,
    responseLength: Number,
    imageSize: String,
    videoDuration: Number,
    endpoint: String
  },
  success: { 
    type: Boolean, 
    required: true,
    default: true
  },
  errorMessage: String,
  responseTimeMs: Number,
  createdAt: { 
    type: Date, 
    default: Date.now, 
    index: true 
  }
});

AIUsageLogSchema.index({ userId: 1, createdAt: -1 });
AIUsageLogSchema.index({ userId: 1, operationType: 1, createdAt: -1 });
AIUsageLogSchema.index({ workspaceId: 1, createdAt: -1 });

export const AIUsageLogModel: Model<IAIUsageLog> = mongoose.model<IAIUsageLog>('AIUsageLog', AIUsageLogSchema);
export { AIUsageLogSchema };
