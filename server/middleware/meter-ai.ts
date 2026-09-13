/**
 * meterAI — put an entire HTTP request under VGU control.
 *
 * Most AI routes do their provider work deep inside a service, several layers from
 * the handler. Rather than thread reservation plumbing through every service, this
 * middleware wraps the whole request in `withVGU`, so:
 *
 *   • quota is reserved BEFORE the handler runs (an over-quota request never
 *     reaches the provider),
 *   • every nested provider call inherits the metered context, which is exactly
 *     what the provider guard checks for,
 *   • actual tokens are reconciled when the response finishes,
 *   • a refusal returns a structured 429 instead of a bare error.
 *
 * The handler is invoked inside the metered scope and the middleware resolves when
 * the response completes, so streaming routes are covered too: usage recorded
 * during the stream lands in the same context and is reconciled at the end.
 */

import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { randomUUID } from 'node:crypto';
import type { PlanId } from '../config/plan-config';
import { resolveVeegptPlan, accountAgeDays } from '../services/veegpt-plan';
import { withVGU, VGUQuotaError, sendVGUError } from '../services/veegpt-metering';
import { policyForPlan, VGU_ERROR } from '../config/veegpt-vgu.config';
import { getRateLimitInfo } from './rate-limiting-working';
import { adjustmentFor, assessAbuse } from '../services/veegpt-abuse';
import { getRedisClient } from '../lib/redis';
import logger from '../config/logger';

/** Per-minute rate-limit window. */
const RPM_WINDOW_MS = 60 * 1000;

/**
 * Per-plan request-rate check (spec §31).
 *
 * Rate is a DIFFERENT concern from budget: a budget bounds total spend, it does
 * nothing about a client loop hammering an endpoint within its allowance. This
 * lives here rather than in a separate middleware so every metered AI route gets
 * it from one place, reading the same authoritative plan policy the quota uses —
 * there is no second table of limits to drift.
 *
 * Fails OPEN: a limiter outage must not block a paying user, and it cannot cause
 * overspending because the VGU engine still gates cost.
 */
async function rateLimitCheck(
  userId: string,
  plan: PlanId,
  rpmFactor: number
): Promise<{ blocked: boolean; limit: number; retryAfter: number }> {
  const base = policyForPlan(plan).requestsPerMinute;
  if (!Number.isFinite(base) || base <= 0) {
    return { blocked: false, limit: 0, retryAfter: 0 };
  }
  // Development gets a very high limit so local testing is never throttled —
  // UNLESS the limit was set explicitly, in which case the explicit value wins.
  // (An override that silently does nothing in one environment is worse than no
  // override at all, and makes the behaviour untestable.)
  const explicit = process.env[`VEEGPT_RPM_${plan.toUpperCase()}`] !== undefined;
  const planLimit =
    !explicit && process.env.NODE_ENV === 'development'
      ? Math.max(base, 1000)
      : base;
  // An abuse throttle can only tighten the limit, never raise it.
  const limit = Math.max(1, Math.floor(planLimit * Math.min(1, rpmFactor)));
  try {
    const info = await getRateLimitInfo(
      `veegpt_ai_rpm:user:${userId}`,
      RPM_WINDOW_MS,
      limit
    );
    return {
      blocked: info.blocked,
      limit,
      retryAfter: Math.max(1, Math.ceil((info.resetTime - Date.now()) / 1000)),
    };
  } catch {
    return { blocked: false, limit, retryAfter: 0 };
  }
}

export interface MeterAIOptions {
  /** AIFeature label — selects the governance spec (ceilings, caps, blocking). */
  feature: string;
  /**
   * Model the request will use. A function receives the request so a route can
   * read it from the body or the workspace config; it may be async, because the
   * user's model selection normally lives in the database. Left unset, the
   * estimate uses the cheap tier and reconciliation corrects the charge.
   */
  model?:
    | string
    | ((req: Request) => string | undefined | Promise<string | undefined>);
  /**
   * Who chose the model. Defaults to 'platform', because a feature route hard-codes
   * its own model — the user never picked it, so it must not spend their
   * model-tier allowance. Set 'user' only where the request carries a user model
   * selection.
   */
  modelChosenBy?: 'user' | 'platform';
  /** Tools the request is expected to run, for a better estimate. */
  tools?: (req: Request) => string[] | undefined;
  /** Attachment count, for the media surcharge. */
  attachments?: (req: Request) => number | undefined;
  /** Prompt size in characters, for the estimate and the context-size signal. */
  promptChars?: (req: Request) => number | undefined;
  /**
   * The prompt text, used ONLY to derive a non-reversible fingerprint for
   * duplicate-request detection. Never stored or logged.
   */
  promptText?: (req: Request) => string | undefined;
}

/** Resolve the workspace id the way the rest of the app does. */
function workspaceIdOf(req: Request): string | undefined {
  const r = req as Request & {
    body?: Record<string, unknown>;
    query?: Record<string, unknown>;
    user?: { workspaceId?: string };
  };
  return (
    (typeof r.body?.workspaceId === 'string' ? r.body.workspaceId : undefined) ||
    (typeof r.query?.workspaceId === 'string' ? r.query.workspaceId : undefined) ||
    r.user?.workspaceId
  );
}

/**
 * Wait for the response to finish, however it finishes.
 *
 * The already-settled check is the important part. `finish`/`close` are one-shot
 * events: if the response has ALREADY closed by the time we attach a listener,
 * the listener never fires and this promise never resolves — so the reservation is
 * never reconciled and its concurrency slot is held until the sweeper reclaims it
 * minutes later. That is not hypothetical: a client that disconnects while the
 * middleware is still doing its own pre-flight work hits it every time.
 *
 * `writableEnded` alone is not enough, because an aborted request destroys the
 * socket without the response ever being ended.
 */
function responseSettled(res: Response): Promise<void> {
  const alreadyDone = () =>
    res.writableEnded ||
    (res as Response & { closed?: boolean }).closed === true ||
    (res as Response & { destroyed?: boolean }).destroyed === true;

  return new Promise<void>(resolve => {
    if (alreadyDone()) return resolve();
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      res.off('finish', finish);
      res.off('close', finish);
      res.off('error', finish);
      resolve();
    };
    res.once('finish', finish);
    res.once('close', finish);
    res.once('error', finish);
    // Re-check after attaching: the response could have closed in between, in
    // which case the events above have already been missed.
    if (alreadyDone()) finish();
  });
}

/**
 * Express middleware factory. Place AFTER requireAuth so the user is known.
 *
 * A request with no authenticated user is passed through unmetered: there is
 * nobody to charge, and refusing would break public endpoints. Such calls are
 * still recorded by the usage tracker.
 */
export function meterAI(opts: MeterAIOptions): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    const r = req as Request & { user?: { id?: string } };
    const userId = r.user?.id;
    if (!userId) return next();

    let plan: PlanId | null = null;
    try {
      plan = await resolveVeegptPlan(userId);
    } catch {
      plan = null;
    }
    // Plan unresolvable → treat as the most restrictive real plan rather than
    // skipping enforcement, so a lookup failure cannot become free premium usage.
    const effectivePlan: PlanId = plan ?? 'free';

    let model: string | undefined;
    try {
      model =
        typeof opts.model === 'function' ? await opts.model(req) : opts.model;
    } catch (err) {
      // The model could not be read. Leaving it undefined would estimate at the
      // CHEAP tier and skip tier enforcement, so treat it as unknown — which
      // shared/veegpt-model-tiers deliberately classifies as premium.
      model = 'unknown';
      logger.warn('meterAI: model resolution failed, estimating as unknown', {
        feature: opts.feature,
        err: err instanceof Error ? err.message : String(err),
        module: 'meter-ai',
      });
    }

    // An idempotency key from the client when supplied, so a retried request
    // reuses its reservation instead of double-charging.
    //
    // A client-supplied header is NOT trusted to name one logical operation: it is
    // only honoured while the first attempt is still in flight. Honouring a
    // completed one would let a client replay a single id forever and get
    // unlimited free AI. A key we generate ourselves is unique per request, so
    // trust is irrelevant for it.
    const headerKey = req.header('x-request-id') || req.header('idempotency-key');
    const requestId = headerKey || `http_${randomUUID()}`;

    // Score behaviour ONCE per request and reuse the verdict for both the rate
    // limit and the quota gate, rather than assessing the same user twice.
    //
    // Account age feeds the `account` signal (heavy volume from an account created
    // hours ago). It is cached for hours, so this is not a per-request read.
    const abuse = await assessAbuse(userId, effectivePlan, {
      accountAgeDays: await accountAgeDays(userId).catch(() => undefined),
    }).catch(() => undefined);
    const adjust = adjustmentFor(abuse?.effectiveAction ?? 'allow');

    const rl = await rateLimitCheck(userId, effectivePlan, adjust.rpmFactor);
    res.setHeader('X-RateLimit-Limit', String(rl.limit));
    if (rl.blocked) {
      res.setHeader('Retry-After', String(rl.retryAfter));
      try {
        const today = new Date().toISOString().slice(0, 10);
        void getRedisClient().incr(`veegpt_rate_limit_violations:${today}`);
      } catch {
        /* best-effort metric */
      }
      res.status(429).json({
        error: 'Too many AI requests',
        code: VGU_ERROR.RATE_LIMITED,
        message:
          'You are sending requests too quickly. Please wait a few seconds and try again.',
        retryAfter: rl.retryAfter,
        limit: rl.limit,
        remaining: 0,
      });
      return;
    }

    try {
      await withVGU(
        {
          userId,
          workspaceId: workspaceIdOf(req),
          plan: effectivePlan,
          feature: opts.feature,
          model,
          modelChosenBy: opts.modelChosenBy ?? 'platform',
          requestId,
          tools: opts.tools?.(req),
          attachments: opts.attachments?.(req),
          promptChars: opts.promptChars?.(req),
          // Only a fingerprint is derived from this; the text is never stored.
          promptText: opts.promptText?.(req),
          userAgent: req.header('user-agent') || undefined,
          abuse,
          meta: {
            userId,
            route: req.originalUrl?.split('?')[0],
            method: req.method,
          },
        },
        async () => {
          next();
          await responseSettled(res);
          // A handler that failed with a 5xx should not be charged as a success;
          // throwing here lets withVGU decide from measured usage (partial usage
          // is charged, zero usage is refunded).
          if (res.statusCode >= 500) {
            throw new Error(`handler responded ${res.statusCode}`);
          }
        }
      );
    } catch (err) {
      if (res.headersSent) {
        // The handler already replied; the quota outcome is recorded and there is
        // nothing more to send.
        if (!(err instanceof VGUQuotaError)) {
          logger.warn('meterAI: request failed after the response was sent', {
            feature: opts.feature,
            err: err instanceof Error ? err.message : String(err),
            module: 'meter-ai',
          });
        }
        return;
      }
      if (sendVGUError(res, err)) return;
      next(err);
    }
  };
}

export default meterAI;
