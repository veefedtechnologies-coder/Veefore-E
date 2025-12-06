import mongoose, { Document, Schema, Model } from 'mongoose';

export interface IUserContentHistory extends Document {
  userId: any;
  workspaceId: any;
  recommendationId?: any;
  action: string;
  metadata: Record<string, any>;
  createdAt: Date;
}

const UserContentHistorySchema = new Schema<IUserContentHistory>({
  userId: { type: Schema.Types.Mixed, required: true },
  workspaceId: { type: Schema.Types.Mixed, required: true },
  recommendationId: { type: Schema.Types.Mixed },
  action: { type: String, required: true },
  metadata: { type: Schema.Types.Mixed, default: {} },
  createdAt: { type: Date, default: Date.now }
});

export const UserContentHistoryModel: Model<IUserContentHistory> = mongoose.models.UserContentHistory as Model<IUserContentHistory> || mongoose.model<IUserContentHistory>('UserContentHistory', UserContentHistorySchema);
export { UserContentHistorySchema };
