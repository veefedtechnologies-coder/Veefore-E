import mongoose, { Document, Schema } from 'mongoose';

export interface IAddon extends Document {
  userId: mongoose.Types.ObjectId | string | number;
  type: string;
  name: string;
  price: number;
  isActive: boolean;
  expiresAt?: Date;
  metadata?: any;
  createdAt: Date;
  updatedAt: Date;
}

const AddonSchema = new Schema<IAddon>({
  userId: { type: Schema.Types.Mixed, required: true },
  type: { type: String, required: true },
  name: { type: String, required: true },
  price: { type: Number, required: true },
  isActive: { type: Boolean, default: true },
  expiresAt: Date,
  metadata: Schema.Types.Mixed,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

export const AddonModel = mongoose.models.Addon as mongoose.Model<IAddon> || mongoose.model<IAddon>('Addon', AddonSchema);
export { AddonSchema };
