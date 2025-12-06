import mongoose, { Document, Schema } from 'mongoose';

export interface IReferral extends Document {
  referrerId: number;
  referredUserId?: number;
  referralCode: string;
  status: string;
  rewardAmount: number;
  isConfirmed: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ReferralSchema = new Schema<IReferral>({
  referrerId: { type: Number, required: true },
  referredUserId: Number,
  referralCode: { type: String, required: true },
  status: { type: String, default: 'pending' },
  rewardAmount: { type: Number, default: 100 },
  isConfirmed: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

export const ReferralModel = mongoose.models.Referral as mongoose.Model<IReferral> || mongoose.model<IReferral>('Referral', ReferralSchema);
export { ReferralSchema };
