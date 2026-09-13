/**
 * withVGU — the ONE entry point every AI-producing path goes through.
 *
 * Enforces the full lifecycle required by the specification:
 *
 *   estimate → eligibility + ATOMIC reservation → execute → measure actual
 *   provider usage → reconcile the difference
 *
 * and never the forbidden shape:
 *
 *   execute → charge   (concurrent requests overspend the quota)
 *
 * WHY A WRAPPER RATHER THAN CALL-SITE CODE
 * There must be exactly one usage engine. If each route reserved and reconciled
 * by hand, some path would eventually forget to release on failure, or charge
 * twice on retry, or skip the gate entirely — which is precisely the class of bug
 * this system exists to prevent. Every caller gets the whole lifecycle for free,
 * including the failure paths.
 *
 * GUARANTEES
 *  • A reservation ALWAYS reaches a terminal state (RECONCILED / RELEASED /
 *    FAILED), including on throw, abort, or partial stream.
 *  • Tokens already consumed before a failure are still charged — a provider
 *    error mid-stream does not make the request free.
 *  • A failure with NO measured usage is refunded in full.
 *  • Retrying with the same requestId cannot double-charge.
 *  • Refusals carry a structured code, never a silent model swap.
 */

import type { PlanId } from '../config/plan-config';
import {
  featureProviderCallLimit,
  featureSpec,
  featureTimeoutMs,
  VGU_ANCHOR_USD,
  VGU_ERROR,
  type ModelTier,
  type VGUErrorCode,
} from '../config/veegpt-vgu.config';

/** Anchor used to express the pre-flight estimate in money for the ledger. */
const VGU_ANCHOR_FOR_LEDGER = VGU_ANCHOR_USD;
import { modelTierOf } from '@shared/veegpt-model-tiers';
import {
  actualVGU,
  estimateVGU,
  type ProviderCall,
} from './veegpt-vgu';
import {
  getReservationEngine,
  UNVERIFIED_RESERVATION,
  type ReserveResult,
} from './veegpt-reservation.engine';
import {
  collectAIUsageInto,
  type AIUsageSample,
} from './aiUsageTracker';
import { writeLedgerEvent, type LedgerStatus } from './veegpt-ledger';
import { resolveBillingPeriod } from './veegpt-billing-period';
import { resolveVeegptPlan } from './veegpt-plan';
import {
  adjustmentFor,
  assessAbuse,
  recordAbuseObservation,
  type AbuseAssessment,
} from './veegpt-abuse';
import { tierWithin } from '@shared/veegpt-model-tiers';
import { priceFor } from '../config/veegpt-pricing.registry';
import logger from '../config/logger';

/** Thrown when a request is refused. Carries the structured refusal payload. */
export class VGUQuotaError extends Error {
  readonly code: VGUErrorCode;
  readonly httpStatus = 429;
  readonly retryAfterSec?: number;
  readonly billingPeriodId: string;
  readonly estimatedVGU: number;
  /** Tier the user asked for, so the client can offer a cheaper alternative. */
  readonly requestedTier: ModelTier;
  readonly requestedModel?: string;

  constructor(args: {
    code: VGUErrorCode;
    message: string;
    retryAfterSec?: number;
    billingPeriodId: string;
    estimatedVGU: number;
    requestedTier: ModelTier;
    requestedModel?: string;
  }) {
    super(args.message);
    this.name = 'VGUQuotaError';
    this.code = args.code;
    this.retryAfterSec = args.retryAfterSec;
    this.billingPeriodId = args.billingPeriodId;
    this.estimatedVGU = args.estimatedVGU;
    this.requestedTier = args.requestedTier;
    this.requestedModel = args.requestedModel;
  }

  /**
   * The JSON body returned to the client. `suggestedTier` is what makes the
   * "Continue with Fast?" prompt possible WITHOUT the server silently switching
   * models — the client asks, the user decides.
   */
  toResponse(): Record<string, unknown> {
    // A refusal is "downgradeable" when choosing a CHEAPER MODEL would actually
    // solve it. That is true for the two model-scoped quota codes, and for an
    // abuse tier restriction — which exists precisely so cheap models keep
    // working. It is NOT true of a burst/monthly refusal, and implying otherwise
    // would send the user round in a circle.
    const downgradeable =
      this.code === VGU_ERROR.MODEL_QUOTA_EXHAUSTED ||
      this.code === VGU_ERROR.MODEL_NOT_IN_PLAN ||
      this.code === VGU_ERROR.ABUSE_TIER_RESTRICTED;
    return {
      error: this.message,
      code: this.code,
      message: this.message,
      retryAfter: this.retryAfterSec,
      retryAt: this.retryAfterSec
        ? new Date(Date.now() + this.retryAfterSec * 1000).toISOString()
        : undefined,
      requestedModel: this.requestedModel,
      requestedTier: this.requestedTier,
      // Only a MODEL-scoped refusal can be solved by choosing a cheaper model.
      // A monthly/burst refusal cannot, so we must not imply it can.
      suggestedTier: downgradeable ? 'cheap' : undefined,
      upgradeAvailable: true,

      // ── Legacy field names the shipped client still reads ──────────────────
      // The chat client keys its "limit reached" notice and its Upgrade CTA off
      // `upgrade` and `scope`, which the retired middleware sent. Emitting both
      // shapes means replacing that middleware did not silently remove the
      // Upgrade button; the client migrates to `code`/`upgradeAvailable` when the
      // structured refusal UI lands.
      upgrade: true,
      scope: this.legacyScope(),
    };
  }

  /** Map a structured code onto the old two-value `scope` field. */
  private legacyScope(): string | undefined {
    switch (this.code) {
      case VGU_ERROR.BURST_QUOTA_EXHAUSTED:
        return 'session';
      case VGU_ERROR.MONTHLY_QUOTA_EXHAUSTED:
      case VGU_ERROR.SEAT_SHARE_EXHAUSTED:
      case VGU_ERROR.WORKSPACE_POOL_EXHAUSTED:
        return 'monthly';
      default:
        return undefined;
    }
  }
}

export interface WithVGUOptions {
  userId?: string;
  workspaceId?: string;
  plan: PlanId;
  /** AIFeature label — selects the governance spec. */
  feature: string;
  /** App-level model id the operation will use. */
  model?: string;
  /**
   * Whether the user selected the model or the feature fixed it. Platform-chosen
   * models do not consume the user's model-tier allowance — see ReserveContext.
   */
  modelChosenBy?: 'user' | 'platform';
  /** Idempotency key; a retry with the same value reuses the reservation. */
  requestId?: string;
  /**
   * True when `requestId` was generated SERVER-SIDE (a queue job id, a scheduled
   * task key) and therefore provably names one logical operation. Client-supplied
   * ids must stay untrusted — see ReserveContext.requestIdTrusted.
   */
  requestIdTrusted?: boolean;
  /**
   * True when this operation runs INSIDE another metered operation — a deep
   * research job within a chat turn, an autopilot stage within a run.
   *
   * The nested scope is what gives a sub-operation its OWN governance (per-job
   * VGU ceiling, monthly feature allowance, feature concurrency, provider-call
   * limit, timeout, retry limit) instead of silently inheriting its parent's. It
   * skips only the plan-wide concurrency slot, which the parent already holds.
   */
  nested?: boolean;
  /** Tools expected to run, for the estimate. */
  tools?: string[];
  /** Media attachments to be analysed. */
  attachments?: number;
  /** Prompt size in characters, when known — scales the estimate. */
  promptChars?: number;
  /**
   * The prompt text, used ONLY to derive a short non-reversible fingerprint for
   * duplicate-request detection. It is never stored or logged.
   */
  promptText?: string;
  /** Client user-agent, when available — one input to the automation signal. */
  userAgent?: string;
  /**
   * A pre-computed abuse assessment. Supplied by `meterAI` so the HTTP layer can
   * both apply the rate-limit adjustment and pass the same verdict down, instead
   * of scoring the user twice per request.
   */
  abuse?: AbuseAssessment;
  /** Audit metadata recorded on the reservation. */
  meta?: Record<string, unknown>;
}

export interface VGUOutcome {
  reservationId: string;
  estimatedVGU: number;
  actualVGU: number;
  providerCostUSD: number;
  providerCalls: number;
  tokens: {
    inputTokens: number;
    outputTokens: number;
    reasoningTokens: number;
    cachedTokens: number;
  };
  pricingVersions: string[];
  billingPeriodId: string;
  tier: ModelTier;
  /** True when the per-request ceiling clipped the charge. */
  capped: boolean;
  /** True when any call fell back to conservative pricing. */
  usedFallbackPricing: boolean;
  status: string;
}

/**
 * Write the durable audit event for a completed operation. Never throws — the
 * ledger writer handles its own failures via the outbox.
 *
 * The subscription id is resolved from the (cached) billing period rather than a
 * fresh query, so the audit trail gets it without adding a database read to every
 * AI request.
 */
async function recordLedger(
  opts: WithVGUOptions,
  outcome: VGUOutcome,
  sink: { usage: AIUsageSample[] },
  status: LedgerStatus
): Promise<void> {
  try {
    if (!opts.userId) return;
    const period = await resolveBillingPeriod(opts.userId);
    // The dominant model of the operation: the one that made the most calls.
    const counts = new Map<string, number>();
    for (const s of sink.usage) {
      counts.set(s.model, (counts.get(s.model) || 0) + 1);
    }
    const primaryModel =
      [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || opts.model;
    const priceRow = primaryModel ? priceFor(primaryModel) : undefined;

    await writeLedgerEvent({
      requestId: opts.requestId,
      reservationId: outcome.reservationId,
      userId: opts.userId,
      workspaceId: opts.workspaceId,
      subscriptionId: period.subscriptionId,
      billingPeriodId: outcome.billingPeriodId || period.id,
      plan: opts.plan,
      provider: priceRow?.provider ?? sink.usage[0]?.provider,
      model: primaryModel,
      modelVersion: priceRow?.modelVersion,
      modelTier: outcome.tier,
      feature: opts.feature,
      inputTokens: outcome.tokens.inputTokens,
      outputTokens: outcome.tokens.outputTokens,
      reasoningTokens: outcome.tokens.reasoningTokens,
      cachedTokens: outcome.tokens.cachedTokens,
      providerCalls: outcome.providerCalls,
      estimatedVGU: outcome.estimatedVGU,
      actualVGU: outcome.actualVGU,
      // The estimate's money equivalent, for estimate-vs-actual drift analysis.
      estimatedProviderCostUSD: outcome.estimatedVGU * VGU_ANCHOR_FOR_LEDGER,
      actualProviderCostUSD: outcome.providerCostUSD,
      pricingVersions: outcome.pricingVersions,
      capped: outcome.capped,
      fallbackPricing: outcome.usedFallbackPricing,
      status,
      meta: opts.meta,
    });
  } catch (err) {
    logger.error('vgu: ledger write threw unexpectedly', {
      reservationId: outcome.reservationId,
      err: err instanceof Error ? err.message : String(err),
      module: 'veegpt-metering',
    });
  }
}

/** Convert collected usage samples into priced provider calls. */
function toProviderCalls(samples: AIUsageSample[]): ProviderCall[] {
  return samples.map(s => ({
    model: s.model,
    usage: {
      inputTokens: s.promptTokens,
      outputTokens: s.completionTokens,
      reasoningTokens: s.reasoningTokens,
      cachedTokens: s.cachedTokens,
    },
  }));
}

/**
 * Run an AI operation under full VGU control.
 *
 * @throws VGUQuotaError when the request is refused. The operation is NOT run.
 * @throws whatever `fn` throws, AFTER reconciling any usage it managed to incur.
 */
export async function withVGU<T>(
  opts: WithVGUOptions,
  fn: () => Promise<T>
): Promise<{ result: T; usage: VGUOutcome }> {
  const engine = getReservationEngine();
  const tier = modelTierOf(opts.model);
  const spec = featureSpec(opts.feature);
  const estimated = estimateVGU({
    feature: opts.feature,
    model: opts.model,
    tools: opts.tools,
    attachments: opts.attachments,
    promptChars: opts.promptChars,
  });

  // Anonymous/system calls have no quota owner. They are still measured, but
  // there is nobody to charge, so they bypass reservation rather than silently
  // charging an arbitrary user.
  if (!opts.userId) {
    return runUnmetered(opts, tier, estimated, fn);
  }

  // ── Abuse gate (spec §32) ────────────────────────────────────────────────
  // Behavioural, not economic: the quota below decides what this user may SPEND,
  // this decides whether they are behaving like a script. It runs before the
  // reservation so a blocked request never takes a slot, and it only ever acts on
  // a COMBINATION of signals (see veegpt-abuse.ts).
  const abuse =
    opts.abuse ??
    (await assessAbuse(opts.userId, opts.plan).catch(() => undefined));
  const adjust = adjustmentFor(abuse?.effectiveAction ?? 'allow');

  if (adjust.deny) {
    throw new VGUQuotaError({
      code: VGU_ERROR.ABUSE_DETECTED,
      message:
        'AI access is temporarily paused on this account while unusual activity is reviewed. Contact support if you believe this is a mistake.',
      billingPeriodId: '',
      estimatedVGU: estimated,
      requestedTier: tier,
      requestedModel: opts.model,
    });
  }
  // A restriction removes the EXPENSIVE capability and nothing else, so a real
  // customer who tripped the heuristics can keep working on cheaper models.
  if (adjust.maxTier && !tierWithin(tier, adjust.maxTier)) {
    throw new VGUQuotaError({
      code: VGU_ERROR.ABUSE_TIER_RESTRICTED,
      message:
        'Expensive models are temporarily unavailable on this account while unusual activity is reviewed. Cheaper models still work.',
      billingPeriodId: '',
      estimatedVGU: estimated,
      requestedTier: tier,
      requestedModel: opts.model,
    });
  }

  const reservation: ReserveResult = await engine.reserve({
    userId: opts.userId,
    workspaceId: opts.workspaceId,
    plan: opts.plan,
    feature: opts.feature,
    tier,
    model: opts.model,
    modelChosenBy: opts.modelChosenBy,
    estimatedVGU: estimated,
    requestId: opts.requestId,
    requestIdTrusted: opts.requestIdTrusted,
    nested: opts.nested,
    // A throttled account gets a tighter concurrency limit rather than a refusal.
    concurrencyFactor: adjust.concurrencyFactor,
    meta: { model: opts.model, userId: opts.userId, ...(opts.meta || {}) },
  });

  /** Record this request's behavioural fingerprint. Never throws. */
  const observe = (failed: boolean, concurrencyBlocked = false) =>
    recordAbuseObservation({
      userId: opts.userId!,
      tier,
      promptChars: opts.promptChars,
      promptText: opts.promptText,
      userAgent: opts.userAgent,
      failed,
      concurrencyBlocked,
    });

  if (!reservation.ok) {
    // A non-blocking internal feature (conversation titles, memory writes) must
    // not be killed by quota: its cost is negligible and failing it corrupts the
    // product. It is recorded but allowed through.
    if (spec.blocking === false) {
      logger.info('vgu: non-blocking feature allowed past an exhausted quota', {
        userId: opts.userId,
        feature: opts.feature,
        code: reservation.code,
        module: 'veegpt-metering',
      });
      return runUnmetered(opts, tier, estimated, fn);
    }
    // Repeatedly saturating concurrency is itself a signal, so the refusal is
    // recorded rather than silently dropped.
    void observe(
      true,
      reservation.code === VGU_ERROR.CONCURRENCY_LIMIT ||
        reservation.code === VGU_ERROR.WORKSPACE_CONCURRENCY_LIMIT
    );
    throw new VGUQuotaError({
      code: reservation.code,
      message: reservation.message,
      retryAfterSec: reservation.retryAfterSec,
      billingPeriodId: reservation.billingPeriodId,
      estimatedVGU: reservation.estimatedVGU,
      requestedTier: tier,
      requestedModel: opts.model,
    });
  }

  // Wall-clock budget for the operation (spec §36/§37). A job that hangs holds a
  // concurrency slot and keeps a reservation open; the sweeper would eventually
  // reclaim it, but "eventually" is minutes of blocked capacity. This bounds it at
  // the feature's own timeout and still reconciles whatever was measured.
  const timeout = startTimeoutBudget(featureTimeoutMs(opts.feature), opts.feature);

  const commitCtx = {
    userId: opts.userId,
    workspaceId: opts.workspaceId,
    plan: opts.plan,
    tier,
    feature: opts.feature,
    billingPeriodId: reservation.billingPeriodId,
  };

  // The sink is owned HERE, not by collectAIUsage, so usage incurred before a
  // throw is still readable in the catch/finally. Without this, a provider error
  // mid-stream would make everything it already burned free.
  const sink = {
    usage: [] as AIUsageSample[],
    externalCostUSD: { total: 0 },
    // Tools the model actually invoked, appended during the run.
    toolsRun: [] as string[],
    // ── §37 fan-out ceiling ────────────────────────────────────────────────
    // The number of provider calls this ONE operation may make. Enforced by the
    // provider guard before each call and by recordAIUsage after each one, so a
    // runaway loop stops instead of billing indefinitely. 0 = unbounded.
    providerCalls: { count: 0, limit: featureProviderCallLimit(opts.feature) },
    // ── §36/§37 wall-clock budget ──────────────────────────────────────────
    abortSignal: timeout.signal,
  };

  const measure = (): VGUOutcome => {
    const computed = actualVGU({
      feature: opts.feature,
      calls: toProviderCalls(sink.usage),
      // Expected tools plus the ones that genuinely ran; the latter are only
      // knowable at runtime because the model chooses them mid-stream.
      tools: [...(opts.tools || []), ...sink.toolsRun],
      attachments: opts.attachments,
      externalCostUSD: sink.externalCostUSD.total,
    });
    return {
      reservationId: reservation.reservationId,
      estimatedVGU: reservation.estimatedVGU,
      actualVGU: computed.vgu,
      providerCostUSD: computed.providerCostUSD,
      providerCalls: computed.providerCalls,
      tokens: computed.tokens,
      pricingVersions: computed.pricingVersions,
      billingPeriodId: reservation.billingPeriodId,
      tier,
      capped: computed.cappedByMaxPerRequest,
      usedFallbackPricing: computed.usedFallbackPricing,
      status: 'RECONCILED',
    };
  };

  try {
    const result = await collectAIUsageInto(
      opts.feature,
      { userId: opts.userId, workspaceId: opts.workspaceId },
      sink,
      () => timeout.race(fn())
    );

    const outcome = measure();
    const { status, delta } = await engine.commit(
      reservation.reservationId,
      outcome.actualVGU,
      commitCtx
    );
    outcome.status = status;

    await recordLedger(opts, outcome, sink, 'RECONCILED');
    void observe(false);

    logger.info('vgu: reconciled', {
      userId: opts.userId,
      feature: opts.feature,
      tier,
      model: opts.model,
      requestId: opts.requestId,
      reservationId: reservation.reservationId,
      estimatedVGU: outcome.estimatedVGU,
      actualVGU: outcome.actualVGU,
      delta,
      providerCalls: outcome.providerCalls,
      providerCostUSD: Number(outcome.providerCostUSD.toFixed(6)),
      capped: outcome.capped,
      // Surfaced because a silent fallback means a model is being charged at the
      // conservative unknown rate — a ~30x over-charge that is otherwise
      // invisible. Alert on this rather than discovering it in a bill.
      fallbackPricing: outcome.usedFallbackPricing,
      pricingVersions: outcome.pricingVersions,
      module: 'veegpt-metering',
    });
    if (outcome.usedFallbackPricing) {
      logger.warn('vgu: charged with conservative fallback pricing', {
        userId: opts.userId,
        feature: opts.feature,
        model: opts.model,
        models: sink.usage.map(s => s.model),
        actualVGU: outcome.actualVGU,
        module: 'veegpt-metering',
      });
    }

    return { result, usage: outcome };
  } catch (err) {
    void observe(true);
    // Charge what was genuinely consumed before the failure; refund the rest.
    const hadUsage =
      sink.usage.length > 0 || sink.externalCostUSD.total > 0;

    if (hadUsage) {
      const outcome = measure();
      await engine.commit(reservation.reservationId, outcome.actualVGU, commitCtx);
      await recordLedger(opts, outcome, sink, 'FAILED');
      logger.warn('vgu: operation failed after partial usage — charged actual', {
        userId: opts.userId,
        feature: opts.feature,
        reservationId: reservation.reservationId,
        actualVGU: outcome.actualVGU,
        providerCalls: outcome.providerCalls,
        err: err instanceof Error ? err.message : String(err),
        module: 'veegpt-metering',
      });
    } else {
      // Spec §35: a provider failure must not consume the reservation when no
      // usage occurred.
      const aborted =
        err instanceof Error &&
        (err.name === 'AbortError' || /abort/i.test(err.message));
      const { refunded } = await engine.release(
        reservation.reservationId,
        commitCtx,
        aborted ? 'RELEASED' : 'FAILED'
      );
      // A refunded operation is still recorded, with actualVGU = 0. The audit
      // trail must show that it happened and cost nothing, not stay silent.
      const zero = measure();
      zero.actualVGU = 0;
      await recordLedger(opts, zero, sink, 'RELEASED');
      logger.warn('vgu: operation failed with no usage — fully refunded', {
        userId: opts.userId,
        feature: opts.feature,
        reservationId: reservation.reservationId,
        refunded,
        aborted,
        err: err instanceof Error ? err.message : String(err),
        module: 'veegpt-metering',
      });
    }
    throw err;
  } finally {
    timeout.clear();
  }
}

/** Thrown when an operation exceeds its feature's wall-clock budget. */
export class AITimeoutError extends Error {
  readonly code = 'AI_TIMEOUT';
  constructor(readonly feature: string, readonly timeoutMs: number) {
    super(`AI operation "${feature}" exceeded its ${timeoutMs}ms budget.`);
    this.name = 'AITimeoutError';
  }
}

/**
 * A wall-clock budget for one operation.
 *
 * `race` rejects when the budget elapses, and `signal` is published on the AI
 * context so nested code that accepts an AbortSignal can stop work that is
 * genuinely in flight. Without the signal a timeout would only abandon the
 * result — the provider call would keep running, and keep costing money.
 *
 * A feature with no `timeoutMs` gets no timer at all rather than an arbitrary
 * default, because guessing a ceiling for an unknown feature is how a legitimate
 * long job gets killed.
 */
function startTimeoutBudget(
  timeoutMs: number | undefined,
  feature: string
): {
  signal?: AbortSignal;
  race<T>(p: Promise<T>): Promise<T>;
  clear(): void;
} {
  if (!timeoutMs || !Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return { race: p => p, clear: () => {} };
  }
  const controller = new AbortController();
  let timer: NodeJS.Timeout | undefined;
  const expiry = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new AITimeoutError(feature, timeoutMs));
    }, timeoutMs);
    // Never keep the process alive just to enforce a timeout.
    timer.unref?.();
  });
  return {
    signal: controller.signal,
    race: <T,>(p: Promise<T>) => Promise.race([p, expiry]) as Promise<T>,
    clear: () => {
      if (timer) clearTimeout(timer);
    },
  };
}

/**
 * withVGU for background work — resolves the plan itself.
 *
 * Workers and scheduled jobs have no request to read a plan from, and the
 * specification requires them to go through the SAME engine as user traffic:
 * a queued job that skipped the quota would be a way to run unlimited AI simply
 * by enqueuing instead of calling.
 *
 * An unresolvable plan becomes `free` — the most restrictive real plan — so a
 * lookup failure cannot turn into unmetered background spending.
 */
export async function withVGUForUser<T>(
  opts: Omit<WithVGUOptions, 'plan'> & { plan?: PlanId },
  fn: () => Promise<T>
): Promise<{ result: T; usage: VGUOutcome }> {
  let plan = opts.plan ?? null;
  if (!plan && opts.userId) {
    try {
      plan = await resolveVeegptPlan(opts.userId);
    } catch {
      plan = null;
    }
  }
  return withVGU({ ...opts, plan: plan ?? 'free' }, fn);
}

/**
 * Execute without reservation, but still MEASURE. Used for anonymous/system calls
 * and for non-blocking internal features whose quota is exhausted. Nothing here
 * pretends to be accounted for: the reservation id is the unverified sentinel.
 */
async function runUnmetered<T>(
  opts: WithVGUOptions,
  tier: ModelTier,
  estimated: number,
  fn: () => Promise<T>
): Promise<{ result: T; usage: VGUOutcome }> {
  const sink = {
    usage: [] as AIUsageSample[],
    externalCostUSD: { total: 0 },
    toolsRun: [] as string[],
  };
  const result = await collectAIUsageInto(
    opts.feature,
    { userId: opts.userId, workspaceId: opts.workspaceId },
    sink,
    fn
  );
  const computed = actualVGU({
    feature: opts.feature,
    calls: toProviderCalls(sink.usage),
    tools: [...(opts.tools || []), ...sink.toolsRun],
    attachments: opts.attachments,
    externalCostUSD: sink.externalCostUSD.total,
  });
  return {
    result,
    usage: {
      reservationId: UNVERIFIED_RESERVATION,
      estimatedVGU: estimated,
      actualVGU: computed.vgu,
      providerCostUSD: computed.providerCostUSD,
      providerCalls: computed.providerCalls,
      tokens: computed.tokens,
      pricingVersions: computed.pricingVersions,
      billingPeriodId: '',
      tier,
      capped: computed.cappedByMaxPerRequest,
      usedFallbackPricing: computed.usedFallbackPricing,
      status: 'UNMETERED',
    },
  };
}

/**
 * Express helper: turn a VGUQuotaError into its HTTP response. Returns true when
 * the error was a quota refusal and the response has been sent.
 */
export function sendVGUError(res: {
  status: (n: number) => { json: (b: unknown) => unknown };
  setHeader: (k: string, v: string) => void;
}, err: unknown): boolean {
  if (!(err instanceof VGUQuotaError)) return false;
  if (err.retryAfterSec) {
    res.setHeader('Retry-After', String(Math.max(1, err.retryAfterSec)));
  }
  res.status(err.httpStatus).json(err.toResponse());
  return true;
}
