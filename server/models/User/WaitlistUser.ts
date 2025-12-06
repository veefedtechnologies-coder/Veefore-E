import mongoose, { Document, Schema } from 'mongoose';

export interface IWaitlistUser extends Document {
  name: string;
  email: string;
  referralCode: string;
  referredBy?: string;
  referralCount: number;
  credits: number;
  status: string;
  discountCode?: string;
  discountExpiresAt?: Date;
  dailyLogins: number;
  feedbackSubmitted: boolean;
  joinedAt: Date;
  createdAt: Date;
  updatedAt: Date;
  metadata: Record<string, any>;
}

export const WaitlistUserSchema = new Schema<IWaitlistUser>({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  referralCode: { type: String, required: true, unique: true },
  referredBy: String,
  referralCount: { type: Number, default: 0 },
  credits: { type: Number, default: 0 },
  status: { type: String, default: 'waitlisted' },
  discountCode: String,
  discountExpiresAt: Date,
  dailyLogins: { type: Number, default: 0 },
  feedbackSubmitted: { type: Boolean, default: false },
  joinedAt: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  metadata: { type: Schema.Types.Mixed, default: {} }
});

export const WaitlistUser = mongoose.model<IWaitlistUser>('WaitlistUser', WaitlistUserSchema);
