/**
 * Veefore Subscription — SubscriptionEvent MongoDB model (Audit Log).
 *
 * Immutable audit trail of every subscription state transition, plan change,
 * or admin action. The `timestamp` field on the document itself handles
 * time-tracking, so Mongoose `timestamps` option is intentionally omitted.
 *
 * Satisfies Requirements: 2.4, 10.6
 */

import mongoose, { Schema, type Document } from 'mongoose';

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface ISubscriptionEvent extends Document {
  /** Name of the business event (e.g. 'subscription.activated', 'plan.upgraded'). */
  eventType: string;
  /** The user whose subscription was affected. */
  userId: string;
  /** The subscription document ID the event relates to. */
  subscriptionId: string;
  /** Subscription status before the transition; null when not applicable. */
  previousStatus: string | null;
  /** Subscription status after the transition; null when not applicable. */
  newStatus: string | null;
  /** Plan ID before the transition; null when not applicable. */
  previousPlan: string | null;
  /** Plan ID after the transition; null when not applicable. */
  newPlan: string | null;
  /** What initiated this event. */
  triggeredBy: 'webhook' | 'admin' | 'user' | 'cron';
  /** Admin user ID when triggeredBy is 'admin'; undefined otherwise. */
  adminUserId?: string;
  /** Arbitrary contextual data (e.g. Cashfree event payload, diff details). */
  metadata: Record<string, unknown>;
  /** When this event occurred. Defaults to the current date at insert time. */
  timestamp: Date;
}

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const SubscriptionEventSchema = new Schema<ISubscriptionEvent>({
  eventType: {
    type: String,
    required: true,
  },
  userId: {
    type: String,
    required: true,
  },
  subscriptionId: {
    type: String,
    required: true,
  },
  previousStatus: {
    type: String,
    default: null,
  },
  newStatus: {
    type: String,
    default: null,
  },
  previousPlan: {
    type: String,
    default: null,
  },
  newPlan: {
    type: String,
    default: null,
  },
  triggeredBy: {
    type: String,
    enum: ['webhook', 'admin', 'user', 'cron'],
    required: true,
  },
  adminUserId: {
    type: String,
  },
  metadata: {
    type: Schema.Types.Mixed,
    default: {},
  },
  timestamp: {
    type: Date,
    default: Date.now,
  },
});
// No `timestamps: true` — the `timestamp` field above covers audit time.

// Read pattern: fetch a user's event history ordered newest-first.
SubscriptionEventSchema.index({ userId: 1, timestamp: -1 });
// Look up all events for a specific subscription document.
SubscriptionEventSchema.index({ subscriptionId: 1 });

// ---------------------------------------------------------------------------
// Model (safe re-use in hot-reload environments)
// ---------------------------------------------------------------------------

export const SubscriptionEventModel =
  (mongoose.models.SubscriptionEvent as mongoose.Model<ISubscriptionEvent>) ||
  mongoose.model<ISubscriptionEvent>('SubscriptionEvent', SubscriptionEventSchema);
