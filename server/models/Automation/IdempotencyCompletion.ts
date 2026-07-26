/**
 * IdempotencyCompletion — Durable Completion Record for Idempotent Side Effects
 *
 * Backs {@link CompletionStore} for {@link IdempotencyGuard}. A single document
 * per idempotency `key` is the durable source of truth that a retryable side
 * effect (comment-reply / DM-reply) has already been performed, surviving Redis
 * evictions, worker restarts, and job retries (smart-polling-system Req 10.3,
 * 10.4).
 *
 * Schema follows the existing Mongoose model conventions (see
 * `AutomationAuditRecord`). The unique index on `key` makes
 * `record(key)` an idempotent upsert and lets `has(key)` be a fast lookup.
 *
 * Requirements covered: 10.3, 10.4
 */

import mongoose, { Document, Schema, Model } from 'mongoose';

/** A persisted marker that the side effect for a given idempotency key is done. */
export interface IIdempotencyCompletion extends Document {
  /** Deterministic idempotency key (see IdempotencyGuard.buildKey). Unique. */
  key: string;
  /** Insertion timestamp. */
  createdAt: Date;
}

const IdempotencyCompletionSchema = new Schema<IIdempotencyCompletion>({
  key: { type: String, required: true, unique: true, index: true },
  createdAt: { type: Date, default: Date.now },
});

export const IdempotencyCompletionModel: Model<IIdempotencyCompletion> =
  (mongoose.models.IdempotencyCompletion as Model<IIdempotencyCompletion>) ||
  mongoose.model<IIdempotencyCompletion>(
    'IdempotencyCompletion',
    IdempotencyCompletionSchema,
    'idempotencyCompletions'
  );

/**
 * MongoDB-backed {@link CompletionStore} for the IdempotencyGuard.
 *
 * - `has(key)` resolves true when a durable completion record exists.
 * - `record(key)` upserts the record so it is idempotent under retries; the
 *   unique index guarantees at most one document per key even under concurrency.
 */
export class MongoCompletionStore {
  async has(key: string): Promise<boolean> {
    const existing = await IdempotencyCompletionModel.exists({ key });
    return existing != null;
  }

  async record(key: string): Promise<void> {
    await IdempotencyCompletionModel.updateOne(
      { key },
      { $setOnInsert: { key, createdAt: new Date() } },
      { upsert: true }
    );
  }
}

export default IdempotencyCompletionModel;
