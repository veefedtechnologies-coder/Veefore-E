import mongoose, { Document, Schema } from 'mongoose';

export interface IChatMessage extends Document {
  id: number;
  conversationId: number;
  role: 'user' | 'assistant';
  content: string;
  tokensUsed: number;
  createdAt: Date;
}

export const ChatMessageSchema = new Schema<IChatMessage>({
  id: { type: Number, unique: true },
  conversationId: { type: Number, required: true },
  role: { type: String, required: true, enum: ['user', 'assistant'] },
  content: { type: String, required: true },
  tokensUsed: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

export const ChatMessage = mongoose.models.ChatMessage as mongoose.Model<IChatMessage> || mongoose.model<IChatMessage>('ChatMessage', ChatMessageSchema);
