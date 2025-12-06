import mongoose, { Document, Schema } from 'mongoose';

export interface ITeamInvitation extends Document {
  workspaceId: mongoose.Types.ObjectId | string | number;
  email: string;
  role: 'admin' | 'editor' | 'viewer';
  status: string;
  token: string;
  expiresAt: Date;
  invitedBy: mongoose.Types.ObjectId | string | number;
  permissions: Record<string, any>;
  acceptedAt?: Date;
  createdAt: Date;
}

export const TeamInvitationSchema = new Schema<ITeamInvitation>({
  workspaceId: { type: Schema.Types.Mixed, required: true },
  email: { type: String, required: true },
  role: { type: String, required: true, enum: ['admin', 'editor', 'viewer'] },
  status: { type: String, default: 'pending' },
  token: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true },
  invitedBy: { type: Schema.Types.Mixed, required: true },
  permissions: { type: Schema.Types.Mixed, default: {} },
  acceptedAt: Date,
  createdAt: { type: Date, default: Date.now }
});

export const TeamInvitationModel = mongoose.model<ITeamInvitation>('TeamInvitation', TeamInvitationSchema);
