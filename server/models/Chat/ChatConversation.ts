import mongoose, { Document, Schema } from 'mongoose';

export interface IChatConversation extends Document {
  id: number;
  userId: string;
  workspaceId: string;
  title: string;
  messageCount: number;
  isArchived?: boolean;
  lastMessageAt?: Date;
  // Rolling long-term memory: a running summary of older messages that have
  // scrolled out of the verbatim history window, plus how many of the oldest
  // messages have already been folded into that summary. This gives the chat
  // effectively unlimited memory without an unbounded prompt.
  memorySummary?: string;
  summarizedMessageCount?: number;
  createdAt: Date;
  updatedAt: Date;
}

export const ChatConversationSchema = new Schema<IChatConversation>({
  id: { type: Number, unique: true },
  userId: { type: String, required: true },
  workspaceId: { type: String, required: true },
  title: { type: String, required: true, default: "New chat" },
  messageCount: { type: Number, default: 0 },
  isArchived: { type: Boolean, default: false },
  lastMessageAt: { type: Date },
  memorySummary: { type: String, default: '' },
  summarizedMessageCount: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

export const ChatConversation = mongoose.models.ChatConversation as mongoose.Model<IChatConversation> || mongoose.model<IChatConversation>('ChatConversation', ChatConversationSchema);
