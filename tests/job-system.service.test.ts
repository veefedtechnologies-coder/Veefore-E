/**
 * Unit tests for the Job_System orchestration service (task 4.4).
 *
 * Framework: vitest. These exercise the IO-orchestration shell with in-memory
 * fakes for the persistence store, credit ledger, queue enqueue, and temp-file
 * remover — no Redis, MongoDB, or provider required.
 *
 * Covered requirements:
 *  - 18.3 creation assigns unique idempotency key, attempt=1, timeout ≤3600 s, artifacts
 *  - 18.4 progress is stage-derived and never premature
 *  - 18.5 cancellation aborts, marks CANCELLED, removes temp files, reconciles credits
 *  - 18.6 cleanup failure still cancels and schedules a background retry
 *  - 18.7 retries are idempotent (same id/key) and bounded
 *  - 18.8 timeout → FAILED + credit release
 *  - 18.9 attempts exhausted → FAILED + credit release
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  JobSystemService,
  JobTransitionError,
  JOB_ERROR_TIMEOUT,
  JOB_ERROR_ATTEMPTS_EXHAUSTED,
  type JobStore,
  type JobRecord,
  type JobCreateData,
  type JobPatch,
} from '../server/features/video-editor/services/job-system.service';
import { videoEditorJobId } from '../server/queues/videoEditorQueues';
import { VIDEO_EDITOR_CONFIG } from '../server/features/video-editor/config/video-editor.config';

// ---------------------------------------------------------------------------
// In-memory fakes
// ---------------------------------------------------------------------------

class InMemoryJobStore implements JobStore {
  readonly jobs = new Map<string, JobRecord>();
  clock = 1_000_000;

  async create(data: JobCreateData): Promise<JobRecord> {
    const now = new Date(this.clock);
    const record: JobRecord = {
      ...data,
      completedStages: [...data.completedStages],
      inputArtifactIds: [...data.inputArtifactIds],
      outputArtifactIds: [...data.outputArtifactIds],
      createdAt: now,
      updatedAt: now,
    };
    this.jobs.set(data.jobId, record);
    return { ...record };
  }

  async findByJobId(jobId: string): Promise<JobRecord | null> {
    const r = this.jobs.get(jobId);
    return r ? { ...r } : null;
  }

  async update(jobId: string, patch: JobPatch): Promise<JobRecord | null> {
    const existing = this.jobs.get(jobId);
    if (!existing) return null;
    const updated: JobRecord = { ...existing, ...patch, updatedAt: new Date(this.clock) };
    this.jobs.set(jobId, updated);
    return { ...updated };
  }
}

function buildDeps(overrides: Partial<Parameters<typeof makeService>[0]> = {}) {
  const store = new InMemoryJobStore();
  const refundSettlement = vi.fn().mockResolvedValue(undefined);
  const enqueue = vi.fn().mockResolvedValue('enqueued');
  const scheduleCleanup = vi.fn().mockResolvedValue('cleanup-enqueued');
  const removeTempFiles = vi.fn().mockResolvedValue(undefined);
  const now = vi.fn(() => store.clock);
  return { store, refundSettlement, enqueue, scheduleCleanup, removeTempFiles, now, ...overrides };
}

function makeService(deps: {
  store: JobStore;
  refundSettlement?: (k: string) => Promise<void>;
  enqueue?: any;
  scheduleCleanup?: any;
  removeTempFiles?: any;
  now?: () => number;
}) {
  const silentLogger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };
  return new JobSystemService({
    store: deps.store,
    creditReleaser: deps.refundSettlement
      ? { refundSettlement: deps.refundSettlement }
      : undefined,
    enqueue: deps.enqueue,
    scheduleCleanup: deps.scheduleCleanup,
    removeTempFiles: deps.removeTempFiles,
    now: deps.now,
    logger: silentLogger as any,
  });
}

const baseInput = {
  type: 'render' as const,
  projectId: 'proj1',
  versionId: 'v1',
  opId: 'op1',
  workspaceId: 'ws1',
  userId: 'user1',
};

// ---------------------------------------------------------------------------
// Creation (Req 18.3)
// ---------------------------------------------------------------------------

describe('JobSystemService.createJob (Req 18.3)', () => {
  let deps: ReturnType<typeof buildDeps>;
  let svc: JobSystemService;

  beforeEach(() => {
    deps = buildDeps();
    svc = makeService(deps);
  });

  it('assigns a deterministic job id, a unique idempotency key, attempt=1, and QUEUED state', async () => {
    const job = await svc.createJob(baseInput);
    expect(job.jobId).toBe(videoEditorJobId('render', baseInput));
    expect(job.idempotencyKey).toBeTruthy();
    expect(job.attempt).toBe(1);
    expect(job.state).toBe('QUEUED');
    expect(job.progress).toBe(0);
  });

  it('generates distinct idempotency keys for distinct work items', async () => {
    const a = await svc.createJob(baseInput);
    const b = await svc.createJob({ ...baseInput, opId: 'op2' });
    expect(a.idempotencyKey).not.toBe(b.idempotencyKey);
  });

  it('clamps a requested timeout to the configured maximum (≤3600 s)', async () => {
    const job = await svc.createJob({ ...baseInput, timeoutSec: 999_999 });
    expect(job.timeoutSec).toBe(VIDEO_EDITOR_CONFIG.job.maxTimeoutSec);
  });

  it('defaults timeout when not supplied or invalid', async () => {
    const job = await svc.createJob({ ...baseInput, timeoutSec: -5 });
    expect(job.timeoutSec).toBe(
      Math.min(VIDEO_EDITOR_CONFIG.job.defaultTimeoutSec, VIDEO_EDITOR_CONFIG.job.maxTimeoutSec),
    );
  });

  it('records input and output artifact references', async () => {
    const job = await svc.createJob({
      ...baseInput,
      inputArtifactIds: ['in-a', 'in-b'],
      outputArtifactIds: ['out-a'],
    });
    expect(job.inputArtifactIds).toEqual(['in-a', 'in-b']);
    expect(job.outputArtifactIds).toEqual(['out-a']);
  });

  it('enqueues asynchronously by default and exposes an abort signal', async () => {
    const job = await svc.createJob(baseInput);
    expect(deps.enqueue).toHaveBeenCalledTimes(1);
    const signal = svc.getAbortSignal(job.jobId);
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(signal?.aborted).toBe(false);
  });

  it('does not enqueue when enqueue:false', async () => {
    await svc.createJob({ ...baseInput, enqueue: false });
    expect(deps.enqueue).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Progress (Req 18.4)
// ---------------------------------------------------------------------------

describe('JobSystemService progress (Req 18.4)', () => {
  it('derives monotonic progress from completed stages and never reports premature 100', async () => {
    const deps = buildDeps();
    const svc = makeService(deps);
    const job = await svc.createJob(baseInput);

    const s1 = await svc.recordStageComplete(job.jobId, 'PREPARING');
    const s2 = await svc.recordStageComplete(job.jobId, 'ANALYZING');
    expect(s2.progress).toBeGreaterThanOrEqual(s1.progress);
    expect(s2.progress).toBeLessThan(100);

    // Completing all seven pipeline stages still stays below 100 until COMPLETED.
    for (const stage of ['UPLOADING', 'PLANNING', 'EDITING', 'RENDERING', 'QUALITY_CHECK'] as const) {
      await svc.recordStageComplete(job.jobId, stage);
    }
    const beforeComplete = await svc.getJob(job.jobId);
    expect(beforeComplete.progress).toBeLessThanOrEqual(99);

    const done = await svc.completeJob(job.jobId, ['render-artifact']);
    expect(done.state).toBe('COMPLETED');
    expect(done.progress).toBe(100);
    expect(done.outputArtifactIds).toEqual(['render-artifact']);
  });

  it('does not double-count a repeated stage', async () => {
    const svc = makeService(buildDeps());
    const job = await svc.createJob(baseInput);
    const first = await svc.recordStageComplete(job.jobId, 'PREPARING');
    const again = await svc.recordStageComplete(job.jobId, 'PREPARING');
    expect(again.completedStages).toEqual(first.completedStages);
    expect(again.progress).toBe(first.progress);
  });

  it('rejects an illegal transition without changing the prior state', async () => {
    const svc = makeService(buildDeps());
    const job = await svc.createJob(baseInput);
    await expect(svc.transitionTo(job.jobId, 'COMPLETED')).rejects.toBeInstanceOf(
      JobTransitionError,
    );
    const unchanged = await svc.getJob(job.jobId);
    expect(unchanged.state).toBe('QUEUED');
  });
});

// ---------------------------------------------------------------------------
// Cancellation (Req 18.5, 18.6)
// ---------------------------------------------------------------------------

describe('JobSystemService.cancelJob (Req 18.5, 18.6)', () => {
  it('aborts the signal, marks CANCELLED, removes temp files, and reconciles credits', async () => {
    const deps = buildDeps();
    const svc = makeService(deps);
    const job = await svc.createJob({ ...baseInput, creditIdempotencyKey: 'credit-key-1' });
    const signal = svc.getAbortSignal(job.jobId)!;
    await svc.recordStageComplete(job.jobId, 'PREPARING');

    const result = await svc.cancelJob(job.jobId, ['/tmp/a.mp4', '/tmp/b.mp4']);

    expect(signal.aborted).toBe(true);
    expect(result.cancelled).toBe(true);
    expect(result.state).toBe('CANCELLED');
    expect(result.tempFilesRemoved).toBe(true);
    expect(result.creditsReleased).toBe(true);
    expect(deps.removeTempFiles).toHaveBeenCalledWith(['/tmp/a.mp4', '/tmp/b.mp4']);
    expect(deps.refundSettlement).toHaveBeenCalledWith('credit-key-1');

    const persisted = await svc.getJob(job.jobId);
    expect(persisted.state).toBe('CANCELLED');
  });

  it('still marks CANCELLED and schedules a background cleanup retry when temp removal fails (Req 18.6)', async () => {
    const deps = buildDeps({
      removeTempFiles: vi.fn().mockRejectedValue(new Error('disk busy')),
    });
    const svc = makeService(deps);
    const job = await svc.createJob({ ...baseInput, creditIdempotencyKey: 'credit-key-2' });

    const result = await svc.cancelJob(job.jobId, ['/tmp/x.mp4']);

    expect(result.cancelled).toBe(true);
    expect(result.state).toBe('CANCELLED');
    expect(result.tempFilesRemoved).toBe(false);
    expect(result.cleanupRetryScheduled).toBe(true);
    expect(deps.scheduleCleanup).toHaveBeenCalledTimes(1);
    const [type] = deps.scheduleCleanup.mock.calls[0];
    expect(type).toBe('cleanup');
  });

  it('is a no-op that reports the existing state when the job is already terminal', async () => {
    const deps = buildDeps();
    const svc = makeService(deps);
    const job = await svc.createJob(baseInput);
    await svc.recordStageComplete(job.jobId, 'RENDERING');
    await svc.completeJob(job.jobId);

    const result = await svc.cancelJob(job.jobId, ['/tmp/y.mp4']);
    expect(result.cancelled).toBe(false);
    expect(result.state).toBe('COMPLETED');
    expect(deps.removeTempFiles).not.toHaveBeenCalled();
    expect(deps.refundSettlement).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Timeout (Req 18.8)
// ---------------------------------------------------------------------------

describe('JobSystemService.enforceTimeout (Req 18.8)', () => {
  it('fails the job with a timeout error and releases credits once elapsed exceeds the timeout', async () => {
    const deps = buildDeps();
    const svc = makeService(deps);
    const job = await svc.createJob({
      ...baseInput,
      timeoutSec: 10,
      creditIdempotencyKey: 'credit-key-timeout',
    });

    // Not yet timed out.
    deps.store.clock += 5_000;
    const still = await svc.enforceTimeout(job.jobId);
    expect(still.state).toBe('QUEUED');
    expect(deps.refundSettlement).not.toHaveBeenCalled();

    // Now past the 10 s timeout.
    deps.store.clock += 6_000;
    const failed = await svc.enforceTimeout(job.jobId);
    expect(failed.state).toBe('FAILED');
    expect(failed.errorCode).toBe(JOB_ERROR_TIMEOUT);
    expect(deps.refundSettlement).toHaveBeenCalledWith('credit-key-timeout');
  });
});

// ---------------------------------------------------------------------------
// Retries (Req 18.7, 18.9)
// ---------------------------------------------------------------------------

describe('JobSystemService.retryJob (Req 18.7, 18.9)', () => {
  it('re-enqueues idempotently with the same job id and idempotency key, incrementing attempt', async () => {
    const deps = buildDeps();
    const svc = makeService(deps);
    const job = await svc.createJob({ ...baseInput, enqueue: false });
    // Simulate a transient failure mid-render (job is in an executing stage).
    await svc.recordStageComplete(job.jobId, 'RENDERING');

    const retried = await svc.retryJob(job.jobId, 'render');
    expect(retried.state).toBe('QUEUED');
    expect(retried.attempt).toBe(2);

    // Re-enqueued with the SAME deterministic id + idempotency key (Req 18.7).
    expect(deps.enqueue).toHaveBeenCalledTimes(1);
    const [, data] = deps.enqueue.mock.calls[0];
    expect(data.idempotencyKey).toBe(job.idempotencyKey);
    expect(videoEditorJobId('render', data)).toBe(job.jobId);
  });

  it('fails with an attempts-exhausted error and releases credits at the configured maximum (Req 18.9)', async () => {
    const deps = buildDeps();
    const svc = makeService(deps);
    const job = await svc.createJob({
      ...baseInput,
      enqueue: false,
      creditIdempotencyKey: 'credit-key-exhausted',
    });

    // Drive the attempt counter to the configured maximum via transient-failure retries.
    const max = VIDEO_EDITOR_CONFIG.job.maxAttempts;
    let current = job;
    for (let i = 1; i < max; i++) {
      await svc.recordStageComplete(current.jobId, 'RENDERING');
      current = await svc.retryJob(current.jobId, 'render');
    }
    expect(current.attempt).toBe(max);

    // One more transient failure at the max attempt → attempts exhausted.
    await svc.recordStageComplete(current.jobId, 'RENDERING');
    const exhausted = await svc.retryJob(current.jobId, 'render');

    expect(exhausted.state).toBe('FAILED');
    expect(exhausted.errorCode).toBe(JOB_ERROR_ATTEMPTS_EXHAUSTED);
    expect(deps.refundSettlement).toHaveBeenCalledWith('credit-key-exhausted');
  });

  it('is a no-op for a COMPLETED or CANCELLED job', async () => {
    const deps = buildDeps();
    const svc = makeService(deps);
    const job = await svc.createJob({ ...baseInput, enqueue: false });
    await svc.recordStageComplete(job.jobId, 'RENDERING');
    await svc.completeJob(job.jobId);

    const result = await svc.retryJob(job.jobId, 'render');
    expect(result.state).toBe('COMPLETED');
    expect(deps.enqueue).not.toHaveBeenCalled();
  });
});
