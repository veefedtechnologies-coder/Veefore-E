/**
 * Payment MongoDB model.
 *
 * Records every payment collected through Razorpay — subscription
 * authentication/renewal charges (Subscriptions API) as well as one-time
 * order payments for add-ons/credit packs (Orders API). One Payment
 * document per Razorpay payment attempt.
 */

import mongoose, { Schema, type Document } from 'mongoose'
import { v4 as uuidv4 } from 'uuid'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PaymentStatus =
  | 'created'      // payment/order created at Razorpay, not yet attempted
  | 'authorized'   // payment authorized (captured=false), awaiting capture
  | 'captured'     // payment captured successfully — real money collected
  | 'failed'       // payment failed or was rejected
  | 'refunded'     // payment was later refunded (partial or full)

export type PaymentSource = 'subscription_auth' | 'subscription_renewal' | 'addon' | 'credits' | 'manual'

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface IPayment extends Document {
  /** UUID — primary application-level identifier for this payment record. */
  paymentId: string
  /** The user this payment belongs to. */
  userId: string
  /** The workspace this payment is billed against. */
  workspaceId: string
  /** Razorpay's payment_id (pay_xxx). */
  razorpayPaymentId: string | null
  /** Razorpay's order_id (order_xxx) — populated for one-time Orders API payments; null for subscription charges. */
  razorpayOrderId: string | null
  /** Razorpay's subscription_id (sub_xxx) — populated for subscription charges; null for one-time payments. */
  razorpaySubscriptionId: string | null
  /** Payment amount in whole currency units (e.g. rupees). */
  amount: number
  /** ISO 4217 currency code, e.g. 'INR'. */
  currency: string
  /** Current lifecycle status of this payment. */
  status: PaymentStatus
  /** Payment method used (upi/card/netbanking/wallet/etc), populated from the webhook payload. */
  paymentMethod: string | null
  /** What this payment was for. */
  source: PaymentSource
  /** The plan this payment activates/renews, for audit/reporting. Empty string for non-plan payments (addon/credits). */
  planId: string
  /** Billing cycle this payment covers, if applicable. */
  billingCycle: 'monthly' | 'yearly' | null
  /** Raw webhook created_at reported by Razorpay, if available. */
  paidAt: Date | null
  /** Refund status tracking — null if never refunded. */
  refundId: string | null
  refundAmount: number | null
  refundStatus: 'none' | 'initiated' | 'success' | 'failed'
  /** Auto-managed by Mongoose timestamps option. */
  createdAt: Date
  /** Auto-managed by Mongoose timestamps option. */
  updatedAt: Date
}

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const PaymentSchema = new Schema<IPayment>(
  {
    paymentId: {
      type: String,
      required: true,
      unique: true,
      default: () => uuidv4(),
    },
    userId: { type: String, required: true },
    workspaceId: { type: String, required: true },
    razorpayPaymentId: { type: String, default: null },
    razorpayOrderId: { type: String, default: null },
    razorpaySubscriptionId: { type: String, default: null },
    amount: { type: Number, required: true },
    currency: { type: String, required: true, default: 'INR' },
    status: {
      type: String,
      enum: ['created', 'authorized', 'captured', 'failed', 'refunded'],
      required: true,
      default: 'created',
    },
    paymentMethod: { type: String, default: null },
    source: {
      type: String,
      enum: ['subscription_auth', 'subscription_renewal', 'addon', 'credits', 'manual'],
      required: true,
    },
    planId: { type: String, default: '' },
    billingCycle: { type: String, enum: ['monthly', 'yearly', null], default: null },
    paidAt: { type: Date, default: null },
    refundId: { type: String, default: null },
    refundAmount: { type: Number, default: null },
    refundStatus: {
      type: String,
      enum: ['none', 'initiated', 'success', 'failed'],
      default: 'none',
    },
  },
  { timestamps: true }
)

// ---------------------------------------------------------------------------
// Indexes
// ---------------------------------------------------------------------------

PaymentSchema.index({ userId: 1, createdAt: -1 })
PaymentSchema.index({ razorpayPaymentId: 1 }, { sparse: true, unique: true })
PaymentSchema.index({ razorpayOrderId: 1 }, { sparse: true })
PaymentSchema.index({ razorpaySubscriptionId: 1 }, { sparse: true })
PaymentSchema.index({ status: 1 })

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------

const PaymentModel =
  (mongoose.models.Payment as mongoose.Model<IPayment>) ||
  mongoose.model<IPayment>('Payment', PaymentSchema)

export default PaymentModel
