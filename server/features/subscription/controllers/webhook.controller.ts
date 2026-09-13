/**
 * Razorpay Webhook Controller
 *
 * Handles inbound Razorpay subscription/payment/refund lifecycle events.
 *
 * Security:
 *  - Route MUST be mounted with `express.raw({ type: 'application/json' })` so
 *    `req.body` arrives as a Buffer (raw bytes required for HMAC verification).
 *  - Signature is verified with HMAC-SHA256 via WebhookVerifier before any
 *    payload is parsed. Razorpay signs the raw body alone (no timestamp
 *    concatenation, unlike the previous Cashfree integration).
 *
 * Idempotency:
 *  - Razorpay does not guarantee a single top-level event ID field across all
 *    API versions, so we prefer the `x-razorpay-event-id` header when present
 *    and fall back to a derived key of `${event}:${entityId}`. Keys are
 *    stored in Redis with a 24-hour TTL via WebhookVerifier. Duplicate
 *    deliveries (Razorpay retries on non-200 responses) are silently
 *    acknowledged with HTTP 200 without re-processing.
 *
 * Billing model:
 *  - Razorpay charges the FULL plan amount on the subscription's
 *    authentication transaction — there is no separate "raise a real charge
 *    afterwards" step like the previous Cashfree mandate-then-charge flow.
 *    Paid access is granted the moment `subscription.activated` (first
 *    successful charge) or `subscription.charged` (renewal charge) fires.
 *
 * Satisfies Requirements: 10.1 – 10.8
 */

import type { Request, Response } from 'express';
import { webhookVerifier } from '../services/WebhookVerifier';
import { quotaNotifier } from '../services/QuotaNotifier';
import { getRedisClient } from '../../../lib/redis';
import SubscriptionRepository from '../db/repositories/SubscriptionRepository';
import { AICreditsRepository } from '../db/repositories/AICreditsRepository';
import {
  SubscriptionEventModel,
  type SubscriptionModalType,
} from '../db/models/SubscriptionEventModel';
import SubscriptionModel, {
  type ISubscription,
} from '../db/models/SubscriptionModel';
import PaymentModel from '../db/models/PaymentModel';
import { AddOnModel } from '../db/models/AddOnModel';
import { User } from '../../../models/User/User';
import {
  PLAN_CONFIG,
  isValidPlan,
  ADDON_CONFIG,
} from '../../../config/plan-config';
import type { PlanId, AddOnType } from '../../../config/plan-config';
import logger from '../../../config/logger';
import {
  sendInvoiceEmail,
  sendRefundEmail,
  sendCancellationEmail,
} from '../../../services/resend.service';
import { razorpaySubscriptionService } from '../services/RazorpaySubscriptionService';

// ---------------------------------------------------------------------------
// Razorpay webhook payload shape (minimal — only the fields we consume)
// ---------------------------------------------------------------------------

interface RazorpayWebhookEvent {
  entity: string;
  account_id?: string;
  event: string;
  contains?: string[];
  payload: Record<string, unknown>;
  created_at?: number;
}

// ---------------------------------------------------------------------------
// Lazy-initialised singletons
// ---------------------------------------------------------------------------

let _subscriptionRepo: SubscriptionRepository | null = null;
let _aiCreditsRepo: AICreditsRepository | null = null;

function getSubscriptionRepo(): SubscriptionRepository {
  if (!_subscriptionRepo) _subscriptionRepo = new SubscriptionRepository();
  return _subscriptionRepo;
}

function getAICreditsRepo(): AICreditsRepository {
  if (!_aiCreditsRepo) _aiCreditsRepo = new AICreditsRepository();
  return _aiCreditsRepo;
}

// ---------------------------------------------------------------------------
// Grace period — reuses the same 3-day window used by the existing
// grace_period_check cron job (subscriptionCronWorker.ts) and the previous
// Cashfree payment_failed handling, so renewal-retry behaviour is unchanged
// by the gateway migration.
// ---------------------------------------------------------------------------

const PAST_DUE_GRACE_PERIOD_DAYS = 3;

// ---------------------------------------------------------------------------
// Helper — resolve plan credits from PLAN_CONFIG (gateway-agnostic)
// ---------------------------------------------------------------------------

function planCreditsPerMonth(planId: string): number {
  if (!isValidPlan(planId)) return 0;
  return PLAN_CONFIG[planId as PlanId].limits.aiCreditsPerMonth;
}

// ---------------------------------------------------------------------------
// Helper — resolve the AUTHORITATIVE plan for the subscription being activated
// or charged.
//
// The plan is read from the Razorpay subscription's own `notes.veefore_plan_id`
// (set at creation in SubscriptionService.create/upgrade). This is tied to the
// exact subscription in the webhook payload, so it can never be a stale value.
//
// BUG FIX: previously the webhook applied `existing.pendingPlan ?? existing.plan`.
// If a user abandoned an earlier upgrade (leaving pendingPlan='pro') and then
// subscribed to a DIFFERENT plan (e.g. 'creator'), the activation applied the
// stale pendingPlan='pro' instead of the plan they actually paid for. Reading
// the plan from the subscription's own notes eliminates that class of bug.
// Falls back to pendingPlan → plan only if notes are missing.
// ---------------------------------------------------------------------------

function resolvePlanFromNotes(
  subEntity: Record<string, unknown>,
  existing: ISubscription
): PlanId {
  const notes = (subEntity.notes ?? {}) as Record<string, unknown>;
  const notePlan =
    typeof notes.veefore_plan_id === 'string' ? notes.veefore_plan_id : '';
  if (notePlan && isValidPlan(notePlan)) {
    return notePlan as PlanId;
  }
  const fallback = (existing.pendingPlan ?? existing.plan) as string;
  return (isValidPlan(fallback) ? fallback : existing.plan) as PlanId;
}

// ---------------------------------------------------------------------------
// Helper — convert Razorpay Unix-seconds timestamps to Date
// ---------------------------------------------------------------------------

function unixToDate(seconds: number | undefined | null): Date | null {
  if (seconds == null) return null;
  return new Date(seconds * 1000);
}

// ---------------------------------------------------------------------------
// Helper — write a raw SubscriptionEvent document
// ---------------------------------------------------------------------------

async function recordEvent(
  eventType: string,
  userId: string,
  subscriptionId: string,
  metadata: Record<string, unknown>,
  previousStatus?: string | null,
  newStatus?: string | null,
  previousPlan?: string | null,
  newPlan?: string | null,
  modalType?: SubscriptionModalType | null
): Promise<void> {
  try {
    await SubscriptionEventModel.create({
      eventType,
      userId,
      subscriptionId,
      previousStatus: previousStatus ?? null,
      newStatus: newStatus ?? null,
      previousPlan: previousPlan ?? null,
      newPlan: newPlan ?? null,
      triggeredBy: 'webhook',
      // Only completed, one-off events carry a modalType. Recurring renewals
      // (subscription.charged) never pass one, so they can never surface a
      // premium modal.
      modalType: modalType ?? null,
      modalClaimedAt: null,
      metadata,
      timestamp: new Date(),
    });
  } catch (err) {
    logger.error('Failed to write SubscriptionEvent audit record', err, {
      eventType,
      userId,
      subscriptionId,
      module: 'webhook.controller',
    });
  }
}

// ---------------------------------------------------------------------------
// Cache invalidation helper
// ---------------------------------------------------------------------------

/**
 * Invalidates BOTH Redis subscription caches for a user:
 *   - `sub:entitlement:{userId}` — used by feature/limit middleware checks.
 *   - `sub:me:{userId}`          — the cached GET /api/v2/subscription/me
 *                                  response the Billing UI reads (30s TTL).
 *
 * BUG FIX: this helper previously cleared ONLY the entitlement cache. When a
 * webhook applied a plan change (e.g. upgrade activation), the `sub:me` cache
 * kept serving the stale plan for up to 30 seconds, so right after a
 * successful payment the Billing page showed the OLD plan and only updated
 * once the TTL expired. Clearing both keys makes the new plan appear
 * immediately once the webhook processes.
 */
async function invalidateEntitlementCache(userId: string): Promise<void> {
  try {
    const redis = getRedisClient();
    await redis.del(`sub:entitlement:${userId}`, `sub:me:${userId}`);
    // A plan change alters the per-plan workspace limit, which decides which
    // workspaces are `locked`. Drop the SSR bootstrap cache too so the next
    // page load re-seeds the workspace list with fresh lock flags — otherwise
    // an upgrade keeps showing a workspace as locked (and a downgrade keeps it
    // unlocked) until the bootstrap cache TTL expires.
    try {
      const { invalidateBootstrapCache } =
        await import('../../../lib/html-bootstrap');
      void invalidateBootstrapCache(userId);
    } catch {
      /* non-fatal */
    }
    logger.debug('Subscription caches invalidated', {
      userId,
      module: 'webhook.controller',
    });
  } catch (err) {
    // Non-fatal: next request will recompute from DB
    logger.warn('Failed to invalidate subscription caches', {
      userId,
      err,
      module: 'webhook.controller',
    });
  }
}

// ---------------------------------------------------------------------------
// Phone capture — persist the contact number Razorpay collected during
// checkout, so future subscribe/resubscribe attempts can prefill it and
// skip Razorpay's mandatory "Contact details" step. Veefore itself has no
// phone field on signup, so the FIRST time we learn a real number is when
// Razorpay's own checkout mandate registration collects it — this is the
// only reliable source, and it only needs to happen once per user.
// ---------------------------------------------------------------------------

async function persistPhoneFromPayment(
  userId: string,
  paymentEntity: Record<string, unknown>
): Promise<void> {
  try {
    const rawContact = paymentEntity.contact;
    if (typeof rawContact !== 'string' && typeof rawContact !== 'number')
      return;

    // Razorpay's payment.entity.contact is E.164-ish, e.g. "+919876543210".
    // Normalise to the bare 10-digit Indian mobile number format our own
    // prefill/create-customer code already expects (see razorpayCheckout.ts
    // and RazorpaySubscriptionService.createCustomer).
    const digitsOnly = String(rawContact).replace(/\D/g, '');
    const tenDigit =
      digitsOnly.length > 10 ? digitsOnly.slice(-10) : digitsOnly;
    if (!/^\d{10}$/.test(tenDigit)) return;

    const user = await User.findById(userId)
      .select('preferences')
      .lean<{ preferences?: Record<string, unknown> }>();
    if (!user) return;

    // Don't overwrite a phone number the user has already saved/confirmed
    // elsewhere (e.g. Settings) — only fill it in when it's genuinely empty.
    if (user.preferences?.phone) return;

    await User.updateOne(
      { _id: userId },
      { $set: { 'preferences.phone': tenDigit } }
    );

    logger.info(
      'Captured phone number from Razorpay payment for future prefill',
      {
        userId,
        module: 'webhook.controller',
      }
    );
  } catch (err) {
    // Non-fatal — worst case the user is asked for their number again next time.
    logger.warn('Failed to persist phone number from Razorpay payment', {
      userId,
      err,
      module: 'webhook.controller',
    });
  }
}

// ---------------------------------------------------------------------------
// Payment recording — persist a Payment document for every captured charge.
//
// BUG FIX: previously no Payment record was ever created for subscription
// charges (PaymentModel was only ever READ by the refund handlers). So when a
// refund arrived, handleRefundProcessed couldn't find a matching payment and
// silently returned — the customer never got a refund email and the
// subscription was never downgraded. Recording the payment here (idempotent
// upsert by razorpayPaymentId) makes refunds resolvable.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Helper — reconcile a RECURRING ADD-ON subscription from a webhook.
//
// Add-on purchases create their own Razorpay subscription (see
// AddOnService.addAddOn), stored in AddOnModel — NOT SubscriptionModel. So an
// add-on's subscription.activated / .charged / .cancelled webhook finds no
// match in SubscriptionModel and used to be dropped with only a warning.
//
// That left add-ons stuck in 'pending' forever (never granting the limits the
// customer paid for) and never cancelled when the mandate stopped. This helper
// is called whenever no base subscription matches the incoming id.
//
// Returns true when the event belonged to an add-on and was handled.
// ---------------------------------------------------------------------------

async function reconcileAddOnFromWebhook(
  razorpaySubscriptionId: string,
  subEntity: Record<string, unknown>,
  intent: 'activate' | 'cancel'
): Promise<boolean> {
  try {
    const addOn = await AddOnModel.findOne({ razorpaySubscriptionId }).lean();
    if (!addOn) return false;

    if (intent === 'activate') {
      const periodEnd =
        unixToDate(subEntity.current_end as number | undefined) ??
        (() => {
          const d = new Date();
          d.setDate(d.getDate() + 30);
          return d;
        })();

      await AddOnModel.findOneAndUpdate(
        { razorpaySubscriptionId },
        { $set: { status: 'active', currentPeriodEnd: periodEnd } }
      );

      logger.info('Add-on activated/renewed from captured payment', {
        userId: addOn.userId,
        addonType: addOn.type,
        razorpaySubscriptionId,
        currentPeriodEnd: periodEnd,
        module: 'webhook.controller',
      });
    } else {
      await AddOnModel.findOneAndUpdate(
        { razorpaySubscriptionId },
        { $set: { status: 'cancelled' } }
      );

      logger.info('Add-on cancelled from provider webhook', {
        userId: addOn.userId,
        addonType: addOn.type,
        razorpaySubscriptionId,
        module: 'webhook.controller',
      });
    }

    // Entitlement limits are derived from active add-ons — refresh immediately.
    await invalidateEntitlementCache(addOn.userId);
    return true;
  } catch (err) {
    logger.error(
      'Failed to reconcile add-on from webhook',
      err instanceof Error ? err : new Error(String(err)),
      { razorpaySubscriptionId, intent, module: 'webhook.controller' }
    );
    // Returning false lets the caller fall through to its normal warning path.
    return false;
  }
}

/**
 * Resolve the payment method (card / upi / netbanking / …) for a payment.
 *
 * Prefer the value already on the webhook payment entity. Some events —
 * notably subscription.activated / subscription.charged — deliver a minimal
 * payment entity without `method`, which left our Payment rows showing
 * "Payment method unavailable" in the billing ledger. When it's missing, fetch
 * the payment from Razorpay to get the real method. Best-effort: returns null
 * if it still can't be determined (never throws).
 */
async function resolvePaymentMethod(
  paymentEntity: Record<string, unknown>
): Promise<string | null> {
  if (typeof paymentEntity.method === 'string' && paymentEntity.method) {
    return paymentEntity.method;
  }
  const paymentId = String(paymentEntity.id ?? '');
  if (!paymentId) return null;
  try {
    const fetched = await razorpaySubscriptionService.getPayment(paymentId);
    const method = (fetched as { method?: unknown }).method;
    return typeof method === 'string' && method ? method : null;
  } catch {
    return null;
  }
}

async function recordPayment(
  userId: string,
  subscription: ISubscription,
  paymentEntity: Record<string, unknown>,
  source: 'subscription_auth' | 'subscription_renewal'
): Promise<void> {
  try {
    const razorpayPaymentId = String(paymentEntity.id ?? '');
    if (!razorpayPaymentId) return;

    const amountPaise = Number(paymentEntity.amount ?? 0);
    const createdAtSec = Number(paymentEntity.created_at ?? 0);

    // Defence in depth: the plan we just granted is resolved from the Razorpay
    // subscription's `notes`, while the money actually captured arrives in the
    // payment entity. Those are set together server-side from PLAN_CONFIG, so a
    // mismatch should be impossible — if one appears it means either a config
    // drift or a tampered/misrouted subscription, and it must be visible rather
    // than silently granting a tier that was not paid for. We log instead of
    // throwing because legitimate discounts/coupons/proration can reduce the
    // captured amount, and rejecting here would strand a real payment.
    if (isValidPlan(subscription.plan) && subscription.plan !== 'free') {
      const cycle = subscription.billingCycle ?? 'monthly';
      const expectedPaise =
        PLAN_CONFIG[subscription.plan as PlanId].pricing[
          cycle as 'monthly' | 'yearly'
        ];
      if (expectedPaise > 0 && amountPaise > 0 && amountPaise < expectedPaise) {
        logger.warn(
          'Captured payment is LESS than the configured price of the granted plan — review for tampering or coupon/proration',
          {
            userId,
            plan: subscription.plan,
            billingCycle: cycle,
            capturedPaise: amountPaise,
            expectedPaise,
            razorpayPaymentId,
            razorpaySubscriptionId: subscription.razorpaySubscriptionId ?? null,
            module: 'webhook.controller',
          }
        );
      }
    }

    await PaymentModel.findOneAndUpdate(
      { razorpayPaymentId },
      {
        $set: {
          userId,
          workspaceId: subscription.workspaceId,
          razorpayPaymentId,
          razorpaySubscriptionId: subscription.razorpaySubscriptionId ?? null,
          amount: amountPaise > 0 ? amountPaise / 100 : 0,
          currency: String(paymentEntity.currency ?? 'INR'),
          status: 'captured',
          paymentMethod: await resolvePaymentMethod(paymentEntity),
          source,
          planId: subscription.plan,
          billingCycle: subscription.billingCycle ?? null,
          paidAt: createdAtSec > 0 ? new Date(createdAtSec * 1000) : new Date(),
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  } catch (err) {
    logger.warn('Failed to record Payment document (non-fatal)', {
      userId,
      err: err instanceof Error ? err.message : String(err),
      module: 'webhook.controller',
    });
  }
}

// ---------------------------------------------------------------------------
// Invoice email helper — sends a payment receipt via Resend after a
// subscription is activated or renewed. Non-fatal: a delivery failure
// must never block the webhook response.
// ---------------------------------------------------------------------------

async function sendInvoiceEmailForSubscription(
  userId: string,
  subscription: ISubscription,
  paymentEntity: Record<string, unknown>,
  currentPeriodStart: Date,
  currentPeriodEnd: Date
): Promise<void> {
  try {
    // DEDUP: a single first charge fires BOTH subscription.activated AND
    // subscription.charged, and both call this helper — that sent two invoices
    // for one payment. Gate on the Razorpay payment_id (fallback: sub id +
    // period end) with a 24h Redis key so exactly one invoice goes out per
    // charge. Renewals get their own payment_id, so they still email once.
    const paymentId = String(paymentEntity.id ?? '');
    const dedupSeed =
      paymentId ||
      `${subscription.razorpaySubscriptionId ?? subscription.subscriptionId}:${currentPeriodEnd.getTime()}`;
    const dedupKey = `invoice:sent:${dedupSeed}`;
    let dedupClaimed = false;
    const redis = getRedisClient();
    try {
      const alreadySent = await redis.set(
        dedupKey,
        '1',
        'EX',
        24 * 60 * 60,
        'NX'
      );
      // ioredis returns 'OK' when the key was set, null when it already existed.
      if (alreadySent === null) {
        logger.debug(
          'Invoice email already sent for this charge — skipping duplicate',
          {
            userId,
            dedupKey,
            module: 'webhook.controller',
          }
        );
        return;
      }
      dedupClaimed = true;
    } catch (redisErr) {
      // If Redis is unavailable we fail open (send the email) rather than
      // silently dropping a receipt — a rare duplicate is better than none.
      logger.warn('Invoice dedup Redis check failed — sending without dedup', {
        userId,
        err: redisErr,
        module: 'webhook.controller',
      });
    }

    const releaseDedup = async () => {
      if (!dedupClaimed) return;
      try {
        await redis.del(dedupKey);
      } catch {
        /* best-effort — key expires in 24h anyway */
      }
    };

    const user = await User.findById(userId).select('email displayName').lean<{
      email?: string;
      displayName?: string;
    }>();
    if (!user?.email) {
      // Couldn't resolve a recipient — release the dedup claim so a retry can try again.
      await releaseDedup();
      return;
    }

    const planConfig = PLAN_CONFIG[subscription.plan as PlanId];
    if (!planConfig) {
      await releaseDedup();
      return;
    }

    const amountPaise =
      subscription.billingCycle === 'yearly'
        ? planConfig.pricing.yearly
        : planConfig.pricing.monthly;

    const sent = await sendInvoiceEmail(user.email, {
      firstName: (user.displayName ?? '').split(' ')[0] || 'User',
      planName: planConfig.name,
      billingCycle: subscription.billingCycle ?? 'monthly',
      amountInr: amountPaise / 100,
      periodStart: currentPeriodStart,
      periodEnd: currentPeriodEnd,
      paymentId: String(paymentEntity.id ?? ''),
    });

    // If the send failed, release the dedup claim so the sibling event
    // (activated/charged) or a webhook retry can send the invoice.
    if (!sent) {
      await releaseDedup();
      logger.warn(
        'Invoice email send returned false — released dedup for retry',
        {
          userId,
          module: 'webhook.controller',
        }
      );
      return;
    }

    logger.info('Invoice email sent', {
      userId,
      plan: subscription.plan,
      module: 'webhook.controller',
    });
  } catch (err) {
    logger.warn('Failed to send invoice email', {
      userId,
      err,
      module: 'webhook.controller',
    });
  }
}

// ---------------------------------------------------------------------------
// Refund receipt email helper
// ---------------------------------------------------------------------------

async function sendRefundReceiptEmail(
  userId: string,
  amountInr: number,
  refundId: string
): Promise<void> {
  try {
    const user = await User.findById(userId).select('email displayName').lean<{
      email?: string;
      displayName?: string;
    }>();
    if (!user?.email) return;
    const firstName = (user.displayName ?? '').split(' ')[0] || 'User';
    await sendRefundEmail(user.email, firstName, amountInr, refundId);
  } catch (err) {
    logger.warn('Failed to send refund email', {
      userId,
      err,
      module: 'webhook.controller',
    });
  }
}

// ---------------------------------------------------------------------------
// Event-specific handlers
// ---------------------------------------------------------------------------

/**
 * subscription.activated
 *
 * Fires when a Razorpay subscription reaches 'active' status for the first
 * time — i.e. the customer's authentication transaction (the FULL plan
 * amount, not a token charge) has been captured. This is the only trigger
 * for granting paid access on a brand-new subscription; the local document
 * up to this point sits in 'pending_payment' (see SubscriptionService.create).
 */
async function handleSubscriptionActivated(
  payload: Record<string, unknown>
): Promise<void> {
  const subEntity = ((
    payload.subscription as Record<string, unknown> | undefined
  )?.entity ?? {}) as Record<string, unknown>;
  const razorpaySubscriptionId = String(subEntity.id ?? '');

  if (!razorpaySubscriptionId) {
    logger.warn('subscription.activated: missing subscription id', {
      payload,
      module: 'webhook.controller',
    });
    return;
  }

  const existing = await SubscriptionModel.findOne({
    razorpaySubscriptionId,
  }).lean<ISubscription>();
  if (!existing) {
    // Could be a recurring ADD-ON subscription rather than a base plan.
    if (
      await reconcileAddOnFromWebhook(
        razorpaySubscriptionId,
        subEntity,
        'activate'
      )
    ) {
      return;
    }
    logger.warn(
      'subscription.activated: no local subscription found for razorpaySubscriptionId',
      {
        razorpaySubscriptionId,
        module: 'webhook.controller',
      }
    );
    return;
  }

  const userId = existing.userId;
  const currentPeriodStart =
    unixToDate(subEntity.current_start as number | undefined) ?? new Date();
  const currentPeriodEnd =
    unixToDate(subEntity.current_end as number | undefined) ??
    existing.currentPeriodEnd;
  const paymentEntity = ((
    payload.payment as Record<string, unknown> | undefined
  )?.entity ?? {}) as Record<string, unknown>;

  // The plan to grant is read from the subscription's OWN notes (authoritative,
  // never stale). Applied HERE — only now that the charge has been captured.
  // This is what prevents "free upgrades" and stale-plan mixups.
  const planToApply = resolvePlanFromNotes(subEntity, existing);

  const updated = await SubscriptionModel.findOneAndUpdate(
    { userId },
    {
      $set: {
        status: 'active',
        plan: planToApply,
        pendingPlan: null,
        currentPeriodStart,
        currentPeriodEnd,
        nextBillingDate: currentPeriodEnd,
        cancelAtPeriodEnd: false,
        cancellationReason: null,
        cancellationFeedback: null,
        cancellationRequestedAt: null,
        renewalRetryCount: 0,
        lastRenewalRetryAt: null,
        pastDueGraceEndsAt: null,
      },
    },
    { new: true, upsert: false }
  ).lean<ISubscription>();

  if (!updated) {
    logger.warn('subscription.activated: subscription update failed', {
      userId,
      module: 'webhook.controller',
    });
    return;
  }

  // Save the contact number Razorpay just collected for the mandate, so the
  // next subscribe/resubscribe skips the "Contact details" prompt.
  await persistPhoneFromPayment(userId, paymentEntity);

  // Allocate AI credits for the first billing cycle
  const monthlyCredits = planCreditsPerMonth(updated.plan);
  if (monthlyCredits > 0) {
    await getAICreditsRepo().upsertForUser(
      userId,
      monthlyCredits,
      currentPeriodEnd
    );
  }

  // Invalidate entitlement cache so paid limits take effect immediately
  await invalidateEntitlementCache(userId);

  await recordEvent(
    'subscription.activated',
    userId,
    updated.subscriptionId,
    {
      razorpaySubscriptionId,
      currentPeriodStart,
      currentPeriodEnd,
      raw: payload,
    },
    existing.status,
    'active',
    existing.plan,
    updated.plan,
    // A first-charge activation (new purchase, resubscribe, or a completed
    // upgrade) is a genuine, one-off lifecycle moment → premium welcome. This
    // is deliberately NOT set on subscription.charged renewals.
    'premium_welcome'
  );

  logger.info(
    'Subscription activated — first charge captured, paid access granted',
    {
      userId,
      plan: updated.plan,
      module: 'webhook.controller',
    }
  );

  // Persist the payment so future refunds can be matched to this user.
  await recordPayment(userId, updated, paymentEntity, 'subscription_auth');

  // Send invoice/receipt email via Resend (non-fatal)
  await sendInvoiceEmailForSubscription(
    userId,
    updated,
    paymentEntity,
    currentPeriodStart,
    currentPeriodEnd
  );
}

/**
 * subscription.charged
 *
 * Fires on every successful renewal charge for an already-active
 * subscription. Refreshes the billing period, resets the monthly AI credit
 * quota, and clears any past_due retry state.
 */
async function handleSubscriptionCharged(
  payload: Record<string, unknown>
): Promise<void> {
  const subEntity = ((
    payload.subscription as Record<string, unknown> | undefined
  )?.entity ?? {}) as Record<string, unknown>;
  const paymentEntity = ((
    payload.payment as Record<string, unknown> | undefined
  )?.entity ?? {}) as Record<string, unknown>;
  const razorpaySubscriptionId = String(subEntity.id ?? '');

  if (!razorpaySubscriptionId) {
    logger.warn('subscription.charged: missing subscription id', {
      payload,
      module: 'webhook.controller',
    });
    return;
  }

  const existing = await SubscriptionModel.findOne({
    razorpaySubscriptionId,
  }).lean<ISubscription>();
  if (!existing) {
    // Could be a recurring ADD-ON renewal rather than a base plan renewal.
    if (
      await reconcileAddOnFromWebhook(
        razorpaySubscriptionId,
        subEntity,
        'activate'
      )
    ) {
      return;
    }
    logger.warn(
      'subscription.charged: no local subscription found for razorpaySubscriptionId',
      {
        razorpaySubscriptionId,
        module: 'webhook.controller',
      }
    );
    return;
  }

  const userId = existing.userId;
  const currentPeriodStart =
    unixToDate(subEntity.current_start as number | undefined) ?? new Date();
  const currentPeriodEnd =
    unixToDate(subEntity.current_end as number | undefined) ??
    existing.currentPeriodEnd;
  const paymentId = String(paymentEntity.id ?? '');

  // Apply the plan from the subscription's own notes (authoritative, never
  // stale) now that a real charge has been captured.
  const planToApply = resolvePlanFromNotes(subEntity, existing);

  const updated = await SubscriptionModel.findOneAndUpdate(
    { userId },
    {
      $set: {
        status: 'active',
        plan: planToApply,
        pendingPlan: null,
        currentPeriodStart,
        currentPeriodEnd,
        nextBillingDate: currentPeriodEnd,
        // A captured charge means this is a live, paying subscription — clear
        // any stale cancellation state (e.g. carried over from a plan the user
        // cancelled just before upgrading) so the active plan never shows as
        // "cancelled / ends at period close".
        cancelAtPeriodEnd: false,
        cancellationReason: null,
        cancellationFeedback: null,
        cancellationRequestedAt: null,
        renewalRetryCount: 0,
        lastRenewalRetryAt: null,
        pastDueGraceEndsAt: null,
        ...(paymentId ? { lastPaymentId: paymentId } : {}),
      },
    },
    { new: true, upsert: false }
  ).lean<ISubscription>();

  if (!updated) {
    logger.warn('subscription.charged: subscription update failed', {
      userId,
      module: 'webhook.controller',
    });
    return;
  }

  // Save the contact number Razorpay collected for this renewal charge, in
  // case it wasn't already captured on subscription.activated (e.g. resumed
  // subscriptions that re-authenticate).
  await persistPhoneFromPayment(userId, paymentEntity);

  // Reset monthly AI credits quota for the new cycle
  const monthlyCredits = planCreditsPerMonth(updated.plan);
  if (monthlyCredits > 0) {
    await getAICreditsRepo().resetMonthly(
      userId,
      monthlyCredits,
      currentPeriodEnd
    );
  }

  // Reset the per-cycle automation conversation counters (keyword / AI /
  // follow-campaign) on the same confirmed-charge boundary as the AI credits,
  // so a renewed subscription starts each cycle with a full conversation quota.
  try {
    const { getEntitlementService } =
      await import('../services/EntitlementService');
    const entitlementService = getEntitlementService(
      getRedisClient(),
      getSubscriptionRepo()
    );
    await entitlementService.resetAutomationCounters(userId);
  } catch (resetErr) {
    logger.warn(
      'Failed to reset automation conversation counters (non-fatal)',
      {
        userId,
        err: resetErr instanceof Error ? resetErr.message : String(resetErr),
        module: 'webhook.controller',
      }
    );
  }

  // Invalidate entitlement cache
  await invalidateEntitlementCache(userId);

  await recordEvent(
    'subscription.charged',
    userId,
    updated.subscriptionId,
    {
      razorpaySubscriptionId,
      paymentId,
      currentPeriodStart,
      currentPeriodEnd,
      raw: payload,
    },
    existing.status,
    'active',
    existing.plan,
    updated.plan
  );

  logger.info('Subscription renewed — recurring charge captured', {
    userId,
    plan: updated.plan,
    module: 'webhook.controller',
  });

  // Persist the renewal payment so future refunds can be matched to this user.
  await recordPayment(userId, updated, paymentEntity, 'subscription_renewal');

  // Send renewal receipt email via Resend (non-fatal)
  await sendInvoiceEmailForSubscription(
    userId,
    updated,
    paymentEntity,
    currentPeriodStart,
    currentPeriodEnd
  );
}

/**
 * payment.captured — ORDER-linked payments (one-time prepaid purchases).
 *
 * This is the ONLY place one-time AI credit packs are granted. The flow is:
 *   1. Client calls POST /api/v2/subscription/credits/create-order, which builds
 *      a Razorpay Order with the price derived from ADDON_CONFIG and tags it with
 *      `notes.veefore_purpose = 'ai_credit_pack'`.
 *   2. Customer pays via Razorpay Checkout.
 *   3. Razorpay sends this signed webhook. We re-read the order from Razorpay
 *      (never trusting anything client-supplied), then grant the credits.
 *
 * Exactly-once guarantee: credits are additive, so a duplicate delivery would
 * double-credit. The webhook-level SET-NX claim dedupes normal duplicates but
 * intentionally fails OPEN when Redis is unavailable, so we cannot rely on it
 * alone. We therefore gate the grant on an atomic insert into PaymentModel,
 * which has a unique index on `razorpayPaymentId`: only the delivery that
 * actually creates the row proceeds to grant.
 *
 * Subscription-linked payments are ignored here — plan access is granted by the
 * subscription.activated / subscription.charged handlers.
 */
async function handleOrderPaymentCaptured(
  payload: Record<string, unknown>
): Promise<void> {
  const paymentEntity = ((
    payload.payment as Record<string, unknown> | undefined
  )?.entity ?? {}) as Record<string, unknown>;

  const razorpayPaymentId = String(paymentEntity.id ?? '');
  const razorpayOrderId = String(paymentEntity.order_id ?? '');

  if (!razorpayPaymentId) return;

  // No order_id → this is a subscription charge; the subscription.* handlers
  // own it. Also skip if it is explicitly tied to a subscription.
  if (!razorpayOrderId || paymentEntity.subscription_id) {
    logger.debug(
      'payment.captured without an order — handled by subscription.* events',
      { razorpayPaymentId, module: 'webhook.controller' }
    );
    return;
  }

  // Read the order from Razorpay so `notes` are authoritative rather than
  // whatever a caller might have echoed back to us.
  let order: Record<string, unknown>;
  try {
    order = await razorpaySubscriptionService.getOrder(razorpayOrderId);
  } catch (err) {
    logger.error(
      'payment.captured: could not fetch order from Razorpay',
      err instanceof Error ? err : new Error(String(err)),
      { razorpayOrderId, razorpayPaymentId, module: 'webhook.controller' }
    );
    // Rethrow so the delivery is retried — dropping this would lose a paid
    // purchase the customer has already been charged for.
    throw err;
  }

  const notes = (order.notes ?? {}) as Record<string, string>;
  if (notes.veefore_purpose !== 'ai_credit_pack') {
    logger.debug(
      'payment.captured: order is not an AI credit pack — ignoring',
      {
        razorpayOrderId,
        purpose: notes.veefore_purpose ?? null,
        module: 'webhook.controller',
      }
    );
    return;
  }

  const userId = String(notes.veefore_user_id ?? '');
  const addonType = String(notes.veefore_addon_type ?? '');
  const quantity = Number(notes.veefore_quantity ?? 0);

  if (!userId || !addonType || !Number.isInteger(quantity) || quantity < 1) {
    logger.error(
      'payment.captured: credit pack order has malformed notes — cannot grant',
      new Error('Malformed order notes'),
      { razorpayOrderId, notes, module: 'webhook.controller' }
    );
    return;
  }

  // Re-derive the expected amount from config and compare against what was
  // actually captured. A shortfall means the order was tampered with or the
  // config changed mid-flight; granting anyway would hand out unpaid credits.
  const addonDef = ADDON_CONFIG[addonType as AddOnType];
  if (!addonDef || addonDef.priceOneTime === null) {
    logger.error(
      'payment.captured: order references an unknown or non-one-time add-on',
      new Error('Invalid add-on in order notes'),
      { razorpayOrderId, addonType, module: 'webhook.controller' }
    );
    return;
  }

  const expectedPaise = addonDef.priceOneTime * quantity;
  const capturedPaise = Number(paymentEntity.amount ?? 0);
  if (capturedPaise < expectedPaise) {
    logger.error(
      'payment.captured: captured amount is less than the credit pack price — refusing to grant',
      new Error('Amount mismatch on credit pack purchase'),
      {
        userId,
        addonType,
        quantity,
        capturedPaise,
        expectedPaise,
        razorpayPaymentId,
        module: 'webhook.controller',
      }
    );
    return;
  }

  // ── Exactly-once gate ────────────────────────────────────────────────────
  // Atomically claim this payment by inserting its Payment row. `upserted` is
  // only set when THIS call created the document, so concurrent/retried
  // deliveries fall through without granting a second time.
  const claim = await PaymentModel.findOneAndUpdate(
    { razorpayPaymentId },
    {
      $setOnInsert: {
        userId,
        workspaceId: '',
        razorpayPaymentId,
        razorpayOrderId,
        razorpaySubscriptionId: null,
        amount: capturedPaise / 100,
        currency: String(paymentEntity.currency ?? 'INR'),
        status: 'captured',
        paymentMethod: await resolvePaymentMethod(paymentEntity),
        source: 'credits',
        planId: '',
        billingCycle: null,
        paidAt: new Date(
          Number(paymentEntity.created_at ?? 0) > 0
            ? Number(paymentEntity.created_at) * 1000
            : Date.now()
        ),
      },
    },
    { upsert: true, new: false, includeResultMetadata: true }
  );

  const isFirstDelivery = Boolean(
    (claim as { lastErrorObject?: { upserted?: unknown } })?.lastErrorObject
      ?.upserted
  );

  if (!isFirstDelivery) {
    logger.info(
      'payment.captured: credit pack already granted for this payment — skipping',
      { userId, razorpayPaymentId, module: 'webhook.controller' }
    );
    return;
  }

  // Payment is confirmed and claimed — grant the credits through the same
  // AddOnService path the rest of the app uses, with paymentVerified set (the
  // only caller permitted to set it, since we have just proven capture).
  //
  // If the grant fails we MUST release the claim. Otherwise the Payment row
  // would persist while no credits were issued, and Razorpay's retry would take
  // the "already granted" branch above — leaving the customer charged with
  // nothing to show for it. Releasing lets the retry succeed cleanly.
  try {
    const [{ getAddOnService }, { getEntitlementService }] = await Promise.all([
      import('../services/AddOnService'),
      import('../services/EntitlementService'),
    ]);
    const redis = getRedisClient();
    const entitlementService = getEntitlementService(
      redis,
      getSubscriptionRepo()
    );

    await getAddOnService(entitlementService, redis).addAddOn(
      userId,
      addonType as AddOnType,
      quantity,
      { paymentVerified: true, razorpayPaymentId }
    );
  } catch (grantErr) {
    try {
      await PaymentModel.deleteOne({ razorpayPaymentId });
    } catch {
      // If even the rollback fails, log loudly — this needs manual
      // reconciliation because the retry would now skip the grant.
      logger.error(
        'CRITICAL: credit pack grant failed AND claim rollback failed — manual credit required',
        new Error('Claim rollback failed'),
        {
          userId,
          razorpayPaymentId,
          addonType,
          quantity,
          module: 'webhook.controller',
        }
      );
    }

    logger.error(
      'Credit pack grant failed after payment capture — claim released for retry',
      grantErr instanceof Error ? grantErr : new Error(String(grantErr)),
      {
        userId,
        razorpayPaymentId,
        addonType,
        quantity,
        module: 'webhook.controller',
      }
    );

    // Rethrow so the webhook responds 5xx and Razorpay retries the delivery.
    throw grantErr;
  }

  await recordEvent(
    'addon.credit_pack_purchased',
    userId,
    razorpayOrderId,
    {
      addonType,
      quantity,
      credits: addonDef.quantityIncrement * quantity,
      amountPaise: capturedPaise,
      razorpayPaymentId,
      razorpayOrderId,
    },
    null,
    null,
    null,
    null,
    // Webhook-confirmed fulfilment — this is the ONLY signal that grants
    // credits, so it is also the only place the success modal is armed.
    'credit_purchase_success'
  );

  logger.info('AI credit pack granted after confirmed payment', {
    userId,
    addonType,
    quantity,
    credits: addonDef.quantityIncrement * quantity,
    razorpayPaymentId,
    module: 'webhook.controller',
  });
}

/**
 * payment.failed
 *
 * Two distinct cases, distinguished by the EXISTING stored status before
 * this event is processed:
 *  1. First-charge failure — local status is currently 'pending_payment'
 *     (the user has never had paid access). The subscription simply stays
 *     'pending_payment' — no grace period applies since nothing was ever
 *     granted.
 *  2. Renewal failure — local status is currently 'active' or 'past_due'
 *     (the user has real paid access from a prior successful charge).
 *     Increments `renewalRetryCount`, moves the subscription to 'past_due',
 *     and sets `pastDueGraceEndsAt` (if not already set) using the same
 *     3-day grace window as the existing grace_period_check cron job.
 */
async function handlePaymentFailed(
  payload: Record<string, unknown>
): Promise<void> {
  const paymentEntity = ((
    payload.payment as Record<string, unknown> | undefined
  )?.entity ?? {}) as Record<string, unknown>;
  const paymentId = String(paymentEntity.id ?? '');
  const notes = (paymentEntity.notes ?? {}) as Record<string, unknown>;
  const razorpaySubscriptionIdFromPayment = String(
    paymentEntity.subscription_id ?? ''
  );

  // Prefer the subscription_id present directly on the payment entity;
  // fall back to the veefore_user_id note attached at subscription creation
  // (see RazorpaySubscriptionService.createSubscription / SubscriptionService).
  let existing: ISubscription | null = null;

  if (razorpaySubscriptionIdFromPayment) {
    existing = await SubscriptionModel.findOne({
      razorpaySubscriptionId: razorpaySubscriptionIdFromPayment,
    }).lean<ISubscription>();
  }

  if (!existing) {
    const notesUserId = String(notes.veefore_user_id ?? '');
    if (notesUserId) {
      existing = await getSubscriptionRepo().findByUserId(notesUserId);
    }
  }

  if (!existing) {
    logger.warn(
      'payment.failed: could not resolve local subscription via subscription_id or notes',
      {
        paymentId,
        razorpaySubscriptionIdFromPayment,
        module: 'webhook.controller',
      }
    );
    return;
  }

  const userId = existing.userId;
  const redis = getRedisClient();

  if (existing.status === 'pending_payment') {
    // Case 1 — first-charge failure. Never paid, no grace period; the
    // subscription simply stays 'pending_payment' (no access granted).
    await recordEvent(
      'payment.failed',
      userId,
      existing.subscriptionId,
      { paymentId, isFirstChargeFailure: true, raw: payload },
      existing.status,
      'pending_payment',
      existing.plan,
      existing.plan
    );

    // Sends the branded payment-failed email via Resend (with Redis dedup)
    await quotaNotifier.sendPaymentFailedNotification(userId, redis);

    logger.info(
      'First charge failed — subscription remains pending_payment, no paid access granted',
      {
        userId,
        module: 'webhook.controller',
      }
    );
    return;
  }

  // Case 2 — renewal failure on an already-paid subscription ('active' or
  // already 'past_due'). Grace period is only set on the FIRST failure of
  // the current retry cycle — subsequent failures reuse the same deadline.
  const pastDueGraceEndsAt =
    existing.pastDueGraceEndsAt ??
    new Date(Date.now() + PAST_DUE_GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000);

  const updated = await SubscriptionModel.findOneAndUpdate(
    { userId },
    {
      $set: {
        status: 'past_due',
        pastDueGraceEndsAt,
        lastRenewalRetryAt: new Date(),
      },
      $inc: { renewalRetryCount: 1 },
    },
    { new: true, upsert: false }
  ).lean<ISubscription>();

  if (!updated) {
    logger.warn('payment.failed: subscription update failed', {
      userId,
      module: 'webhook.controller',
    });
    return;
  }

  // Invalidate entitlement cache (past_due grace-period limits may apply)
  await invalidateEntitlementCache(userId);

  await quotaNotifier.sendPaymentFailedNotification(userId, redis);

  await recordEvent(
    'payment.failed',
    userId,
    updated.subscriptionId,
    {
      paymentId,
      pastDueGraceEndsAt,
      renewalRetryCount: updated.renewalRetryCount,
      raw: payload,
    },
    existing.status,
    'past_due',
    existing.plan,
    existing.plan
  );

  logger.info(
    'Renewal payment failed — subscription marked past_due, grace period set',
    {
      userId,
      pastDueGraceEndsAt,
      renewalRetryCount: updated.renewalRetryCount,
      module: 'webhook.controller',
    }
  );
}

/**
 * subscription.cancelled
 *
 * If `ended_at` is already in the past, Razorpay has fully terminated the
 * subscription — downgrade immediately. Otherwise mirror the previous
 * Cashfree semantics: keep access until period end, just flag
 * `cancelAtPeriodEnd`.
 */
async function handleSubscriptionCancelled(
  payload: Record<string, unknown>
): Promise<void> {
  const subEntity = ((
    payload.subscription as Record<string, unknown> | undefined
  )?.entity ?? {}) as Record<string, unknown>;
  const razorpaySubscriptionId = String(subEntity.id ?? '');

  if (!razorpaySubscriptionId) {
    logger.warn('subscription.cancelled: missing subscription id', {
      payload,
      module: 'webhook.controller',
    });
    return;
  }

  const existing = await SubscriptionModel.findOne({
    razorpaySubscriptionId,
  }).lean<ISubscription>();
  if (!existing) {
    // Could be a recurring ADD-ON subscription being cancelled.
    if (
      await reconcileAddOnFromWebhook(
        razorpaySubscriptionId,
        subEntity,
        'cancel'
      )
    ) {
      return;
    }
    logger.warn(
      'subscription.cancelled: no local subscription found for razorpaySubscriptionId',
      {
        razorpaySubscriptionId,
        module: 'webhook.controller',
      }
    );
    return;
  }

  // GUARD: if an upgrade is in flight (pendingPlan set), this cancellation is
  // for the OLD superseded subscription that upgrade() just cancelled. It must
  // NOT downgrade the user — the new subscription's activation webhook owns the
  // final plan state. Acknowledge and skip.
  if (existing.pendingPlan) {
    logger.info(
      'subscription.cancelled: ignoring cancellation of superseded sub during upgrade',
      {
        userId: existing.userId,
        razorpaySubscriptionId,
        pendingPlan: existing.pendingPlan,
        module: 'webhook.controller',
      }
    );
    return;
  }

  const userId = existing.userId;
  const endedAt = unixToDate(subEntity.ended_at as number | undefined);
  const now = new Date();
  // currentPeriodEnd is the paid-through authority. Provider terminal events
  // may arrive as soon as auto-renew is disabled; they must never revoke time
  // the customer has already paid for.
  const paidThrough = existing.currentPeriodEnd;
  const accessEnded =
    paidThrough != null && paidThrough.getTime() <= now.getTime();
  const redis = getRedisClient();

  if (accessEnded) {
    const updated = await SubscriptionModel.findOneAndUpdate(
      { userId },
      {
        $set: {
          status: 'cancelled',
          plan: 'free',
          cancelAtPeriodEnd: false,
          gracePeriodEndsAt: null,
          pastDueGraceEndsAt: null,
        },
      },
      { new: true, upsert: false }
    ).lean<ISubscription>();

    if (!updated) {
      logger.warn('subscription.cancelled: subscription update failed', {
        userId,
        module: 'webhook.controller',
      });
      return;
    }

    await invalidateEntitlementCache(userId);

    await recordEvent(
      'subscription.cancelled',
      userId,
      updated.subscriptionId,
      { razorpaySubscriptionId, endedAt, raw: payload },
      existing.status,
      'cancelled',
      existing.plan,
      'free'
    );

    // Sends the branded cancellation email via Resend (with Redis dedup)
    await quotaNotifier.sendCancellationConfirmation(userId, now, redis);

    logger.info(
      'Subscription paid-through period ended — downgraded to free with no grace period',
      {
        userId,
        module: 'webhook.controller',
      }
    );
    return;
  }

  const updated = await SubscriptionModel.findOneAndUpdate(
    { userId },
    {
      $set: {
        cancelAtPeriodEnd: true,
        gracePeriodEndsAt: null,
        pastDueGraceEndsAt: null,
      },
    },
    { new: true, upsert: false }
  ).lean<ISubscription>();

  if (!updated) {
    logger.warn('subscription.cancelled: subscription update failed', {
      userId,
      module: 'webhook.controller',
    });
    return;
  }

  await recordEvent(
    'subscription.cancelled',
    userId,
    updated.subscriptionId,
    { razorpaySubscriptionId, raw: payload },
    existing.status,
    existing.status, // status unchanged — still active until period end
    existing.plan,
    existing.plan
  );

  await quotaNotifier.sendCancellationConfirmation(
    userId,
    updated.currentPeriodEnd ?? now,
    redis
  );

  logger.info('Subscription cancellation scheduled at period end', {
    userId,
    module: 'webhook.controller',
  });
}

/**
 * subscription.paused
 *
 * No Cashfree equivalent existed. Reuses the existing 'past_due' status
 * (no new enum value is introduced) since a paused subscription grants no
 * new charges and should be treated the same as a stalled renewal for
 * entitlement purposes.
 */
async function handleSubscriptionPaused(
  payload: Record<string, unknown>
): Promise<void> {
  const subEntity = ((
    payload.subscription as Record<string, unknown> | undefined
  )?.entity ?? {}) as Record<string, unknown>;
  const razorpaySubscriptionId = String(subEntity.id ?? '');

  if (!razorpaySubscriptionId) {
    logger.warn('subscription.paused: missing subscription id', {
      payload,
      module: 'webhook.controller',
    });
    return;
  }

  const existing = await SubscriptionModel.findOne({
    razorpaySubscriptionId,
  }).lean<ISubscription>();
  if (!existing) {
    logger.warn(
      'subscription.paused: no local subscription found for razorpaySubscriptionId',
      {
        razorpaySubscriptionId,
        module: 'webhook.controller',
      }
    );
    return;
  }

  const userId = existing.userId;

  const updated = await SubscriptionModel.findOneAndUpdate(
    { userId },
    { $set: { status: 'past_due' } },
    { new: true, upsert: false }
  ).lean<ISubscription>();

  if (!updated) {
    logger.warn('subscription.paused: subscription update failed', {
      userId,
      module: 'webhook.controller',
    });
    return;
  }

  await invalidateEntitlementCache(userId);

  await recordEvent(
    'subscription.paused',
    userId,
    updated.subscriptionId,
    { razorpaySubscriptionId, raw: payload },
    existing.status,
    'past_due',
    existing.plan,
    existing.plan
  );

  logger.info('Subscription paused at Razorpay — marked past_due locally', {
    userId,
    module: 'webhook.controller',
  });
}

/**
 * subscription.resumed
 *
 * Counterpart to handleSubscriptionPaused — restores 'active' status and
 * clears any retry/grace-period state left over from the pause.
 */
async function handleSubscriptionResumed(
  payload: Record<string, unknown>
): Promise<void> {
  const subEntity = ((
    payload.subscription as Record<string, unknown> | undefined
  )?.entity ?? {}) as Record<string, unknown>;
  const razorpaySubscriptionId = String(subEntity.id ?? '');

  if (!razorpaySubscriptionId) {
    logger.warn('subscription.resumed: missing subscription id', {
      payload,
      module: 'webhook.controller',
    });
    return;
  }

  const existing = await SubscriptionModel.findOne({
    razorpaySubscriptionId,
  }).lean<ISubscription>();
  if (!existing) {
    logger.warn(
      'subscription.resumed: no local subscription found for razorpaySubscriptionId',
      {
        razorpaySubscriptionId,
        module: 'webhook.controller',
      }
    );
    return;
  }

  const userId = existing.userId;

  const updated = await SubscriptionModel.findOneAndUpdate(
    { userId },
    {
      $set: {
        status: 'active',
        renewalRetryCount: 0,
        lastRenewalRetryAt: null,
        pastDueGraceEndsAt: null,
      },
    },
    { new: true, upsert: false }
  ).lean<ISubscription>();

  if (!updated) {
    logger.warn('subscription.resumed: subscription update failed', {
      userId,
      module: 'webhook.controller',
    });
    return;
  }

  await invalidateEntitlementCache(userId);

  await recordEvent(
    'subscription.resumed',
    userId,
    updated.subscriptionId,
    { razorpaySubscriptionId, raw: payload },
    existing.status,
    'active',
    existing.plan,
    existing.plan
  );

  logger.info('Subscription resumed at Razorpay — marked active locally', {
    userId,
    module: 'webhook.controller',
  });
}

/**
 * subscription.halted
 *
 * Razorpay HALTS a subscription after ALL automatic charge retries for a
 * failed renewal have been exhausted — this is terminal non-payment. There is
 * no further retry; paid access must end now. We downgrade to the free plan
 * immediately and send the cancellation email, rather than leaving the user
 * stuck in 'past_due' until the daily grace-period cron eventually catches it.
 */
async function handleSubscriptionHalted(
  payload: Record<string, unknown>
): Promise<void> {
  const subEntity = ((
    payload.subscription as Record<string, unknown> | undefined
  )?.entity ?? {}) as Record<string, unknown>;
  const razorpaySubscriptionId = String(subEntity.id ?? '');

  if (!razorpaySubscriptionId) {
    logger.warn('subscription.halted: missing subscription id', {
      payload,
      module: 'webhook.controller',
    });
    return;
  }

  const existing = await SubscriptionModel.findOne({
    razorpaySubscriptionId,
  }).lean<ISubscription>();
  if (!existing) {
    logger.warn(
      'subscription.halted: no local subscription found for razorpaySubscriptionId',
      {
        razorpaySubscriptionId,
        module: 'webhook.controller',
      }
    );
    return;
  }

  // An upgrade-in-flight halt would be for a superseded sub — ignore, the new
  // subscription's activation owns the final state.
  if (existing.pendingPlan) {
    logger.info(
      'subscription.halted: ignoring halt of superseded sub during upgrade',
      {
        userId: existing.userId,
        razorpaySubscriptionId,
        module: 'webhook.controller',
      }
    );
    return;
  }

  const userId = existing.userId;
  const now = new Date();

  // Voluntary cancellation is paid through currentPeriodEnd and has no grace.
  // A provider halt/cancel signal before that cutoff only confirms that future
  // auto-pay is off; it must not remove already-paid access early.
  if (
    existing.cancelAtPeriodEnd &&
    existing.currentPeriodEnd != null &&
    existing.currentPeriodEnd > now
  ) {
    await invalidateEntitlementCache(userId);
    logger.info(
      'subscription.halted: preserving paid access until scheduled cancellation cutoff',
      {
        userId,
        accessEndsAt: existing.currentPeriodEnd,
        module: 'webhook.controller',
      }
    );
    return;
  }

  const updated = await SubscriptionModel.findOneAndUpdate(
    { userId },
    {
      $set: {
        status: 'expired',
        plan: 'free',
        pendingPlan: null,
        cancelAtPeriodEnd: false,
        pastDueGraceEndsAt: null,
      },
    },
    { new: true, upsert: false }
  ).lean<ISubscription>();

  if (!updated) {
    logger.warn('subscription.halted: subscription update failed', {
      userId,
      module: 'webhook.controller',
    });
    return;
  }

  await invalidateEntitlementCache(userId);

  await recordEvent(
    'subscription.halted',
    userId,
    updated.subscriptionId,
    { razorpaySubscriptionId, raw: payload },
    existing.status,
    'expired',
    existing.plan,
    'free'
  );

  // Notify the user their subscription ended due to non-payment (non-fatal).
  if (existing.plan && existing.plan !== 'free') {
    try {
      const user = await User.findById(userId)
        .select('email displayName')
        .lean<{
          email?: string;
          displayName?: string;
        }>();
      if (user?.email) {
        const firstName = (user.displayName ?? '').split(' ')[0] || 'User';
        const planName = isValidPlan(existing.plan)
          ? PLAN_CONFIG[existing.plan as PlanId].name
          : String(existing.plan);
        await sendCancellationEmail(user.email, firstName, planName, now);
      }
    } catch (err) {
      logger.warn('subscription.halted: failed to send cancellation email', {
        userId,
        err: err instanceof Error ? err.message : String(err),
        module: 'webhook.controller',
      });
    }
  }

  logger.info(
    'Subscription halted at Razorpay (terminal non-payment) — downgraded to free',
    {
      userId,
      module: 'webhook.controller',
    }
  );
}

/** refund.created */
async function handleRefundCreated(
  payload: Record<string, unknown>
): Promise<void> {
  const refundEntity = ((payload.refund as Record<string, unknown> | undefined)
    ?.entity ?? {}) as Record<string, unknown>;
  const razorpayPaymentId = String(refundEntity.payment_id ?? '');
  const refundId = String(refundEntity.id ?? '');
  const amount = Number(refundEntity.amount ?? 0) / 100;

  if (!razorpayPaymentId) {
    logger.warn('refund.created: missing payment_id', {
      payload,
      module: 'webhook.controller',
    });
    return;
  }

  const payment = await PaymentModel.findOneAndUpdate(
    { razorpayPaymentId },
    { $set: { refundId, refundAmount: amount, refundStatus: 'initiated' } },
    { new: true, upsert: false }
  ).lean();

  if (!payment) {
    logger.warn('refund.created: no matching Payment record found', {
      razorpayPaymentId,
      refundId,
      module: 'webhook.controller',
    });
    return;
  }

  await recordEvent('refund.created', payment.userId, payment.paymentId, {
    refundId,
    amount,
    raw: payload,
  });

  logger.info('Refund created', {
    userId: payment.userId,
    refundId,
    amount,
    module: 'webhook.controller',
  });
}

/**
 * refund.processed
 *
 * Marks the Payment record as refunded. If this was a full refund tied to a
 * subscription that is already cancelled (or scheduled to cancel at period
 * end), the user is downgraded to the free plan immediately — access should
 * not continue once the money backing it has been fully returned.
 */
async function handleRefundProcessed(
  payload: Record<string, unknown>
): Promise<void> {
  const refundEntity = ((payload.refund as Record<string, unknown> | undefined)
    ?.entity ?? {}) as Record<string, unknown>;
  const razorpayPaymentId = String(refundEntity.payment_id ?? '');
  const refundId = String(refundEntity.id ?? '');
  const amount = Number(refundEntity.amount ?? 0) / 100;

  if (!razorpayPaymentId) {
    logger.warn('refund.processed: missing payment_id', {
      payload,
      module: 'webhook.controller',
    });
    return;
  }

  // Update our Payment record if we have one.
  let payment = await PaymentModel.findOneAndUpdate(
    { razorpayPaymentId },
    {
      $set: {
        refundId,
        refundAmount: amount,
        refundStatus: 'success',
        status: 'refunded',
      },
    },
    { new: true, upsert: false }
  ).lean();

  // FALLBACK: for payments made before we started recording Payment docs (or
  // any missing record), resolve the user + subscription directly from
  // Razorpay so the refund still emails and downgrades. We fetch the payment
  // to get its subscription_id, then find the local subscription.
  let userId = payment?.userId ?? '';
  let razorpaySubscriptionId = payment?.razorpaySubscriptionId ?? '';
  let paidAmount = payment?.amount ?? amount;

  if (!payment) {
    try {
      const rzpPayment = (await razorpaySubscriptionService.getPayment(
        razorpayPaymentId
      )) as {
        subscription_id?: string;
        notes?: Record<string, unknown>;
        amount?: number;
      };
      razorpaySubscriptionId = String(rzpPayment.subscription_id ?? '');
      paidAmount = rzpPayment.amount ? Number(rzpPayment.amount) / 100 : amount;

      let sub: ISubscription | null = null;
      if (razorpaySubscriptionId) {
        sub = await SubscriptionModel.findOne({
          razorpaySubscriptionId,
        }).lean<ISubscription>();
      }
      if (!sub) {
        const notesUserId = String(
          (rzpPayment.notes ?? {}).veefore_user_id ?? ''
        );
        if (notesUserId)
          sub = await getSubscriptionRepo().findByUserId(notesUserId);
      }
      if (sub) {
        userId = sub.userId;
        razorpaySubscriptionId =
          sub.razorpaySubscriptionId ?? razorpaySubscriptionId;
      }
    } catch (err) {
      logger.warn('refund.processed: fallback payment resolution failed', {
        razorpayPaymentId,
        err: err instanceof Error ? err.message : String(err),
        module: 'webhook.controller',
      });
    }
  }

  if (!userId) {
    logger.warn(
      'refund.processed: could not resolve user for refund — skipping',
      {
        razorpayPaymentId,
        refundId,
        module: 'webhook.controller',
      }
    );
    return;
  }

  await recordEvent(
    'refund.processed',
    userId,
    payment?.paymentId ?? razorpayPaymentId,
    { refundId, amount, raw: payload }
  );

  logger.info('Refund processed', {
    userId,
    refundId,
    amount,
    module: 'webhook.controller',
  });

  // Send refund receipt via Resend (non-fatal)
  await sendRefundReceiptEmail(userId, amount, refundId);

  // A FULL refund of a subscription payment ends paid access: cancel the
  // Razorpay subscription (so it stops renewing), downgrade to free, and send
  // the cancellation email.
  //
  // SAFETY: we only downgrade when the refunded payment actually belongs to the
  // user's CURRENT subscription. Otherwise a refund of an OLD/superseded payment
  // (e.g. the previous plan's charge after the user has since upgraded) would
  // wrongly cancel their active paid plan. "Belongs to current" is proven by
  // either (a) the refunded payment's subscription id matching the current
  // subscription's razorpaySubscriptionId, or — when the sub id can't be
  // resolved from the payment — (b) the refunded amount matching the current
  // plan's price. A mismatch means we refund-email only and leave the plan
  // untouched (logged for manual review).
  const isFullRefund = amount >= paidAmount;
  if (isFullRefund) {
    const subscription = await getSubscriptionRepo().findByUserId(userId);

    if (subscription && subscription.plan !== 'free') {
      // Resolve the subscription the REFUNDED payment was for.
      const refundedSubId = (
        payment?.razorpaySubscriptionId ||
        razorpaySubscriptionId ||
        ''
      ).toString();
      const idMatchesCurrent =
        !!refundedSubId &&
        !!subscription.razorpaySubscriptionId &&
        refundedSubId === subscription.razorpaySubscriptionId;

      // Amount match: the refunded amount equals the current plan's price.
      const planCfg = isValidPlan(subscription.plan)
        ? PLAN_CONFIG[subscription.plan as PlanId]
        : null;
      const currentPlanInr = planCfg
        ? (subscription.billingCycle === 'yearly'
            ? planCfg.pricing.yearly
            : planCfg.pricing.monthly) / 100
        : -1;
      const amountMatchesCurrentPlan =
        currentPlanInr > 0 && Math.abs(paidAmount - currentPlanInr) < 1;

      // Downgrade only when we're confident the refund is for the current plan.
      const belongsToCurrentSubscription =
        idMatchesCurrent || (!refundedSubId && amountMatchesCurrentPlan);

      if (!belongsToCurrentSubscription) {
        logger.warn(
          'refund.processed: refunded payment does not match the current subscription — refund emailed, plan left unchanged for manual review',
          {
            userId,
            refundId,
            refundedSubId: refundedSubId || null,
            currentRazorpaySubId: subscription.razorpaySubscriptionId ?? null,
            paidAmount,
            currentPlanInr,
            module: 'webhook.controller',
          }
        );
        return;
      }

      // Best-effort cancel at Razorpay so it stops renewing (non-fatal).
      const subToCancel = subscription.razorpaySubscriptionId ?? refundedSubId;
      if (subToCancel) {
        try {
          await razorpaySubscriptionService.cancelSubscription(
            subToCancel,
            false
          );
        } catch {
          /* already cancelled or unreachable — local state is authoritative */
        }
      }

      const updatedSub = await SubscriptionModel.findOneAndUpdate(
        { userId: subscription.userId },
        {
          $set: {
            status: 'cancelled',
            plan: 'free',
            pendingPlan: null,
            cancelAtPeriodEnd: false,
          },
        },
        { new: true, upsert: false }
      ).lean<ISubscription>();

      if (updatedSub) {
        await invalidateEntitlementCache(subscription.userId);

        await recordEvent(
          'subscription.downgraded_after_refund',
          subscription.userId,
          updatedSub.subscriptionId,
          {
            refundId,
            amount,
            razorpaySubscriptionId:
              subscription.razorpaySubscriptionId ?? razorpaySubscriptionId,
          },
          subscription.status,
          'cancelled',
          subscription.plan,
          'free'
        );

        // Send the cancellation email (non-fatal).
        try {
          const user = await User.findById(subscription.userId)
            .select('email displayName')
            .lean<{
              email?: string;
              displayName?: string;
            }>();
          if (user?.email) {
            const firstName = (user.displayName ?? '').split(' ')[0] || 'User';
            const planName = isValidPlan(subscription.plan)
              ? PLAN_CONFIG[subscription.plan as PlanId].name
              : String(subscription.plan);
            await sendCancellationEmail(
              user.email,
              firstName,
              planName,
              new Date()
            );
          }
        } catch (err) {
          logger.warn('refund.processed: failed to send cancellation email', {
            userId: subscription.userId,
            err: err instanceof Error ? err.message : String(err),
            module: 'webhook.controller',
          });
        }

        logger.info(
          'Full refund processed — subscription cancelled and downgraded to free',
          {
            userId: subscription.userId,
            module: 'webhook.controller',
          }
        );
      }
    }
  }
}

/** refund.failed */
async function handleRefundFailed(
  payload: Record<string, unknown>
): Promise<void> {
  const refundEntity = ((payload.refund as Record<string, unknown> | undefined)
    ?.entity ?? {}) as Record<string, unknown>;
  const razorpayPaymentId = String(refundEntity.payment_id ?? '');
  const refundId = String(refundEntity.id ?? '');

  if (!razorpayPaymentId) {
    logger.warn('refund.failed: missing payment_id', {
      payload,
      module: 'webhook.controller',
    });
    return;
  }

  const payment = await PaymentModel.findOneAndUpdate(
    { razorpayPaymentId },
    { $set: { refundId, refundStatus: 'failed' } },
    { new: true, upsert: false }
  ).lean();

  if (!payment) {
    logger.warn('refund.failed: no matching Payment record found', {
      razorpayPaymentId,
      refundId,
      module: 'webhook.controller',
    });
    return;
  }

  await recordEvent('refund.failed', payment.userId, payment.paymentId, {
    refundId,
    raw: payload,
  });

  logger.warn('Refund failed', {
    userId: payment.userId,
    refundId,
    module: 'webhook.controller',
  });
}

// ---------------------------------------------------------------------------
// Idempotency key derivation
// ---------------------------------------------------------------------------

/**
 * Razorpay does not reliably send a single top-level event ID field across
 * all API versions in the webhook body. Prefer the `x-razorpay-event-id`
 * header when present; otherwise derive a stable key from the event type +
 * the relevant entity id.
 */
function computeIdempotencyKey(
  req: Request,
  eventType: string,
  payload: Record<string, unknown>
): string {
  const headerEventId = req.headers['x-razorpay-event-id'];
  if (headerEventId) {
    return String(
      Array.isArray(headerEventId) ? headerEventId[0] : headerEventId
    );
  }

  const paymentEntityId = (
    (payload.payment as Record<string, unknown> | undefined)?.entity as
      Record<string, unknown> | undefined
  )?.id;
  const subscriptionEntityId = (
    (payload.subscription as Record<string, unknown> | undefined)?.entity as
      Record<string, unknown> | undefined
  )?.id;
  const refundEntityId = (
    (payload.refund as Record<string, unknown> | undefined)?.entity as
      Record<string, unknown> | undefined
  )?.id;

  const entityId = String(
    paymentEntityId ?? subscriptionEntityId ?? refundEntityId ?? ''
  );
  return `${eventType}:${entityId}`;
}

// ---------------------------------------------------------------------------
// Main controller
// ---------------------------------------------------------------------------

/**
 * handleRazorpayWebhook
 *
 * Express route handler for `POST /api/webhooks/razorpay`.
 *
 * The route MUST be mounted with `express.raw({ type: 'application/json' })`
 * so that `req.body` is a Buffer containing the raw request bytes — the HMAC
 * signature is computed over the raw body and will fail if the body has been
 * parsed and re-serialised.
 */
export async function handleRazorpayWebhook(
  req: Request,
  res: Response
): Promise<void> {
  // 1. Extract raw body — normalise to Buffer regardless of what arrived.
  //    express.raw() should deliver a Buffer, but if global express.json()
  //    ran first (e.g. Content-Type mismatch), body may be a string or object.
  let rawBody: Buffer;
  if (Buffer.isBuffer(req.body)) {
    rawBody = req.body;
  } else if (typeof req.body === 'string') {
    rawBody = Buffer.from(req.body, 'utf8');
  } else if (req.body != null) {
    rawBody = Buffer.from(JSON.stringify(req.body), 'utf8');
  } else {
    rawBody = Buffer.alloc(0);
  }

  // 2. Get signature from headers (Razorpay has no separate timestamp header)
  const signature = String(req.headers['x-razorpay-signature'] ?? '');

  // 3. Verify HMAC signature — hex( HMAC-SHA256( RAZORPAY_WEBHOOK_SECRET, rawBody ) )
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET ?? '';
  const isValid = webhookVerifier.verify(rawBody, signature, webhookSecret);
  if (!isValid) {
    const sourceIp = req.ip ?? req.socket.remoteAddress ?? 'unknown';
    logger.warn('Razorpay webhook signature verification failed', {
      module: 'webhook.controller',
      sourceIp,
      signatureProvided: Boolean(signature),
    });
    res.status(401).json({ error: 'Invalid webhook signature' });
    return;
  }

  // 4. Parse event
  let event: RazorpayWebhookEvent;
  try {
    event = JSON.parse(rawBody.toString()) as RazorpayWebhookEvent;
  } catch (err) {
    logger.error('Failed to parse webhook body as JSON', err, {
      module: 'webhook.controller',
    });
    res.status(400).json({ error: 'Invalid JSON payload' });
    return;
  }

  const eventType = String(event.event ?? '');
  const payload = (event.payload ?? {}) as Record<string, unknown>;

  // 5. Idempotency — ATOMIC claim (SET NX). Only the first delivery for this
  //    eventId wins; concurrent duplicates are skipped without a check-then-act
  //    race. If processing later fails we release the claim so Razorpay's retry
  //    can reprocess (see step 7).
  const idempotencyKey = computeIdempotencyKey(req, eventType, payload);
  const redis = getRedisClient();

  if (idempotencyKey) {
    let claimed = false;
    try {
      claimed = await webhookVerifier.claim(idempotencyKey, redis);
    } catch (claimErr) {
      // Redis unavailable — fail OPEN (process the event) rather than dropping
      // it. Handlers are idempotent (upserts + payment-id invoice dedup), so a
      // rare double-process is safe; a missed billing event is not.
      logger.warn(
        'Webhook idempotency claim failed (Redis?) — processing without dedup',
        {
          idempotencyKey,
          err: claimErr instanceof Error ? claimErr.message : String(claimErr),
          module: 'webhook.controller',
        }
      );
      claimed = true;
    }
    if (!claimed) {
      logger.debug('Duplicate webhook event — skipping', {
        idempotencyKey,
        module: 'webhook.controller',
      });
      res.status(200).json({ status: 'already_processed' });
      return;
    }
  }

  logger.info('Processing Razorpay webhook event', {
    eventType,
    idempotencyKey,
    module: 'webhook.controller',
  });

  // 6. Route on event type
  let processingSucceeded = true;
  try {
    switch (eventType) {
      case 'subscription.activated':
        await handleSubscriptionActivated(payload);
        break;

      case 'subscription.charged':
        await handleSubscriptionCharged(payload);
        break;

      case 'payment.failed':
        await handlePaymentFailed(payload);
        break;

      case 'subscription.cancelled':
        await handleSubscriptionCancelled(payload);
        break;

      case 'subscription.paused':
        await handleSubscriptionPaused(payload);
        break;

      case 'subscription.resumed':
        await handleSubscriptionResumed(payload);
        break;

      case 'subscription.halted':
        await handleSubscriptionHalted(payload);
        break;

      case 'refund.created':
        await handleRefundCreated(payload);
        break;

      case 'refund.processed':
        await handleRefundProcessed(payload);
        break;

      case 'refund.failed':
        await handleRefundFailed(payload);
        break;

      case 'payment.captured':
        // For SUBSCRIPTION-linked payments this fires alongside
        // subscription.activated / subscription.charged, which own plan access —
        // nothing to do here.
        //
        // For ORDER-linked payments it is the ONLY event that confirms money was
        // captured, and is therefore where one-time prepaid AI credit packs are
        // granted.
        await handleOrderPaymentCaptured(payload);
        break;

      case 'payment.authorized':
        // Authorised but not yet captured — grants nothing.
        logger.debug(
          'Payment authorized event acknowledged (no entitlement granted until capture)',
          {
            eventType,
            module: 'webhook.controller',
          }
        );
        break;

      default:
        logger.info('Unhandled Razorpay webhook event type — acknowledging', {
          eventType,
          idempotencyKey,
          allEventData: JSON.stringify(event).slice(0, 500),
          module: 'webhook.controller',
        });
    }
  } catch (err) {
    // A handler threw — treat as a transient/unexpected failure. We must NOT
    // acknowledge success, or Razorpay would never retry and the billing event
    // (plan grant, email, downgrade) would be permanently lost.
    processingSucceeded = false;
    logger.error('Error processing Razorpay webhook event', err, {
      eventType,
      idempotencyKey,
      module: 'webhook.controller',
    });
  }

  // 7. Finalise.
  if (processingSucceeded) {
    // The claim (step 5) already marks the event processed for 24h, so nothing
    // more to do. Acknowledge so Razorpay stops delivering this event.
    res.status(200).json({ status: 'ok' });
  } else {
    // Release the idempotency claim so Razorpay's automatic retry (and our
    // claim) can reprocess this exact event, then return 5xx to trigger that
    // retry. Razorpay retries failed webhooks with backoff for ~24h.
    if (idempotencyKey) {
      await webhookVerifier.release(idempotencyKey, redis);
    }
    res
      .status(500)
      .json({ status: 'error', message: 'Processing failed; will retry' });
  }
}
