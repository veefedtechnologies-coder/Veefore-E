import mongoose, { Document, Schema, Model } from 'mongoose';

export interface IFeedbackMessage extends Document {
  userId?: number;
  name?: string;
  email?: string;
  subject: string;
  message: string;
  type: string;
  status: string;
  adminResponse?: string;
  respondedBy?: number;
  respondedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const FeedbackMessageSchema = new Schema<IFeedbackMessage>({
  userId: Number,
  name: String,
  email: String,
  subject: { type: String, required: true },
  message: { type: String, required: true },
  type: { type: String, required: true },
  status: { type: String, default: 'pending' },
  adminResponse: String,
  respondedBy: Number,
  respondedAt: Date,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

export const FeedbackMessageModel: Model<IFeedbackMessage> = mongoose.models.FeedbackMessage as Model<IFeedbackMessage> || mongoose.model<IFeedbackMessage>('FeedbackMessage', FeedbackMessageSchema);
export { FeedbackMessageSchema };
