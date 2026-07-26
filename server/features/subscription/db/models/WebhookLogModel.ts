/**
 * WebhookLog MongoDB model.
 *
 * Durable, queryable record of every inbound Razorpay webhook (both Payments
 * and Subscriptions events). Complements the Redis-based idempotency
 * check in WebhookVerifier (which is fast but ephemeral, 24h TTL) with a
 * permanent audit trail — required for dispute resolution, debugging, and
 * compliance ("store webhook history").
 */

import mongoose, { Schema, type Document } from 'mongoose'

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface IWebhookLog extends Document {
  /** Razorpay's event id (x-razorpay-event-id header, or payload entity id) — idempotency key for this webhook delivery. */
  eventId: string
  /** Webhook event type, e.g. 'payment.captured', 'subscription.charged'. */
  eventType: string
  /** Which Razorpay product this webhook belongs to. */
  source: 'payments' | 'subscriptions'
  /** Full raw JSON payload, exactly as received. */
  payload: Record<string, unknown>
  /** Whether this webhook was successfully processed. */
  processed: boolean
  /** Number of processing attempts (relevant for retried/duplicate deliveries). */
  retryCount: number
  /** Error message from the most recent failed processing attempt, if any. */
  lastError: string | null
  /** Source IP the webhook was received from, for security auditing. */
  sourceIp: string | null
  /** Auto-managed by Mongoose timestamps option. */
  createdAt: Date
  updatedAt: Date
}

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const WebhookLogSchema = new Schema<IWebhookLog>(
  {
    eventId: { type: String, required: true },
    eventType: { type: String, required: true },
    source: { type: String, enum: ['payments', 'subscriptions'], required: true },
    payload: { type: Schema.Types.Mixed, required: true },
    processed: { type: Boolean, required: true, default: false },
    retryCount: { type: Number, required: true, default: 0 },
    lastError: { type: String, default: null },
    sourceIp: { type: String, default: null },
  },
  { timestamps: true }
)

// ---------------------------------------------------------------------------
// Indexes
// ---------------------------------------------------------------------------

// Idempotency lookups happen by eventId; not unique because Razorpay may
// legitimately redeliver the same event on retry — we want to log every
// delivery attempt while only *processing* it once (see `processed` flag).
WebhookLogSchema.index({ eventId: 1 })
WebhookLogSchema.index({ eventType: 1, createdAt: -1 })
WebhookLogSchema.index({ processed: 1 })

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------

const WebhookLogModel =
  (mongoose.models.WebhookLog as mongoose.Model<IWebhookLog>) ||
  mongoose.model<IWebhookLog>('WebhookLog', WebhookLogSchema)

export default WebhookLogModel
