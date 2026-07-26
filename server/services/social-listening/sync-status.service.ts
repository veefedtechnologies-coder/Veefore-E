import { ListeningSyncStatusModel, SyncPhase } from '../../models/SocialListening/ListeningSyncStatus';

/**
 * Centralized helper for reading/writing the per-workspace live-sync status.
 *
 * Keeps the "Syncing…" indicator accurate and refresh-proof: the route writes
 * progress here as the long run advances, and the frontend polls
 * GET /sync-status to render phase + % + ETA until the data is genuinely ready.
 */

// Rough share of total wall-clock each phase takes. Fetch + AI analysis
// dominate; trend computation is fast. Used to map per-phase progress onto a
// single 0..100 bar and to estimate the remaining time.
const PHASE_WEIGHTS: Record<SyncPhase, { start: number; end: number }> = {
  idle: { start: 0, end: 0 },
  queued: { start: 0, end: 3 },
  fetching: { start: 3, end: 35 },
  analyzing: { start: 35, end: 90 },
  computing: { start: 90, end: 99 },
  completed: { start: 100, end: 100 },
  failed: { start: 0, end: 0 },
};

const PHASE_MESSAGE: Record<SyncPhase, string> = {
  idle: 'Idle',
  queued: 'Starting sync…',
  fetching: 'Scanning Reddit, YouTube, Hacker News & News for fresh mentions…',
  analyzing: 'Running AI sentiment, hook & pain-point analysis…',
  computing: 'Computing trends, clusters & audience intelligence…',
  completed: 'Sync complete — your intelligence is ready.',
  failed: 'Sync failed. Please try again.',
};

export interface SyncStatusView {
  active: boolean;
  phase: SyncPhase;
  mode: 'interactive' | 'background';
  batchMode: boolean;
  progress: number;
  message: string;
  postsFetched: number;
  commentsFetched: number;
  postsAnalyzed: number;
  postsToAnalyze: number;
  trendsComputed: number;
  startedAt: Date | null;
  estimatedCompletionAt: Date | null;
  estimatedSecondsRemaining: number | null;
  finishedAt: Date | null;
  error: string | null;
}

export class SyncStatusService {
  /**
   * Begin a fresh sync run for a workspace (resets counters).
   *
   * @returns the unique runId for this run. The caller passes it back into the
   *   pipeline; a background run periodically checks `isCurrentRun(runId)` and
   *   bails (cancelling its batch) the moment a newer run supersedes it — which
   *   is how a user-triggered interactive sync terminates an in-flight
   *   background batch to save cost.
   */
  static async begin(
    workspaceId: string,
    niche: string,
    mode: 'interactive' | 'background' = 'interactive'
  ): Promise<string> {
    const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    // Interactive runs feel quicker (~60s); background batches can take longer.
    const estimatedCompletionAt = new Date(Date.now() + (mode === 'background' ? 90 * 60_000 : 75_000));
    await ListeningSyncStatusModel.findOneAndUpdate(
      { workspaceId },
      {
        $set: {
          workspaceId,
          niche,
          mode,
          runId,
          phase: 'queued',
          progress: PHASE_WEIGHTS.queued.start,
          message: PHASE_MESSAGE.queued,
          postsFetched: 0,
          commentsFetched: 0,
          postsAnalyzed: 0,
          postsToAnalyze: 0,
          trendsComputed: 0,
          startedAt: new Date(),
          estimatedCompletionAt,
          finishedAt: null,
          batchMode: false,
          batchId: null,
          error: null,
        },
      },
      { upsert: true }
    );
    return runId;
  }

  /** Is this runId still the active run? False once a newer run supersedes it. */
  static async isCurrentRun(workspaceId: string, runId: string): Promise<boolean> {
    const doc = await ListeningSyncStatusModel.findOne({ workspaceId }).select('runId').lean();
    return !!doc && doc.runId === runId;
  }

  /** Read the provider batch id currently associated with the workspace (if any). */
  static async getBatchId(workspaceId: string): Promise<string | null> {
    const doc = await ListeningSyncStatusModel.findOne({ workspaceId }).select('batchId').lean();
    return doc?.batchId || null;
  }

  /** Record the provider batch id so it can be cancelled later. */
  static async setBatchId(workspaceId: string, batchId: string): Promise<void> {
    await ListeningSyncStatusModel.updateOne({ workspaceId }, { $set: { batchId, batchMode: true } });
  }

  /**
   * Update the status during a run.
   *
   * @param phaseProgress 0..1 fraction of the CURRENT phase that is complete;
   *   mapped onto the phase's slice of the overall bar so the % moves smoothly.
   */
  static async update(
    workspaceId: string,
    phase: SyncPhase,
    phaseProgress: number,
    extra: Partial<{
      message: string;
      postsFetched: number;
      commentsFetched: number;
      postsAnalyzed: number;
      postsToAnalyze: number;
      trendsComputed: number;
      batchMode: boolean;
      batchId: string;
    }> = {}
  ): Promise<void> {
    const band = PHASE_WEIGHTS[phase] || PHASE_WEIGHTS.queued;
    const frac = Math.max(0, Math.min(1, phaseProgress));
    const progress = Math.round(band.start + (band.end - band.start) * frac);

    // Refine the ETA from elapsed time + overall progress so it converges.
    let estimatedCompletionAt: Date | undefined;
    try {
      const current = await ListeningSyncStatusModel.findOne({ workspaceId }).select('startedAt').lean();
      const startedAt = current?.startedAt ? new Date(current.startedAt).getTime() : Date.now();
      const elapsed = Date.now() - startedAt;
      if (progress > 4 && progress < 100) {
        const totalEstimate = (elapsed / progress) * 100;
        const remaining = Math.max(2000, totalEstimate - elapsed);
        estimatedCompletionAt = new Date(Date.now() + remaining);
      }
    } catch {
      /* best-effort ETA */
    }

    const set: Record<string, any> = {
      phase,
      progress,
      message: extra.message || PHASE_MESSAGE[phase],
      ...extra,
    };
    if (estimatedCompletionAt) set.estimatedCompletionAt = estimatedCompletionAt;

    await ListeningSyncStatusModel.updateOne({ workspaceId }, { $set: set });
  }

  /** Mark the run successfully finished. */
  static async complete(workspaceId: string, trendsComputed: number): Promise<void> {
    await ListeningSyncStatusModel.updateOne(
      { workspaceId },
      {
        $set: {
          phase: 'completed',
          progress: 100,
          message: PHASE_MESSAGE.completed,
          trendsComputed,
          finishedAt: new Date(),
          estimatedCompletionAt: new Date(),
        },
      }
    );
  }

  /** Mark the run failed with an error message. */
  static async fail(workspaceId: string, error: string): Promise<void> {
    await ListeningSyncStatusModel.updateOne(
      { workspaceId },
      {
        $set: {
          phase: 'failed',
          message: PHASE_MESSAGE.failed,
          finishedAt: new Date(),
          error: error?.slice(0, 500) || 'Unknown error',
        },
      }
    );
  }

  /** Read the current status as a UI-friendly view (with ETA seconds). */
  static async get(workspaceId: string): Promise<SyncStatusView> {
    const doc = await ListeningSyncStatusModel.findOne({ workspaceId }).lean();
    if (!doc) {
      return {
        active: false, phase: 'idle', mode: 'interactive', batchMode: false, progress: 0, message: '',
        postsFetched: 0, commentsFetched: 0, postsAnalyzed: 0, postsToAnalyze: 0,
        trendsComputed: 0, startedAt: null, estimatedCompletionAt: null,
        estimatedSecondsRemaining: null, finishedAt: null, error: null,
      };
    }

    const active = doc.phase !== 'completed' && doc.phase !== 'failed' && doc.phase !== 'idle';

    // Heartbeat-based stale detection. Every progress write bumps `updatedAt`,
    // so a sync that is genuinely making progress (even a long 150-post run)
    // stays alive. We only fail it when there has been NO update for a while
    // (truly hung), or when an absolute hard cap is exceeded.
    //
    // Background syncs can legitimately run for up to 3 hours while waiting for
    // the OpenAI Batch API to complete — use a higher hard cap for background mode.
    const STALE_NO_UPDATE_MS = 4 * 60_000;                                     // no progress for 4 min ⇒ hung
    const HARD_CAP_MS = doc.mode === 'background'
      ? 4 * 60 * 60_000   // 4h absolute ceiling for background batch waits
      : 20 * 60_000;      // 20 min for interactive syncs
    const lastUpdate = doc.updatedAt ? new Date(doc.updatedAt).getTime() : (doc.startedAt ? new Date(doc.startedAt).getTime() : Date.now());
    const startedMs = doc.startedAt ? new Date(doc.startedAt).getTime() : Date.now();
    if (active && (Date.now() - lastUpdate > STALE_NO_UPDATE_MS || Date.now() - startedMs > HARD_CAP_MS)) {
      const reason = Date.now() - startedMs > HARD_CAP_MS ? 'Sync exceeded the maximum time.' : 'Sync stalled (no progress).';
      await SyncStatusService.fail(workspaceId, reason);
      return SyncStatusService.get(workspaceId);
    }

    let estimatedSecondsRemaining: number | null = null;
    if (active && doc.estimatedCompletionAt) {
      estimatedSecondsRemaining = Math.max(
        0,
        Math.round((new Date(doc.estimatedCompletionAt).getTime() - Date.now()) / 1000)
      );
    }

    return {
      active,
      phase: doc.phase,
      mode: (doc.mode as 'interactive' | 'background') || 'interactive',
      batchMode: !!doc.batchMode,
      progress: doc.progress || 0,
      message: doc.message || '',
      postsFetched: doc.postsFetched || 0,
      commentsFetched: doc.commentsFetched || 0,
      postsAnalyzed: doc.postsAnalyzed || 0,
      postsToAnalyze: doc.postsToAnalyze || 0,
      trendsComputed: doc.trendsComputed || 0,
      startedAt: doc.startedAt || null,
      estimatedCompletionAt: doc.estimatedCompletionAt || null,
      estimatedSecondsRemaining,
      finishedAt: doc.finishedAt || null,
      error: doc.error || null,
    };
  }

  /** Is a sync currently running for this workspace? */
  static async isActive(workspaceId: string): Promise<boolean> {
    const doc = await ListeningSyncStatusModel.findOne({ workspaceId }).select('phase startedAt updatedAt').lean();
    if (!doc) return false;
    const active = doc.phase !== 'completed' && doc.phase !== 'failed' && doc.phase !== 'idle';
    if (!active) return false;
    const lastUpdate = doc.updatedAt ? new Date(doc.updatedAt).getTime() : (doc.startedAt ? new Date(doc.startedAt).getTime() : Date.now());
    const startedMs = doc.startedAt ? new Date(doc.startedAt).getTime() : Date.now();
    // Treat a hung (no update for 4 min) or over-cap (20 min) run as inactive.
    if (Date.now() - lastUpdate > 4 * 60_000 || Date.now() - startedMs > 20 * 60_000) {
      return false; // stale
    }
    return true;
  }
}
