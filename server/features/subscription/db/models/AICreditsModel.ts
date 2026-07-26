/**
 * AICredits MongoDB model.
 *
 * Tracks per-user AI credit balances split across monthly plan allocation,
 * one-time purchased packs, and rollover credits. Also records cycle-level
 * usage for quota notification thresholds (80 / 90 / 100%).
 *
 * Satisfies Requirements: 2.2, 9.2, 15.2
 */

import mongoose, { Schema, type Document } from 'mongoose'

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface IAICredits extends Document {
  /** Unique user identifier — one document per user. */
  userId: string
  /** Total credits currently available to the user (monthlyCredits + purchasedCredits + rolloverCredits - consumed). */
  remainingCredits: number
  /** Base credit allocation from the user's current plan, reset on each billing cycle. */
  monthlyCredits: number
  /** Credits added via one-time add-on packs; carry over until exhausted. */
  purchasedCredits: number
  /** Rollover credits from previous cycles (future feature, initialised to 0). */
  rolloverCredits: number
  /** Total credits consumed in the current billing cycle; used for threshold notifications. */
  usedThisCycle: number
  /** Idempotency keys for applied credit debits/reservations. */
  appliedDebitKeys: string[]
  /** Idempotency keys for applied credit refunds/adjustments. */
  appliedRefundKeys: string[]
  /** Timestamp of the most recent monthly reset. */
  lastResetAt: Date
  /** Timestamp of the next scheduled monthly reset. */
  nextResetAt: Date
  /** Auto-managed by Mongoose timestamps option. */
  createdAt: Date
  /** Auto-managed by Mongoose timestamps option. */
  updatedAt: Date
}

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const AICreditsSchema = new Schema<IAICredits>(
  {
    userId: { type: String, required: true, unique: true },
    remainingCredits: { type: Number, required: true, min: 0, default: 0 },
    monthlyCredits: { type: Number, required: true, min: 0, default: 0 },
    purchasedCredits: { type: Number, required: true, min: 0, default: 0 },
    rolloverCredits: { type: Number, required: true, min: 0, default: 0 },
    usedThisCycle: { type: Number, required: true, min: 0, default: 0 },
    appliedDebitKeys: { type: [String], default: [] },
    appliedRefundKeys: { type: [String], default: [] },
    lastResetAt: { type: Date, required: true },
    nextResetAt: { type: Date, required: true },
  },
  { timestamps: true }
)

// ---------------------------------------------------------------------------
// Indexes
// ---------------------------------------------------------------------------

// Unique index on userId — one document per user, used for all credit reads/writes.
AICreditsSchema.index({ userId: 1 }, { unique: true })
// Used by the monthly quota-reset cron job to find users due for reset.
AICreditsSchema.index({ nextResetAt: 1 })

// ---------------------------------------------------------------------------
// Model (singleton-safe for hot-reload / ESM environments)
// ---------------------------------------------------------------------------

const AICreditsModel =
  (mongoose.models.AICredits as mongoose.Model<IAICredits>) ||
  mongoose.model<IAICredits>('AICredits', AICreditsSchema)

export default AICreditsModel
