import mongoose, { Document, Schema } from 'mongoose';

export interface IWorkspace extends Document {
  userId: mongoose.Types.ObjectId | string | number;
  name: string;
  description?: string;
  avatar?: string;
  credits: number;
  theme: string;
  aiPersonality: string;
  isDefault: boolean;
  maxTeamMembers: number;
  inviteCode?: string;
  aiConfiguration?: {
    aiModel?: string;
    creativityLevel?: number;
    optimizationGoals?: string;
    aiPersona?: string;
    captionStyle?: string;
    responseLength?: string;
    multilingual?: string;
    videoEngine?: string;
    thumbnailStyle?: string;
    autoHashtags?: boolean;
    contentSafety?: string;
    aiMemory?: string;
    autoLearning?: boolean;
    googleAiStudioKey?: string;
    openAiKey?: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

export const WorkspaceSchema = new Schema<IWorkspace>({
  userId: { type: Schema.Types.Mixed, required: true },
  name: { type: String, required: true },
  description: String,
  avatar: String,
  credits: { type: Number, default: 0 },
  theme: { type: String, default: 'space' },
  aiPersonality: { type: String, default: 'professional' },
  isDefault: { type: Boolean, default: false },
  maxTeamMembers: { type: Number, default: 1 },
  inviteCode: { type: String, unique: true, sparse: true },
  aiConfiguration: {
    aiModel: String,
    creativityLevel: Number,
    optimizationGoals: String,
    aiPersona: String,
    captionStyle: String,
    responseLength: String,
    multilingual: String,
    videoEngine: String,
    thumbnailStyle: String,
    autoHashtags: Boolean,
    contentSafety: String,
    aiMemory: String,
    autoLearning: Boolean,
    googleAiStudioKey: String,
    openAiKey: String
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

WorkspaceSchema.index({ userId: 1 }, { background: true });
WorkspaceSchema.index({ isDefault: 1 }, { background: true });
WorkspaceSchema.index({ userId: 1, isDefault: 1 }, { background: true });
WorkspaceSchema.index({ createdAt: -1 }, { background: true });
WorkspaceSchema.index({ 'aiConfiguration.googleAiStudioKey': 1 }, { sparse: true });

export const WorkspaceModel = mongoose.models.Workspace as mongoose.Model<IWorkspace> || mongoose.model<IWorkspace>('Workspace', WorkspaceSchema);
