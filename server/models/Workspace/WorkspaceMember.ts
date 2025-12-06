import mongoose, { Document, Schema } from 'mongoose';

export interface IWorkspaceMember extends Document {
  userId: mongoose.Types.ObjectId | string | number;
  workspaceId: mongoose.Types.ObjectId | string | number;
  role: 'owner' | 'admin' | 'editor' | 'viewer';
  status: string;
  permissions: Record<string, any>;
  invitedBy?: mongoose.Types.ObjectId | string | number;
  joinedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export const WorkspaceMemberSchema = new Schema<IWorkspaceMember>({
  userId: { type: Schema.Types.Mixed, required: true },
  workspaceId: { type: Schema.Types.Mixed, required: true },
  role: { type: String, required: true, enum: ['owner', 'admin', 'editor', 'viewer'] },
  status: { type: String, default: 'active' },
  permissions: { type: Schema.Types.Mixed, default: {} },
  invitedBy: { type: Schema.Types.Mixed },
  joinedAt: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

export const WorkspaceMemberModel = mongoose.model<IWorkspaceMember>('WorkspaceMember', WorkspaceMemberSchema);
