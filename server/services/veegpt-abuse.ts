/**
 * Abuse detection for AI usage (spec §32).
 *
 * WHAT THIS IS FOR
 * The VGU engine already bounds what a user can SPEND. It does not tell you when
 * a user is behaving like a script rather than a person. Those are different
 * problems: an attacker who buys a Pro plan and drives it flat out 24/7 is inside
 * their quota and still a problem — for provider rate limits, for capacity shared
 * with real users, and for the account-sharing case where one seat serves a whole
 * agency.
 *
 * THE RULE THAT SHAPES THE DESIGN
 * Spec §32: "Do not automatically punish users from one signal. Use a combination
 * of signals."
 *
 * A single signal is always ambiguous. A power user sends many requests. A
 * developer testing a prompt sends the same request repeatedly. A long document
 * legitimately produces a huge context. Acting on any one of those would punish
 * exactly the customers worth keeping. So:
 *
 *   • each signal contributes a WEIGHT, never a verdict;
 *   • an action requires BOTH a score threshold AND at least
 *     MIN_DISTINCT_SIGNALS independent signals firing;
 *   • the response ESCALATES (observe → throttle → restrict → block) rather than
 *     jumping to a ban;
 *   • everything is recorded so a human can review why.
 *
 * SIGNALS (all eight from the spec)
 *   frequency        request rate far above the plan's normal envelope
 *   duplicate        the same prompt repeated
 *   failures         an abnormal share of requests failing
 *   context          abnormally large prompts
 *   premium          abnormal share of expensive-tier usage
 *   concurrency      repeatedly saturating the concurrency limit
 *   automation       machine-regular inter-arrival timing
 *   account          high volume from a very new account
 *
 * FAILURE POLICY
 * Detection failures FAIL OPEN. If Redis is unavailable, abuse scoring degrades
 * to "no signal" — it must never block a paying customer on its own, and it
 * cannot become a spending hole because the VGU engine still gates cost.
 */

import { getRedisClient } from '../lib/redis';
import type { PlanId } from '../config/plan-config';
import { policyForPlan } from '../config/veegpt-vgu.config';
import type { ModelTier } from '@shared/veegpt-model-tiers';
import logger from '../config/logger';
import { createHash } from 'node:crypto';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** How long behavioural counters are retained. One hour of history. */
const WINDOW_SEC = 3600;

/** Signal weights. Tuned so no single signal can reach the ACTION threshold. */
export const SIGNAL_WEIGHT = {
  frequency: 25,
  duplicate: 20,
  failures: 20,
  context: 15,
  premium: 15,
  concurrency: 20,
  automation: 30,
  account: 15,
} as const;

export type SignalName = keyof typeof SIGNAL_WEIGHT;

/**
 * Score thresholds. `automation` (30) is the heaviest single signal and sits well
 * below THROTTLE (45), so no lone signal can trigger an action — the
 * "never punish on one signal" rule is enforced by arithmetic, not by discipline,
 * and a test asserts it.
 */
export const ABUSE_THRESHOLD = {
  /** Recorded only. Nothing changes for the user. */
  observe: 25,
  /** Concurrency and request rate are tightened. */
  throttle: 45,
  /** Expensive tiers are refused; cheap models still work. */
  restrict: 70,
  /** AI is refused entirely pending review. */
  block: 100,
} as const;

/**
 * An action needs at least this many DISTINCT signals, whatever the score. This
 * is the structural guarantee behind §32: one very strong signal is still one
 * signal.
 */
export const MIN_DISTINCT_SIGNALS = 2;

export type AbuseAction = 'allow' | 'observe' | 'throttle' | 'restrict' | 'block';

function envInt(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/** Detection can be switched off entirely without a deploy. */
export function abuseDetectionEnabled(): boolean {
  return (process.env.VGU_ABUSE_DETECTION || 'on').toLowerCase() !== 'off';
}

/**
 * When false (the default), a computed action is RECORDED but not applied.
 * Abuse heuristics need real traffic to calibrate; shipping them in enforcing
 * mode on day one risks refusing legitimate customers on untuned thresholds.
 */
export function abuseEnforcementEnabled(): boolean {
  return (process.env.VGU_ABUSE_ENFORCE || 'off').toLowerCase() === 'on';
}

// ---------------------------------------------------------------------------
// Keys
// ---------------------------------------------------------------------------

const AK = {
  /** HASH of rolling counters for a user. */
  stats: (u: string) => `vgu:abuse:${u}`,
  /** ZSET score=ms — request arrival times, for rate and cadence analysis. */
  arrivals: (u: string) => `vgu:abuse:arr:${u}`,
  /** HASH promptHash → count, for duplicate detection. */
  prompts: (u: string) => `vgu:abuse:dup:${u}`,
  /** STRING — the last computed assessment, for the admin view. */
  verdict: (u: string) => `vgu:abuse:verdict:${u}`,
};

export const ABUSE_KEYS = AK;

// ---------------------------------------------------------------------------
// Recording
// ---------------------------------------------------------------------------

export interface AbuseObservation {
  userId: string;
  /** Model tier the request ran on. */
  tier: ModelTier;
  /** Prompt size in characters, when known. */
  promptChars?: number;
  /** Stable hash source for duplicate detection (usually the prompt text). */
  promptText?: string;
  /** True when the request failed. */
  failed?: boolean;
  /** True when the request was refused for hitting a concurrency limit. */
  concurrencyBlocked?: boolean;
  /** Client user-agent, when available. */
  userAgent?: string;
}

/** A short, non-reversible fingerprint of a prompt. Never stores the prompt. */
function promptFingerprint(text: string): string {
  return createHash('sha256').update(text.trim().toLowerCase()).digest('hex').slice(0, 16);
}

/**
 * Record one AI request's behavioural fingerprint. Cheap (one pipeline) and
 * never throws — observation must not be able to fail a user's request.
 */
export async function recordAbuseObservation(
  obs: AbuseObservation
): Promise<void> {
  if (!abuseDetectionEnabled() || !obs.userId) return;
  try {
    const redis = getRedisClient();
    const now = Date.now();
    const pipe = redis.pipeline();
    const stats = AK.stats(obs.userId);

    pipe.hincrby(stats, 'requests', 1);
    if (obs.failed) pipe.hincrby(stats, 'failures', 1);
    if (obs.concurrencyBlocked) pipe.hincrby(stats, 'concBlocks', 1);
    if (obs.tier === 'premium' || obs.tier === 'ultra') {
      pipe.hincrby(stats, 'premium', 1);
    }
    if (Number.isFinite(obs.promptChars) && (obs.promptChars as number) > 0) {
      pipe.hincrby(stats, 'charsTotal', Math.round(obs.promptChars as number));
      pipe.hincrby(stats, 'charsCount', 1);
    }
    // Missing user-agent is weak evidence of a non-browser client on its own,
    // which is exactly why it only contributes to a signal rather than being one.
    if (!obs.userAgent) pipe.hincrby(stats, 'noUserAgent', 1);
    pipe.expire(stats, WINDOW_SEC);

    pipe.zadd(AK.arrivals(obs.userId), now, `${now}:${Math.random().toString(36).slice(2, 8)}`);
    pipe.zremrangebyscore(AK.arrivals(obs.userId), '-inf', now - WINDOW_SEC * 1000);
    pipe.expire(AK.arrivals(obs.userId), WINDOW_SEC);

    if (obs.promptText && obs.promptText.trim().length >= 8) {
      pipe.hincrby(AK.prompts(obs.userId), promptFingerprint(obs.promptText), 1);
      pipe.expire(AK.prompts(obs.userId), WINDOW_SEC);
    }

    // A running MAXIMUM, so one enormous prompt stays visible even when the mean
    // is unremarkable — which is exactly the shape of a context-stuffing attack.
    // Done in one atomic script rather than read-then-write, so concurrent
    // requests cannot lose the larger value to a race.
    if (Number.isFinite(obs.promptChars) && (obs.promptChars as number) > 0) {
      pipe.eval(
        `local cur = tonumber(redis.call('HGET', KEYS[1], 'charsMax')) or 0
         local v = tonumber(ARGV[1])
         if v > cur then redis.call('HSET', KEYS[1], 'charsMax', v) end
         return 1`,
        1,
        stats,
        String(Math.round(obs.promptChars as number))
      );
    }

    await pipe.exec();
  } catch (err) {
    logger.debug?.('vgu-abuse: observation failed (ignored)', {
      userId: obs.userId,
      err: err instanceof Error ? err.message : String(err),
      module: 'veegpt-abuse',
    });
  }
}

// ---------------------------------------------------------------------------
// Assessment
// ---------------------------------------------------------------------------

export interface AbuseSignal {
  name: SignalName;
  weight: number;
  /** Human-readable evidence, safe to show an administrator. */
  detail: string;
}

export interface AbuseAssessment {
  userId: string;
  plan: PlanId;
  score: number;
  signals: AbuseSignal[];
  /** What the score and signal count justify. */
  action: AbuseAction;
  /** What is actually applied right now (`allow`/`observe` unless enforcing). */
  effectiveAction: AbuseAction;
  /** True when Redis could not be read; the assessment is not meaningful. */
  degraded: boolean;
  observedRequests: number;
}

/** Map a score + signal count onto an action, honouring the §32 rule. */
export function actionFor(score: number, distinctSignals: number): AbuseAction {
  if (score < ABUSE_THRESHOLD.observe) return 'allow';
  // Below the minimum signal count nothing escalates past observation, however
  // high the score. One signal is never enough.
  if (distinctSignals < MIN_DISTINCT_SIGNALS) return 'observe';
  if (score >= ABUSE_THRESHOLD.block) return 'block';
  if (score >= ABUSE_THRESHOLD.restrict) return 'restrict';
  if (score >= ABUSE_THRESHOLD.throttle) return 'throttle';
  return 'observe';
}

/** Coefficient of variation of consecutive gaps. Low = machine-regular. */
function cadenceRegularity(timestamps: number[]): number | null {
  if (timestamps.length < 8) return null;
  const gaps: number[] = [];
  for (let i = 1; i < timestamps.length; i++) {
    gaps.push(timestamps[i] - timestamps[i - 1]);
  }
  const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  if (mean <= 0) return 0;
  const variance =
    gaps.reduce((a, g) => a + (g - mean) ** 2, 0) / gaps.length;
  return Math.sqrt(variance) / mean;
}

/** The subset of the Redis client this module needs. */
export interface AbuseStore {
  hgetall(key: string): Promise<Record<string, string>>;
  zrangebyscore(key: string, min: number | string, max: string): Promise<string[]>;
}

export interface AssessOptions {
  /** Account age in days, when known. Used only by the `account` signal. */
  accountAgeDays?: number;
  /**
   * Store override. Exists so the fail-open path can be verified against a
   * deliberately broken store: that behaviour is a safety property, and asserting
   * it needs a way to make reads fail on demand.
   */
  store?: AbuseStore;
}

/**
 * Score a user's recent behaviour. Read-only; never throws.
 *
 * Thresholds are expressed RELATIVE to the plan's own limits rather than as
 * absolute numbers, so a Business customer is not judged by a Free user's
 * envelope.
 */
export async function assessAbuse(
  userId: string,
  plan: PlanId,
  opts: AssessOptions = {}
): Promise<AbuseAssessment> {
  const policy = policyForPlan(plan);
  const signals: AbuseSignal[] = [];
  let degraded = false;
  let requests = 0;

  if (!abuseDetectionEnabled() || !userId) {
    return {
      userId,
      plan,
      score: 0,
      signals,
      action: 'allow',
      effectiveAction: 'allow',
      degraded: false,
      observedRequests: 0,
    };
  }

  try {
    const redis: AbuseStore = opts.store ?? (getRedisClient() as AbuseStore);
    const now = Date.now();
    const [stats, arrivals, prompts] = await Promise.all([
      redis.hgetall(AK.stats(userId)),
      redis.zrangebyscore(AK.arrivals(userId), now - WINDOW_SEC * 1000, '+inf'),
      redis.hgetall(AK.prompts(userId)),
    ]);

    requests = Number(stats.requests) || 0;

    // A handful of requests tells you nothing. Refusing to score a small sample
    // is what stops a new user's first few messages looking like an attack.
    const MIN_SAMPLE = envInt('VGU_ABUSE_MIN_SAMPLE', 20);
    if (requests < MIN_SAMPLE) {
      return {
        userId,
        plan,
        score: 0,
        signals,
        action: 'allow',
        effectiveAction: 'allow',
        degraded: false,
        observedRequests: requests,
      };
    }

    // ── frequency ────────────────────────────────────────────────────────────
    // Sustained rate over the last minute against the plan's own per-minute cap.
    // The rate limiter already rejects bursts; this catches someone who sits at
    // the ceiling continuously, which the limiter permits.
    const lastMinute = arrivals.filter(
      m => Number(String(m).split(':')[0]) >= now - 60_000
    ).length;
    const rpmRatio = policy.requestsPerMinute
      ? lastMinute / policy.requestsPerMinute
      : 0;
    if (rpmRatio >= 0.9) {
      signals.push({
        name: 'frequency',
        weight: SIGNAL_WEIGHT.frequency,
        detail: `${lastMinute} requests in the last minute (${Math.round(rpmRatio * 100)}% of the plan's per-minute cap)`,
      });
    }

    // ── duplicate ────────────────────────────────────────────────────────────
    // The same prompt many times over is either a retry loop or scripted
    // scraping. A person rarely resends an identical prompt more than a few times.
    const counts = Object.values(prompts).map(Number).filter(Number.isFinite);
    const topDup = counts.length ? Math.max(...counts) : 0;
    const dupLimit = envInt('VGU_ABUSE_DUP_LIMIT', 10);
    if (topDup >= dupLimit) {
      signals.push({
        name: 'duplicate',
        weight: SIGNAL_WEIGHT.duplicate,
        detail: `the same prompt was sent ${topDup} times in the last hour`,
      });
    }

    // ── failures ─────────────────────────────────────────────────────────────
    // A high failure share means requests are being generated without regard to
    // the responses, which a human does not do.
    const failures = Number(stats.failures) || 0;
    const failRate = failures / requests;
    if (failRate >= 0.4) {
      signals.push({
        name: 'failures',
        weight: SIGNAL_WEIGHT.failures,
        detail: `${Math.round(failRate * 100)}% of ${requests} requests failed`,
      });
    }

    // ── context size ─────────────────────────────────────────────────────────
    // Enormous prompts are the cheapest way to multiply provider cost per
    // request, so an outlier maximum matters even when the average is normal.
    const charsMax = Number(stats.charsMax) || 0;
    const charsLimit = envInt('VGU_ABUSE_CONTEXT_CHARS', 400_000);
    if (charsMax >= charsLimit) {
      signals.push({
        name: 'context',
        weight: SIGNAL_WEIGHT.context,
        detail: `largest prompt was ${charsMax.toLocaleString()} characters`,
      });
    }

    // ── premium share ────────────────────────────────────────────────────────
    // Exclusively expensive-tier traffic at volume is the pattern of reselling
    // access, not of ordinary use.
    const premium = Number(stats.premium) || 0;
    const premiumShare = premium / requests;
    if (premiumShare >= 0.9 && premium >= 30) {
      signals.push({
        name: 'premium',
        weight: SIGNAL_WEIGHT.premium,
        detail: `${premium} of ${requests} requests used an expensive tier (${Math.round(premiumShare * 100)}%)`,
      });
    }

    // ── concurrency saturation ───────────────────────────────────────────────
    // Occasionally hitting the limit is normal. Hitting it constantly means
    // something is firing requests in parallel without waiting for answers.
    const concBlocks = Number(stats.concBlocks) || 0;
    if (concBlocks >= envInt('VGU_ABUSE_CONC_BLOCKS', 20)) {
      signals.push({
        name: 'concurrency',
        weight: SIGNAL_WEIGHT.concurrency,
        detail: `hit the concurrency limit ${concBlocks} times in the last hour`,
      });
    }

    // ── automation ───────────────────────────────────────────────────────────
    // Humans are irregular. A near-constant gap between requests is the clearest
    // single indicator of a script, which is why it carries the largest weight —
    // but still not enough to act on alone.
    const times = arrivals
      .map(m => Number(String(m).split(':')[0]))
      .filter(Number.isFinite)
      .sort((a, b) => a - b);
    const cv = cadenceRegularity(times);
    const noUA = Number(stats.noUserAgent) || 0;
    if (cv !== null && cv < 0.15) {
      signals.push({
        name: 'automation',
        weight: SIGNAL_WEIGHT.automation,
        detail: `request timing is machine-regular (variation ${cv.toFixed(3)} across ${times.length} requests)`,
      });
    } else if (noUA / requests >= 0.9) {
      // Weaker evidence of the same thing, so it earns a fraction of the weight.
      signals.push({
        name: 'automation',
        weight: Math.round(SIGNAL_WEIGHT.automation / 2),
        detail: `${noUA} of ${requests} requests arrived with no user-agent`,
      });
    }

    // ── account behaviour ────────────────────────────────────────────────────
    // Heavy volume within hours of signup is the throwaway-account pattern.
    if (
      opts.accountAgeDays !== undefined &&
      opts.accountAgeDays <= 1 &&
      requests >= envInt('VGU_ABUSE_NEW_ACCOUNT_REQUESTS', 100)
    ) {
      signals.push({
        name: 'account',
        weight: SIGNAL_WEIGHT.account,
        detail: `${requests} requests from an account less than a day old`,
      });
    }
  } catch (err) {
    // FAIL OPEN. Abuse scoring is not a cost control; the VGU engine is.
    degraded = true;
    logger.warn('vgu-abuse: assessment unavailable — failing open', {
      userId,
      err: err instanceof Error ? err.message : String(err),
      module: 'veegpt-abuse',
    });
  }

  const score = signals.reduce((a, s) => a + s.weight, 0);
  const distinct = new Set(signals.map(s => s.name)).size;
  const action = degraded ? 'allow' : actionFor(score, distinct);
  const effectiveAction =
    abuseEnforcementEnabled() || action === 'allow' || action === 'observe'
      ? action
      : 'observe';

  const assessment: AbuseAssessment = {
    userId,
    plan,
    score,
    signals,
    action,
    effectiveAction,
    degraded,
    observedRequests: requests,
  };

  if (action !== 'allow') {
    logger.warn('vgu-abuse: signals detected', {
      userId,
      plan,
      score,
      action,
      effectiveAction,
      enforcing: abuseEnforcementEnabled(),
      signals: signals.map(s => `${s.name}: ${s.detail}`),
      module: 'veegpt-abuse',
    });
    // Persisted so an administrator can see WHY without re-deriving it.
    try {
      await getRedisClient().set(
        AK.verdict(userId),
        JSON.stringify({ at: new Date().toISOString(), ...assessment }),
        'EX',
        WINDOW_SEC * 24
      );
    } catch {
      /* the verdict is a convenience, not a source of truth */
    }
  }

  return assessment;
}

/** The last recorded assessment for a user, for the admin view. */
export async function lastAbuseAssessment(
  userId: string
): Promise<(AbuseAssessment & { at: string }) | null> {
  try {
    const raw = await getRedisClient().get(AK.verdict(userId));
    return raw ? (JSON.parse(raw) as AbuseAssessment & { at: string }) : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Applying an action
// ---------------------------------------------------------------------------

/** Thrown when abuse enforcement refuses a request. */
export class AbuseBlockedError extends Error {
  readonly code = 'ABUSE_DETECTED';
  readonly httpStatus = 429;
  constructor(
    readonly action: AbuseAction,
    readonly assessment: AbuseAssessment,
    message: string
  ) {
    super(message);
    this.name = 'AbuseBlockedError';
  }
}

/**
 * How an action changes the limits for a request.
 *
 * `restrict` deliberately keeps CHEAP models working: the goal is to remove the
 * expensive capability an abuser is after while leaving a real customer who
 * tripped the heuristics able to keep working. Cutting everyone off on a
 * heuristic would be worse than the abuse.
 */
export interface AbuseAdjustment {
  /** Multiplier applied to the plan's concurrency limit. */
  concurrencyFactor: number;
  /** Multiplier applied to the plan's per-minute request cap. */
  rpmFactor: number;
  /** Highest tier permitted, or null for no restriction. */
  maxTier: ModelTier | null;
  /** True when the request must be refused outright. */
  deny: boolean;
}

export function adjustmentFor(action: AbuseAction): AbuseAdjustment {
  switch (action) {
    case 'throttle':
      return { concurrencyFactor: 0.5, rpmFactor: 0.5, maxTier: null, deny: false };
    case 'restrict':
      return { concurrencyFactor: 0.5, rpmFactor: 0.25, maxTier: 'medium', deny: false };
    case 'block':
      return { concurrencyFactor: 0, rpmFactor: 0, maxTier: null, deny: true };
    default:
      return { concurrencyFactor: 1, rpmFactor: 1, maxTier: null, deny: false };
  }
}

/** Clear a user's abuse state — used by an administrator after review. */
export async function clearAbuseState(userId: string): Promise<void> {
  try {
    await getRedisClient().del(
      AK.stats(userId),
      AK.arrivals(userId),
      AK.prompts(userId),
      AK.verdict(userId)
    );
  } catch {
    /* nothing to do — the counters expire on their own within the hour */
  }
}
