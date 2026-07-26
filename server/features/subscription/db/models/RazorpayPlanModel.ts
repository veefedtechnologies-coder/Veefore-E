/**
 * RazorpayPlanModel
 *
 * Caches the mapping from (planType, billingCycle, amountPaise) to the
 * Razorpay `plan_id` created for that price point. Razorpay plans are
 * immutable price points with no "find or create" API, so we create each
 * plan once and persist the mapping here — every subsequent subscription
 * for that plan/cycle/price reuses the same Razorpay plan_id instead of
 * creating a new (duplicate) plan on every checkout.
 */

import mongoose, { Schema, type Document } from 'mongoose'

export interface IRazorpayPlan extends Document {
  /** Internal Veefore plan id, e.g. 'creator', 'pro', 'business'. */
  planType: string
  billingCycle: 'monthly' | 'yearly'
  /** Amount in paise — part of the key since Razorpay plans are price-immutable. */
  amountPaise: number
  /** The Razorpay plan_id returned when this plan was created. */
  razorpayPlanId: string
  createdAt: Date
  updatedAt: Date
}

const RazorpayPlanSchema = new Schema<IRazorpayPlan>(
  {
    planType: { type: String, required: true },
    billingCycle: { type: String, enum: ['monthly', 'yearly'], required: true },
    amountPaise: { type: Number, required: true },
    razorpayPlanId: { type: String, required: true, unique: true },
  },
  { timestamps: true }
)

RazorpayPlanSchema.index({ planType: 1, billingCycle: 1, amountPaise: 1 }, { unique: true })

const RazorpayPlanModel =
  (mongoose.models.RazorpayPlan as mongoose.Model<IRazorpayPlan>) ||
  mongoose.model<IRazorpayPlan>('RazorpayPlan', RazorpayPlanSchema)

export default RazorpayPlanModel
