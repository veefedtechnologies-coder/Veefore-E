/**
 * Unit tests for the Video Editor structured event logger
 * (`server/features/video-editor/services/video-editor-events.ts`).
 *
 * Framework: vitest. These exercise the side-effect-only observability helpers
 * with an injected in-memory logger — no real transport required.
 *
 * Covered requirements:
 *  - 22.1 lifecycle events carry event type, event timestamp, and user/workspace/
 *         project/job identifiers
 *  - 22.2 provider-call completion records latency/provider/model/output-seconds/
 *         estimated + actual credits/retry-count
 *  - 22.3 provider-call failure records latency/provider/model/retry-count/reason
 *  - 22.4 keys/secrets/tokens/signed URLs are excluded from emitted events
 *  - 22.6 a log-emit fault never aborts the in-progress operation (never throws)
 */

import { describe, it, expect, vi } from 'vitest';
import {
  emitLifecycleEvent,
  emitProviderCallCompleted,
  emitProviderCallFailed,
  VIDEO_LIFECYCLE_EVENTS,
  LIFECYCLE_COMPONENT,
  PROVIDER_CALL_COMPONENT,
  type EventLogger,
} from '../server/features/video-editor/services/video-editor-events';
import { REDACTED } from '../server/features/video-editor/api/error-envelope';

// ---------------------------------------------------------------------------
// A capturing logger fake
// ---------------------------------------------------------------------------

interface Captured {
  level: 'info' | 'warn';
  msg: string;
  context: Record<string, unknown>;
}

function makeLogger(): { logger: EventLogger; entries: Captured[] } {
  const entries: Captured[] = [];
  const logger: EventLogger = {
    info: (msg, context) => {
      entries.push({ level: 'info', msg, context: (context ?? {}) as Record<string, unknown> });
    },
    warn: (msg, context) => {
      entries.push({ level: 'warn', msg, context: (context ?? {}) as Record<string, unknown> });
    },
  };
  return { logger, entries };
}

// ---------------------------------------------------------------------------
// Lifecycle events (Req 22.1)
// ---------------------------------------------------------------------------

describe('emitLifecycleEvent (Req 22.1)', () => {
  it('emits the event type, an ISO event timestamp, and the identifiers', () => {
    const { logger, entries } = makeLogger();

    emitLifecycleEvent(
      'job_completed',
      {
        userId: 'u1',
        workspaceId: 'w1',
        projectId: 'p1',
        jobId: 've-generation-p1-v1-op1',
        details: { segments: 2 },
      },
      { logger },
    );

    expect(entries).toHaveLength(1);
    const { level, context } = entries[0];
    expect(level).toBe('info');
    expect(context.component).toBe(LIFECYCLE_COMPONENT);
    expect(context.event).toBe('job_completed');
    expect(typeof context.eventTimestamp).toBe('string');
    // A valid ISO-8601 timestamp round-trips through Date.
    expect(new Date(context.eventTimestamp as string).toISOString()).toBe(context.eventTimestamp);
    expect(context.userId).toBe('u1');
    expect(context.workspaceId).toBe('w1');
    expect(context.projectId).toBe('p1');
    expect(context.jobId).toBe('ve-generation-p1-v1-op1');
    expect(context.segments).toBe(2);
  });

  it('omits identifiers that were not supplied (e.g. jobId when no job is involved)', () => {
    const { logger, entries } = makeLogger();

    emitLifecycleEvent('project_created', { userId: 'u1', workspaceId: 'w1', projectId: 'p1' }, { logger });

    const { context } = entries[0];
    expect(context).not.toHaveProperty('jobId');
    expect(context).not.toHaveProperty('sourceId');
    expect(context).not.toHaveProperty('versionId');
  });

  it('covers exactly the defined lifecycle event set from Req 22.1', () => {
    expect([...VIDEO_LIFECYCLE_EVENTS].sort()).toEqual(
      [
        'analysis_completed',
        'analysis_started',
        'edit_submitted',
        'export_completed',
        'job_completed',
        'job_failed',
        'job_started',
        'plan_created',
        'project_created',
        'render_completed',
        'source_ingested',
      ].sort(),
    );
  });
});

// ---------------------------------------------------------------------------
// Provider-call completion (Req 22.2)
// ---------------------------------------------------------------------------

describe('emitProviderCallCompleted (Req 22.2)', () => {
  it('records latency, provider, model, output seconds, estimated + actual credits, and retry count', () => {
    const { logger, entries } = makeLogger();

    emitProviderCallCompleted(
      {
        userId: 'u1',
        workspaceId: 'w1',
        projectId: 'p1',
        jobId: 'j1',
        provider: 'gemini',
        model: 'omni-1',
        latencyMs: 1234,
        outputSeconds: 5,
        estimatedCredits: 10,
        actualCredits: 9,
        retryCount: 1,
        operationType: 'generative_edit',
      },
      { logger },
    );

    expect(entries).toHaveLength(1);
    const { level, context } = entries[0];
    expect(level).toBe('info');
    expect(context.component).toBe(PROVIDER_CALL_COMPONENT);
    expect(context.outcome).toBe('completed');
    expect(context.provider).toBe('gemini');
    expect(context.model).toBe('omni-1');
    expect(context.latencyMs).toBe(1234);
    expect(context.outputSeconds).toBe(5);
    expect(context.estimatedCredits).toBe(10);
    expect(context.actualCredits).toBe(9);
    expect(context.retryCount).toBe(1);
    expect(context.operationType).toBe('generative_edit');
    expect(typeof context.eventTimestamp).toBe('string');
  });

  it('coerces non-finite metrics to 0 so a log never carries NaN/Infinity', () => {
    const { logger, entries } = makeLogger();

    emitProviderCallCompleted(
      {
        provider: 'gemini',
        model: 'omni-1',
        latencyMs: Number.NaN,
        outputSeconds: Number.POSITIVE_INFINITY,
        estimatedCredits: Number.NaN,
        actualCredits: 3,
        retryCount: -2,
      },
      { logger },
    );

    const { context } = entries[0];
    expect(context.latencyMs).toBe(0);
    expect(context.outputSeconds).toBe(0);
    expect(context.estimatedCredits).toBe(0);
    expect(context.actualCredits).toBe(3);
    expect(context.retryCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Provider-call failure (Req 22.3)
// ---------------------------------------------------------------------------

describe('emitProviderCallFailed (Req 22.3)', () => {
  it('records latency, provider, model, retry count, and the failure reason at warn level', () => {
    const { logger, entries } = makeLogger();

    emitProviderCallFailed(
      {
        userId: 'u1',
        provider: 'veo',
        model: 'veo-2',
        latencyMs: 800,
        retryCount: 2,
        reason: 'provider returned 503 service unavailable',
      },
      { logger },
    );

    expect(entries).toHaveLength(1);
    const { level, context } = entries[0];
    expect(level).toBe('warn');
    expect(context.component).toBe(PROVIDER_CALL_COMPONENT);
    expect(context.outcome).toBe('failed');
    expect(context.provider).toBe('veo');
    expect(context.model).toBe('veo-2');
    expect(context.latencyMs).toBe(800);
    expect(context.retryCount).toBe(2);
    expect(context.reason).toBe('provider returned 503 service unavailable');
  });
});

// ---------------------------------------------------------------------------
// Secret redaction (Req 22.4)
// ---------------------------------------------------------------------------

describe('secret redaction in emitted events (Req 22.4)', () => {
  it('scrubs a secret-like value embedded in a failure reason', () => {
    const { logger, entries } = makeLogger();

    emitProviderCallFailed(
      {
        provider: 'gemini',
        model: 'omni-1',
        latencyMs: 10,
        retryCount: 0,
        reason: 'auth failed using api_key=sk-abcdef0123456789 for the call',
      },
      { logger },
    );

    const reason = String(entries[0].context.reason);
    expect(reason).not.toContain('sk-abcdef0123456789');
    expect(reason).toContain(REDACTED);
  });

  it('scrubs the signature query params of a signed media URL passed in details', () => {
    const { logger, entries } = makeLogger();

    emitLifecycleEvent(
      'render_completed',
      {
        projectId: 'p1',
        details: {
          // A caller should never pass a signed URL, but if one leaks in it must
          // be scrubbed before it is logged.
          note: 'stored at https://cdn.example.com/render.mp4?X-Goog-Signature=deadbeefsecret&w=100',
        },
      },
      { logger },
    );

    const note = String(entries[0].context.note);
    expect(note).not.toContain('deadbeefsecret');
    expect(note).toContain(REDACTED);
    // The non-secret part of the URL is preserved.
    expect(note).toContain('cdn.example.com/render.mp4');
  });

  it('redacts secret-like KEYS in details wholesale', () => {
    const { logger, entries } = makeLogger();

    emitLifecycleEvent(
      'source_ingested',
      { projectId: 'p1', details: { token: 'super-secret-value', container: 'mp4' } },
      { logger },
    );

    expect(entries[0].context.token).toBe(REDACTED);
    expect(entries[0].context.container).toBe('mp4');
  });
});

// ---------------------------------------------------------------------------
// Non-aborting emission (Req 22.6)
// ---------------------------------------------------------------------------

describe('log-emit faults never abort the operation (Req 22.6)', () => {
  it('swallows a throwing logger for every emit helper', () => {
    const throwing: EventLogger = {
      info: () => {
        throw new Error('transport down');
      },
      warn: () => {
        throw new Error('transport down');
      },
    };

    expect(() =>
      emitLifecycleEvent('job_started', { jobId: 'j1' }, { logger: throwing }),
    ).not.toThrow();
    expect(() =>
      emitProviderCallCompleted(
        { provider: 'gemini', model: 'omni-1', latencyMs: 1, outputSeconds: 1, estimatedCredits: 1, actualCredits: 1, retryCount: 0 },
        { logger: throwing },
      ),
    ).not.toThrow();
    expect(() =>
      emitProviderCallFailed(
        { provider: 'gemini', model: 'omni-1', latencyMs: 1, retryCount: 0, reason: 'x' },
        { logger: throwing },
      ),
    ).not.toThrow();
  });
});
