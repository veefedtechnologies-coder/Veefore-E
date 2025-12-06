import mongoose, { Document, Schema } from 'mongoose';

export interface ISuggestion extends Document {
  workspaceId: mongoose.Types.ObjectId | string;
  type: string;
  data: Record<string, any>;
  confidence: number;
  isUsed: boolean;
  validUntil?: Date;
  createdAt: Date;
}

export const SuggestionSchema = new Schema<ISuggestion>({
  workspaceId: { type: Schema.Types.Mixed, required: true },
  type: { type: String, required: true },
  data: { type: Schema.Types.Mixed, required: true },
  confidence: { type: Number, default: 0.8 },
  isUsed: { type: Boolean, default: false },
  validUntil: Date,
  createdAt: { type: Date, default: Date.now }
});

export const SuggestionModel = mongoose.models.Suggestion as mongoose.Model<ISuggestion> || mongoose.model<ISuggestion>('Suggestion', SuggestionSchema);
