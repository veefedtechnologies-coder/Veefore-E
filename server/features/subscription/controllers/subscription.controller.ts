/**
 * Subscription Controller
 *
 * Handles all HTTP request/response concerns for the subscription feature.
 * Business logic is delegated entirely to SubscriptionService, AddOnService,
 * and EntitlementService. This layer is responsible only for:
 *  - Zod input validation
 *  - userId / req.user.id ownership checks (403 on mismatch)
 *  - Building and returning the HTTP response
 *  - Redis caching of the /me response (30s TTL)
 *
 * All service singletons are resolved lazily at call time so the module can
 * be imported before the server fully initialises.
 *
 * Satisfies Requirements: 7.1 – 7.8 (REST API surface), 15.6 (Redis cache for /me)
 */

import { z } from 'zod';
import crypto from 'crypto';
import { type Request, type Response } from 'express';
import {
  getEntitlementService,
  UsageCounterModel,
} from '../services/EntitlementService';
import { getSubscriptionService } from '../services/SubscriptionService';
import { getAddOnService } from '../services/AddOnService';
import { razorpaySubscriptionService } from '../services/RazorpaySubscriptionService';
import SubscriptionRepository from '../db/repositories/SubscriptionRepository';
import { providerCostUSD } from '../../../config/veegpt-pricing.registry';
import {
  isStaleCancellationFlag,
  shouldFinalizeCancellation,
} from '../lib/subscriptionAccess';
import AICreditsModel from '../db/models/AICreditsModel';
import AICreditTransactionModel from '../db/models/AICreditTransactionModel';
import { getRedisClient } from '../../../lib/redis';
import { invalidateBootstrapCache } from '../../../lib/html-bootstrap';
import logger from '../../../config/logger';
import { User } from '../../../models/User/User';
import { sendCancellationEmail } from '../../../services/resend.service';
import {
  PLAN_CONFIG,
  isValidPlan,
  ADDON_CONFIG,
} from '../../../config/plan-config';
import type { PlanId } from '../../../config/plan-config';
import {
  SubscriptionEventModel,
  SUBSCRIPTION_MODAL_TYPES,
  MODAL_CLAIM_LEASE_MS,
  type SubscriptionModalType,
} from '../db/models/SubscriptionEventModel';

/**
 * Rupee amounts that unambiguously identify a one-time AI credit pack purchase —
 * i.e. a one-time add-on price that does NOT collide with any plan's monthly or
 * yearly price. Used to correctly label legacy payment rows whose `source` was
 * never stored (they otherwise fell through to the generic "Subscription
 * billing" label even when they were clearly a credit purchase).
 */
const UNAMBIGUOUS_CREDIT_PACK_RUPEES: ReadonlySet<number> = (() => {
  const planRupees = new Set<number>();
  for (const plan of Object.values(PLAN_CONFIG)) {
    planRupees.add(plan.pricing.monthly / 100);
    planRupees.add(plan.pricing.yearly / 100);
  }
  const creditRupees = new Set<number>();
  for (const addon of Object.values(ADDON_CONFIG)) {
    if (addon.priceOneTime !== null) {
      const rupees = addon.priceOneTime / 100;
      if (!planRupees.has(rupees)) creditRupees.add(rupees);
    }
  }
  return creditRupees;
})();

// ---------------------------------------------------------------------------
// Internal helpers — lazy singleton wiring
// ---------------------------------------------------------------------------

/**
 * Resolves the three service singletons at call time.
 * Avoids circular-init issues by deferring construction until first request.
 */
function getServices() {
  const redis = getRedisClient();
  const subscriptionRepo = new SubscriptionRepository();
  const entitlementService = getEntitlementService(redis, subscriptionRepo);
  const subscriptionService = getSubscriptionService(
    subscriptionRepo,
    entitlementService,
    redis
  );
  const addOnService = getAddOnService(entitlementService, redis);
  return {
    redis,
    subscriptionRepo,
    entitlementService,
    subscriptionService,
    addOnService,
  };
}

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const CreateSubscriptionSchema = z.object({
  planId: z.string(),
  billingCycle: z.enum(['monthly', 'yearly']),
  workspaceId: z.string(),
  email: z.string().email(),
  phone: z.string(),
});

const UpgradeSchema = z.object({
  newPlanId: z.string(),
});

const DowngradeSchema = z.object({
  newPlanId: z.string(),
  // Optional opt-in to apply the downgrade immediately instead of at period
  // end. Defaults to the normal scheduled behaviour when omitted.
  immediate: z.boolean().optional(),
});

const AddAddonSchema = z.object({
  addonType: z.string(),
  quantity: z.number().int().min(1).default(1),
});

const CreateCreditPackOrderSchema = z.object({
  addonType: z.string(),
  quantity: z.number().int().min(1).max(20).default(1),
});

const RemoveAddonSchema = z.object({
  addOnId: z.string().uuid(),
});

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SUB_ME_CACHE_TTL = 30; // seconds
const SUB_ME_CACHE_PREFIX = 'sub:me:';

// ---------------------------------------------------------------------------
// Utility — extract and validate userId from request
// ---------------------------------------------------------------------------

/**
 * Returns the userId from the authenticated request (req.user.id).
 * When a `paramUserId` is supplied (from body or route params), validates
 * it matches the authenticated user — sends 403 and returns null on mismatch.
 */
function resolveUserId(
  req: Request,
  res: Response,
  paramUserId?: string
): string | null {
  // req.user is attached by auth middleware
  const authUserId = (req as Request & { user?: { id: string } }).user?.id;

  if (!authUserId) {
    res.status(401).json({ error: 'Unauthorised' });
    return null;
  }

  if (paramUserId !== undefined && paramUserId !== authUserId) {
    logger.warn('userId mismatch — possible IDOR attempt', {
      userId: authUserId,
      paramUserId,
      component: 'SubscriptionController',
    });
    res
      .status(403)
      .json({ error: 'Forbidden: userId does not match authenticated user' });
    return null;
  }

  return authUserId;
}

// ---------------------------------------------------------------------------
// 1. createSubscription
// ---------------------------------------------------------------------------

/**
 * POST /api/subscription/create
 *
 * Validates the request body, verifies the userId in the body matches the
 * authenticated user, then delegates to SubscriptionService.create().
 *
 * Response: { subscriptionId: string, checkoutUrl: string }
 *
 * `subscriptionId` is the primary field the client uses to launch Razorpay's
 * Checkout.js modal directly (see SubscriptionCheckoutPage.tsx) — that flow
 * has a `handler` callback that returns the user to /settings/billing on
 * completion. `checkoutUrl` (Razorpay's short_url hosted page) is kept only
 * as a fallback for callers that can't run Checkout.js; it has no
 * callback_url configured, so success/failure there does NOT navigate back
 * into the app.
 */
export async function createSubscription(
  req: Request,
  res: Response
): Promise<void> {
  const parseResult = CreateSubscriptionSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      error: 'Validation failed',
      details: parseResult.error.flatten(),
    });
    return;
  }

  const { planId, billingCycle, workspaceId, email, phone } = parseResult.data;

  // Validate that the authenticated user is the one initiating the subscription.
  // If a userId field was passed in the body, check it matches.
  const bodyUserId = (req.body as Record<string, unknown>).userId as
    string | undefined;
  const userId = resolveUserId(req, res, bodyUserId);
  if (!userId) return;

  try {
    const { subscriptionService } = getServices();
    const result = await subscriptionService.create(
      userId,
      workspaceId,
      planId,
      billingCycle,
      email,
      phone
    );

    res.status(200).json({
      subscriptionId: result.subscriptionId,
      checkoutUrl: result.checkoutUrl,
    });
  } catch (err) {
    const error = err as Error & { statusCode?: number };
    logger.error('createSubscription failed', error, {
      userId,
      component: 'SubscriptionController',
    });
    res.status(error.statusCode ?? 500).json({ error: error.message });
  }
}

// ---------------------------------------------------------------------------
// 1a. claimNextSubscriptionModalEvent
// ---------------------------------------------------------------------------

/**
 * Atomically claims the oldest completed, future-only subscription event that
 * is eligible for a premium account modal. The event writer sets modalType;
 * historical events and recurring subscription.charged renewals have no type
 * and therefore can never be surfaced here.
 *
 * Delivery uses a LEASE-AND-ACK protocol so a modal is never lost or shown
 * twice:
 *   - Claiming LEASES the event (stamps modalClaimedAt) and returns it. It is
 *     NOT permanently consumed yet.
 *   - The client renders the modal and calls `.../events/:id/ack` once shown,
 *     which stamps modalAckedAt (permanent consume — never offered again).
 *   - If the client crashes / times out / hard-reloads before acknowledging,
 *     the lease expires after MODAL_CLAIM_LEASE_MS and the event becomes
 *     claimable again, so a genuine event is recovered on the next visit
 *     instead of being burned by the claim.
 */
const MODAL_ELIGIBLE_PAIRS: Array<{
  eventType: string;
  modalType: SubscriptionModalType;
}> = [
  { eventType: 'subscription.activated', modalType: 'premium_welcome' },
  { eventType: 'subscription.downgraded', modalType: 'plan_change_success' },
  {
    eventType: 'addon.credit_pack_purchased',
    modalType: 'credit_purchase_success',
  },
];

/**
 * Freshness window: a celebratory modal is only surfaced for an event that
 * JUST happened, never replayed from history.
 *
 * BUG FIX: without this, EVERY unacknowledged eligible event (including a
 * backlog of historical/test purchases, downgrades and credit packs) was
 * offered on every session — so the success/plan-change modals appeared to
 * "always show", draining one after another, and a single missed ack could
 * loop forever once its 3-minute lease expired. Bounding eligibility to recent
 * events means: a real, just-completed purchase still shows once on the user's
 * next visit, but stale events can never resurface. Overridable via env.
 */
const MODAL_EVENT_MAX_AGE_MS = (() => {
  const minutes = Number(process.env.SUBSCRIPTION_MODAL_MAX_AGE_MINUTES);
  const resolved = Number.isFinite(minutes) && minutes > 0 ? minutes : 30;
  return resolved * 60 * 1000;
})();

export async function claimNextSubscriptionModalEvent(
  req: Request,
  res: Response
): Promise<void> {
  const userId = resolveUserId(req, res);
  if (!userId) return;

  try {
    const now = new Date();
    // A lease stamped before this instant is expired and may be re-claimed.
    const leaseCutoff = new Date(now.getTime() - MODAL_CLAIM_LEASE_MS);
    // Only events newer than this are eligible — stale/backlog events never
    // resurface (see MODAL_EVENT_MAX_AGE_MS).
    const freshnessCutoff = new Date(now.getTime() - MODAL_EVENT_MAX_AGE_MS);

    const event = await SubscriptionEventModel.findOneAndUpdate(
      {
        userId,
        // Never re-offer a permanently acknowledged (shown) event.
        modalAckedAt: null,
        modalType: { $in: SUBSCRIPTION_MODAL_TYPES },
        // Recent events only — this is the core "no replaying history" guard.
        timestamp: { $gte: freshnessCutoff },
        $and: [
          { $or: MODAL_ELIGIBLE_PAIRS },
          // Claimable when never leased, or the previous lease has expired
          // (crashed/abandoned claim) — this is what makes delivery crash-safe.
          {
            $or: [
              { modalClaimedAt: null },
              { modalClaimedAt: { $lte: leaseCutoff } },
            ],
          },
        ],
      },
      // (Re)stamp the lease. Ownership is proven by returning the fresh doc.
      { $set: { modalClaimedAt: now } },
      { sort: { timestamp: 1 }, new: true }
    ).lean();

    if (!event) {
      res.status(200).json({ event: null });
      return;
    }

    const metadata = (event.metadata ?? {}) as Record<string, unknown>;
    const toSafePlan = (value: unknown): PlanId | null =>
      typeof value === 'string' && isValidPlan(value)
        ? (value as PlanId)
        : null;
    const credits = Number(metadata.credits);
    const quantity = Number(metadata.quantity);

    res.status(200).json({
      event: {
        id: String(event._id),
        modalType: event.modalType,
        previousPlan: toSafePlan(event.previousPlan),
        newPlan: toSafePlan(event.newPlan),
        credits: Number.isFinite(credits) && credits > 0 ? credits : null,
        quantity: Number.isInteger(quantity) && quantity > 0 ? quantity : null,
        addonType:
          typeof metadata.addonType === 'string'
            ? metadata.addonType.slice(0, 80)
            : null,
        timestamp: event.timestamp.toISOString(),
      },
    });
  } catch (err) {
    const error = err as Error;
    logger.error('claimNextSubscriptionModalEvent failed', error, {
      userId,
      component: 'SubscriptionController',
    });
    res.status(500).json({ error: 'Unable to load subscription update' });
  }
}

// ---------------------------------------------------------------------------
// 1a-i. ackSubscriptionModalEvent
// ---------------------------------------------------------------------------

/**
 * POST /api/v2/subscription/events/:id/ack
 *
 * Completes the lease-and-ack protocol. The client calls this after it has
 * actually displayed (or the user has dismissed) a leased modal event:
 *   - `{ renew: true }` re-stamps the lease so a long-open modal is never
 *     stolen by another visible tab while it remains on screen (heartbeat).
 *   - Otherwise it permanently acknowledges the event (stamps modalAckedAt),
 *     so it can never be offered again.
 *
 * Ownership is enforced by userId + id; a caller can only ack its own events.
 * Idempotent: acking an already-acked event is a no-op success.
 */
export async function ackSubscriptionModalEvent(
  req: Request,
  res: Response
): Promise<void> {
  const userId = resolveUserId(req, res);
  if (!userId) return;

  const eventId =
    typeof req.params?.id === 'string' ? req.params.id : undefined;
  if (!eventId || !/^[a-fA-F0-9]{24}$/.test(eventId)) {
    res.status(400).json({ error: 'Invalid event id' });
    return;
  }

  const renew =
    (req.body as Record<string, unknown> | undefined)?.renew === true;

  try {
    const update = renew
      ? { $set: { modalClaimedAt: new Date() } }
      : { $set: { modalAckedAt: new Date() } };

    const result = await SubscriptionEventModel.updateOne(
      {
        _id: eventId,
        userId,
        modalType: { $in: SUBSCRIPTION_MODAL_TYPES },
      },
      update
    );

    // matchedCount 0 → not this user's event (or not a modal event). Treat a
    // missing/foreign id as a benign no-op so a stale client can't probe.
    res.status(200).json({ success: result.matchedCount > 0 });
  } catch (err) {
    const error = err as Error;
    logger.error('ackSubscriptionModalEvent failed', error, {
      userId,
      component: 'SubscriptionController',
    });
    res
      .status(500)
      .json({ error: 'Unable to acknowledge subscription update' });
  }
}

// ---------------------------------------------------------------------------
// 1a-ii. getPaymentUpdateLink
// ---------------------------------------------------------------------------

/**
 * POST /api/v2/subscription/payment-update-link
 *
 * Returns Razorpay's hosted subscription page URL so a user whose recurring
 * charge failed can re-authorize / update their payment method during the
 * grace period. Only valid while the subscription is actually in a renewal
 * failure state (`past_due` / `payment_failed`) so the link can't be abused to
 * mint checkout URLs for healthy subscriptions.
 */
export async function getPaymentUpdateLink(
  req: Request,
  res: Response
): Promise<void> {
  const userId = resolveUserId(req, res);
  if (!userId) return;

  try {
    const { subscriptionRepo } = getServices();
    const subscription = await subscriptionRepo.findByUserId(userId);

    if (!subscription || !subscription.razorpaySubscriptionId) {
      res.status(404).json({ error: 'No subscription found' });
      return;
    }

    const inFailureState =
      subscription.status === 'past_due' ||
      subscription.status === 'payment_failed';
    if (!inFailureState) {
      res
        .status(400)
        .json({ error: 'Subscription is not in a payment-failure state' });
      return;
    }

    const rzpSub = await razorpaySubscriptionService.getSubscription(
      subscription.razorpaySubscriptionId
    );
    const shortUrl =
      typeof rzpSub.short_url === 'string' ? rzpSub.short_url : null;

    if (!shortUrl) {
      res
        .status(502)
        .json({ error: 'Payment update link is temporarily unavailable' });
      return;
    }

    res.status(200).json({ shortUrl });
  } catch (err) {
    const error = err as Error;
    logger.error('getPaymentUpdateLink failed', error, {
      userId,
      component: 'SubscriptionController',
    });
    res.status(500).json({ error: 'Unable to generate a payment update link' });
  }
}

// ---------------------------------------------------------------------------
// 1b. checkoutCallback
// ---------------------------------------------------------------------------

/**
 * POST /api/v2/subscription/checkout-callback
 *
 * Razorpay's redirect target for the Checkout.js `redirect: true` flow used
 * by SubscriptionCheckoutPage.tsx. This is NOT a webhook (Razorpay's webhook
 * delivery — POST /api/webhooks/razorpay — remains the sole source of truth
 * for granting paid access, per handleRazorpayWebhook). This endpoint only
 * decides which page in the app to send the browser to next.
 *
 * Razorpay performs this as a real browser top-level POST navigation
 * (unauthenticated, no cookies, no CSRF token — this is Razorpay's request,
 * not the logged-in user's fetch client), so it cannot go through
 * `requireAuth`. Instead we verify the payment signature Razorpay attaches
 * to the POST body to confirm the redirect genuinely came from Razorpay
 * before trusting it, exactly as Razorpay's own docs recommend for
 * redirect-based Checkout integrations.
 *
 * On success/failure/cancellation we 302-redirect the browser to the
 * appropriate Billing page state. We deliberately do NOT flip any
 * subscription status here — that stays the webhook's job so paid access is
 * only ever granted from a source Razorpay calls directly server-to-server.
 */
export async function checkoutCallback(
  req: Request,
  res: Response
): Promise<void> {
  const appBaseUrl =
    process.env.APP_BASE_URL ||
    process.env.FRONTEND_URL ||
    'http://localhost:5173';
  const billingUrl = (query: string) =>
    res.redirect(302, `${appBaseUrl}/settings/billing${query}`);

  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const paymentId =
      typeof body.razorpay_payment_id === 'string'
        ? body.razorpay_payment_id
        : '';
    const subscriptionId =
      typeof body.razorpay_subscription_id === 'string'
        ? body.razorpay_subscription_id
        : '';
    const signature =
      typeof body.razorpay_signature === 'string'
        ? body.razorpay_signature
        : '';
    const errorCode =
      typeof body['error[code]'] === 'string'
        ? (body['error[code]'] as string)
        : '';

    if (errorCode) {
      logger.info('Razorpay checkout redirect reported a payment error', {
        errorCode,
        subscriptionId,
        component: 'SubscriptionController.checkoutCallback',
      });
      billingUrl('?checkout=failed');
      return;
    }

    if (!paymentId || !subscriptionId || !signature) {
      // Customer closed/cancelled checkout before completing payment —
      // Razorpay does not POST back in this case, but guard anyway for any
      // malformed/incomplete redirect.
      billingUrl('?checkout=cancelled');
      return;
    }

    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keySecret) {
      logger.error(
        'checkoutCallback: RAZORPAY_KEY_SECRET missing',
        new Error('Missing secret'),
        {
          component: 'SubscriptionController.checkoutCallback',
        }
      );
      billingUrl('?checkout=failed');
      return;
    }

    // Razorpay's documented subscription payment-verification scheme:
    // signature = HMAC-SHA256( key_secret, `${payment_id}|${subscription_id}` )
    const expectedSignature = crypto
      .createHmac('sha256', keySecret)
      .update(`${paymentId}|${subscriptionId}`)
      .digest('hex');

    const validSignature =
      expectedSignature.length === signature.length &&
      crypto.timingSafeEqual(
        Buffer.from(expectedSignature),
        Buffer.from(signature)
      );

    if (!validSignature) {
      logger.warn('checkoutCallback: signature verification failed', {
        subscriptionId,
        component: 'SubscriptionController.checkoutCallback',
      });
      billingUrl('?checkout=failed');
      return;
    }

    // Signature is valid — the authentication payment was genuinely
    // completed. Actual plan activation still happens via the
    // subscription.activated / subscription.charged webhook, which may
    // arrive slightly before or after this redirect. We just send the user
    // back to a success state; BillingPage re-fetches /me on mount.
    billingUrl('?checkout=success');
  } catch (err) {
    logger.error(
      'checkoutCallback failed',
      err instanceof Error ? err : new Error(String(err)),
      {
        component: 'SubscriptionController.checkoutCallback',
      }
    );
    billingUrl('?checkout=failed');
  }
}

// ---------------------------------------------------------------------------
// 2. upgradeSubscription
// ---------------------------------------------------------------------------

/**
 * POST /api/subscription/upgrade
 *
 * Response: { success: true }
 */
export async function upgradeSubscription(
  req: Request,
  res: Response
): Promise<void> {
  const parseResult = UpgradeSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      error: 'Validation failed',
      details: parseResult.error.flatten(),
    });
    return;
  }

  const { newPlanId } = parseResult.data;
  const userId = resolveUserId(req, res);
  if (!userId) return;

  try {
    const { subscriptionService } = getServices();
    const result = await subscriptionService.upgrade(userId, newPlanId);
    // The upgrade is NOT applied yet — the client must complete payment at
    // checkoutUrl. Access changes only after the Razorpay webhook confirms it.
    res.status(200).json({
      success: true,
      pendingPayment: true,
      subscriptionId: result.subscriptionId,
      checkoutUrl: result.checkoutUrl,
    });
  } catch (err) {
    const error = err as Error & { statusCode?: number };
    logger.error('upgradeSubscription failed', error, {
      userId,
      component: 'SubscriptionController',
    });
    res.status(error.statusCode ?? 500).json({ error: error.message });
  }
}

// ---------------------------------------------------------------------------
// 3. downgradeSubscription
// ---------------------------------------------------------------------------

/**
 * POST /api/subscription/downgrade
 *
 * Response: { success: true }
 */
export async function downgradeSubscription(
  req: Request,
  res: Response
): Promise<void> {
  const parseResult = DowngradeSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      error: 'Validation failed',
      details: parseResult.error.flatten(),
    });
    return;
  }

  const { newPlanId, immediate } = parseResult.data;
  const userId = resolveUserId(req, res);
  if (!userId) return;

  try {
    const { subscriptionService } = getServices();
    await subscriptionService.downgrade(userId, newPlanId, { immediate });
    res.status(200).json({ success: true, immediate: Boolean(immediate) });
  } catch (err) {
    const error = err as Error & { statusCode?: number };
    logger.error('downgradeSubscription failed', error, {
      userId,
      component: 'SubscriptionController',
    });
    res.status(error.statusCode ?? 500).json({ error: error.message });
  }
}

// ---------------------------------------------------------------------------
// 4. cancelSubscription
// ---------------------------------------------------------------------------

/**
 * POST /api/subscription/cancel
 *
 * Response: { success: true }
 */
export async function cancelSubscription(
  req: Request,
  res: Response
): Promise<void> {
  const userId = resolveUserId(req, res);
  if (!userId) return;

  const reason =
    typeof req.body?.reason === 'string'
      ? req.body.reason.slice(0, 80)
      : undefined;
  const feedback =
    typeof req.body?.feedback === 'string'
      ? req.body.feedback.trim().slice(0, 500)
      : undefined;

  try {
    const { subscriptionService } = getServices();
    const result = await subscriptionService.cancel(userId, {
      reason,
      feedback,
    });
    res.status(200).json({
      success: true,
      autoRenew: result.autoRenew,
      accessEndsAt: result.accessEndsAt.toISOString(),
    });
  } catch (err) {
    const error = err as Error & { statusCode?: number };
    logger.error('cancelSubscription failed', error, {
      userId,
      component: 'SubscriptionController',
    });
    res.status(error.statusCode ?? 500).json({ error: error.message });
  }
}

// ---------------------------------------------------------------------------
// 5. resumeSubscription
// ---------------------------------------------------------------------------

/**
 * POST /api/subscription/resume
 *
 * Response: { success: true }
 */
export async function resumeSubscription(
  req: Request,
  res: Response
): Promise<void> {
  const userId = resolveUserId(req, res);
  if (!userId) return;

  try {
    const { subscriptionService } = getServices();
    await subscriptionService.resume(userId);
    res.status(200).json({ success: true });
  } catch (err) {
    const error = err as Error & { statusCode?: number };
    logger.error('resumeSubscription failed', error, {
      userId,
      component: 'SubscriptionController',
    });
    res.status(error.statusCode ?? 500).json({ error: error.message });
  }
}

// ---------------------------------------------------------------------------
// 6. getSubscriptionMe
// ---------------------------------------------------------------------------

/**
 * GET /api/subscription/me
 *
 * Builds the full SubscriptionMeResponse by aggregating data from multiple
 * collections. The response is cached in Redis for 30 seconds per user.
 *
 * Response shape:
 * {
 *   plan, billingCycle, status, currentPeriodEnd, nextBillingDate,
 *   cancelAtPeriodEnd, limits, usage, aiCredits, addOns
 * }
 */
export async function getSubscriptionMe(
  req: Request,
  res: Response
): Promise<void> {
  const userId = resolveUserId(req, res);
  if (!userId) return;

  const redis = getRedisClient();
  const cacheKey = `${SUB_ME_CACHE_PREFIX}${userId}`;

  // ── Cache check ──────────────────────────────────────────────────────────
  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      const cachedResponse = JSON.parse(cached) as {
        cancelAtPeriodEnd?: boolean;
        currentPeriodEnd?: string | null;
      };
      const cancellationExpired = Boolean(
        cachedResponse.cancelAtPeriodEnd &&
        cachedResponse.currentPeriodEnd &&
        new Date(cachedResponse.currentPeriodEnd) <= new Date()
      );
      if (!cancellationExpired) {
        logger.debug('/me cache hit', {
          userId,
          component: 'SubscriptionController',
        });
        res.status(200).json(cachedResponse);
        return;
      }
      await redis.del(cacheKey);
    }
  } catch (cacheErr) {
    // Non-fatal: proceed to DB fetch on Redis failure
    logger.warn('/me Redis cache read failed, falling back to DB', {
      userId,
      component: 'SubscriptionController',
    });
  }

  try {
    const { subscriptionRepo, entitlementService, addOnService } =
      getServices();

    // Lazily initialize the canonical balance from the effective plan. This
    // guarantees a Free user sees exactly 50 credits even before their first
    // AI action.
    await entitlementService.ensureCreditAccount(userId);

    // ── Parallel data fetch ───────────────────────────────────────────────
    const [subscription, effectiveLimits, aiCreditsDoc, addOns] =
      await Promise.all([
        subscriptionRepo.findByUserId(userId),
        entitlementService.getEffectiveLimits(userId),
        AICreditsModel.findOne({ userId }).lean(),
        addOnService.listActiveAddOns(userId),
      ]);

    // ── Self-heal a stale cancellation flag ───────────────────────────────
    // If an ACTIVE subscription still carries cancelAtPeriodEnd = true but the
    // cancellation was requested BEFORE the current paid period began, the flag
    // belongs to a plan the user cancelled right before upgrading — a newer
    // upgrade/charge started a fresh period, so the cancellation no longer
    // applies. Clear it so the active plan doesn't wrongly show as "cancelled"
    // (and so the daily expiry cron can't later downgrade a paying plan).
    if (isStaleCancellationFlag(subscription)) {
      try {
        await subscriptionRepo.upsert({
          userId,
          cancelAtPeriodEnd: false,
          cancellationReason: null,
          cancellationFeedback: null,
          cancellationRequestedAt: null,
          nextBillingDate: subscription.currentPeriodEnd,
        } as Parameters<typeof subscriptionRepo.upsert>[0]);

        // Mutate the in-memory copy so the response we build below is correct.
        subscription.cancelAtPeriodEnd = false;
        subscription.cancellationReason = null;
        subscription.cancellationFeedback = null;
        subscription.cancellationRequestedAt = null;
        subscription.nextBillingDate = subscription.currentPeriodEnd;

        logger.info('Cleared stale cancelAtPeriodEnd on active subscription', {
          userId,
          currentPeriodStart: subscription.currentPeriodStart,
          component: 'SubscriptionController',
        });
      } catch (healErr) {
        logger.warn('Failed to self-heal stale cancellation flag', {
          userId,
          component: 'SubscriptionController',
        });
      }
    }

    // ── Lazily finalize an expired cancellation ───────────────────────────
    // A voluntarily-cancelled subscription (cancelAtPeriodEnd = true) whose
    // paid-through date has now passed must land on Free with status
    // 'cancelled'. The daily_expiry_check cron normally does this, but it only
    // runs when Redis/BullMQ is available and only once per day — so the stored
    // record can lag. Access is ALREADY correct at this point (effectiveLimits
    // and the cancellationExpired branch below both enforce the cutoff), but we
    // persist the terminal state here so the DB self-heals on the user's next
    // visit even if the cron never runs. This is idempotent: once written, the
    // flag is cleared and the status is terminal, so it won't re-trigger.
    if (shouldFinalizeCancellation(subscription)) {
      const previousStatus = subscription.status;
      const previousPlan = subscription.plan;
      try {
        await subscriptionRepo.upsert({
          userId,
          status: 'cancelled',
          plan: 'free',
          pendingPlan: null,
          cancelAtPeriodEnd: false,
          gracePeriodEndsAt: null,
          pastDueGraceEndsAt: null,
          nextBillingDate: null,
          renewalRetryCount: 0,
          lastRenewalRetryAt: null,
        } as unknown as Parameters<typeof subscriptionRepo.upsert>[0]);

        // Record an audit event mirroring the cron finalizer so admin/history
        // sees a consistent trail regardless of which path finalized the sub.
        try {
          const { SubscriptionEventModel } =
            await import('../db/models/SubscriptionEventModel');
          await SubscriptionEventModel.create({
            eventType: 'subscription.cancelled',
            userId,
            subscriptionId: subscription.subscriptionId,
            previousStatus,
            newStatus: 'cancelled',
            previousPlan,
            newPlan: 'free',
            triggeredBy: 'cron',
            metadata: {
              reason: 'scheduled_cancellation_cutoff_reached',
              currentPeriodEnd: subscription.currentPeriodEnd,
              graceApplied: false,
              finalizedBy: 'lazy_me_check',
            },
            timestamp: new Date(),
          });
        } catch (auditErr) {
          logger.warn('Lazy cancellation finalize: audit event failed', {
            userId,
            component: 'SubscriptionController',
          });
        }

        // Invalidate entitlement + bootstrap caches so downstream reads reflect
        // the finalized Free state immediately.
        await entitlementService.invalidateCache(userId);
        void invalidateBootstrapCache(userId);
        // Also drop VeeGPT's own 60s plan cache so the AI quota gate + usage
        // panel show Free limits at once, not the pre-downgrade plan's.
        void import('../../../services/veegpt-plan')
          .then(m => m.invalidateVeegptPlanCache(userId))
          .catch(() => {});

        logger.info(
          'Lazily finalized expired cancellation to Free on /me fetch',
          {
            userId,
            previousPlan,
            currentPeriodEnd: subscription.currentPeriodEnd,
            component: 'SubscriptionController',
          }
        );
      } catch (finalizeErr) {
        // Non-fatal: the response below still enforces the cutoff (Free) even
        // if the write-back fails; the cron remains the backstop.
        logger.warn('Failed to lazily finalize expired cancellation', {
          userId,
          component: 'SubscriptionController',
        });
      }
    }

    // ── Usage counters (parallel) ─────────────────────────────────────────
    // workspacesUsed / profilesUsed / teamMembersUsed / scheduledPostsThisCycle
    // are resolved via EntitlementService.getUsageCounts(), which counts against
    // the user's REAL workspace IDs (same resolution path as the workspace
    // switcher UI) rather than a raw userId match — SocialAccount and Content
    // documents only carry workspaceId, not userId, so a direct userId filter
    // always returned 0/wrong-collection results here previously.
    const [
      {
        workspacesUsed,
        profilesUsed,
        teamMembersUsed,
        scheduledPostsThisCycle,
      },
      keywordCounter,
      aiConversationsCounter,
      followCampaignCounter,
    ] = await Promise.all([
      entitlementService.getUsageCounts(userId),

      // keywordConversationsThisCycle
      UsageCounterModel.findOne({
        userId,
        type: 'keywordConversations',
      }).lean(),

      // aiConversationsThisCycle
      UsageCounterModel.findOne({ userId, type: 'aiConversations' }).lean(),

      // followCampaignConversationsThisCycle
      UsageCounterModel.findOne({
        userId,
        type: 'followCampaignConversations',
      }).lean(),
    ]);

    // ── Assemble response ─────────────────────────────────────────────────
    // SECURITY: The effective plan is derived from entitlements (status-gated),
    // not directly from subscription.plan. Only 'active'/'trial' subscriptions
    // grant paid plan access. For 'started' (pending payment) → show 'free'.
    const now = new Date();
    const paidStatuses = ['active', 'trial'];
    const cancellationExpired = Boolean(
      subscription?.cancelAtPeriodEnd &&
      subscription.currentPeriodEnd != null &&
      subscription.currentPeriodEnd <= now
    );
    const cancellationPaidThrough = Boolean(
      subscription?.cancelAtPeriodEnd &&
      subscription.currentPeriodEnd != null &&
      subscription.currentPeriodEnd > now
    );
    const isPaymentFailed =
      !cancellationExpired &&
      subscription?.status === 'payment_failed' &&
      subscription.gracePeriodEndsAt != null &&
      subscription.gracePeriodEndsAt >= now;
    const isPastDue =
      !cancellationExpired &&
      subscription?.status === 'past_due' &&
      subscription.pastDueGraceEndsAt != null &&
      subscription.pastDueGraceEndsAt >= now;
    const effectivePlan =
      subscription &&
      !cancellationExpired &&
      (paidStatuses.includes(subscription.status) ||
        cancellationPaidThrough ||
        isPaymentFailed ||
        isPastDue)
        ? (subscription.plan ?? 'free')
        : 'free';

    // 'started'            → checkout initiated, mandate not yet authorized
    // 'mandate_authorized' → mandate authorized (refundable ₹1 charge only),
    //                        real first charge has been raised but has not
    //                        yet succeeded — still no paid access.
    const pendingStatuses = ['started', 'mandate_authorized'];

    const response = {
      plan: effectivePlan,
      // pendingPlan shows the plan being purchased/authorized (no paid access yet) for UI display only
      pendingPlan:
        subscription && pendingStatuses.includes(subscription.status)
          ? (subscription.plan ?? null)
          : null,
      billingCycle: subscription?.billingCycle ?? 'monthly',
      status: cancellationExpired
        ? 'cancelled'
        : (subscription?.status ?? 'inactive'),
      currentPeriodStart:
        subscription?.currentPeriodStart?.toISOString() ?? null,
      currentPeriodEnd: subscription?.currentPeriodEnd?.toISOString() ?? null,
      nextBillingDate:
        subscription?.cancelAtPeriodEnd || cancellationExpired
          ? null
          : (subscription?.nextBillingDate?.toISOString() ?? null),
      renewsAt:
        subscription && !subscription.cancelAtPeriodEnd && !cancellationExpired
          ? (subscription.nextBillingDate?.toISOString() ?? null)
          : null,
      accessEndsAt:
        subscription?.cancelAtPeriodEnd || cancellationExpired
          ? (subscription?.currentPeriodEnd?.toISOString() ?? null)
          : null,
      autoRenew: Boolean(
        subscription &&
        effectivePlan !== 'free' &&
        !subscription.cancelAtPeriodEnd &&
        !cancellationExpired
      ),
      cancelAtPeriodEnd: subscription?.cancelAtPeriodEnd ?? false,
      // Surfaces an ACTIVE renewal-failure grace window so the UI can prompt
      // the user to fix their payment method before access is revoked. Only
      // present while access is still retained (within the grace period);
      // null once resolved or once the cutoff has passed (Free downgrade).
      paymentIssue:
        isPastDue || isPaymentFailed
          ? {
              status: subscription?.status ?? 'past_due',
              graceEndsAt:
                (isPastDue
                  ? subscription?.pastDueGraceEndsAt
                  : subscription?.gracePeriodEndsAt
                )?.toISOString() ?? null,
              retryCount: subscription?.renewalRetryCount ?? 0,
            }
          : null,
      limits: effectiveLimits,
      usage: {
        workspacesUsed,
        profilesUsed,
        teamMembersUsed,
        scheduledPostsThisCycle,
        keywordConversationsThisCycle: keywordCounter?.countThisCycle ?? 0,
        aiConversationsThisCycle: aiConversationsCounter?.countThisCycle ?? 0,
        followCampaignConversationsThisCycle:
          followCampaignCounter?.countThisCycle ?? 0,
      },
      aiCredits: {
        remaining: Math.max(0, aiCreditsDoc?.remainingCredits ?? 0),
        monthly: aiCreditsDoc?.monthlyCredits ?? 0,
        purchased: aiCreditsDoc?.purchasedCredits ?? 0,
        usedThisCycle: aiCreditsDoc?.usedThisCycle ?? 0,
        nextResetAt: aiCreditsDoc?.nextResetAt?.toISOString() ?? null,
      },
      addOns: addOns.map(a => ({
        addOnId: a.addOnId,
        type: a.type,
        quantity: a.quantity,
        status: a.status,
        currentPeriodEnd: a.currentPeriodEnd?.toISOString() ?? null,
      })),
    };

    // ── Cache the response ────────────────────────────────────────────────
    try {
      await redis.set(
        cacheKey,
        JSON.stringify(response),
        'EX',
        SUB_ME_CACHE_TTL
      );
    } catch (cacheWriteErr) {
      // Non-fatal: still return the response even if caching fails
      logger.warn('/me Redis cache write failed', {
        userId,
        component: 'SubscriptionController',
      });
    }

    res.status(200).json(response);
  } catch (err) {
    const error = err as Error;
    logger.error('getSubscriptionMe failed', error, {
      userId,
      component: 'SubscriptionController',
    });
    res.status(500).json({ error: error.message });
  }
}

// ---------------------------------------------------------------------------
// 6b. getCreditHistory
// ---------------------------------------------------------------------------

/**
 * GET /api/v2/subscription/credits/history
 *
 * Returns the authenticated user's AI-credit ledger — every deduction,
 * finalization adjustment, refund, and skipped charge — plus lifetime and
 * current-cycle totals and the live balance snapshot. Powers the Credits page.
 *
 * Query params:
 *   - page   (1-based, default 1)
 *   - limit  (1..100, default 20)
 *   - type   ('all' | 'deduction' | 'refund' | 'adjustment' | 'skipped' | 'failed')
 *   - feature (optional AICreditFeature id filter)
 *
 * Response:
 * {
 *   balance: { remaining, monthly, purchased, rolloverCredits, usedThisCycle, nextResetAt, lastResetAt },
 *   totals:  { lifetimeSpent, lifetimeRefunded, transactionCount },
 *   items:   [{ id, feature, kind, status, credits, providerCostInr, workspaceId,
 *               automatic, refundReason, createdAt, updatedAt }],
 *   pagination: { page, limit, total, totalPages, hasMore }
 * }
 *
 * The classification maps the raw ledger status → a user-facing `kind`:
 *   settled/pending      → 'deduction'
 *   refunded/refunding/refund_pending → 'refund'
 *   adjusting            → 'adjustment'
 *   skipped              → 'skipped'
 *   failed               → 'failed'
 */
export async function getCreditHistory(
  req: Request,
  res: Response
): Promise<void> {
  const userId = resolveUserId(req, res);
  if (!userId) return;

  // ── Parse & clamp query params ─────────────────────────────────────────
  const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1);
  const limit = Math.min(
    100,
    Math.max(1, parseInt(String(req.query.limit ?? '20'), 10) || 20)
  );
  const typeFilter = String(req.query.type ?? 'all');
  const featureFilter = req.query.feature
    ? String(req.query.feature)
    : undefined;

  // Map the requested user-facing `type` to the underlying ledger statuses.
  const STATUS_BY_TYPE: Record<string, string[]> = {
    deduction: ['settled', 'pending'],
    refund: ['refunded', 'refunding', 'refund_pending'],
    adjustment: ['adjusting'],
    skipped: ['skipped'],
    failed: ['failed'],
  };

  const query: Record<string, unknown> = { userId };
  if (featureFilter) query.feature = featureFilter;
  if (typeFilter !== 'all' && STATUS_BY_TYPE[typeFilter]) {
    query.status = { $in: STATUS_BY_TYPE[typeFilter] };
  }

  try {
    const { entitlementService } = getServices();
    // Ensure the balance doc exists so a brand-new user sees their allowance.
    await entitlementService.ensureCreditAccount(userId);

    const [creditsDoc, total, rawItems, lifetimeAgg] = await Promise.all([
      AICreditsModel.findOne({ userId }).lean(),
      AICreditTransactionModel.countDocuments(query),
      AICreditTransactionModel.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      // Lifetime spent vs refunded across ALL of the user's transactions.
      AICreditTransactionModel.aggregate([
        { $match: { userId } },
        { $group: { _id: '$status', credits: { $sum: '$credits' } } },
      ]),
    ]);

    const spentStatuses = new Set(['settled', 'pending']);
    let lifetimeSpent = 0;
    let lifetimeRefunded = 0;
    for (const row of lifetimeAgg as Array<{ _id: string; credits: number }>) {
      if (row._id === 'refunded') lifetimeRefunded += row.credits;
      else if (spentStatuses.has(row._id)) lifetimeSpent += row.credits;
    }

    const kindForStatus = (status: string): string => {
      if (
        status === 'refunded' ||
        status === 'refunding' ||
        status === 'refund_pending'
      )
        return 'refund';
      if (status === 'adjusting') return 'adjustment';
      if (status === 'skipped') return 'skipped';
      if (status === 'failed') return 'failed';
      return 'deduction';
    };

    const items = (rawItems as Array<Record<string, any>>).map(tx => {
      const metadata = (tx.metadata ?? {}) as Record<string, unknown>;
      const credits = Number(tx.credits ?? 0);

      // Reserve-then-adjust bookkeeping. A caption reserves its ceiling (e.g. 2)
      // before the AI call, then the unused portion is refunded once real usage
      // is measured — leaving `credits` at the final charge. Surfacing the
      // original hold + refunded portion explains why the balance briefly dips
      // then recovers (otherwise it looks like credits appeared from nowhere).
      const refundedPortion =
        metadata.adjustmentRefund != null
          ? Number(metadata.adjustmentRefund)
          : 0;
      const overageCredits =
        metadata.overageCredits != null ? Number(metadata.overageCredits) : 0;
      const reservedCredits =
        refundedPortion > 0
          ? Math.round((credits + refundedPortion) * 100) / 100
          : overageCredits > 0 && metadata.overageBaseCredits != null
            ? Number(metadata.overageBaseCredits)
            : null;

      return {
        id: String(tx._id),
        feature: tx.feature as string,
        kind: kindForStatus(tx.status as string),
        status: tx.status as string,
        credits,
        providerCostInr: Number(tx.providerCostInr ?? 0),
        workspaceId: tx.workspaceId ?? null,
        automatic: metadata.automatic === true,
        refundReason: (metadata.refundReason as string) ?? null,
        // Set only when the ceiling reservation was trued-up to measured usage.
        reservedCredits,
        refundedPortion:
          refundedPortion > 0 ? Math.round(refundedPortion * 100) / 100 : null,
        adjustmentCredits:
          metadata.adjustmentCredits != null
            ? Number(metadata.adjustmentCredits)
            : null,
        overageCredits: overageCredits > 0 ? overageCredits : null,
        createdAt:
          tx.createdAt instanceof Date
            ? tx.createdAt.toISOString()
            : tx.createdAt,
        updatedAt:
          tx.updatedAt instanceof Date
            ? tx.updatedAt.toISOString()
            : tx.updatedAt,
      };
    });

    res.status(200).json({
      balance: {
        remaining: Math.max(0, creditsDoc?.remainingCredits ?? 0),
        monthly: creditsDoc?.monthlyCredits ?? 0,
        purchased: creditsDoc?.purchasedCredits ?? 0,
        rolloverCredits: creditsDoc?.rolloverCredits ?? 0,
        usedThisCycle: creditsDoc?.usedThisCycle ?? 0,
        nextResetAt: creditsDoc?.nextResetAt?.toISOString?.() ?? null,
        lastResetAt: creditsDoc?.lastResetAt?.toISOString?.() ?? null,
      },
      totals: {
        lifetimeSpent: Math.round(lifetimeSpent * 100) / 100,
        lifetimeRefunded: Math.round(lifetimeRefunded * 100) / 100,
        transactionCount: total,
      },
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
        hasMore: page * limit < total,
      },
    });
  } catch (err) {
    const error = err as Error;
    logger.error('getCreditHistory failed', error, {
      userId,
      component: 'SubscriptionController',
    });
    res.status(500).json({ error: error.message });
  }
}

// ---------------------------------------------------------------------------
// createCreditPackOrder — start a one-time AI credit pack purchase
// ---------------------------------------------------------------------------

/**
 * POST /api/v2/subscription/credits/create-order
 *
 * Starts the purchase of a one-time prepaid AI credit pack by creating a
 * Razorpay Order. Returns the parameters the client needs to open Checkout.
 *
 * IMPORTANT: this grants nothing. Credits are added only by the
 * `payment.captured` webhook once Razorpay confirms the money was captured, so
 * abandoning checkout leaves the account untouched and a replayed client call
 * cannot mint credits.
 *
 * Response: { orderId, amountPaise, currency, credits, addonType, keyId }
 */
export async function createCreditPackOrder(
  req: Request,
  res: Response
): Promise<void> {
  const parseResult = CreateCreditPackOrderSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      error: 'Validation failed',
      details: parseResult.error.flatten(),
    });
    return;
  }

  const { addonType, quantity } = parseResult.data;
  const userId = resolveUserId(req, res);
  if (!userId) return;

  try {
    const { addOnService } = getServices();
    const order = await addOnService.createCreditPackOrder(
      userId,
      addonType as Parameters<typeof addOnService.createCreditPackOrder>[1],
      quantity
    );
    res.status(200).json(order);
  } catch (err) {
    const error = err as Error & { statusCode?: number };
    logger.error('createCreditPackOrder failed', error, {
      userId,
      addonType,
      component: 'SubscriptionController',
    });
    res.status(error.statusCode ?? 500).json({ error: error.message });
  }
}

// ---------------------------------------------------------------------------
// 7. addAddon
// ---------------------------------------------------------------------------

/**
 * POST /api/subscription/addon/add
 *
 * Response: { success: true }
 */
export async function addAddon(req: Request, res: Response): Promise<void> {
  const parseResult = AddAddonSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      error: 'Validation failed',
      details: parseResult.error.flatten(),
    });
    return;
  }

  const { addonType, quantity } = parseResult.data;
  const userId = resolveUserId(req, res);
  if (!userId) return;

  try {
    const { addOnService } = getServices();
    // addonType string is validated against ADDON_CONFIG inside AddOnService.addAddOn
    await addOnService.addAddOn(
      userId,
      addonType as Parameters<typeof addOnService.addAddOn>[1],
      quantity
    );
    res.status(200).json({ success: true });
  } catch (err) {
    const error = err as Error & { statusCode?: number };
    logger.error('addAddon failed', error, {
      userId,
      component: 'SubscriptionController',
    });
    res.status(error.statusCode ?? 500).json({ error: error.message });
  }
}

// ---------------------------------------------------------------------------
// 8. removeAddon
// ---------------------------------------------------------------------------

/**
 * POST /api/subscription/addon/remove
 *
 * Response: { success: true }
 */
export async function removeAddon(req: Request, res: Response): Promise<void> {
  const parseResult = RemoveAddonSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      error: 'Validation failed',
      details: parseResult.error.flatten(),
    });
    return;
  }

  const { addOnId } = parseResult.data;
  const userId = resolveUserId(req, res);
  if (!userId) return;

  try {
    const { addOnService } = getServices();
    await addOnService.removeAddOn(userId, addOnId);
    res.status(200).json({ success: true });
  } catch (err) {
    const error = err as Error & { statusCode?: number };
    logger.error('removeAddon failed', error, {
      userId,
      component: 'SubscriptionController',
    });
    res.status(error.statusCode ?? 500).json({ error: error.message });
  }
}

// ---------------------------------------------------------------------------
// 10. downgradeToFree
// ---------------------------------------------------------------------------

/**
 * POST /api/subscription/downgrade-to-free
 *
 * Immediately resets the user to the free plan. Cancels any active Razorpay
 * subscription, sets plan='free', status='active', clears billing fields.
 *
 * Response: { success: true }
 */
export async function downgradeToFree(
  req: Request,
  res: Response
): Promise<void> {
  const userId = resolveUserId(req, res);
  if (!userId) return;

  try {
    const { subscriptionRepo, entitlementService } = getServices();

    const subscription = await subscriptionRepo.findByUserId(userId);

    // Capture the plan being cancelled BEFORE we reset it (for the email).
    const cancelledPlan = subscription?.plan;
    const accessUntil = subscription?.currentPeriodEnd ?? new Date();

    // Cancel on Razorpay if there's an active remote subscription
    if (subscription?.razorpaySubscriptionId) {
      try {
        await razorpaySubscriptionService.cancelSubscription(
          subscription.razorpaySubscriptionId,
          false
        );
      } catch {
        // Non-fatal — local state is authoritative
      }
    }

    // Immediately reset to free plan
    await subscriptionRepo.upsert({
      userId,
      plan: 'free' as any,
      status: 'active' as any,
      pendingPlan: null,
      cancelAtPeriodEnd: false,
      razorpaySubscriptionId: null,
      razorpayCustomerId: null,
    } as any);

    // Invalidate entitlement cache so limits take effect immediately
    await entitlementService.invalidateCache(userId);
    // Drop VeeGPT's own 60s plan cache so the AI quota gate + usage panel reflect
    // the new plan immediately instead of the pre-change limits.
    void import('../../../services/veegpt-plan')
      .then(m => m.invalidateVeegptPlanCache(userId))
      .catch(() => {});

    // Invalidate Redis subscription cache
    const redis = getRedisClient();
    await redis.del(`${SUB_ME_CACHE_PREFIX}${userId}`);

    // Invalidate the SSR bootstrap cache so the NEXT page load re-seeds the
    // workspace list with the new free-plan `locked` flags. Without this, the
    // bootstrap keeps seeding the pre-downgrade (all-accessible) workspace list
    // and the client's 5-min staleTime shows over-limit workspaces as usable.
    void invalidateBootstrapCache(userId);

    logger.info('downgradeToFree: user reset to free plan', {
      userId,
      component: 'SubscriptionController',
    });

    // Send the cancellation confirmation email (non-fatal). This is done HERE
    // because the Razorpay `subscription.cancelled` webhook can't send it: we
    // null razorpaySubscriptionId above, so that webhook no longer matches any
    // record. Only send when the user was actually on a PAID plan.
    if (cancelledPlan && cancelledPlan !== 'free') {
      void (async () => {
        try {
          const user = await User.findById(userId)
            .select('email displayName')
            .lean<{
              email?: string;
              displayName?: string;
            }>();
          if (user?.email) {
            const firstName = (user.displayName ?? '').split(' ')[0] || 'User';
            const planName = isValidPlan(cancelledPlan)
              ? PLAN_CONFIG[cancelledPlan as PlanId].name
              : String(cancelledPlan);
            await sendCancellationEmail(
              user.email,
              firstName,
              planName,
              accessUntil
            );
          }
        } catch (emailErr) {
          logger.warn('downgradeToFree: failed to send cancellation email', {
            userId,
            err:
              emailErr instanceof Error ? emailErr.message : String(emailErr),
            component: 'SubscriptionController',
          });
        }
      })();
    }

    res.status(200).json({ success: true });
  } catch (err) {
    const error = err as Error;
    logger.error('downgradeToFree failed', error, {
      userId,
      component: 'SubscriptionController',
    });
    res.status(500).json({ error: error.message });
  }
}

/**
 * GET /api/subscription/addon/list
 *
 * Response: { addOns: ActiveAddOnView[] }
 */
export async function listAddons(req: Request, res: Response): Promise<void> {
  const userId = resolveUserId(req, res);
  if (!userId) return;

  try {
    const { addOnService } = getServices();
    const addOns = await addOnService.listActiveAddOns(userId);

    res.status(200).json({
      addOns: addOns.map(a => ({
        addOnId: a.addOnId,
        type: a.type,
        quantity: a.quantity,
        status: a.status,
        currentPeriodEnd: a.currentPeriodEnd?.toISOString() ?? null,
      })),
    });
  } catch (err) {
    const error = err as Error;
    logger.error('listAddons failed', error, {
      userId,
      component: 'SubscriptionController',
    });
    res.status(500).json({ error: error.message });
  }
}

// ---------------------------------------------------------------------------
// 10. getBillingHistory — unified, user-scoped financial + AI usage ledger
// ---------------------------------------------------------------------------

/**
 * Estimated provider cost (USD) of one recorded AI call, for the customer ledger.
 *
 * Reads the ONE versioned pricing registry. This controller previously held a
 * third copy of the price table covering only 7 models, so every other model was
 * reported as costing ZERO in billing history.
 */
function billingEstimatedCost(
  model: string,
  input: number,
  output: number,
  cached = 0,
  reasoning = 0,
  at?: Date
): number {
  return providerCostUSD(
    model,
    {
      inputTokens: input,
      outputTokens: output,
      cachedTokens: cached,
      reasoningTokens: reasoning,
    },
    at ?? new Date()
  ).usd;
}

function billingIso(value: unknown): string {
  const date = value instanceof Date ? value : new Date(String(value));
  return date.toISOString();
}

/**
 * GET /api/v2/subscription/billing/history
 *
 * A read-only, authenticated customer ledger. It intentionally derives userId
 * only from requireAuth and never accepts a scope/user override. Monetary
 * amounts retain their source currency; estimated provider cost remains USD.
 */
export async function getBillingHistory(
  req: Request,
  res: Response
): Promise<void> {
  const userId = resolveUserId(req, res);
  if (!userId) return;

  // Financial and usage history must never be cached by browsers, service
  // workers, reverse proxies, or CDNs. Every filter selection reads fresh data.
  res.set({
    'Cache-Control':
      'private, no-store, no-cache, must-revalidate, proxy-revalidate',
    Pragma: 'no-cache',
    Expires: '0',
    'Surrogate-Control': 'no-store',
    Vary: 'Authorization, Cookie',
  });

  const page = Math.max(
    1,
    Number.parseInt(String(req.query.page ?? '1'), 10) || 1
  );
  const limit = Math.min(
    50,
    Math.max(10, Number.parseInt(String(req.query.limit ?? '20'), 10) || 20)
  );
  const rangeDays = [30, 90, 365].includes(Number(req.query.range))
    ? Number(req.query.range)
    : 30;
  const requestedType = String(req.query.type ?? 'all');
  const activityType = [
    'all',
    'payments',
    'refunds',
    'credits',
    'ai_usage',
  ].includes(requestedType)
    ? requestedType
    : 'all';
  const until = new Date();
  const since = new Date(
    Date.UTC(until.getUTCFullYear(), until.getUTCMonth(), until.getUTCDate())
  );
  since.setUTCDate(since.getUTCDate() - (rangeDays - 1));
  const dateMatch = { $gte: since, $lte: until };
  const candidateLimit = Math.min(page * limit, 500);

  try {
    const [paymentModule, invoiceModule, usageModule] = await Promise.all([
      import('../db/models/PaymentModel'),
      import('../db/models/InvoiceModel'),
      import('../../../services/aiUsageTracker'),
    ]);
    const PaymentModel = paymentModule.default;
    const InvoiceModel = invoiceModule.default;
    const { AIUsageEvent } = usageModule;

    const paymentQuery = { userId, createdAt: dateMatch };
    // Include both current refund records and legacy rows that were marked
    // `status=refunded` before refundStatus/refundAmount were populated.
    const refundQuery = {
      userId,
      updatedAt: dateMatch,
      $or: [
        { refundStatus: { $in: ['initiated', 'success', 'failed'] } },
        { status: 'refunded' },
      ],
    };
    const creditQuery = { userId, createdAt: dateMatch };
    const usageQuery = { userId, createdAt: dateMatch };

    await getServices().entitlementService.ensureCreditAccount(userId);

    const [
      creditsAccount,
      payments,
      refundPayments,
      creditEvents,
      usageEvents,
      paymentCount,
      refundCount,
      creditCount,
      usageCount,
      paymentSummary,
      creditSummary,
      usageSummary,
      modelRows,
      paymentDaily,
      creditDaily,
      usageDaily,
    ] = await Promise.all([
      AICreditsModel.findOne({ userId }).lean(),
      activityType === 'all' || activityType === 'payments'
        ? PaymentModel.find(paymentQuery)
            .sort({ createdAt: -1 })
            .limit(candidateLimit)
            .lean()
        : [],
      activityType === 'all' || activityType === 'refunds'
        ? PaymentModel.find(refundQuery)
            .sort({ updatedAt: -1 })
            .limit(candidateLimit)
            .lean()
        : [],
      activityType === 'all' || activityType === 'credits'
        ? AICreditTransactionModel.find(creditQuery)
            .sort({ createdAt: -1 })
            .limit(candidateLimit)
            .lean()
        : [],
      activityType === 'all' || activityType === 'ai_usage'
        ? AIUsageEvent.find(usageQuery)
            .sort({ createdAt: -1 })
            .limit(candidateLimit)
            .lean()
        : [],
      activityType === 'all' || activityType === 'payments'
        ? PaymentModel.countDocuments(paymentQuery)
        : 0,
      activityType === 'all' || activityType === 'refunds'
        ? PaymentModel.countDocuments(refundQuery)
        : 0,
      activityType === 'all' || activityType === 'credits'
        ? AICreditTransactionModel.countDocuments(creditQuery)
        : 0,
      activityType === 'all' || activityType === 'ai_usage'
        ? AIUsageEvent.countDocuments(usageQuery)
        : 0,
      PaymentModel.aggregate([
        { $match: paymentQuery },
        {
          $group: {
            _id: '$currency',
            paid: {
              $sum: {
                $cond: [
                  { $in: ['$status', ['captured', 'refunded']] },
                  '$amount',
                  0,
                ],
              },
            },
            refunded: {
              $sum: {
                $cond: [
                  { $eq: ['$refundStatus', 'success'] },
                  { $ifNull: ['$refundAmount', 0] },
                  0,
                ],
              },
            },
            purchases: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $in: ['$source', ['credits', 'addon']] },
                      { $in: ['$status', ['captured', 'refunded']] },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
          },
        },
      ]),
      AICreditTransactionModel.aggregate([
        { $match: creditQuery },
        {
          $group: {
            _id: null,
            consumed: {
              $sum: {
                $cond: [
                  { $in: ['$status', ['settled', 'pending']] },
                  '$credits',
                  0,
                ],
              },
            },
            refunded: {
              $sum: {
                $cond: [
                  {
                    $in: [
                      '$status',
                      ['refunded', 'refunding', 'refund_pending'],
                    ],
                  },
                  '$credits',
                  0,
                ],
              },
            },
            providerCostInr: { $sum: '$providerCostInr' },
          },
        },
      ]),
      AIUsageEvent.aggregate([
        { $match: usageQuery },
        {
          $group: {
            _id: null,
            calls: { $sum: 1 },
            promptTokens: { $sum: '$promptTokens' },
            completionTokens: { $sum: '$completionTokens' },
            totalTokens: { $sum: '$totalTokens' },
            cachedTokens: { $sum: '$cachedTokens' },
            estimatedCalls: { $sum: { $cond: ['$estimated', 1, 0] } },
          },
        },
      ]),
      AIUsageEvent.aggregate([
        { $match: usageQuery },
        {
          $group: {
            _id: { provider: '$provider', model: '$model' },
            calls: { $sum: 1 },
            promptTokens: { $sum: '$promptTokens' },
            completionTokens: { $sum: '$completionTokens' },
            totalTokens: { $sum: '$totalTokens' },
            cachedTokens: { $sum: '$cachedTokens' },
            estimatedCalls: { $sum: { $cond: ['$estimated', 1, 0] } },
          },
        },
        { $sort: { totalTokens: -1 } },
      ]),
      PaymentModel.aggregate([
        { $match: paymentQuery },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            spend: {
              $sum: {
                $cond: [
                  { $in: ['$status', ['captured', 'refunded']] },
                  '$amount',
                  0,
                ],
              },
            },
            refunds: {
              $sum: {
                $cond: [
                  { $eq: ['$refundStatus', 'success'] },
                  { $ifNull: ['$refundAmount', 0] },
                  0,
                ],
              },
            },
          },
        },
      ]),
      AICreditTransactionModel.aggregate([
        { $match: creditQuery },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            credits: {
              $sum: {
                $cond: [
                  { $in: ['$status', ['settled', 'pending']] },
                  '$credits',
                  0,
                ],
              },
            },
            creditRefunds: {
              $sum: {
                $cond: [
                  {
                    $in: [
                      '$status',
                      ['refunded', 'refunding', 'refund_pending'],
                    ],
                  },
                  '$credits',
                  0,
                ],
              },
            },
          },
        },
      ]),
      AIUsageEvent.aggregate([
        { $match: usageQuery },
        {
          $group: {
            _id: {
              day: {
                $dateToString: { format: '%Y-%m-%d', date: '$createdAt' },
              },
              model: '$model',
            },
            calls: { $sum: 1 },
            promptTokens: { $sum: '$promptTokens' },
            completionTokens: { $sum: '$completionTokens' },
            totalTokens: { $sum: '$totalTokens' },
            cachedTokens: { $sum: '$cachedTokens' },
          },
        },
      ]),
    ]);

    const paymentIds = [...payments, ...refundPayments].map((payment: any) =>
      String(payment.paymentId)
    );
    const invoices = paymentIds.length
      ? await InvoiceModel.find({
          userId,
          paymentId: { $in: paymentIds },
        }).lean()
      : [];
    const invoiceByPayment = new Map(
      invoices.map((invoice: any) => [String(invoice.paymentId), invoice])
    );

    const activities: Array<Record<string, unknown> & { occurredAt: string }> =
      [];
    const seenPaymentReferences = new Set<string>();
    const seenRefundReferences = new Set<string>();
    for (const payment of payments as any[]) {
      const paymentReference = String(
        payment.razorpayPaymentId ?? payment.paymentId
      );
      if (seenPaymentReferences.has(paymentReference)) continue;
      seenPaymentReferences.add(paymentReference);
      const invoice: any = invoiceByPayment.get(String(payment.paymentId));
      // Resolve an EFFECTIVE source. PaymentModel.source is a required enum, but
      // legacy rows (written before the field existed) can come back without it,
      // and those then rendered as the generic "Subscription billing" fallback —
      // e.g. a one-time AI credit order showing as subscription billing. When the
      // stored source is missing or not a recognised value, infer it from the
      // authoritative order-vs-subscription references:
      //   • a Razorpay ORDER with no subscription id and no plan → one-time credits
      //   • otherwise (has subscription id or a plan) → a subscription charge
      const KNOWN_SOURCES = [
        'subscription_auth',
        'subscription_renewal',
        'credits',
        'addon',
      ];
      let effectiveSource: string = payment.source;
      if (!KNOWN_SOURCES.includes(effectiveSource)) {
        if (payment.razorpayOrderId && !payment.razorpaySubscriptionId) {
          // A Razorpay ORDER (not a subscription) is a one-time purchase.
          effectiveSource = 'credits';
        } else if (
          !payment.razorpaySubscriptionId &&
          !payment.planId &&
          UNAMBIGUOUS_CREDIT_PACK_RUPEES.has(Number(payment.amount ?? 0))
        ) {
          // Legacy row with no references but an amount that matches a credit
          // pack price (and no plan) — it was a credit purchase.
          effectiveSource = 'credits';
        } else if (payment.razorpaySubscriptionId || payment.planId) {
          effectiveSource = 'subscription_auth';
        }
      }
      activities.push({
        id: `payment-${payment.paymentId}`,
        type: 'payment',
        occurredAt: billingIso(payment.paidAt ?? payment.createdAt),
        status: payment.status,
        title:
          effectiveSource === 'subscription_renewal'
            ? 'Subscription renewal'
            : effectiveSource === 'subscription_auth'
              ? 'Subscription activation'
              : effectiveSource === 'credits'
                ? 'AI credit purchase'
                : effectiveSource === 'addon'
                  ? 'Add-on purchase'
                  : 'Subscription payment',
        amount: Number(payment.amount ?? 0),
        currency: payment.currency,
        source: effectiveSource,
        method: payment.paymentMethod,
        planId: payment.planId || null,
        billingCycle: payment.billingCycle,
        reference: payment.razorpayPaymentId ?? payment.paymentId,
        invoice: invoice
          ? {
              number: invoice.invoiceNumber,
              pdfUrl: invoice.pdfUrl,
              baseAmount: invoice.baseAmount,
              gstAmount: invoice.gstAmount,
              gstRate: invoice.gstRate,
              totalAmount: invoice.totalAmount,
              gstin: invoice.gstin,
            }
          : null,
      });
    }
    for (const payment of refundPayments as any[]) {
      const refundReference = String(
        payment.refundId ?? payment.razorpayPaymentId ?? payment.paymentId
      );
      if (seenRefundReferences.has(refundReference)) continue;
      seenRefundReferences.add(refundReference);
      const storedRefundAmount = Number(payment.refundAmount ?? 0);
      const legacyFullRefund = payment.status === 'refunded';
      const normalizedRefundAmount =
        storedRefundAmount > 0
          ? storedRefundAmount
          : legacyFullRefund
            ? Number(payment.amount ?? 0)
            : 0;
      const normalizedRefundStatus = [
        'initiated',
        'success',
        'failed',
      ].includes(String(payment.refundStatus))
        ? String(payment.refundStatus)
        : legacyFullRefund
          ? 'success'
          : 'initiated';
      activities.push({
        id: `refund-${payment.refundId ?? payment.paymentId}`,
        type: 'refund',
        occurredAt: billingIso(payment.updatedAt),
        status: normalizedRefundStatus,
        title: 'Subscription refund',
        amount: normalizedRefundAmount,
        currency: payment.currency,
        source: payment.source,
        method: payment.paymentMethod,
        reference:
          payment.refundId ?? payment.razorpayPaymentId ?? payment.paymentId,
        originalPaymentId: payment.paymentId,
      });
    }
    for (const tx of creditEvents as any[]) {
      const metadata = (tx.metadata ?? {}) as Record<string, unknown>;
      activities.push({
        id: `credit-${String(tx._id)}`,
        type: 'credit',
        occurredAt: billingIso(tx.createdAt),
        status: tx.status,
        title: String(tx.feature)
          .replace(/[._-]+/g, ' ')
          .replace(/\b\w/g, letter => letter.toUpperCase()),
        credits: Number(tx.credits ?? 0),
        providerCostInr: Number(tx.providerCostInr ?? 0),
        automatic: metadata.automatic === true,
        refundReason: metadata.refundReason ?? null,
        reservedCredits: metadata.adjustmentRefund
          ? Number(tx.credits ?? 0) + Number(metadata.adjustmentRefund)
          : null,
        refundedPortion: metadata.adjustmentRefund
          ? Number(metadata.adjustmentRefund)
          : null,
      });
    }
    for (const event of usageEvents as any[]) {
      activities.push({
        id: `usage-${String(event._id)}`,
        type: 'ai_usage',
        occurredAt: billingIso(event.createdAt),
        status: event.estimated ? 'estimated' : 'reported',
        title: String(event.feature)
          .replace(/[._-]+/g, ' ')
          .replace(/\b\w/g, letter => letter.toUpperCase()),
        provider: event.provider,
        model: event.model,
        promptTokens: event.promptTokens,
        completionTokens: event.completionTokens,
        totalTokens: event.totalTokens,
        cachedTokens: event.cachedTokens ?? 0,
        estimated: event.estimated,
        estimatedCostUsd: billingEstimatedCost(
          event.model,
          event.promptTokens ?? 0,
          event.completionTokens ?? 0,
          event.cachedTokens ?? 0
        ),
      });
    }
    activities.sort(
      (a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt)
    );

    const [refundSummaryRows, refundDailyRows] = await Promise.all([
      PaymentModel.aggregate([
        { $match: refundQuery },
        {
          $group: {
            _id: '$currency',
            refunded: {
              $sum: {
                $cond: [
                  {
                    $or: [
                      { $eq: ['$refundStatus', 'success'] },
                      { $eq: ['$status', 'refunded'] },
                    ],
                  },
                  {
                    $cond: [
                      { $gt: [{ $ifNull: ['$refundAmount', 0] }, 0] },
                      '$refundAmount',
                      '$amount',
                    ],
                  },
                  0,
                ],
              },
            },
          },
        },
      ]),
      PaymentModel.aggregate([
        { $match: refundQuery },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$updatedAt' } },
            refunds: {
              $sum: {
                $cond: [
                  {
                    $or: [
                      { $eq: ['$refundStatus', 'success'] },
                      { $eq: ['$status', 'refunded'] },
                    ],
                  },
                  {
                    $cond: [
                      { $gt: [{ $ifNull: ['$refundAmount', 0] }, 0] },
                      '$refundAmount',
                      '$amount',
                    ],
                  },
                  0,
                ],
              },
            },
          },
        },
      ]),
    ]);
    const refundByCurrency = new Map(
      (refundSummaryRows as any[]).map(row => [
        String(row._id),
        Number(row.refunded ?? 0),
      ])
    );
    const paymentByCurrency = new Map(
      (paymentSummary as any[]).map(row => [String(row._id), row])
    );
    const currencies = new Set([
      ...paymentByCurrency.keys(),
      ...refundByCurrency.keys(),
    ]);
    const money = Array.from(currencies).map(currency => {
      const row: any = paymentByCurrency.get(currency) ?? {};
      const refunded = refundByCurrency.get(currency) ?? 0;
      return {
        currency,
        paid: Number(row.paid ?? 0),
        refunded,
        net: Number(row.paid ?? 0) - refunded,
        purchases: Number(row.purchases ?? 0),
      };
    });
    const aiModels = (modelRows as any[]).map(row => {
      const provider = String(row._id.provider || 'unknown');
      const model = String(row._id.model || 'Unknown model');
      return {
        provider,
        model,
        calls: row.calls,
        promptTokens: row.promptTokens,
        completionTokens: row.completionTokens,
        totalTokens: row.totalTokens,
        cachedTokens: row.cachedTokens,
        estimatedCalls: row.estimatedCalls,
        estimatedCostUsd: billingEstimatedCost(
          model,
          row.promptTokens,
          row.completionTokens,
          row.cachedTokens
        ),
      };
    });
    const estimatedCostUsd = aiModels.reduce(
      (sum, row) => sum + row.estimatedCostUsd,
      0
    );

    const seriesMap = new Map<string, Record<string, number>>();
    const seriesRow = (day: string) => {
      if (!seriesMap.has(day))
        seriesMap.set(day, {
          spend: 0,
          refunds: 0,
          credits: 0,
          creditRefunds: 0,
          aiCalls: 0,
          tokens: 0,
          estimatedCostUsd: 0,
        });
      return seriesMap.get(day)!;
    };
    // Fill the selected range with zero-value days so 30/90/365-day views have
    // genuinely different axes even when activity only happened recently.
    const cursor = new Date(
      Date.UTC(since.getUTCFullYear(), since.getUTCMonth(), since.getUTCDate())
    );
    const lastDay = new Date(
      Date.UTC(until.getUTCFullYear(), until.getUTCMonth(), until.getUTCDate())
    );
    while (cursor <= lastDay) {
      seriesRow(cursor.toISOString().slice(0, 10));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    for (const row of paymentDaily as any[])
      Object.assign(seriesRow(row._id), { spend: row.spend });
    for (const row of refundDailyRows as any[])
      Object.assign(seriesRow(row._id), { refunds: row.refunds });
    for (const row of creditDaily as any[])
      Object.assign(seriesRow(row._id), {
        credits: row.credits,
        creditRefunds: row.creditRefunds,
      });
    for (const row of usageDaily as any[]) {
      const point = seriesRow(row._id.day);
      point.aiCalls += row.calls;
      point.tokens += row.totalTokens;
      point.estimatedCostUsd += billingEstimatedCost(
        row._id.model,
        row.promptTokens,
        row.completionTokens,
        row.cachedTokens
      );
    }
    const series = Array.from(seriesMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, values]) => ({ date, ...values }));

    const total =
      Number(paymentCount) +
      Number(refundCount) +
      Number(creditCount) +
      Number(usageCount);
    const start = (page - 1) * limit;
    const creditTotals: any = (creditSummary as any[])[0] ?? {};
    const aiTotals: any = (usageSummary as any[])[0] ?? {};

    res.status(200).json({
      range: {
        days: rangeDays,
        since: since.toISOString(),
        until: until.toISOString(),
      },
      filters: { type: activityType, page, limit },
      summary: {
        money,
        credits: {
          remaining: Math.max(0, creditsAccount?.remainingCredits ?? 0),
          monthly: creditsAccount?.monthlyCredits ?? 0,
          purchased: creditsAccount?.purchasedCredits ?? 0,
          usedThisCycle: creditsAccount?.usedThisCycle ?? 0,
          consumed: Number(creditTotals.consumed ?? 0),
          refunded: Number(creditTotals.refunded ?? 0),
          providerCostInr: Number(creditTotals.providerCostInr ?? 0),
          nextResetAt: creditsAccount?.nextResetAt?.toISOString?.() ?? null,
        },
        ai: {
          calls: Number(aiTotals.calls ?? 0),
          promptTokens: Number(aiTotals.promptTokens ?? 0),
          completionTokens: Number(aiTotals.completionTokens ?? 0),
          totalTokens: Number(aiTotals.totalTokens ?? 0),
          cachedTokens: Number(aiTotals.cachedTokens ?? 0),
          estimatedCalls: Number(aiTotals.estimatedCalls ?? 0),
          estimatedCostUsd,
        },
        invoiceCount: await InvoiceModel.countDocuments({
          userId,
          createdAt: dateMatch,
        }),
      },
      series,
      models: aiModels,
      activities: activities.slice(start, start + limit),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
        hasMore: page * limit < total,
      },
      disclosure:
        'Provider cost is estimated from recorded tokens and the server pricing table. Payments and refunds are verified ledger records; currencies are never combined.',
    });
  } catch (err) {
    const error = err as Error;
    logger.error('getBillingHistory failed', error, {
      userId,
      component: 'SubscriptionController',
    });
    res.status(500).json({ error: 'Unable to load billing history' });
  }
}
