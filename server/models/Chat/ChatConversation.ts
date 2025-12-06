import mongoose, { Document, Schema } from 'mongoose';

export interface IChatConversation extends Document {
  id: number;
  userId: string;
  workspaceId: string;
  title: string;
  messageCount: number;
  lastMessageAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export const ChatConversationSchema = new Schema<IChatConversation>({
  id: { type: Number, unique: true },
  userId: { type: String, required: true },
  workspaceId: { type: String, required: true },
  title: { type: String, required: true, default: "New chat" },
  messageCount: { type: Number, default: 0 },
  lastMessageAt: { type: Date },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

export const ChatConversation = mongoose.model<IChatConversation>('ChatConversation', ChatConversationSchema);
