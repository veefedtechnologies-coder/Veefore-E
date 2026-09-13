/**
 * VGU audit ledger — the durable record of every AI operation (spec §50).
 *
 * Redis holds the fast counters; this holds the TRUTH. Every metered operation
 * writes exactly one event containing the ids, the plan, the model and its
 * pricing version, the real token counts, the estimated and actual VGU, and the
 * estimated and actual provider cost. Counters can be rebuilt from these events,
 * which is what makes the repair job in veegpt-repair.service.ts possible.
 *
 * IDEMPOTENCY IS ENFORCED BY THE DATABASE (spec §52)
 * `reservationId` carries a unique index, so a duplicate write — a retry, a
 * double reconciliation, an outbox replay — is rejected by Mongo rather than
 * relying on application code to remember. Writes upsert on that key, so the
 * second attempt is a no-op that leaves the same final state as the first.
 *
 * NEVER LOSE AN EVENT (spec §34)
 * If Mongo is unavailable the event is pushed to a Redis outbox list and drained
 * later. If Redis is ALSO unavailable, the full event is logged at error level as
 * the last-resort recovery path. An expensive AI call must never execute with no
 * auditable record anywhere.
 */

import mongoose, { Schema } from 'mongoose';
import { getRedisClient } from '../lib/redis';
import type { PlanId } from '../config/plan-config';
import type { ModelTier } from '../config/veegpt-vgu.config';
import logger from '../config/logger';

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------

export type LedgerStatus =
  | 'RECONCILED'
  | 'RELEASED'
  | 'FAILED'
  | 'EXPIRED'
  | 'UNMETERED';

/**
 * Deliberately a PLAIN interface, not `extends mongoose.Document`.
 *
 * The spec requires a field named `model`, which collides with `Document.model()`
 * and produces a TS2430 "incorrectly extends" error (the existing AIUsageEvent
 * model carries exactly that error for this reason). Mongoose types work fine
 * with a raw document shape, so this avoids the conflict instead of inheriting it.
 */
export interface IVeegptUsageEvent {
  requestId?: string;
  reservationId: string;
  userId: string;
  workspaceId?: string;
  subscriptionId?: string;
  billingPeriodId: string;
  plan: PlanId;
  provider?: string;
  model?: string;
  modelVersion?: string;
  modelTier: ModelTier;
  feature: string;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  cachedTokens: number;
  providerCalls: number;
  estimatedVGU: number;
  actualVGU: number;
  estimatedProviderCostUSD: number;
  actualProviderCostUSD: number;
  /** Pricing rows in force when this ran — makes historical cost reproducible. */
  pricingVersions: string[];
  /** True when the per-request ceiling clipped the charge. */
  capped: boolean;
  /** True when a model had no price row and the conservative fallback was used. */
  fallbackPricing: boolean;
  status: LedgerStatus;
  /** Free-form audit metadata. Never prompt content. */
  meta?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const VeegptUsageEventSchema = new Schema<IVeegptUsageEvent>(
  {
    requestId: { type: String },
    // Unique: this is what makes reconciliation idempotent at the data layer.
    reservationId: { type: String, required: true, unique: true },
    userId: { type: String, required: true },
    workspaceId: { type: String },
    subscriptionId: { type: String },
    billingPeriodId: { type: String, required: true },
    plan: { type: String, required: true },
    provider: { type: String },
    model: { type: String },
    modelVersion: { type: String },
    modelTier: { type: String, required: true },
    feature: { type: String, required: true },
    inputTokens: { type: Number, default: 0, min: 0 },
    outputTokens: { type: Number, default: 0, min: 0 },
    reasoningTokens: { type: Number, default: 0, min: 0 },
    cachedTokens: { type: Number, default: 0, min: 0 },
    providerCalls: { type: Number, default: 0, min: 0 },
    // min: 0 enforces the data-integrity rule that VGU is never negative (§51).
    estimatedVGU: { type: Number, default: 0, min: 0 },
    actualVGU: { type: Number, default: 0, min: 0 },
    estimatedProviderCostUSD: { type: Number, default: 0, min: 0 },
    actualProviderCostUSD: { type: Number, default: 0, min: 0 },
    pricingVersions: { type: [String], default: [] },
    capped: { type: Boolean, default: false },
    fallbackPricing: { type: Boolean, default: false },
    status: { type: String, required: true },
    meta: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

// Counter rebuilds and per-user reports scan by user + period.
VeegptUsageEventSchema.index({ userId: 1, billingPeriodId: 1 });
// Workspace pool rebuilds.
VeegptUsageEventSchema.index({ workspaceId: 1, billingPeriodId: 1 });
// Admin analytics by model / feature over time.
VeegptUsageEventSchema.index({ createdAt: -1 });
VeegptUsageEventSchema.index({ feature: 1, createdAt: -1 });
VeegptUsageEventSchema.index({ model: 1, createdAt: -1 });
// Idempotent replay of a caller-supplied request id.
VeegptUsageEventSchema.index({ requestId: 1 }, { sparse: true });

export const VeegptUsageEvent =
  (mongoose.models.VeegptUsageEvent as mongoose.Model<IVeegptUsageEvent>) ||
  mongoose.model<IVeegptUsageEvent>(
    'VeegptUsageEvent',
    VeegptUsageEventSchema
  );

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

/** The shape callers hand in; ids and numbers only, never prompt text. */
export interface LedgerEntry {
  requestId?: string;
  reservationId: string;
  userId: string;
  workspaceId?: string;
  subscriptionId?: string;
  billingPeriodId: string;
  plan: PlanId;
  provider?: string;
  model?: string;
  modelVersion?: string;
  modelTier: ModelTier;
  feature: string;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  cachedTokens: number;
  providerCalls: number;
  estimatedVGU: number;
  actualVGU: number;
  estimatedProviderCostUSD: number;
  actualProviderCostUSD: number;
  pricingVersions: string[];
  capped: boolean;
  fallbackPricing: boolean;
  status: LedgerStatus;
  meta?: Record<string, unknown>;
}

const OUTBOX_KEY = 'vgu:ledger:outbox';
/** Cap the outbox so a long Mongo outage cannot exhaust Redis memory. */
const OUTBOX_MAX = 50_000;

/** Clamp every numeric field so a bad caller can never write negative usage. */
function sanitize(entry: LedgerEntry): LedgerEntry {
  const nn = (n: number) => (Number.isFinite(n) && n > 0 ? n : 0);
  return {
    ...entry,
    inputTokens: nn(entry.inputTokens),
    outputTokens: nn(entry.outputTokens),
    reasoningTokens: nn(entry.reasoningTokens),
    cachedTokens: nn(entry.cachedTokens),
    providerCalls: nn(entry.providerCalls),
    estimatedVGU: nn(entry.estimatedVGU),
    actualVGU: nn(entry.actualVGU),
    estimatedProviderCostUSD: nn(entry.estimatedProviderCostUSD),
    actualProviderCostUSD: nn(entry.actualProviderCostUSD),
  };
}

/**
 * Persist one usage event. Never throws.
 *
 * Upserts on `reservationId`: writing the same event twice leaves exactly the
 * same document, so retries and outbox replays are safe.
 */
export async function writeLedgerEvent(entry: LedgerEntry): Promise<{
  ok: boolean;
  queued: boolean;
}> {
  const clean = sanitize(entry);
  try {
    await VeegptUsageEvent.updateOne(
      { reservationId: clean.reservationId },
      { $set: clean },
      { upsert: true }
    ).exec();
    return { ok: true, queued: false };
  } catch (err) {
    // A duplicate-key race means a concurrent writer already stored it — that is
    // success, not failure.
    if (isDuplicateKey(err)) return { ok: true, queued: false };

    const queued = await queueOutbox(clean);
    logger.error('vgu-ledger: Mongo write failed', {
      reservationId: clean.reservationId,
      userId: clean.userId,
      feature: clean.feature,
      actualVGU: clean.actualVGU,
      queued,
      err: err instanceof Error ? err.message : String(err),
      module: 'veegpt-ledger',
    });
    if (!queued) {
      // Both stores are unreachable. Emit the whole event so it can be recovered
      // from logs — an expensive AI call must never vanish without a record.
      logger.error('vgu-ledger: UNRECOVERABLE — event only exists in this log', {
        event: clean,
        module: 'veegpt-ledger',
      });
    }
    return { ok: false, queued };
  }
}

function isDuplicateKey(err: unknown): boolean {
  const code = (err as { code?: number })?.code;
  return code === 11000 || code === 11001;
}

/** Buffer an event in Redis for later replay. */
async function queueOutbox(entry: LedgerEntry): Promise<boolean> {
  try {
    const redis = getRedisClient();
    const len = await redis.rpush(OUTBOX_KEY, JSON.stringify(entry));
    if (len > OUTBOX_MAX) {
      // Drop the OLDEST rather than refusing new ones: recent events matter more
      // for current-period accounting, and the loss is logged.
      const dropped = await redis.lpop(OUTBOX_KEY);
      logger.error('vgu-ledger: outbox full — dropped the oldest event', {
        droppedReservationId: safeReservationId(dropped),
        outboxLen: len,
        module: 'veegpt-ledger',
      });
    }
    return true;
  } catch {
    return false;
  }
}

function safeReservationId(raw: string | null): string | undefined {
  if (!raw) return undefined;
  try {
    return (JSON.parse(raw) as LedgerEntry).reservationId;
  } catch {
    return undefined;
  }
}

/**
 * Replay buffered events into Mongo. Safe to call repeatedly and concurrently:
 * every write upserts on `reservationId`.
 *
 * An event that fails again is pushed back to the FRONT so ordering is preserved
 * and the drain stops immediately — hammering a dead database achieves nothing.
 */
export async function drainLedgerOutbox(
  max = 500
): Promise<{ drained: number; remaining: number; stoppedEarly: boolean }> {
  let drained = 0;
  let stoppedEarly = false;
  const redis = getRedisClient();

  for (let i = 0; i < max; i++) {
    let raw: string | null = null;
    try {
      raw = await redis.lpop(OUTBOX_KEY);
    } catch {
      stoppedEarly = true;
      break;
    }
    if (!raw) break;

    let entry: LedgerEntry;
    try {
      entry = JSON.parse(raw) as LedgerEntry;
    } catch {
      // Unparseable payload: drop it rather than blocking the queue forever.
      logger.error('vgu-ledger: discarded an unparseable outbox entry', {
        module: 'veegpt-ledger',
      });
      continue;
    }

    try {
      await VeegptUsageEvent.updateOne(
        { reservationId: entry.reservationId },
        { $set: sanitize(entry) },
        { upsert: true }
      ).exec();
      drained++;
    } catch (err) {
      if (isDuplicateKey(err)) {
        drained++;
        continue;
      }
      // Still failing — put it back at the front and stop.
      try {
        await redis.lpush(OUTBOX_KEY, raw);
      } catch {
        logger.error('vgu-ledger: lost an event while requeuing', {
          reservationId: entry.reservationId,
          event: entry,
          module: 'veegpt-ledger',
        });
      }
      stoppedEarly = true;
      break;
    }
  }

  let remaining = 0;
  try {
    remaining = await redis.llen(OUTBOX_KEY);
  } catch {
    /* unknown */
  }
  if (drained > 0) {
    logger.info('vgu-ledger: outbox drained', {
      drained,
      remaining,
      module: 'veegpt-ledger',
    });
  }
  return { drained, remaining, stoppedEarly };
}

/** Current outbox depth — surfaced to monitoring as a backlog signal. */
export async function ledgerOutboxDepth(): Promise<number> {
  try {
    return await getRedisClient().llen(OUTBOX_KEY);
  } catch {
    return -1;
  }
}

export const LEDGER_OUTBOX_KEY = OUTBOX_KEY;

// ---------------------------------------------------------------------------
// Reading (used by the repair job and admin analytics)
// ---------------------------------------------------------------------------

/** Total actual VGU recorded for a user in a billing period, from the ledger. */
export async function ledgerPeriodTotal(
  userId: string,
  billingPeriodId: string
): Promise<{ vgu: number; costUSD: number; events: number }> {
  const rows = await VeegptUsageEvent.aggregate<{
    _id: null;
    vgu: number;
    costUSD: number;
    events: number;
  }>([
    // UNMETERED events are measured but deliberately not charged, so they must
    // not appear in a counter rebuild or repair would invent usage.
    {
      $match: {
        userId,
        billingPeriodId,
        status: { $nin: ['RELEASED', 'UNMETERED'] },
      },
    },
    {
      $group: {
        _id: null,
        vgu: { $sum: '$actualVGU' },
        costUSD: { $sum: '$actualProviderCostUSD' },
        events: { $sum: 1 },
      },
    },
  ]).exec();
  const r = rows[0];
  return {
    vgu: r?.vgu ?? 0,
    costUSD: r?.costUSD ?? 0,
    events: r?.events ?? 0,
  };
}

/** Total actual VGU recorded for a workspace pool in a billing period. */
export async function ledgerPoolTotal(
  workspaceId: string,
  billingPeriodId: string
): Promise<number> {
  const rows = await VeegptUsageEvent.aggregate<{ _id: null; vgu: number }>([
    {
      $match: {
        workspaceId,
        billingPeriodId,
        status: { $nin: ['RELEASED', 'UNMETERED'] },
      },
    },
    { $group: { _id: null, vgu: { $sum: '$actualVGU' } } },
  ]).exec();
  return rows[0]?.vgu ?? 0;
}
