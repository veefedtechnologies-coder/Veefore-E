/**
 * Integration tests for Video Editor observability (task 22.3, Req 22.1, 22.2, 22.5).
 *
 * Two surfaces are exercised end-to-end against fakes, with no real transport or
 * database:
 *
 *   1. Structured lifecycle / provider-call logging (task 22.1,
 *      `video-editor-events.ts`). A capturing logger records every emitted event
 *      so we can assert the required fields are carried (Req 22.1, 22.2), that a
 *      failure event records latency/provider/model/retry/reason, and — most
 *      importantly — that NO secret, token, or signed media URL ever survives
 *      into an emitted event (Req 22.4).
 *
 *   2. The admin video AI-usage analytics aggregation (task 22.2,
 *      `video-analytics.service.ts`). The four durable collections the service
 *      reads (`VideoEditOperation`, `AIUsageEvent`, `AICreditTransaction`,
 *      `VideoEditJob`) are replaced with in-memory fakes backed by a small
 *      aggregation engine that faithfully evaluates the SAME `$match`/`$group`
 *      pipelines the service issues. We then seed realistic documents and assert
 *      the rolled-up counts, spend, and success / retry / QC-failure rates match
 *      Req 22.5 exactly, that the analytics window is respected, and that a
 *      failing breakdown degrades to zeros rather than blanking the dashboard.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// In-memory model fakes + a faithful mini $match/$group engine (vi.hoisted so
// the mock factories below can reference them).
// ---------------------------------------------------------------------------

const h = vi.hoisted(() => {
  const stores: {
    operations: any[];
    usage: any[];
    credits: any[];
    jobs: any[];
  } = { operations: [], usage: [], credits: [], jobs: [] };

  /** Read a top-level field path (`$field`) off a document. */
  function getField(doc: any, name: string): unknown {
    return doc == null ? undefined : doc[name];
  }

  /** Evaluate a Mongo aggregation expression against a single document. */
  function evalExpr(expr: any, doc: any): any {
    if (expr === null || expr === undefined) return expr;
    if (typeof expr === 'number' || typeof expr === 'boolean') return expr;
    if (typeof expr === 'string') return expr.startsWith('$') ? getField(doc, expr.slice(1)) : expr;
    if (Array.isArray(expr)) return expr.map((e) => evalExpr(e, doc));
    if (typeof expr === 'object') {
      const op = Object.keys(expr)[0];
      const arg = expr[op];
      switch (op) {
        case '$cond': {
          const [c, t, e] = arg;
          return evalExpr(c, doc) ? evalExpr(t, doc) : evalExpr(e, doc);
        }
        case '$eq': {
          const [a, b] = arg;
          return evalExpr(a, doc) === evalExpr(b, doc);
        }
        case '$gt': {
          const [a, b] = arg;
          return evalExpr(a, doc) > evalExpr(b, doc);
        }
        case '$or':
          return (arg as any[]).some((e) => Boolean(evalExpr(e, doc)));
        case '$and':
          return (arg as any[]).every((e) => Boolean(evalExpr(e, doc)));
        case '$in': {
          const [v, list] = arg;
          const arr = evalExpr(list, doc);
          return Array.isArray(arr) && arr.includes(evalExpr(v, doc));
        }
        case '$ifNull': {
          const [v, fb] = arg;
          const r = evalExpr(v, doc);
          return r === null || r === undefined ? evalExpr(fb, doc) : r;
        }
        default:
          throw new Error(`fake-mongo: unsupported expression operator ${op}`);
      }
    }
    return expr;
  }

  /** Evaluate a `$match` filter clause against a single document. */
  function matchesFilter(doc: any, filter: Record<string, any>): boolean {
    for (const [key, cond] of Object.entries(filter)) {
      const val = getField(doc, key);
      if (cond && typeof cond === 'object' && !(cond instanceof Date) && !Array.isArray(cond)) {
        for (const [operator, operand] of Object.entries(cond as Record<string, any>)) {
          switch (operator) {
            case '$gte':
              if (!(val != null && val >= (operand as any))) return false;
              break;
            case '$gt':
              if (!(val != null && val > (operand as any))) return false;
              break;
            case '$lt':
              if (!(val != null && val < (operand as any))) return false;
              break;
            case '$lte':
              if (!(val != null && val <= (operand as any))) return false;
              break;
            case '$eq':
              if (val !== operand) return false;
              break;
            case '$ne':
              if (val === operand) return false;
              break;
            default:
              throw new Error(`fake-mongo: unsupported match operator ${operator}`);
          }
        }
      } else if (val !== cond) {
        return false;
      }
    }
    return true;
  }

  /** Run a `_id: null` `$group` stage, returning `[]` for empty input (as Mongo does). */
  function runGroup(docs: any[], groupSpec: Record<string, any>): any[] {
    if (docs.length === 0) return [];
    const result: Record<string, unknown> = { _id: null };
    for (const [field, spec] of Object.entries(groupSpec)) {
      if (field === '_id') continue;
      const [acc, accExpr] = Object.entries(spec as Record<string, any>)[0];
      if (acc !== '$sum') throw new Error(`fake-mongo: unsupported accumulator ${acc}`);
      result[field] = docs.reduce((sum, d) => {
        const v = evalExpr(accExpr, d);
        return sum + (typeof v === 'number' && Number.isFinite(v) ? v : 0);
      }, 0);
    }
    return [result];
  }

  /** Run a bounded `$match`/`$group` aggregation pipeline over an array of docs. */
  function runAggregate(docs: any[], pipeline: any[]): any[] {
    let current = docs.slice();
    let grouped: any[] | null = null;
    for (const stage of pipeline) {
      if (stage.$match) current = current.filter((d) => matchesFilter(d, stage.$match));
      else if (stage.$group) grouped = runGroup(current, stage.$group);
      else throw new Error(`fake-mongo: unsupported stage ${Object.keys(stage)[0]}`);
    }
    return grouped ?? current;
  }

  function makeModel(getDocs: () => any[]) {
    return {
      async countDocuments(filter: Record<string, any> = {}) {
        return getDocs().filter((d) => matchesFilter(d, filter)).length;
      },
      async aggregate(pipeline: any[]) {
        return runAggregate(getDocs(), pipeline);
      },
    };
  }

  return {
    stores,
    reset() {
      stores.operations = [];
      stores.usage = [];
      stores.credits = [];
      stores.jobs = [];
    },
    opModel: makeModel(() => stores.operations),
    usageModel: makeModel(() => stores.usage),
    creditModel: makeModel(() => stores.credits),
    jobModel: makeModel(() => stores.jobs),
  };
});

// Replace the durable collections + the metering constants source so importing
// the analytics service pulls in no mongoose connection or ledger chain.
vi.mock('../../../../models/VideoEditor/VideoEditJob', () => ({ VideoEditJobModel: h.jobModel }));
vi.mock('../../../../models/VideoEditor/VideoEditOperation', () => ({
  VideoEditOperationModel: h.opModel,
}));
vi.mock('../../../../services/aiUsageTracker', () => ({ AIUsageEvent: h.usageModel }));
vi.mock('../../../../features/subscription/db/models/AICreditTransactionModel', () => ({
  default: h.creditModel,
}));
vi.mock('../generative-metering.service', () => ({
  VIDEO_GENERATION_USAGE_FEATURE: 'video.generation',
  VIDEO_GENERATIVE_CREDIT_FEATURE: 'videoGenerativeEdit',
}));

import {
  emitLifecycleEvent,
  emitProviderCallCompleted,
  emitProviderCallFailed,
  VIDEO_LIFECYCLE_EVENTS,
  LIFECYCLE_COMPONENT,
  PROVIDER_CALL_COMPONENT,
} from '../video-editor-events';
import {
  computeVideoJobRates,
  videoUsageAnalytics,
  QC_FAILURE_ERROR_CODE,
  type VideoJobCounts,
} from '../video-analytics.service';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

interface Captured {
  level: 'info' | 'warn' | 'error' | 'debug';
  msg: string;
  ctx: any;
}

/** A logger that captures every call so emitted events can be inspected. */
function makeCapturingLogger() {
  const calls: Captured[] = [];
  const push = (level: Captured['level']) => (msg: string, ctx?: any) =>
    calls.push({ level, msg, ctx });
  return {
    calls,
    info: push('info'),
    warn: push('warn'),
    error: push('error'),
    debug: push('debug'),
  };
}

/** True when the deep-serialised value contains the given secret substring. */
function leaks(value: unknown, secret: string): boolean {
  return JSON.stringify(value ?? '').includes(secret);
}

const WINDOW = { from: new Date('2024-01-01T00:00:00.000Z'), to: new Date('2024-02-01T00:00:00.000Z') };
const IN = new Date('2024-01-15T12:00:00.000Z'); // inside the window
const BEFORE = new Date('2023-12-31T23:59:59.000Z'); // before the window
const AT_END = new Date('2024-02-01T00:00:00.000Z'); // == exclusive end → excluded

beforeEach(() => {
  h.reset();
});

// ===========================================================================
// 1. Structured lifecycle + provider-call logging (Req 22.1, 22.2, 22.3, 22.4)
// ===========================================================================

describe('video lifecycle logging (Req 22.1)', () => {
  it('emits a structured lifecycle event carrying type, timestamp, and identifiers', () => {
    const log = makeCapturingLogger();

    emitLifecycleEvent(
      'job_started',
      {
        userId: 'user-1',
        workspaceId: 'ws-1',
        projectId: 'proj-1',
        jobId: 'job-1',
        details: { stage: 'ANALYSIS', segmentCount: 3 },
      },
      { logger: log },
    );

    expect(log.calls).toHaveLength(1);
    const { level, ctx } = log.calls[0];
    expect(level).toBe('info');
    expect(ctx.component).toBe(LIFECYCLE_COMPONENT);
    expect(ctx.event).toBe('job_started');
    // ISO-8601 timestamp.
    expect(typeof ctx.eventTimestamp).toBe('string');
    expect(new Date(ctx.eventTimestamp).toISOString()).toBe(ctx.eventTimestamp);
    expect(ctx.userId).toBe('user-1');
    expect(ctx.workspaceId).toBe('ws-1');
    expect(ctx.projectId).toBe('proj-1');
    expect(ctx.jobId).toBe('job-1');
    // Extra structured detail is preserved.
    expect(ctx.stage).toBe('ANALYSIS');
    expect(ctx.segmentCount).toBe(3);
  });

  it('emits every event in the defined lifecycle set with the correct event tag', () => {
    const log = makeCapturingLogger();

    for (const event of VIDEO_LIFECYCLE_EVENTS) {
      emitLifecycleEvent(event, { projectId: 'proj-1' }, { logger: log });
    }

    expect(log.calls).toHaveLength(VIDEO_LIFECYCLE_EVENTS.length);
    expect(log.calls.map((c) => c.ctx.event)).toEqual([...VIDEO_LIFECYCLE_EVENTS]);
  });

  it('omits the job identifier for a lifecycle event where no job is involved', () => {
    const log = makeCapturingLogger();

    emitLifecycleEvent('project_created', { userId: 'u', workspaceId: 'w', projectId: 'p' }, { logger: log });

    const { ctx } = log.calls[0];
    expect(ctx.projectId).toBe('p');
    expect('jobId' in ctx).toBe(false);
  });
});

describe('provider-call logging (Req 22.2, 22.3)', () => {
  it('records latency, provider, model, output seconds, costs, and retry count on completion', () => {
    const log = makeCapturingLogger();

    emitProviderCallCompleted(
      {
        provider: 'gemini',
        model: 'omni-1',
        latencyMs: 4200,
        outputSeconds: 6.5,
        estimatedCredits: 12,
        actualCredits: 11.4,
        retryCount: 1,
        operationType: 'generative_edit',
        projectId: 'proj-1',
        jobId: 'job-1',
      },
      { logger: log },
    );

    expect(log.calls).toHaveLength(1);
    const { level, ctx } = log.calls[0];
    expect(level).toBe('info');
    expect(ctx.component).toBe(PROVIDER_CALL_COMPONENT);
    expect(ctx.outcome).toBe('completed');
    expect(ctx.provider).toBe('gemini');
    expect(ctx.model).toBe('omni-1');
    expect(ctx.latencyMs).toBe(4200);
    expect(ctx.outputSeconds).toBe(6.5);
    expect(ctx.estimatedCredits).toBe(12);
    expect(ctx.actualCredits).toBe(11.4);
    expect(ctx.retryCount).toBe(1);
    expect(ctx.operationType).toBe('generative_edit');
    expect(ctx.jobId).toBe('job-1');
  });

  it('records latency, provider, model, retry count, and reason on failure', () => {
    const log = makeCapturingLogger();

    emitProviderCallFailed(
      {
        provider: 'gemini',
        model: 'omni-1',
        latencyMs: 800,
        retryCount: 2,
        reason: 'provider returned 503 service unavailable',
        jobId: 'job-1',
      },
      { logger: log },
    );

    expect(log.calls).toHaveLength(1);
    const { level, ctx } = log.calls[0];
    expect(level).toBe('warn');
    expect(ctx.component).toBe(PROVIDER_CALL_COMPONENT);
    expect(ctx.outcome).toBe('failed');
    expect(ctx.provider).toBe('gemini');
    expect(ctx.model).toBe('omni-1');
    expect(ctx.latencyMs).toBe(800);
    expect(ctx.retryCount).toBe(2);
    expect(ctx.reason).toBe('provider returned 503 service unavailable');
  });

  it('coerces non-finite numeric metrics to 0 so a log never carries NaN/Infinity', () => {
    const log = makeCapturingLogger();

    emitProviderCallCompleted(
      {
        provider: 'gemini',
        model: 'omni-1',
        latencyMs: Number.NaN,
        outputSeconds: Number.POSITIVE_INFINITY,
        estimatedCredits: Number.NaN,
        actualCredits: 5,
        retryCount: -3,
      },
      { logger: log },
    );

    const { ctx } = log.calls[0];
    expect(ctx.latencyMs).toBe(0);
    expect(ctx.outputSeconds).toBe(0);
    expect(ctx.estimatedCredits).toBe(0);
    expect(ctx.actualCredits).toBe(5);
    expect(ctx.retryCount).toBe(0);
  });
});

describe('no secret / URL leakage in emitted events (Req 22.4)', () => {
  it('scrubs a signed media URL passed in lifecycle details', () => {
    const log = makeCapturingLogger();
    const signature = 'deadbeefcafedeadbeefcafe0123456789';

    emitLifecycleEvent(
      'source_ingested',
      {
        projectId: 'proj-1',
        details: {
          mediaUrl: `https://cdn.example.com/v/clip.mp4?X-Amz-Signature=${signature}&X-Amz-Credential=DUMMYAWSAKCESSKEY123/us-east-1&w=100`,
        },
      },
      { logger: log },
    );

    const { ctx } = log.calls[0];
    expect(leaks(ctx, signature)).toBe(false);
    // The harmless, non-signing param is preserved (only the credential is scrubbed).
    expect(ctx.mediaUrl).toContain('clip.mp4');
    expect(ctx.mediaUrl).toContain('[REDACTED]');
  });

  it('scrubs bearer tokens and provider key shapes embedded in a failure reason', () => {
    const log = makeCapturingLogger();
    const token = 'sk-abc123SECRETtoken4567890abcdef';

    emitProviderCallFailed(
      {
        provider: 'gemini',
        model: 'omni-1',
        latencyMs: 100,
        retryCount: 0,
        reason: `auth rejected: Authorization: Bearer ${token}`,
      },
      { logger: log },
    );

    const { ctx } = log.calls[0];
    expect(leaks(ctx, token)).toBe(false);
    expect(ctx.reason).toContain('[REDACTED]');
  });

  it('replaces the value of any secret-looking identity/detail key wholesale', () => {
    const log = makeCapturingLogger();
    const secretValue = 'supersecretvalue-should-never-appear';

    emitLifecycleEvent(
      'edit_submitted',
      {
        projectId: 'proj-1',
        details: { authToken: secretValue, apiKey: secretValue, note: 'ok' },
      },
      { logger: log },
    );

    const { ctx } = log.calls[0];
    expect(leaks(ctx, secretValue)).toBe(false);
    expect(ctx.authToken).toBe('[REDACTED]');
    expect(ctx.apiKey).toBe('[REDACTED]');
    expect(ctx.note).toBe('ok');
  });
});

describe('logging never aborts the in-progress operation (Req 22.6)', () => {
  it('swallows a logger transport fault instead of throwing', () => {
    const throwingLogger = {
      info: () => {
        throw new Error('transport down');
      },
      warn: () => {
        throw new Error('transport down');
      },
    };

    expect(() =>
      emitLifecycleEvent('job_completed', { jobId: 'j' }, { logger: throwingLogger }),
    ).not.toThrow();
    expect(() =>
      emitProviderCallCompleted(
        { provider: 'p', model: 'm', latencyMs: 1, outputSeconds: 1, estimatedCredits: 1, actualCredits: 1, retryCount: 0 },
        { logger: throwingLogger },
      ),
    ).not.toThrow();
    expect(() =>
      emitProviderCallFailed(
        { provider: 'p', model: 'm', latencyMs: 1, retryCount: 0, reason: 'x' },
        { logger: throwingLogger },
      ),
    ).not.toThrow();
  });
});

// ===========================================================================
// 2. Admin video AI-usage analytics aggregation (Req 22.5)
// ===========================================================================

describe('computeVideoJobRates (Req 22.5 rate arithmetic)', () => {
  it('computes success / retry / QC-failure rates from raw counts', () => {
    const counts: VideoJobCounts = {
      total: 10,
      completed: 6,
      failed: 2,
      cancelled: 1,
      retried: 3,
      reachedQc: 6,
      qcFailed: 2,
    };
    const rates = computeVideoJobRates(counts);
    expect(rates.successRate).toBe(0.667); // 6 / (6+2+1)
    expect(rates.retryRate).toBe(0.3); // 3 / 10
    expect(rates.qcFailureRate).toBe(0.333); // 2 / 6
  });

  it('returns 0 (never NaN) for undefined rates with a zero denominator', () => {
    const rates = computeVideoJobRates({
      total: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
      retried: 0,
      reachedQc: 0,
      qcFailed: 0,
    });
    expect(rates.successRate).toBe(0);
    expect(rates.retryRate).toBe(0);
    expect(rates.qcFailureRate).toBe(0);
  });
});

describe('videoUsageAnalytics aggregation (Req 22.5)', () => {
  /** Seed a realistic, mixed dataset spanning inside and outside the window. */
  function seed() {
    // ── Edit operations (only completed, in-window, of the right type count) ──
    h.stores.operations.push(
      { type: 'deterministic', status: 'completed', createdAt: IN },
      { type: 'deterministic', status: 'completed', createdAt: IN },
      { type: 'deterministic', status: 'completed', createdAt: IN },
      { type: 'deterministic', status: 'completed', createdAt: BEFORE }, // out of window
      { type: 'deterministic', status: 'failed', createdAt: IN }, // not completed
      { type: 'generative', status: 'completed', createdAt: IN },
      { type: 'generative', status: 'completed', createdAt: IN },
      { type: 'generative', status: 'completed', createdAt: AT_END }, // == exclusive end
      { type: 'render', status: 'completed', createdAt: IN }, // wrong type
    );

    // ── Provider generation calls on the existing AIUsageEvent collection ──
    h.stores.usage.push(
      { feature: 'video.generation', createdAt: IN },
      { feature: 'video.generation', createdAt: IN },
      { feature: 'video.generation', createdAt: IN },
      { feature: 'video.generation', createdAt: IN },
      { feature: 'video.generation', createdAt: BEFORE }, // out of window
      { feature: 'veegpt.chat', createdAt: IN }, // wrong feature
    );

    // ── Provider spend from the credit ledger (only settled, in-window) ──
    h.stores.credits.push(
      { feature: 'videoGenerativeEdit', status: 'settled', credits: 10, providerCostInr: 0.5, createdAt: IN },
      { feature: 'videoGenerativeEdit', status: 'settled', credits: 5, providerCostInr: 0.25, createdAt: IN },
      { feature: 'videoGenerativeEdit', status: 'pending', credits: 100, providerCostInr: 9, createdAt: IN }, // not settled
      { feature: 'videoGenerativeEdit', status: 'settled', credits: 50, providerCostInr: 3, createdAt: BEFORE }, // out of window
      { feature: 'chatCompletion', status: 'settled', credits: 7, providerCostInr: 0.7, createdAt: IN }, // wrong feature
    );

    // ── Jobs (window filter only on createdAt) ──
    const QC = 'QUALITY_CHECK';
    h.stores.jobs.push(
      { state: 'COMPLETED', attempt: 1, completedStages: [QC], createdAt: IN },
      { state: 'COMPLETED', attempt: 1, completedStages: [QC], createdAt: IN },
      { state: 'COMPLETED', attempt: 2, completedStages: [QC], createdAt: IN }, // retried
      { state: 'COMPLETED', attempt: 1, completedStages: [QC], createdAt: IN },
      { state: 'COMPLETED', attempt: 1, completedStages: [], createdAt: IN },
      { state: 'COMPLETED', attempt: 2, completedStages: [], createdAt: IN }, // retried
      { state: 'FAILED', attempt: 2, errorCode: QC_FAILURE_ERROR_CODE, createdAt: IN }, // retried, QC failed
      { state: 'FAILED', attempt: 1, errorCode: QC_FAILURE_ERROR_CODE, createdAt: IN }, // QC failed
      { state: 'CANCELLED', attempt: 1, createdAt: IN },
      { state: 'RUNNING', attempt: 1, createdAt: IN }, // non-terminal
      { state: 'COMPLETED', attempt: 1, completedStages: [QC], createdAt: BEFORE }, // out of window
    );
  }

  it('rolls up counts, spend, and rates exactly per Req 22.5', async () => {
    seed();
    const log = makeCapturingLogger();

    const result = await videoUsageAnalytics(WINDOW, { logger: log });

    // Window echoed back as ISO strings.
    expect(result.window).toEqual({ from: WINDOW.from.toISOString(), to: WINDOW.to.toISOString() });

    // Edit / generation counts.
    expect(result.editCount).toBe(3);
    expect(result.generativeEditCount).toBe(2);
    expect(result.providerGenerationCalls).toBe(4);

    // Provider spend: only settled, in-window, right-feature charges.
    expect(result.providerSpendCredits).toBe(15);
    expect(result.providerSpendInr).toBe(0.75);

    // Raw job counters.
    expect(result.jobs).toEqual({
      total: 10,
      completed: 6,
      failed: 2,
      cancelled: 1,
      retried: 3,
      reachedQc: 6,
      qcFailed: 2,
    });

    // Derived rates.
    expect(result.successRate).toBe(0.667); // 6 / 9 terminated
    expect(result.retryRate).toBe(0.3); // 3 / 10
    expect(result.qcFailureRate).toBe(0.333); // 2 / 6 reached QC
  });

  it('returns a well-formed all-zero rollup for a window with no activity', async () => {
    const log = makeCapturingLogger();

    const result = await videoUsageAnalytics(WINDOW, { logger: log });

    expect(result.editCount).toBe(0);
    expect(result.generativeEditCount).toBe(0);
    expect(result.providerGenerationCalls).toBe(0);
    expect(result.providerSpendCredits).toBe(0);
    expect(result.providerSpendInr).toBe(0);
    expect(result.jobs).toEqual({
      total: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
      retried: 0,
      reachedQc: 0,
      qcFailed: 0,
    });
    expect(result.successRate).toBe(0);
    expect(result.retryRate).toBe(0);
    expect(result.qcFailureRate).toBe(0);
  });

  it('degrades a failing breakdown to zeros without blanking the whole rollup', async () => {
    seed();
    const log = makeCapturingLogger();

    // Simulate the job aggregation failing (e.g. a transient DB error).
    const spy = vi.spyOn(h.jobModel, 'aggregate').mockRejectedValueOnce(new Error('db down'));

    const result = await videoUsageAnalytics(WINDOW, { logger: log });

    // The failed breakdown is zeroed…
    expect(result.jobs).toEqual({
      total: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
      retried: 0,
      reachedQc: 0,
      qcFailed: 0,
    });
    expect(result.successRate).toBe(0);
    // …but every other breakdown is still computed.
    expect(result.editCount).toBe(3);
    expect(result.generativeEditCount).toBe(2);
    expect(result.providerGenerationCalls).toBe(4);
    expect(result.providerSpendCredits).toBe(15);
    // The failure was logged, not thrown.
    expect(log.calls.some((c) => c.level === 'warn')).toBe(true);

    spy.mockRestore();
  });
});
