/**
 * BackpressureMonitor — Graceful internal degradation signal (smart-polling-system Req 12).
 *
 * The monitor samples two internal stress signals on a fixed cadence and exposes
 * a single hysteresis-stabilized state that the {@link TieredJobScheduler}
 * consults to decide whether to shed the lowest-priority (Tier 4 first) work:
 *
 *  1. **Queue depth** — the count of waiting jobs in the metrics BullMQ queue
 *     (`getWaitingCount`). A deep backlog signals the system cannot keep up.
 *  2. **Redis command latency** — round-trip time of a `PING`. A slow or
 *     unreachable Redis is the other primary source of internal backpressure.
 *
 * This module is an enhancement layer that plugs into the existing flow — it
 * never duplicates the foundation. The scheduler owns the actual shed/resume
 * ordering and the durable deferred queue (Req 12.1, 12.2, 12.4, 12.5); this
 * monitor only answers "are we under pressure right now?".
 *
 * Design highlights:
 *  - Thresholds and the sampling interval are loaded from
 *    `config.smartPolling.backpressure` and are never hardcoded (Req 12.3, 12.6).
 *  - The transition is a **pure** static function {@link BackpressureMonitor.nextState}
 *    so it is fully property-testable: it implements hysteresis (clear < trigger,
 *    Req 12.7) and treats an unmeasurable (null) Redis latency as active
 *    (Req 12.8).
 *  - {@link start}/{@link stop} drive an interval timer that samples and folds
 *    each sample through `nextState`; {@link getState} returns the latest state.
 *
 * smart-polling-system Requirements: 12.1, 12.2, 12.3, 12.4, 12.6, 12.7, 12.8
 */

import type { Queue } from 'bullmq';
import type Redis from 'ioredis';
import { logger } from '../config/logger';
import { rateLimitConfig, type RateLimitConfig } from '../config/rateLimitConfig';
import { getSharedRedisConnection } from '../lib/redis';

/**
 * The two-valued backpressure state consulted by the scheduler.
 *  - `'active'`  — the system is under internal stress; shed Tier 4 work first.
 *  - `'cleared'` — pressure has subsided below the clear thresholds; resume.
 */
export type BackpressureState = 'active' | 'cleared';

/**
 * A single backpressure observation.
 *  - `queueDepth` — count of waiting jobs in the metrics queue.
 *  - `redisLatencyMs` — measured Redis command (PING) round-trip in ms, or
 *    `null` when Redis is unreachable / latency could not be measured (Req 12.8).
 */
export interface BackpressureSample {
  queueDepth: number;
  redisLatencyMs: number | null;
}

export class BackpressureMonitor {
  private readonly metricsQueue: Queue;
  private readonly config: RateLimitConfig;
  private redis: Redis | null;

  /** Latest stabilized state. Starts `'cleared'` (assume healthy until proven otherwise). */
  private state: BackpressureState = 'cleared';

  /** Active sampling timer, or null when stopped. */
  private timer: ReturnType<typeof setInterval> | null = null;

  /**
   * @param metricsQueue The BullMQ queue whose waiting depth is sampled (Req 12.6).
   * @param redis Redis connection used to measure command latency (Req 12.6, 12.8).
   *   Defaults to the shared worker connection.
   * @param config Rate-limit config supplying thresholds + sampling interval
   *   (Req 12.3, 12.6). Defaults to the singleton config.
   */
  constructor(
    metricsQueue: Queue,
    redis: Redis = getSharedRedisConnection(),
    config: RateLimitConfig = rateLimitConfig
  ) {
    this.metricsQueue = metricsQueue;
    this.redis = redis;
    this.config = config;
  }

  /**
   * Begin sampling queue depth + Redis command latency every
   * `config.smartPolling.backpressure.evaluationIntervalMs` (Req 12.6).
   *
   * Each tick takes a sample and folds it through the pure {@link nextState} to
   * update the stabilized state. Calling `start` when already running is a no-op.
   */
  start(): void {
    if (this.timer !== null) {
      return;
    }

    const intervalMs = this.config.smartPolling.backpressure.evaluationIntervalMs;

    logger.info('[BackpressureMonitor] Starting backpressure sampling', {
      component: 'BackpressureMonitor',
      evaluationIntervalMs: intervalMs,
    });

    this.timer = setInterval(() => {
      // The async evaluation is fire-and-forget; any error is handled inside.
      void this.evaluate();
    }, intervalMs);

    // Do not keep the event loop alive solely for sampling.
    if (typeof this.timer.unref === 'function') {
      this.timer.unref();
    }
  }

  /** Stop sampling and release the interval timer (Req 12.6). Idempotent. */
  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
      logger.info('[BackpressureMonitor] Stopped backpressure sampling', {
        component: 'BackpressureMonitor',
      });
    }
  }

  /** The latest stabilized backpressure state, consulted by the scheduler. */
  getState(): BackpressureState {
    return this.state;
  }

  /**
   * Take one sample and fold it through {@link nextState}, updating the state.
   * Exposed for testing and for an integration that wants to drive sampling
   * manually. Never throws — a sampling failure degrades to an unmeasurable
   * (null-latency) sample, which the transition treats as active (Req 12.8).
   */
  async evaluate(): Promise<BackpressureState> {
    const sample = await this.sample();
    const prev = this.state;
    const next = BackpressureMonitor.nextState(prev, sample, this.config);

    if (next !== prev) {
      logger.warn('[BackpressureMonitor] Backpressure state transition', {
        component: 'BackpressureMonitor',
        from: prev,
        to: next,
        queueDepth: sample.queueDepth,
        redisLatencyMs: sample.redisLatencyMs,
      });
    }

    this.state = next;
    return next;
  }

  /**
   * Collect one {@link BackpressureSample}: the metrics queue waiting depth and
   * the Redis `PING` round-trip latency (Req 12.6).
   *
   * On failure the corresponding signal is reported pessimistically:
   *  - A Redis PING failure / timeout yields `redisLatencyMs: null` so the
   *    transition treats Redis as unreachable and the state as active (Req 12.8).
   *  - A queue-depth read failure yields a depth of 0 (the latency signal still
   *    governs); we never throw out of the sampler.
   */
  private async sample(): Promise<BackpressureSample> {
    const [queueDepth, redisLatencyMs] = await Promise.all([
      this.sampleQueueDepth(),
      this.sampleRedisLatency(),
    ]);
    return { queueDepth, redisLatencyMs };
  }

  /** Sample the count of waiting jobs in the metrics queue. */
  private async sampleQueueDepth(): Promise<number> {
    try {
      return await this.metricsQueue.getWaitingCount();
    } catch (error) {
      logger.warn('[BackpressureMonitor] Failed to read queue depth — treating depth as 0', {
        component: 'BackpressureMonitor',
        error: (error as Error).message,
      });
      return 0;
    }
  }

  /**
   * Measure Redis command latency via a `PING`, returning the round-trip in ms,
   * or `null` when Redis is unreachable / the command fails (Req 12.8).
   */
  private async sampleRedisLatency(): Promise<number | null> {
    const redis = this.getRedis();
    if (!redis) {
      return null;
    }
    const startedAt = Date.now();
    try {
      await redis.ping();
      return Date.now() - startedAt;
    } catch (error) {
      logger.warn('[BackpressureMonitor] Redis PING failed — treating backpressure as active', {
        component: 'BackpressureMonitor',
        error: (error as Error).message,
      });
      return null;
    }
  }

  /** Lazily (re)resolve the shared Redis connection; null when unavailable. */
  private getRedis(): Redis | null {
    if (this.redis) {
      return this.redis;
    }
    try {
      this.redis = getSharedRedisConnection() ?? null;
    } catch {
      this.redis = null;
    }
    return this.redis;
  }

  /**
   * Pure hysteresis transition (smart-polling-system Req 12.1–12.4, 12.7, 12.8).
   *
   * Given the previous state, a fresh sample, and the config thresholds, decide
   * the next state. By config invariant `clearQueueDepth < triggerQueueDepth`
   * and `clearRedisLatencyMs < triggerRedisLatencyMs` (Req 12.7), so the band
   * between the clear and trigger thresholds is where the state is *retained* —
   * this is what prevents oscillation.
   *
   * Order of evaluation:
   *  1. Unmeasurable (null/undefined/NaN) Redis latency ⇒ `'active'` — Redis is
   *     unreachable, so treat the system as under pressure (Req 12.8).
   *  2. `queueDepth > triggerQueueDepth` OR `latency > triggerRedisLatencyMs`
   *     ⇒ `'active'` (Req 12.1, 12.2, 12.3).
   *  3. `queueDepth < clearQueueDepth` AND `latency < clearRedisLatencyMs`
   *     ⇒ `'cleared'` (Req 12.4) — both signals must be calm to resume.
   *  4. Otherwise ⇒ retain `prev` (within the hysteresis band, Req 12.7).
   *
   * @param prev The current backpressure state.
   * @param sample The fresh observation.
   * @param config The rate-limit config supplying the thresholds.
   * @returns The next backpressure state.
   */
  static nextState(
    prev: BackpressureState,
    sample: BackpressureSample,
    config: RateLimitConfig
  ): BackpressureState {
    const { triggerQueueDepth, triggerRedisLatencyMs, clearQueueDepth, clearRedisLatencyMs } =
      config.smartPolling.backpressure;

    const { queueDepth, redisLatencyMs } = sample;

    // Req 12.8 — Redis latency cannot be measured ⇒ treat as active.
    if (redisLatencyMs === null || redisLatencyMs === undefined || Number.isNaN(redisLatencyMs)) {
      return 'active';
    }

    // Req 12.1, 12.2, 12.3 — either signal above its trigger ⇒ active.
    if (queueDepth > triggerQueueDepth || redisLatencyMs > triggerRedisLatencyMs) {
      return 'active';
    }

    // Req 12.4 — both signals below their clear thresholds ⇒ cleared.
    if (queueDepth < clearQueueDepth && redisLatencyMs < clearRedisLatencyMs) {
      return 'cleared';
    }

    // Req 12.7 — within the hysteresis band ⇒ retain previous state (no oscillation).
    return prev;
  }
}

export default BackpressureMonitor;
