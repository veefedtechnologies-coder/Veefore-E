import mongoose, { Document, Schema } from 'mongoose';

export interface ICreditTransaction extends Document {
  userId: mongoose.Types.ObjectId | string | number;
  amount: number;
  type: string;
  description: string;
  workspaceId?: mongoose.Types.ObjectId | string | number;
  referenceId?: string;
  createdAt: Date;
}

const CreditTransactionSchema = new Schema<ICreditTransaction>({
  userId: { type: Schema.Types.Mixed, required: true },
  amount: { type: Number, required: true },
  type: { type: String, required: true },
  description: { type: String, required: true },
  workspaceId: { type: Schema.Types.Mixed },
  referenceId: { type: String },
  createdAt: { type: Date, default: Date.now }
});

export const CreditTransactionModel = mongoose.models.CreditTransaction as mongoose.Model<ICreditTransaction> || mongoose.model<ICreditTransaction>('CreditTransaction', CreditTransactionSchema);
export { CreditTransactionSchema };
