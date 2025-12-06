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
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

export const WorkspaceModel = mongoose.model<IWorkspace>('Workspace', WorkspaceSchema);
