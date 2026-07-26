/**
 * AutomationAuditRecord — Durable Audit Trail for Automated Actions
 *
 * Persists exactly one record per automated comment-reply / DM-reply action
 * (success or failure) so actions taken on a user's behalf can be reviewed
 * after the fact for debugging and compliance.
 *
 * Schema follows the existing Mongoose model conventions (see
 * `MetaUsageTracker`, `AutomationRule`). Retention is enforced by a TTL index
 * on `occurredAt` using `config.smartPolling.audit.retentionSeconds`
 * (smart-polling-system Req 11.6).
 *
 * Requirements covered: 11.3, 11.6
 */

import mongoose, { Document, Schema, Model } from 'mongoose';
import { rateLimitConfig } from '../../config/rateLimitConfig';

/**
 * A persisted record of a single automated action capturing which rule matched,
 * the triggering input, what was sent, and the outcome.
 */
export interface IAutomationAuditRecord extends Document {
  /** The Instagram/target account the action was taken on (indexed). */
  targetAccountId: string;
  /** Id of the automation rule that matched and triggered the action. */
  ruleId: string;
  /** Human-readable name of the matched rule, when available. */
  ruleName?: string;
  /** Which automated action was attempted. */
  actionType: 'comment_reply' | 'dm_reply';
  /** The input that triggered the action (e.g. the comment/DM payload). */
  triggeringInput: Record<string, any>;
  /** The content that was sent (omitted on failure-before-send). */
  contentSent?: string;
  /** Whether the action succeeded or failed. */
  outcome: 'success' | 'failure';
  /** Failure detail, present only when `outcome === 'failure'`. */
  failureReason?: string;
  /** UTC timestamp at second precision the action occurred (Req 11.3). */
  occurredAt: Date;
  /** Insertion timestamp. */
  createdAt: Date;
}

const AutomationAuditRecordSchema = new Schema<IAutomationAuditRecord>({
  targetAccountId: { type: String, required: true, index: true },
  ruleId: { type: String, required: true },
  ruleName: { type: String },
  actionType: { type: String, enum: ['comment_reply', 'dm_reply'], required: true },
  triggeringInput: { type: Schema.Types.Mixed, required: true },
  contentSent: { type: String },
  outcome: { type: String, enum: ['success', 'failure'], required: true },
  failureReason: { type: String },
  occurredAt: { type: Date, required: true },
  createdAt: { type: Date, default: Date.now },
});

// Retention TTL index (Req 11.6): documents expire `retentionSeconds` after
// `occurredAt`, with the retention period sourced from the Rate_Limit_Config.
AutomationAuditRecordSchema.index(
  { occurredAt: 1 },
  { expireAfterSeconds: rateLimitConfig.smartPolling.audit.retentionSeconds }
);

export const AutomationAuditRecordModel: Model<IAutomationAuditRecord> =
  (mongoose.models.AutomationAuditRecord as Model<IAutomationAuditRecord>) ||
  mongoose.model<IAutomationAuditRecord>(
    'AutomationAuditRecord',
    AutomationAuditRecordSchema,
    'automationAuditRecords'
  );

export default AutomationAuditRecordModel;
