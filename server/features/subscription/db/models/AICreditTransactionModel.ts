/**
 * AICreditTransaction — the per-event AI-credit ledger.
 *
 * Each document records a single credit-affecting event: a deduction
 * (reservation → settlement), a finalization adjustment (partial refund or
 * overage debit), or a full refund. This is the authoritative history that
 * powers the user-facing Credits page.
 *
 * The schema mirrors the one declared inside AICreditMeteringService (which
 * writes these docs). Mongoose caches models by name, so the singleton guard
 * below resolves to the SAME compiled model regardless of which module is
 * imported first — re-declaring the identical schema here is safe and avoids a
 * circular import on the metering service.
 */

import mongoose, { Schema } from 'mongoose'

export type AICreditTransactionStatus =
  | 'pending'
  | 'settled'
  | 'failed'
  | 'skipped'
  | 'adjusting'
  | 'refunding'
  | 'refund_pending'
  | 'refunded'

export interface IAICreditTransaction {
  userId: string
  workspaceId?: string
  feature: string
  credits: number
  providerCostInr: number
  status: AICreditTransactionStatus
  idempotencyKey: string
  metadata?: Record<string, unknown>
  createdAt: Date
  updatedAt: Date
}

const AICreditTransactionSchema = new Schema<IAICreditTransaction>(
  {
    userId: { type: String, required: true, index: true },
    workspaceId: { type: String, index: true },
    feature: { type: String, required: true, index: true },
    credits: { type: Number, required: true, min: 0 },
    providerCostInr: { type: Number, required: true, min: 0 },
    status: {
      type: String,
      enum: [
        'pending',
        'settled',
        'failed',
        'skipped',
        'adjusting',
        'refunding',
        'refund_pending',
        'refunded',
      ],
      required: true,
    },
    idempotencyKey: { type: String, required: true, unique: true },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
)

const AICreditTransactionModel =
  (mongoose.models.AICreditTransaction as mongoose.Model<IAICreditTransaction>) ||
  mongoose.model<IAICreditTransaction>('AICreditTransaction', AICreditTransactionSchema)

export default AICreditTransactionModel
