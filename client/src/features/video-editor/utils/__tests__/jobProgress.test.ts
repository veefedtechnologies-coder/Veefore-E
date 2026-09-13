import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

import { interpretJobStatus, isTerminalJobState } from '../jobProgress';

describe('interpretJobStatus', () => {
  it('surfaces a determinate percentage when the server marks it determinate', () => {
    const view = interpretJobStatus({
      jobId: 'j1',
      projectId: 'p1',
      state: 'RENDERING',
      determinate: true,
      progress: 60,
      completedStages: ['UPLOADING', 'ANALYZING', 'PLANNING'],
      totalStages: 5,
    });
    expect(view.determinate).toBe(true);
    expect(view.percent).toBe(60);
    expect(view.completedStages).toBe(3);
    expect(view.totalStages).toBe(5);
    expect(view.label).toBe('Rendering');
    expect(view.terminal).toBe(false);
  });

  it('forces percent to null when indeterminate, even if a value is present (Req 23.6)', () => {
    const view = interpretJobStatus({
      jobId: 'j1',
      state: 'ANALYZING',
      determinate: false,
      // A stray value must NOT leak through as a fabricated percentage.
      progress: 42,
    });
    expect(view.determinate).toBe(false);
    expect(view.percent).toBeNull();
  });

  it('treats a missing determinate flag as indeterminate', () => {
    const view = interpretJobStatus({ jobId: 'j1', state: 'PLANNING', progress: 30 });
    expect(view.determinate).toBe(false);
    expect(view.percent).toBeNull();
  });

  it('recognizes terminal states and success/failure flags', () => {
    const done = interpretJobStatus({ jobId: 'j1', state: 'COMPLETED', determinate: true, progress: 100 });
    expect(done.terminal).toBe(true);
    expect(done.succeeded).toBe(true);
    expect(done.failed).toBe(false);

    const failed = interpretJobStatus({ jobId: 'j1', state: 'FAILED', errorCode: 'QC_FAILED' });
    expect(failed.terminal).toBe(true);
    expect(failed.failed).toBe(true);
    expect(failed.succeeded).toBe(false);
    expect(failed.errorCode).toBe('QC_FAILED');

    const cancelled = interpretJobStatus({ jobId: 'j1', state: 'CANCELLED' });
    expect(cancelled.terminal).toBe(true);
    expect(cancelled.failed).toBe(true);
  });

  it('normalizes a stream event the same way as a status payload', () => {
    const view = interpretJobStatus({
      type: 'complete',
      jobId: 'j1',
      projectId: 'p1',
      state: 'COMPLETED',
      terminal: true,
      determinate: true,
      progress: 100,
      completedStages: 5,
      totalStages: 5,
    });
    expect(view.succeeded).toBe(true);
    expect(view.percent).toBe(100);
  });

  it('reads the error code from a stream error event', () => {
    const view = interpretJobStatus({ type: 'error', jobId: 'j1', code: 'JOB_STREAM_ERROR' });
    expect(view.errorCode).toBe('JOB_STREAM_ERROR');
  });

  it('defaults an unknown state to a raw label', () => {
    const view = interpretJobStatus({ jobId: 'j1', state: 'WEIRD_STATE' });
    expect(view.label).toBe('WEIRD_STATE');
  });

  it('isTerminalJobState matches the terminal set', () => {
    expect(isTerminalJobState('COMPLETED')).toBe(true);
    expect(isTerminalJobState('FAILED')).toBe(true);
    expect(isTerminalJobState('CANCELLED')).toBe(true);
    expect(isTerminalJobState('RENDERING')).toBe(false);
    expect(isTerminalJobState(undefined)).toBe(false);
  });
});

describe('interpretJobStatus properties', () => {
  // Feature: veefore-ai-video-editor — Req 23.6: an indeterminate job NEVER
  // exposes a percentage, and a determinate one only ever exposes an integer in
  // [0,100]. The view never fabricates a completion percentage.
  it('percent is null unless determinate, and always an integer in [0,100] otherwise', () => {
    fc.assert(
      fc.property(
        fc.record({
          jobId: fc.string({ minLength: 1 }),
          state: fc.constantFrom(
            'QUEUED',
            'ANALYZING',
            'RENDERING',
            'COMPLETED',
            'FAILED',
            'CANCELLED',
          ),
          determinate: fc.boolean(),
          progress: fc.oneof(
            fc.integer({ min: -100, max: 300 }),
            fc.double(),
            fc.constant(undefined),
            fc.constant(null),
          ),
        }),
        (payload) => {
          const view = interpretJobStatus(payload as never);
          if (!payload.determinate) {
            return view.percent === null;
          }
          if (view.percent === null) return true;
          return Number.isInteger(view.percent) && view.percent >= 0 && view.percent <= 100;
        },
      ),
      { numRuns: 300 },
    );
  });

  // Feature: veefore-ai-video-editor — success is exclusive: a job is `succeeded`
  // only in the COMPLETED state, and never both succeeded and failed.
  it('succeeded and failed are mutually exclusive and match the state', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(
          'QUEUED',
          'PREPARING',
          'ANALYZING',
          'RENDERING',
          'QUALITY_CHECK',
          'COMPLETED',
          'FAILED',
          'CANCELLED',
          'RETRYING',
        ),
        (state) => {
          const view = interpretJobStatus({ jobId: 'j', state });
          if (view.succeeded && view.failed) return false;
          if (state === 'COMPLETED') return view.succeeded && !view.failed;
          if (state === 'FAILED' || state === 'CANCELLED') return view.failed && !view.succeeded;
          return !view.succeeded && !view.failed;
        },
      ),
      { numRuns: 200 },
    );
  });
});
