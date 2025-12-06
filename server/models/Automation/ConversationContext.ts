import mongoose, { Document, Schema } from 'mongoose';

export interface IConversationContext extends Document {
  conversationId: any;
  contextType: string;
  contextValue: string;
  confidence: number;
  extractedAt: Date;
  expiresAt?: Date;
}

export const ConversationContextSchema = new Schema<IConversationContext>({
  conversationId: { type: Schema.Types.Mixed, required: true },
  contextType: { type: String, required: true },
  contextValue: { type: String, required: true },
  confidence: { type: Number, default: 100 },
  extractedAt: { type: Date, default: Date.now },
  expiresAt: Date
});

export const ConversationContextModel = mongoose.models.ConversationContext as mongoose.Model<IConversationContext> || mongoose.model<IConversationContext>('ConversationContext', ConversationContextSchema);
