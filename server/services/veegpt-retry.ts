/**
 * Bounded, provider-aware retries for AI calls (spec §37).
 *
 * WHY THIS MODULE EXISTS
 * A retry is the easiest way to turn one expensive request into several. The
 * specification is explicit: "Never blindly retry expensive AI requests
 * indefinitely… Each retry must be economically accounted for."
 *
 * Two rules shape everything here:
 *
 *  1. RETRY ONLY WHAT CAN SUCCEED. A 429 or a 503 is worth another attempt; a
 *     400 "invalid request" or a 401 will fail identically forever, and retrying
 *     it just multiplies the bill for a guaranteed failure. Classification is
 *     therefore explicit, not "retry on any error".
 *
 *  2. RETRIES SHARE ONE RESERVATION. `withVGU` wraps the whole retry loop, so
 *     every attempt's tokens land in the SAME metered context and are reconciled
 *     together, and every attempt counts against the same provider-call ceiling.
 *     Retrying inside its own reservation would let a request charge N times for
 *     one logical operation, and would let N attempts each consume a concurrency
 *     slot.
 *
 * The retry count comes from the feature's own spec, so deep research (1 retry)
 * and a caption (2) are governed by the same registry as their cost ceilings.
 */

import { featureSpec } from '../config/veegpt-vgu.config';
import { currentAbortSignal } from './aiUsageTracker';
import logger from '../config/logger';

/** Why an attempt failed, which decides whether another one is worthwhile. */
export type FailureKind =
  /** Provider asked us to slow down. Retry — this is the case retries exist for. */
  | 'rate_limit'
  /** Provider-side fault (5xx). Retry; a different instance may succeed. */
  | 'server_error'
  /** Network or socket failure with no response. Retry. */
  | 'connection'
  /** Request-level timeout. Retry once, cautiously — it may have been partial. */
  | 'timeout'
  /** Our request is wrong (4xx). NEVER retry: it will fail identically. */
  | 'client_error'
  /** Content policy refusal. NEVER retry: the same prompt is refused again. */
  | 'content_policy'
  /** Quota/budget refusal from our own engine. NEVER retry: it is deliberate. */
  | 'quota'
  /** Deliberately aborted (client disconnect, wall-clock budget). NEVER retry. */
  | 'aborted'
  /** Anything unrecognised. NOT retried — unknown failures are not free. */
  | 'unknown';

const RETRYABLE: ReadonlySet<FailureKind> = new Set<FailureKind>([
  'rate_limit',
  'server_error',
  'connection',
  'timeout',
]);

/** Whether another attempt could plausibly succeed. */
export function isRetryable(kind: FailureKind): boolean {
  return RETRYABLE.has(kind);
}

interface ErrorShape {
  status?: number;
  statusCode?: number;
  code?: string;
  name?: string;
  message?: string;
  type?: string;
  response?: { status?: number };
  cause?: { code?: string };
}

/**
 * Classify a provider error.
 *
 * Deliberately reads only stable, structured fields (status, code, name) before
 * falling back to message matching, because message text changes between SDK
 * versions and a misclassified 4xx becomes a retry loop that pays for nothing.
 */
export function classifyFailure(err: unknown): FailureKind {
  const e = (err ?? {}) as ErrorShape;

  // Our own refusals are decisions, not failures.
  if (e.name === 'VGUQuotaError' || e.code === 'ABUSE_DETECTED') return 'quota';
  if (e.code === 'PROVIDER_CALL_BUDGET_EXCEEDED') return 'quota';
  if (e.name === 'AbortError' || e.code === 'ABORT_ERR') return 'aborted';
  if (e.code === 'AI_TIMEOUT') return 'timeout';

  const status = e.status ?? e.statusCode ?? e.response?.status;
  if (typeof status === 'number') {
    if (status === 429) return 'rate_limit';
    if (status === 408 || status === 504) return 'timeout';
    if (status >= 500) return 'server_error';
    // 403 can be a content refusal, but it is a 4xx either way: not retryable.
    if (status >= 400) return 'client_error';
  }

  const netCodes = new Set([
    'ECONNRESET',
    'ECONNREFUSED',
    'EPIPE',
    'ENOTFOUND',
    'EAI_AGAIN',
    'ERR_STREAM_PREMATURE_CLOSE',
    'UND_ERR_SOCKET',
  ]);
  const code = e.code || e.cause?.code;
  if (code && netCodes.has(code)) return 'connection';
  if (code === 'ETIMEDOUT' || code === 'ESOCKETTIMEDOUT') return 'timeout';

  const type = String(e.type || '');
  if (type === 'insufficient_quota' || e.code === 'insufficient_quota') {
    // Our provider account is out of credit. Retrying cannot fix that.
    return 'client_error';
  }

  const msg = String(e.message || '').toLowerCase();
  if (/content[_ ]policy|safety|blocked by/.test(msg)) return 'content_policy';
  if (/rate limit|too many requests/.test(msg)) return 'rate_limit';
  if (/timeout|timed out/.test(msg)) return 'timeout';
  if (/socket hang up|network|econn/.test(msg)) return 'connection';

  return 'unknown';
}

export interface RetryOptions {
  /** Feature label — supplies the retry ceiling from the registry. */
  feature: string;
  /** Overrides the feature's ceiling. Clamped to it; can only lower it. */
  maxRetries?: number;
  /** First backoff step in ms. Doubles each attempt. */
  baseDelayMs?: number;
  /** Upper bound on any single backoff wait. */
  maxDelayMs?: number;
  /** Called before each wait, for logging/metrics. */
  onRetry?: (info: {
    attempt: number;
    kind: FailureKind;
    delayMs: number;
    err: unknown;
  }) => void;
}

const DEFAULT_BASE_DELAY_MS = 500;
const DEFAULT_MAX_DELAY_MS = 8_000;

/** Honour a provider's own Retry-After when it gives one. */
function providerRetryAfterMs(err: unknown): number | undefined {
  const e = (err ?? {}) as {
    headers?: Record<string, string> | { get?: (k: string) => string | null };
    response?: { headers?: { get?: (k: string) => string | null } };
  };
  const read = (k: string): string | undefined => {
    const h = e.headers;
    if (h && typeof (h as { get?: unknown }).get === 'function') {
      return (h as { get: (x: string) => string | null }).get(k) ?? undefined;
    }
    if (h && typeof h === 'object') {
      return (h as Record<string, string>)[k];
    }
    const rh = e.response?.headers;
    if (rh && typeof rh.get === 'function') return rh.get(k) ?? undefined;
    return undefined;
  };
  const raw = read('retry-after') ?? read('Retry-After');
  if (!raw) return undefined;
  const secs = Number(raw);
  if (Number.isFinite(secs) && secs >= 0) return Math.min(secs * 1000, 60_000);
  const at = Date.parse(raw);
  if (Number.isFinite(at)) return Math.max(0, Math.min(at - Date.now(), 60_000));
  return undefined;
}

/**
 * Exponential backoff with full jitter.
 *
 * Jitter matters more than the exponent here: without it, every request that hit
 * the same provider rate limit retries at the same instant and gets rate-limited
 * again together.
 */
export function backoffDelayMs(
  attempt: number,
  baseMs = DEFAULT_BASE_DELAY_MS,
  maxMs = DEFAULT_MAX_DELAY_MS
): number {
  const ceiling = Math.min(maxMs, baseMs * 2 ** attempt);
  return Math.floor(ceiling / 2 + Math.random() * (ceiling / 2));
}

/** Sleep that gives up early if the operation is aborted. */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise(resolve => {
    const timer = setTimeout(done, ms);
    timer.unref?.();
    function done(): void {
      clearTimeout(timer);
      signal?.removeEventListener('abort', done);
      resolve();
    }
    signal?.addEventListener('abort', done, { once: true });
  });
}

export interface RetryOutcome {
  /** Total attempts made, including the first. */
  attempts: number;
  /** Classification of each failure, oldest first. */
  failures: FailureKind[];
}

/**
 * Run `fn`, retrying only failures that could plausibly succeed, at most as many
 * times as the feature's spec allows.
 *
 * MUST be called INSIDE a `withVGU` scope. Every attempt's tokens then land in
 * one reservation and count against one provider-call ceiling, which is what
 * makes each retry economically accounted for rather than a new free request.
 *
 * @throws the LAST error when every attempt fails, or immediately for a failure
 *         that is not retryable.
 */
export async function withProviderRetry<T>(
  opts: RetryOptions,
  fn: (attempt: number) => Promise<T>
): Promise<{ result: T; retry: RetryOutcome }> {
  const spec = featureSpec(opts.feature);
  // The registry is the ceiling; a caller may ask for fewer retries, never more.
  const specMax = spec.maxRetries ?? 0;
  const max = Math.max(
    0,
    Math.min(specMax, opts.maxRetries ?? specMax)
  );
  const failures: FailureKind[] = [];
  let attempt = 0;

  for (;;) {
    // A wall-clock budget that has already elapsed must not start another
    // attempt, however many retries remain.
    const signal = currentAbortSignal();
    if (signal?.aborted && attempt > 0) {
      const err = new Error('AI operation aborted before retry');
      err.name = 'AbortError';
      throw err;
    }

    try {
      const result = await fn(attempt);
      return { result, retry: { attempts: attempt + 1, failures } };
    } catch (err) {
      const kind = classifyFailure(err);
      failures.push(kind);

      const exhausted = attempt >= max;
      if (!isRetryable(kind) || exhausted) {
        if (attempt > 0 || isRetryable(kind)) {
          logger.warn('vgu-retry: giving up', {
            feature: opts.feature,
            attempts: attempt + 1,
            maxRetries: max,
            reason: !isRetryable(kind) ? `not retryable (${kind})` : 'retries exhausted',
            failures,
            module: 'veegpt-retry',
          });
        }
        throw err;
      }

      // A provider that told us when to come back knows better than our curve.
      const delayMs =
        providerRetryAfterMs(err) ??
        backoffDelayMs(attempt, opts.baseDelayMs, opts.maxDelayMs);

      opts.onRetry?.({ attempt: attempt + 1, kind, delayMs, err });
      logger.info('vgu-retry: retrying', {
        feature: opts.feature,
        attempt: attempt + 1,
        maxRetries: max,
        kind,
        delayMs,
        module: 'veegpt-retry',
      });

      await sleep(delayMs, signal);
      attempt++;
    }
  }
}
