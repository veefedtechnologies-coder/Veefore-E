import mongoose from 'mongoose';

/**
 * Durable store for authentication audit events
 * (spec: production-security-hardening, Requirement 10).
 *
 * APPEND-ONLY (Requirement 10.4): the application only ever `create`s here — no
 * update or delete path exists in `server/lib/auth-audit.ts`. `strict: true` plus
 * the explicit field list means a caller cannot smuggle extra properties (such as
 * a token) into a document.
 *
 * NO CREDENTIAL MATERIAL (Requirement 10.3): there is deliberately no field capable
 * of holding a token, cookie, or password, and `detail` is redacted before it
 * reaches this model.
 */

export interface IAuthAuditEvent extends mongoose.Document {
  type: string;
  userId: string | null;
  clientIp: string | null;
  path: string | null;
  reason: string | null;
  detail: Record<string, unknown> | null;
  createdAt: Date;
}

const AuthAuditEventSchema = new mongoose.Schema<IAuthAuditEvent>(
  {
    type: { type: String, required: true, index: true },
    userId: { type: String, default: null, index: true },
    clientIp: { type: String, default: null },
    path: { type: String, default: null },
    reason: { type: String, default: null },
    // Free-form but pre-redacted; `Mixed` so varied shapes persist without a
    // migration. Never contains credential material.
    detail: { type: mongoose.Schema.Types.Mixed, default: null },
    createdAt: { type: Date, required: true, default: Date.now, index: true },
  },
  {
    // Reject unknown paths rather than silently storing them.
    strict: true,
    // `createdAt` is set explicitly by the writer; no `updatedAt` because records
    // are never modified.
    timestamps: false,
    collection: 'auth_audit_events',
    // Guard against a document-level `__v` bump implying mutability.
    versionKey: false,
  }
);

// Investigation queries are "recent events for a user" and "recent events of a
// type", so index both in descending time order.
AuthAuditEventSchema.index({ userId: 1, createdAt: -1 }, { background: true });
AuthAuditEventSchema.index({ type: 1, createdAt: -1 }, { background: true });

export const AuthAuditEventModel =
  (mongoose.models.AuthAuditEvent as mongoose.Model<IAuthAuditEvent>) ||
  mongoose.model<IAuthAuditEvent>('AuthAuditEvent', AuthAuditEventSchema);
