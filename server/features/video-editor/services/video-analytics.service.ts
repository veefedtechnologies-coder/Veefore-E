/**
 * Video AI-usage analytics (task 22.2, Req 22.5).
 *
 * Extends the existing admin AI-usage analytics with a VIDEO-specific rollup.
 * The existing `veegpt-analytics.ts` rolls up the VeeGPT usage ledger; this
 * module reuses the SAME durable collections the rest of the platform already
 * writes — it invents no new accounting system (mirroring the metering rule):
 *
 *   - Generation counts come from the existing `AIUsageEvent` collection
 *     (`server/services/aiUsageTracker.ts`), filtered to the `video.generation`
 *     usage feature — every real generative video provider call is recorded
 *     there at the single AIServiceManager chokepoint.
 *   - Provider spend in credits comes from the authoritative `AICreditTransaction`
 *     ledger, filtered to the `videoGenerativeEdit` credit feature and settled
 *     rows (the net charge that actually landed on a user's balance).
 *   - Edit counts and the success / retry / quality-control failure rates come
 *     from the video-specific `VideoEditJob` / `VideoEditOperation` collections.
 *
 * The rate arithmetic is a pure, IO-free function (`computeVideoJobRates`) so it
 * can be unit-tested without a database, exactly per Req 22.5's definitions:
 *   - success rate  = completed / all terminated jobs (COMPLETED+FAILED+CANCELLED)
 *   - retry rate    = jobs that needed ≥1 retry (attempt>1) / all jobs
 *   - QC-failure rate = jobs that failed QC / all jobs that reached QC
 *
 * This is analytics, never enforcement — it is only ever read by an authenticated
 * admin. Every query is defensive: a failure in one breakdown yields zeros rather
 * than throwing, so a partial data problem never blanks the whole dashboard.
 */

import { logger as defaultLogger } from '../../../config/logger';
import { AIUsageEvent } from '../../../services/aiUsageTracker';
import AICreditTransactionModel from '../../../features/subscription/db/models/AICreditTransactionModel';
import { VideoEditJobModel } from '../../../models/VideoEditor/VideoEditJob';
import { VideoEditOperationModel } from '../../../models/VideoEditor/VideoEditOperation';
import { VIDEO_GENERATION_USAGE_FEATURE, VIDEO_GENERATIVE_CREDIT_FEATURE } from './generative-metering.service';

/**
 * The error code recorded on a `VideoEditJob` when the bounded QC repair loop
 * is exhausted and the version is reverted (see `quality-controller.service.ts`,
 * `RunRepairLoopResult.errorCode`). A job carrying this code is one that reached
 * quality control and failed it (Req 22.5).
 */
export const QC_FAILURE_ERROR_CODE = 'QUALITY_CONTROL_FAILED';

/** The QC pipeline stage name (see `job-state.logic.ts`, PIPELINE_STAGES). */
const QC_STAGE = 'QUALITY_CHECK';

// ---------------------------------------------------------------------------
// Time window
// ---------------------------------------------------------------------------

/** A half-open analytics window `[from, to)` (matches `veegpt-analytics.ts`). */
export interface VideoAnalyticsWindow {
  /** Inclusive start. */
  from: Date;
  /** Exclusive end. */
  to: Date;
}

/** A `createdAt` match clause for the window. */
function windowMatch(win: VideoAnalyticsWindow): Record<string, unknown> {
  return { createdAt: { $gte: win.from, $lt: win.to } };
}

// ---------------------------------------------------------------------------
// Pure rate arithmetic (Req 22.5) — unit-testable without a database
// ---------------------------------------------------------------------------

/** Raw video-job counters the rates are derived from. */
export interface VideoJobCounts {
  /** All jobs created in the window. */
  total: number;
  /** Jobs whose terminal state is COMPLETED. */
  completed: number;
  /** Jobs whose terminal state is FAILED. */
  failed: number;
  /** Jobs whose terminal state is CANCELLED. */
  cancelled: number;
  /** Jobs that required at least one retry (attempt > 1). */
  retried: number;
  /** Jobs that reached quality control (passed the QC stage OR failed QC). */
  reachedQc: number;
  /** Jobs that failed quality control. */
  qcFailed: number;
}

/** The three rates Req 22.5 defines, each a fraction in [0,1] (0 when undefined). */
export interface VideoJobRates {
  /** completed / (completed + failed + cancelled). */
  successRate: number;
  /** retried / total. */
  retryRate: number;
  /** qcFailed / reachedQc. */
  qcFailureRate: number;
}

/** Round a fraction to 3 dp; a zero/absent denominator yields 0 (never NaN). */
function rate(numerator: number, denominator: number): number {
  if (!denominator || denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 1000) / 1000;
}

/**
 * Compute the success / retry / QC-failure rates from raw job counts exactly per
 * Req 22.5. Pure and total: never throws, never performs IO, always returns a
 * fraction in [0,1] (0 for an undefined rate).
 */
export function computeVideoJobRates(counts: VideoJobCounts): VideoJobRates {
  const terminated = counts.completed + counts.failed + counts.cancelled;
  return {
    successRate: rate(counts.completed, terminated),
    retryRate: rate(counts.retried, counts.total),
    qcFailureRate: rate(counts.qcFailed, counts.reachedQc),
  };
}

// ---------------------------------------------------------------------------
// Aggregation result
// ---------------------------------------------------------------------------

/** The full video AI-usage rollup for the admin dashboard (Req 22.5). */
export interface VideoUsageAnalytics {
  window: { from: string; to: string };
  /** Completed deterministic edit operations in the window (Req 22.5 · edit counts). */
  editCount: number;
  /** Completed generative edit operations in the window (Req 22.5 · generation counts). */
  generativeEditCount: number;
  /** Real generative provider calls recorded on `AIUsageEvent` (`video.generation`). */
  providerGenerationCalls: number;
  /** Net provider spend in CREDITS (settled `videoGenerativeEdit` charges). */
  providerSpendCredits: number;
  /** Net provider spend in INR (settled `videoGenerativeEdit` provider cost). */
  providerSpendInr: number;
  /** The raw job counters the rates are derived from. */
  jobs: VideoJobCounts;
  /** Success / retry / QC-failure rates (Req 22.5). */
  successRate: number;
  retryRate: number;
  qcFailureRate: number;
}

// ---------------------------------------------------------------------------
// Individual breakdown queries (each defensive)
// ---------------------------------------------------------------------------

type Logger = Pick<typeof defaultLogger, 'info' | 'warn' | 'error' | 'debug'>;

/** Count completed edit operations of a given type in the window. */
async function countOperations(
  win: VideoAnalyticsWindow,
  type: 'deterministic' | 'generative',
  log: Logger,
): Promise<number> {
  try {
    return await VideoEditOperationModel.countDocuments({
      ...windowMatch(win),
      type,
      status: 'completed',
    });
  } catch (error) {
    log.warn?.('[VideoEditor][Analytics] Failed to count edit operations', {
      component: 'videoEditor.Analytics',
      type,
      err: error instanceof Error ? error.message : String(error),
    });
    return 0;
  }
}

/** Count real generative provider calls from the existing AIUsageEvent collection. */
async function countProviderGenerationCalls(
  win: VideoAnalyticsWindow,
  log: Logger,
): Promise<number> {
  try {
    return await AIUsageEvent.countDocuments({
      ...windowMatch(win),
      feature: VIDEO_GENERATION_USAGE_FEATURE,
    });
  } catch (error) {
    log.warn?.('[VideoEditor][Analytics] Failed to count provider generation calls', {
      component: 'videoEditor.Analytics',
      err: error instanceof Error ? error.message : String(error),
    });
    return 0;
  }
}

/** Sum settled generative provider spend (credits + INR) from the credit ledger. */
async function sumProviderSpend(
  win: VideoAnalyticsWindow,
  log: Logger,
): Promise<{ credits: number; inr: number }> {
  try {
    const rows = await AICreditTransactionModel.aggregate([
      {
        $match: {
          ...windowMatch(win),
          feature: VIDEO_GENERATIVE_CREDIT_FEATURE,
          // Only settled charges represent spend that actually landed on a
          // balance; pending/refunded rows are not real spend.
          status: 'settled',
        },
      },
      {
        $group: {
          _id: null,
          credits: { $sum: '$credits' },
          inr: { $sum: '$providerCostInr' },
        },
      },
    ]);
    const agg = rows[0] ?? { credits: 0, inr: 0 };
    return {
      credits: Math.round((agg.credits || 0) * 100) / 100,
      inr: Math.round((agg.inr || 0) * 1e6) / 1e6,
    };
  } catch (error) {
    log.warn?.('[VideoEditor][Analytics] Failed to sum provider spend', {
      component: 'videoEditor.Analytics',
      err: error instanceof Error ? error.message : String(error),
    });
    return { credits: 0, inr: 0 };
  }
}

/** Aggregate the raw video-job counters used to derive the rates (Req 22.5). */
async function aggregateJobCounts(
  win: VideoAnalyticsWindow,
  log: Logger,
): Promise<VideoJobCounts> {
  const empty: VideoJobCounts = {
    total: 0,
    completed: 0,
    failed: 0,
    cancelled: 0,
    retried: 0,
    reachedQc: 0,
    qcFailed: 0,
  };
  try {
    const rows = await VideoEditJobModel.aggregate([
      { $match: windowMatch(win) },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          completed: { $sum: { $cond: [{ $eq: ['$state', 'COMPLETED'] }, 1, 0] } },
          failed: { $sum: { $cond: [{ $eq: ['$state', 'FAILED'] }, 1, 0] } },
          cancelled: { $sum: { $cond: [{ $eq: ['$state', 'CANCELLED'] }, 1, 0] } },
          retried: { $sum: { $cond: [{ $gt: ['$attempt', 1] }, 1, 0] } },
          qcFailed: {
            $sum: { $cond: [{ $eq: ['$errorCode', QC_FAILURE_ERROR_CODE] }, 1, 0] },
          },
          // A job reached QC iff it passed the QC stage (recorded in
          // completedStages) OR it failed QC (carries the QC failure code).
          reachedQc: {
            $sum: {
              $cond: [
                {
                  $or: [
                    { $in: [QC_STAGE, { $ifNull: ['$completedStages', []] }] },
                    { $eq: ['$errorCode', QC_FAILURE_ERROR_CODE] },
                  ],
                },
                1,
                0,
              ],
            },
          },
        },
      },
    ]);
    const agg = rows[0];
    if (!agg) return empty;
    return {
      total: agg.total || 0,
      completed: agg.completed || 0,
      failed: agg.failed || 0,
      cancelled: agg.cancelled || 0,
      retried: agg.retried || 0,
      reachedQc: agg.reachedQc || 0,
      qcFailed: agg.qcFailed || 0,
    };
  } catch (error) {
    log.warn?.('[VideoEditor][Analytics] Failed to aggregate job counts', {
      component: 'videoEditor.Analytics',
      err: error instanceof Error ? error.message : String(error),
    });
    return empty;
  }
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Compute the full video AI-usage rollup for the admin dashboard (Req 22.5).
 * Every breakdown is queried defensively and the rates are computed by the pure
 * `computeVideoJobRates`, so the shape is always well-formed for any window.
 */
export async function videoUsageAnalytics(
  win: VideoAnalyticsWindow,
  deps: { logger?: Logger } = {},
): Promise<VideoUsageAnalytics> {
  const log = deps.logger ?? defaultLogger;

  const [editCount, generativeEditCount, providerGenerationCalls, spend, jobs] =
    await Promise.all([
      countOperations(win, 'deterministic', log),
      countOperations(win, 'generative', log),
      countProviderGenerationCalls(win, log),
      sumProviderSpend(win, log),
      aggregateJobCounts(win, log),
    ]);

  const rates = computeVideoJobRates(jobs);

  return {
    window: { from: win.from.toISOString(), to: win.to.toISOString() },
    editCount,
    generativeEditCount,
    providerGenerationCalls,
    providerSpendCredits: spend.credits,
    providerSpendInr: spend.inr,
    jobs,
    successRate: rates.successRate,
    retryRate: rates.retryRate,
    qcFailureRate: rates.qcFailureRate,
  };
}
