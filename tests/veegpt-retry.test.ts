/**
 * Retry, timeout and fan-out policy tests (Block 7, spec §35–§37).
 *
 * Pure logic — no Redis, no Mongo, no network — so these run on every commit.
 * They pin down the decisions that keep a retry from becoming a second bill:
 *
 *  • only failures that CAN succeed are retried;
 *  • the retry count comes from the feature registry and a caller can only lower
 *    it;
 *  • backoff grows and is jittered;
 *  • every expensive feature has a wall-clock budget and a provider-call ceiling.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  backoffDelayMs,
  classifyFailure,
  isRetryable,
  withProviderRetry,
  type FailureKind,
} from '../server/services/veegpt-retry';
import {
  AUTOMATION_INTENT_FEATURE,
  DEEP_RESEARCH_FEATURE,
  AUTOPILOT_FEATURE,
  LANDING_DEMO_FEATURE,
  featureSpec,
} from '../server/config/veegpt-vgu.config';

/** Build an error shaped like a real provider failure. */
const httpErr = (status: number, message = 'boom') =>
  Object.assign(new Error(message), { status });
const codeErr = (code: string, message = 'boom') =>
  Object.assign(new Error(message), { code });

describe('failure classification is provider-aware', () => {
  it('treats provider-side and transport faults as retryable', () => {
    const retryable: Array<[unknown, FailureKind]> = [
      [httpErr(429), 'rate_limit'],
      [httpErr(500), 'server_error'],
      [httpErr(502), 'server_error'],
      [httpErr(503), 'server_error'],
      [httpErr(408), 'timeout'],
      [httpErr(504), 'timeout'],
      [codeErr('ECONNRESET'), 'connection'],
      [codeErr('ECONNREFUSED'), 'connection'],
      [codeErr('EPIPE'), 'connection'],
      [codeErr('ETIMEDOUT'), 'timeout'],
    ];
    for (const [err, kind] of retryable) {
      expect(classifyFailure(err)).toBe(kind);
      expect(isRetryable(classifyFailure(err))).toBe(true);
    }
  });

  it('never retries a request that will fail identically', () => {
    // Retrying a 4xx pays the provider for a guaranteed failure.
    const never: Array<[unknown, FailureKind]> = [
      [httpErr(400), 'client_error'],
      [httpErr(401), 'client_error'],
      [httpErr(403), 'client_error'],
      [httpErr(404), 'client_error'],
      [httpErr(422), 'client_error'],
      [new Error('Request blocked by content_policy'), 'content_policy'],
      [Object.assign(new Error('x'), { name: 'VGUQuotaError' }), 'quota'],
      [codeErr('PROVIDER_CALL_BUDGET_EXCEEDED'), 'quota'],
      [codeErr('ABUSE_DETECTED'), 'quota'],
      [Object.assign(new Error('x'), { name: 'AbortError' }), 'aborted'],
      [new Error('completely unrecognised'), 'unknown'],
    ];
    for (const [err, kind] of never) {
      expect(classifyFailure(err)).toBe(kind);
      expect(isRetryable(classifyFailure(err))).toBe(false);
    }
  });

  it('does not retry an exhausted provider account', () => {
    // `insufficient_quota` means OUR billing is empty. Retrying cannot fix it and
    // every attempt is another failed request.
    expect(isRetryable(classifyFailure({ type: 'insufficient_quota' }))).toBe(false);
  });

  it('reads structured fields before message text', () => {
    // A 400 whose message happens to mention "rate limit" must stay a 4xx: message
    // text changes between SDK versions, status codes do not.
    expect(classifyFailure(httpErr(400, 'rate limit style wording'))).toBe('client_error');
  });

  it('reads a nested response status', () => {
    expect(classifyFailure({ response: { status: 429 } })).toBe('rate_limit');
  });

  it('classifies a bare unknown value without throwing', () => {
    expect(classifyFailure(undefined)).toBe('unknown');
    expect(classifyFailure(null)).toBe('unknown');
    expect(classifyFailure('a string')).toBe('unknown');
  });
});

describe('backoff', () => {
  it('grows exponentially and stays inside its window', () => {
    const base = 100;
    const max = 10_000;
    for (let attempt = 0; attempt < 8; attempt++) {
      const ceiling = Math.min(max, base * 2 ** attempt);
      for (let i = 0; i < 25; i++) {
        const d = backoffDelayMs(attempt, base, max);
        expect(d).toBeGreaterThanOrEqual(ceiling / 2);
        expect(d).toBeLessThanOrEqual(ceiling);
      }
    }
  });

  it('is jittered', () => {
    // Without jitter every client that hit the same rate limit retries in lockstep
    // and is rate-limited again together.
    const seen = new Set(Array.from({ length: 50 }, () => backoffDelayMs(4, 100, 10_000)));
    expect(seen.size).toBeGreaterThan(1);
  });

  it('is capped', () => {
    expect(backoffDelayMs(40, 100, 5_000)).toBeLessThanOrEqual(5_000);
  });
});

describe('retries are bounded by the feature registry', () => {
  it('makes exactly maxRetries extra attempts', async () => {
    const spec = featureSpec('social_listening.extract');
    expect(spec.maxRetries).toBe(2);
    const fn = vi.fn(async () => {
      throw httpErr(503);
    });
    await expect(
      withProviderRetry({ feature: 'social_listening.extract', baseDelayMs: 1 }, fn)
    ).rejects.toBeTruthy();
    expect(fn).toHaveBeenCalledTimes(3); // 1 attempt + 2 retries
  });

  it('lets a caller lower the ceiling but never raise it', async () => {
    const lower = vi.fn(async () => {
      throw httpErr(503);
    });
    await expect(
      withProviderRetry(
        { feature: 'social_listening.extract', maxRetries: 0, baseDelayMs: 1 },
        lower
      )
    ).rejects.toBeTruthy();
    expect(lower).toHaveBeenCalledTimes(1);

    const higher = vi.fn(async () => {
      throw httpErr(503);
    });
    await expect(
      withProviderRetry(
        { feature: 'social_listening.extract', maxRetries: 999, baseDelayMs: 1 },
        higher
      )
    ).rejects.toBeTruthy();
    expect(higher).toHaveBeenCalledTimes(3);
  });

  it('does not retry at all for a non-retryable failure', async () => {
    const fn = vi.fn(async () => {
      throw httpErr(400);
    });
    await expect(
      withProviderRetry({ feature: 'social_listening.extract', baseDelayMs: 1 }, fn)
    ).rejects.toBeTruthy();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('returns the result and the attempt history on eventual success', async () => {
    let n = 0;
    const { result, retry } = await withProviderRetry(
      { feature: 'social_listening.extract', baseDelayMs: 1 },
      async () => {
        n++;
        if (n < 3) throw httpErr(429);
        return 'ok';
      }
    );
    expect(result).toBe('ok');
    expect(retry.attempts).toBe(3);
    expect(retry.failures).toEqual(['rate_limit', 'rate_limit']);
  });

  it('reports a single attempt when nothing failed', async () => {
    const { retry } = await withProviderRetry(
      { feature: 'social_listening.extract' },
      async () => 'fine'
    );
    expect(retry.attempts).toBe(1);
    expect(retry.failures).toEqual([]);
  });

  it('passes the attempt index to the callback', async () => {
    const seen: number[] = [];
    await withProviderRetry(
      { feature: 'social_listening.extract', baseDelayMs: 1 },
      async attempt => {
        seen.push(attempt);
        if (attempt < 2) throw httpErr(503);
        return 'done';
      }
    );
    expect(seen).toEqual([0, 1, 2]);
  });

  it('honours a provider Retry-After over its own curve', async () => {
    const onRetry = vi.fn();
    let n = 0;
    await withProviderRetry(
      { feature: 'social_listening.extract', baseDelayMs: 1, onRetry },
      async () => {
        n++;
        if (n === 1) {
          throw Object.assign(new Error('slow down'), {
            status: 429,
            headers: { 'retry-after': '0' },
          });
        }
        return 'ok';
      }
    );
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry.mock.calls[0][0].delayMs).toBe(0);
    expect(onRetry.mock.calls[0][0].kind).toBe('rate_limit');
  });
});

describe('every expensive feature is bounded in time and fan-out (§37)', () => {
  /** Features whose cost is dominated by fan-out rather than one call. */
  const EXPENSIVE = [
    DEEP_RESEARCH_FEATURE,
    AUTOPILOT_FEATURE,
    AUTOMATION_INTENT_FEATURE,
    LANDING_DEMO_FEATURE,
    'veegpt.chat',
    'trend.intelligence',
    'competitor.analysis',
    'image.generation',
    'video.generation',
    'social_listening.extract',
  ];

  it('gives each one a wall-clock budget', () => {
    for (const f of EXPENSIVE) {
      const spec = featureSpec(f);
      expect(spec.timeoutMs, `${f} has no timeout`).toBeGreaterThan(0);
    }
  });

  it('gives each one a provider-call ceiling', () => {
    // A per-request VGU cap bounds the CHARGE; only this bounds the CALLS, which
    // is what a runaway loop actually consumes.
    for (const f of EXPENSIVE) {
      const spec = featureSpec(f);
      expect(spec.maxProviderCalls, `${f} has no call ceiling`).toBeGreaterThan(0);
    }
  });

  it('bounds retries everywhere, including the default', () => {
    // An unset retry count must never be readable as "unlimited".
    expect(featureSpec('__not_a_feature__').maxRetries).toBeGreaterThanOrEqual(0);
    expect(featureSpec('__not_a_feature__').maxRetries).toBeLessThanOrEqual(2);
    for (const f of EXPENSIVE) {
      const spec = featureSpec(f);
      expect(spec.maxRetries, `${f} retries`).toBeGreaterThanOrEqual(0);
      expect(spec.maxRetries, `${f} retries are unbounded`).toBeLessThanOrEqual(3);
    }
  });

  it('keeps deep research the most tightly retried expensive feature', () => {
    // It is the single largest cost per job, so it gets the fewest second chances.
    expect(featureSpec(DEEP_RESEARCH_FEATURE).maxRetries).toBe(1);
    expect(featureSpec(DEEP_RESEARCH_FEATURE).maxProviderCalls).toBe(25);
    expect(featureSpec(DEEP_RESEARCH_FEATURE).maxVGUPerRequest).toBe(800);
  });
});
