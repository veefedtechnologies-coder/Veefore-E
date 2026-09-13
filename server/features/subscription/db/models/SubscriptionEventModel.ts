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

export const SUBSCRIPTION_MODAL_TYPES = [
  'premium_welcome',
  'plan_change_success',
  'credit_purchase_success',
] as const;

export type SubscriptionModalType = (typeof SUBSCRIPTION_MODAL_TYPES)[number];

/**
 * How long a modal-event lease (modalClaimedAt) is considered valid before it
 * can be re-claimed. A client claims an event to render it and acknowledges it
 * once shown; if it never acknowledges (tab crash, network timeout, hard
 * reload during a Razorpay redirect), the lease expires after this window and
 * the event is offered again. Long enough that a normally-open modal is never
 * stolen by another visible tab, short enough that a genuine crash recovers
 * quickly on the next visit.
 */
export const MODAL_CLAIM_LEASE_MS = 3 * 60 * 1000; // 3 minutes

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
  /** Optional future-only UI experience attached to completed events. */
  modalType: SubscriptionModalType | null;
  /**
   * Lease timestamp — set when a client claims (leases) the modal event to
   * render it. This is NOT a permanent consume: if the client crashes or times
   * out before acknowledging, the lease expires (see MODAL_CLAIM_LEASE_MS) and
   * the event becomes claimable again so it is never silently lost.
   */
  modalClaimedAt: Date | null;
  /**
   * Permanent consume marker — set only after the client confirms the modal was
   * actually shown (acknowledged). Once set, the event can never be claimed
   * again, guaranteeing exactly-once display in the normal path.
   */
  modalAckedAt: Date | null;
  /** Arbitrary contextual data (e.g. provider payload, diff details). */
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
  modalType: {
    type: String,
    enum: [...SUBSCRIPTION_MODAL_TYPES, null],
    default: null,
  },
  modalClaimedAt: {
    type: Date,
    default: null,
  },
  modalAckedAt: {
    type: Date,
    default: null,
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
// Atomically lease the oldest un-acknowledged future modal event for one
// account. modalAckedAt gates permanent consume; modalClaimedAt is the
// (expirable) lease used to recover crashed/timed-out claims.
SubscriptionEventSchema.index({
  userId: 1,
  modalType: 1,
  modalAckedAt: 1,
  modalClaimedAt: 1,
  timestamp: 1,
});
// Look up all events for a specific subscription document.
SubscriptionEventSchema.index({ subscriptionId: 1 });

// ---------------------------------------------------------------------------
// Model (safe re-use in hot-reload environments)
// ---------------------------------------------------------------------------

export const SubscriptionEventModel =
  (mongoose.models.SubscriptionEvent as mongoose.Model<ISubscriptionEvent>) ||
  mongoose.model<ISubscriptionEvent>(
    'SubscriptionEvent',
    SubscriptionEventSchema
  );
