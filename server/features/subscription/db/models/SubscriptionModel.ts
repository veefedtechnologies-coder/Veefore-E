/**
 * Subscription MongoDB model.
 *
 * Represents a user's subscription state including plan, billing cycle,
 * status, Razorpay integration references, and admin feature overrides.
 *
 * Billing gateway: Razorpay (Subscriptions API). Razorpay's authentication
 * transaction charges the FULL plan amount immediately — there is no
 * separate "first charge via Orders API" step like the previous Cashfree
 * integration required. A subscription reaching Razorpay status 'active'
 * (via the `subscription.activated` or `subscription.charged` webhook,
 * always with a real captured payment) is the only trigger for granting
 * paid plan access.
 */

import mongoose, { Schema, type Document } from 'mongoose'
import { v4 as uuidv4 } from 'uuid'
import type { PlanId, BillingCycle } from '../../../../config/plan-config'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SubscriptionStatus =
  | 'active'
  | 'trial'
  | 'cancelled'
  | 'expired'
  | 'payment_failed'
  | 'started'
  /**
   * The user has selected a plan and a Razorpay subscription has been
   * created, but the customer has not yet completed the authentication
   * transaction (or it has not yet been confirmed via webhook). No plan
   * access is granted in this status. Maps to Razorpay's 'created' /
   * 'authenticated' subscription states.
   */
  | 'pending_payment'
  /**
   * A recurring renewal charge failed. The subscription retains its paid
   * plan and limits during the configured retry window (Day 0/1/3/5) and
   * subsequent grace period — see `renewalRetryCount` / `pastDueGraceEndsAt`.
   * Maps to Razorpay's 'halted' subscription state (all retries exhausted
   * on Razorpay's side) as well as individual `payment.failed` events
   * during the retry window.
   * If all retries and the grace period are exhausted, the cron worker
   * transitions the subscription to 'cancelled' and revokes paid access.
   */
  | 'past_due'

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface ISubscription extends Document {
  /** UUID — primary application-level identifier for this subscription. */
  subscriptionId: string
  /** The user this subscription belongs to. */
  userId: string
  /** The workspace this subscription is associated with. */
  workspaceId: string
  /** Current plan tier. */
  plan: PlanId
  /** Whether the user is billed monthly or yearly. */
  billingCycle: BillingCycle
  /** Lifecycle status of the subscription. */
  status: SubscriptionStatus
  /** Start of the current paid period. */
  currentPeriodStart: Date
  /** End of the current paid period. */
  currentPeriodEnd: Date
  /** Date when the next payment will be charged. */
  nextBillingDate: Date
  /** If true, subscription cancels at the end of the current period instead of renewing. */
  cancelAtPeriodEnd: boolean

  /** Razorpay subscription reference ID (sub_xxx); null before checkout is initiated. */
  razorpaySubscriptionId: string | null
  /** Razorpay customer ID (cust_xxx); null before customer record is created. */
  razorpayCustomerId: string | null
  /** Razorpay plan ID (plan_xxx) this subscription is linked to. */
  razorpayPlanId: string | null
  /** Razorpay payment_id of the most recent successful charge (authentication or renewal). */
  lastPaymentId: string | null

  /**
   * Admin-managed per-feature overrides (e.g. force-enable a beta feature).
   * Keys are feature names, values are boolean overrides.
   */
  featureOverrides: Map<string, boolean>
  /** Date after which a payment_failed subscription is fully downgraded; null if not in grace. */
  gracePeriodEndsAt: Date | null

  /** Number of consecutive failed renewal attempts in the current retry cycle (resets to 0 on success). */
  renewalRetryCount: number
  /** Timestamp of the most recent renewal retry attempt; null if no retry in progress. */
  lastRenewalRetryAt: Date | null
  /** Timestamp the current 'past_due' grace period ends; access is revoked after this if unresolved. */
  pastDueGraceEndsAt: Date | null

  /** Auto-managed by Mongoose timestamps option. */
  createdAt: Date
  /** Auto-managed by Mongoose timestamps option. */
  updatedAt: Date
}

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const SubscriptionSchema = new Schema<ISubscription>(
  {
    subscriptionId: {
      type: String,
      required: true,
      unique: true,
      default: () => uuidv4(),
    },
    userId: { type: String, required: true },
    workspaceId: { type: String, required: true },
    plan: {
      type: String,
      enum: ['free', 'creator', 'pro', 'business', 'enterprise'],
      required: true,
    },
    billingCycle: {
      type: String,
      enum: ['monthly', 'yearly'],
      required: true,
    },
    status: {
      type: String,
      enum: [
        'active',
        'trial',
        'cancelled',
        'expired',
        'payment_failed',
        'started',
        'pending_payment',
        'past_due',
      ],
      required: true,
    },
    currentPeriodStart: { type: Date, required: true },
    currentPeriodEnd: { type: Date, required: true },
    nextBillingDate: { type: Date, required: true },
    cancelAtPeriodEnd: { type: Boolean, default: false },

    razorpaySubscriptionId: { type: String, default: null },
    razorpayCustomerId: { type: String, default: null },
    razorpayPlanId: { type: String, default: null },
    lastPaymentId: { type: String, default: null },

    featureOverrides: { type: Map, of: Boolean, default: () => new Map() },
    gracePeriodEndsAt: { type: Date, default: null },

    renewalRetryCount: { type: Number, default: 0 },
    lastRenewalRetryAt: { type: Date, default: null },
    pastDueGraceEndsAt: { type: Date, default: null },
  },
  { timestamps: true }
)

// ---------------------------------------------------------------------------
// Indexes
// ---------------------------------------------------------------------------

SubscriptionSchema.index({ userId: 1 })
SubscriptionSchema.index({ status: 1 })
SubscriptionSchema.index({ nextBillingDate: 1 })
SubscriptionSchema.index({ userId: 1, status: 1 })
SubscriptionSchema.index({ razorpaySubscriptionId: 1 }, { sparse: true })

// ---------------------------------------------------------------------------
// Model (singleton-safe for hot-reload / ESM environments)
// ---------------------------------------------------------------------------

const SubscriptionModel =
  (mongoose.models.Subscription as mongoose.Model<ISubscription>) ||
  mongoose.model<ISubscription>('Subscription', SubscriptionSchema)

export default SubscriptionModel
