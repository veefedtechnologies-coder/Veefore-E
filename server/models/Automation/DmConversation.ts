import mongoose, { Document, Schema } from 'mongoose';

export interface IDmConversation extends Document {
  workspaceId: any;
  platform: string;
  participantId: string;
  participantUsername?: string;
  lastMessageAt: Date;
  messageCount: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export const DmConversationSchema = new Schema<IDmConversation>({
  workspaceId: { type: Schema.Types.Mixed, required: true },
  platform: { type: String, required: true },
  participantId: { type: String, required: true },
  participantUsername: String,
  lastMessageAt: { type: Date, default: Date.now },
  messageCount: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

export const DmConversationModel = mongoose.models.DmConversation as mongoose.Model<IDmConversation> || mongoose.model<IDmConversation>('DmConversation', DmConversationSchema);
