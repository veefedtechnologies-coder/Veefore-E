/**
 * Veefore Subscription — AddOn MongoDB model.
 *
 * Tracks purchasable add-ons attached to a user's account, both recurring
 * (e.g. extra_workspace) and one-time credit packs (e.g. ai_credits_500).
 * A null `currentPeriodEnd` indicates a one-time, non-expiring add-on.
 *
 * Satisfies Requirements: 2.3, 8.1
 */

import mongoose, { Schema, type Document } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

import { type AddOnType } from '../../../../config/plan-config';

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface IAddOn extends Document {
  /** UUID, auto-generated via uuidv4. */
  addOnId: string;
  /** The user who owns this add-on. */
  userId: string;
  /** Which add-on type this record represents (from plan-config AddOnType). */
  type: AddOnType;
  /** Quantity purchased — minimum 1. */
  quantity: number;
  /** Lifecycle state of the add-on. Defaults to 'active'. */
  status: 'active' | 'cancelled';
  /** Razorpay subscription ID (sub_xxx) for recurring add-ons; null for one-time packs. */
  razorpaySubscriptionId: string | null;
  /**
   * When this add-on's current billing period ends.
   * null for one-time purchases (they never expire).
   */
  currentPeriodEnd: Date | null;
  /** Managed by Mongoose `timestamps: true`. */
  createdAt: Date;
  updatedAt: Date;
}

// ---------------------------------------------------------------------------
// All valid AddOnType values — used for the enum constraint on the schema.
// Derived from the union type to keep it in sync with plan-config.
// ---------------------------------------------------------------------------

const ADDON_TYPES: AddOnType[] = [
  'extra_workspace',
  'extra_team_member',
  'extra_profiles',
  'ai_credits_500',
  'ai_credits_2000',
  'ai_credits_5000',
  'ai_conversations_500',
  'keyword_conversations_1000',
  'follow_campaign_500',
  'white_label_reports',
  'api_access',
  'priority_support',
];

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const AddOnSchema = new Schema<IAddOn>(
  {
    addOnId: {
      type: String,
      required: true,
      unique: true,
      default: () => uuidv4(),
    },
    userId: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      enum: ADDON_TYPES,
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
    },
    status: {
      type: String,
      enum: ['active', 'cancelled'],
      default: 'active',
    },
    razorpaySubscriptionId: {
      type: String,
      default: null,
    },
    currentPeriodEnd: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

// Compound index to efficiently query active add-ons for a user.
AddOnSchema.index({ userId: 1, status: 1 });

// ---------------------------------------------------------------------------
// Model (safe re-use in hot-reload environments)
// ---------------------------------------------------------------------------

export const AddOnModel =
  (mongoose.models.AddOn as mongoose.Model<IAddOn>) ||
  mongoose.model<IAddOn>('AddOn', AddOnSchema);
