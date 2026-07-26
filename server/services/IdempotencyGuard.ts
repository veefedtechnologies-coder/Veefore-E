/**
 * IdempotencyGuard — Duplicate-Side-Effect Protection for Retryable Jobs
 *
 * Ensures a retryable job that produces an external side effect (e.g. a
 * comment-reply or DM-reply) performs that side effect at most once, even when
 * the job is retried or two workers execute the same job concurrently.
 *
 * Two storage layers cooperate:
 *
 *  1. An **atomic in-flight reservation** in Redis (`SET key value NX PX ttl`).
 *     Only one concurrent caller can win the reservation, so two simultaneous
 *     executions of the same key can never both proceed (Req 10.2). The
 *     reservation carries a TTL so a crashed holder does not block a later
 *     legitimate retry forever.
 *
 *  2. A **durable completion record** (e.g. MongoDB), written *before* the job
 *     is marked complete (Req 10.4). This record is the source of truth for
 *     "the side effect already happened" and survives Redis evictions, worker
 *     restarts, and retries (Req 10.3).
 *
 * Failure handling (Req 10.5): if either store cannot be read or written, the
 * guard returns `unavailable`. The caller MUST then leave the side effect
 * un-performed, surface an error, and preserve the job for a safe later retry.
 *
 * Requirements covered: 10.1, 10.2, 10.3, 10.4, 10.5
 */

import type Redis from 'ioredis';
import { logger } from '../config/logger';
import { stableHash } from '../utils/deterministicJitter';

/**
 * Outcome of an idempotency reservation attempt.
 *
 * - `reserved`           — the caller may perform the side effect.
 * - `already_completed`  — the side effect is already done (or another live
 *                          execution holds the reservation); the caller MUST
 *                          skip the side effect and mark the job complete.
 * - `unavailable`        — the idempotency store could not be read/written; the
 *                          caller MUST NOT perform the side effect and SHOULD
 *                          preserve the job for retry (Req 10.5).
 */
export interface IdempotencyResult {
  status: 'reserved' | 'already_completed' | 'unavailable';
}

/**
 * The components that uniquely identify a single intended side effect.
 * `sourceId` is the comment id (comment-reply) or thread id (DM-reply).
 */
export interface IdempotencyKeyParts {
  accountId: string;
  sourceId: string;
  ruleId: string;
}

/**
 * Durable completion store abstraction. The default production binding is a
 * MongoDB-backed implementation, but any durable store can be injected (which
 * also makes the guard easy to unit/property test).
 */
export interface CompletionStore {
  /** True if a durable completion record exists for `key`. */
  has(key: string): Promise<boolean>;
  /** Durably persist the completion record for `key` (idempotent upsert). */
  record(key: string): Promise<void>;
}

/** Tunable knobs for the guard. */
export interface IdempotencyGuardOptions {
  /**
   * Redis key prefix for the in-flight reservation lock.
   * Defaults to `idem:lock:`.
   */
  reservationPrefix?: string;
  /**
   * TTL (ms) for the in-flight reservation lock. Bounds how long a crashed
   * holder can block a legitimate retry. Defaults to 5 minutes.
   */
  reservationTtlMs?: number;
}

/** Default in-flight reservation TTL: 5 minutes. */
const DEFAULT_RESERVATION_TTL_MS = 5 * 60 * 1000;
/** Default Redis key prefix for reservation locks. */
const DEFAULT_RESERVATION_PREFIX = 'idem:lock:';
/** Sentinel value stored in the reservation lock key. */
const RESERVATION_VALUE = '1';

export class IdempotencyGuard {
  private readonly redis: Redis;
  private readonly completionStore: CompletionStore;
  private readonly reservationPrefix: string;
  private readonly reservationTtlMs: number;

  /**
   * @param redis           Redis connection used for the atomic reservation.
   * @param completionStore Durable store recording completed side effects.
   * @param options         Optional reservation prefix / TTL overrides.
   */
  constructor(redis: Redis, completionStore: CompletionStore, options?: IdempotencyGuardOptions) {
    this.redis = redis;
    this.completionStore = completionStore;
    this.reservationPrefix = options?.reservationPrefix ?? DEFAULT_RESERVATION_PREFIX;
    this.reservationTtlMs = options?.reservationTtlMs ?? DEFAULT_RESERVATION_TTL_MS;
  }

  /**
   * Build a deterministic idempotency key for a reply side effect (Req 10.1).
   *
   * The key is a pure function of `(accountId, sourceId, ruleId)`, so every
   * retry of the same intended action produces an identical key. Each part is
   * URI-encoded before joining so that delimiter characters in any part cannot
   * collide two distinct tuples onto the same canonical string. A stable,
   * non-cryptographic hash (reused from `deterministicJitter`) then yields a
   * compact, fixed-shape key; two hashes over differently-salted inputs are
   * combined into a 64-bit hex string to keep the collision probability
   * negligible.
   *
   * @example
   * IdempotencyGuard.buildKey({ accountId: 'a1', sourceId: 'c9', ruleId: 'r3' })
   * // => stable string, identical across every retry of this action
   */
  static buildKey(parts: IdempotencyKeyParts): string {
    const canonical = [parts.accountId, parts.sourceId, parts.ruleId]
      .map((p) => encodeURIComponent(p))
      .join(':');

    // Combine two 32-bit hashes over differently-salted inputs into a 64-bit
    // hex string. Deterministic and dependency-free; collision risk negligible.
    const hi = stableHash(canonical);
    const lo = stableHash(`${canonical}|idem-salt`);
    const hex = (hi >>> 0).toString(16).padStart(8, '0') + (lo >>> 0).toString(16).padStart(8, '0');

    return `idem:${hex}`;
  }

  /**
   * Atomically reserve `key` and check durable completion before the caller
   * performs its side effect (Req 10.2, 10.3, 10.5).
   *
   * Order of operations:
   *  1. Read the durable completion record. If present → `already_completed`.
   *  2. Atomically acquire the in-flight reservation via `SET NX PX`. If won →
   *     `reserved` (the caller may proceed).
   *  3. If the reservation was NOT won, another execution is either still
   *     in flight or just completed; re-read the durable record and, either
   *     way, return `already_completed` so the side effect is not duplicated.
   *
   * Any read/write error against Redis or the completion store yields
   * `unavailable` so the caller can safely preserve and retry the job
   * (Req 10.5) — the side effect is never performed on an unknown state.
   */
  async reserve(key: string): Promise<IdempotencyResult> {
    try {
      // (1) Durable completion is the source of truth — check it first.
      if (await this.completionStore.has(key)) {
        return { status: 'already_completed' };
      }

      // (2) Atomic in-flight reservation. Only one concurrent caller can win.
      const lockKey = this.reservationKey(key);
      const setResult = await this.redis.set(
        lockKey,
        RESERVATION_VALUE,
        'PX',
        this.reservationTtlMs,
        'NX'
      );

      if (setResult === 'OK') {
        return { status: 'reserved' };
      }

      // (3) Lost the race: another execution either holds the live reservation
      // or has already completed. The safe action in both cases is to skip so
      // the side effect is performed at most once (Req 10.2, 10.3).
      return { status: 'already_completed' };
    } catch (error) {
      // Req 10.5: store unreadable/unwritable → leave side effect un-performed,
      // surface an error, and let the caller preserve the job for retry.
      logger.error('[IdempotencyGuard] reserve failed; treating as unavailable', error, {
        component: 'IdempotencyGuard',
        key,
      });
      return { status: 'unavailable' };
    }
  }

  /**
   * Durably record the completion of a side effect BEFORE the job is marked
   * complete (Req 10.4), so the record survives retries and restarts.
   *
   * Throws if the durable write fails so the caller can surface the error and
   * keep the job retryable rather than silently marking it done.
   */
  async recordCompletion(key: string): Promise<void> {
    await this.completionStore.record(key);
  }

  /** Compose the Redis reservation-lock key for an idempotency key. */
  private reservationKey(key: string): string {
    return `${this.reservationPrefix}${key}`;
  }
}
