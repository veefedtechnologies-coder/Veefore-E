import mongoose, { Document, Schema } from 'mongoose';

export interface IDmMessage extends Document {
  conversationId: any;
  messageId?: string;
  sender: 'user' | 'ai';
  content: string;
  messageType: string;
  sentiment?: string;
  topics?: string[];
  aiResponse: boolean;
  automationRuleId?: any;
  createdAt: Date;
}

export const DmMessageSchema = new Schema<IDmMessage>({
  conversationId: { type: Schema.Types.Mixed, required: true },
  messageId: String,
  sender: { type: String, required: true, enum: ['user', 'ai'] },
  content: { type: String, required: true },
  messageType: { type: String, default: 'text' },
  sentiment: String,
  topics: [String],
  aiResponse: { type: Boolean, default: false },
  automationRuleId: { type: Schema.Types.Mixed },
  createdAt: { type: Date, default: Date.now }
});

export const DmMessageModel = mongoose.model<IDmMessage>('DmMessage', DmMessageSchema);
