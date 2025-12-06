import mongoose, { Document, Schema } from 'mongoose';

export interface ISubscription extends Document {
  userId: mongoose.Types.ObjectId | string | number;
  plan: string;
  status: string;
  priceId?: string;
  subscriptionId?: string;
  currentPeriodStart?: Date;
  currentPeriodEnd?: Date;
  monthlyCredits: number;
  extraCredits: number;
  autoRenew: boolean;
  canceledAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const SubscriptionSchema = new Schema<ISubscription>({
  userId: { type: Schema.Types.Mixed, required: true },
  plan: { type: String, required: true },
  status: { type: String, required: true },
  priceId: String,
  subscriptionId: String,
  currentPeriodStart: Date,
  currentPeriodEnd: Date,
  monthlyCredits: { type: Number, default: 0 },
  extraCredits: { type: Number, default: 0 },
  autoRenew: { type: Boolean, default: true },
  canceledAt: Date,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

export const SubscriptionModel = mongoose.model<ISubscription>('Subscription', SubscriptionSchema);
export { SubscriptionSchema };
