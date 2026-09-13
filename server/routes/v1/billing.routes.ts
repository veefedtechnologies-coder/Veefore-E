/**
 * Legacy billing routes.
 *
 * This router is now READ-ONLY. Every purchase/verification endpoint it used to
 * expose has been retired (410) because each priced money from a table that had
 * drifted from the canonical `server/config/plan-config.ts`, and because
 * entitlement is now granted exclusively from signed Razorpay webhooks rather
 * than from client callbacks.
 *
 * Purchases live in the v2 API:
 *   - plans / upgrades   → POST /api/v2/subscription/create | /upgrade
 *   - AI credit packs    → POST /api/v2/subscription/credits/create-order
 *   - add-ons            → POST /api/v2/subscription/addon/add
 *
 * Mounted exactly once, at /api/billing (see mountBillingRoutes in
 * server/routes/v1/index.ts) — money endpoints must not be reachable at two
 * prefixes.
 *
 * The request-validation schemas, `validateRequest` and `billingAuditMiddleware`
 * imports were removed along with the handlers that used them; the remaining
 * read endpoints take no request body.
 */

import { Router, Request, Response, type RequestHandler } from 'express';
import { requireAuth } from '../../middleware/require-auth';
import { storage } from '../../mongodb-storage';
import { AuthenticatedRequest } from '../../types/express';

const router = Router();

/**
 * Adapts a handler written against `AuthenticatedRequest` (which carries
 * `req.user`, populated by `requireAuth`) to Express's `RequestHandler`
 * signature. `AuthenticatedRequest` is not assignable to `Request`, so passing
 * these handlers directly produced a TS2769 overload error on every route.
 * Narrowing here keeps the handlers strongly typed against `req.user`.
 */
const authed =
  (
    handler: (req: AuthenticatedRequest, res: Response) => unknown
  ): RequestHandler =>
  (req, res) =>
    void handler(req as unknown as AuthenticatedRequest, res);

router.get(
  '/subscription',
  requireAuth,
  authed(async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user.id;

      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      const currentPlan = user.plan || 'free';
      const creditBalance = user.credits || 0;

      // Resolve the monthly AI-credit allowance from the canonical plan config so
      // this legacy read can never disagree with what the entitlement engine
      // actually grants. Unknown/legacy plan strings fall back to the free tier.
      const { PLAN_CONFIG, isValidPlan } =
        await import('../../config/plan-config');
      const canonicalMonthlyCredits = isValidPlan(currentPlan)
        ? PLAN_CONFIG[currentPlan as keyof typeof PLAN_CONFIG].limits
            .aiCreditsPerMonth
        : PLAN_CONFIG.free.limits.aiCreditsPerMonth;

      console.log(
        `[SUBSCRIPTION] User ${userId} has plan: ${currentPlan} with ${creditBalance} credits`
      );

      const subscription = {
        id: 0,
        plan: currentPlan,
        status: 'active',
        userId: userId,
        createdAt: new Date(),
        updatedAt: new Date(),
        priceId: null,
        subscriptionId: null,
        currentPeriodStart: null,
        currentPeriodEnd: null,
        canceledAt: null,
        trialEnd: null,
        // CONSOLIDATION: this was a hardcoded ladder (free:20, starter:300,
        // pro:1100, business:2000) that matched neither the canonical
        // PLAN_CONFIG allowances (free:50, creator:500, pro:2000, business:5000)
        // nor the real plan set — 'starter' does not exist and 'creator' was
        // missing entirely, so Creator users were reported the 50-credit fallback.
        // Read the canonical allowance instead.
        monthlyCredits: canonicalMonthlyCredits,
        extraCredits: 0,
        autoRenew: false,
        credits: creditBalance,
        lastUpdated: new Date(),
      };

      res.json(subscription);
    } catch (error: any) {
      console.error('[SUBSCRIPTION] Error:', error);
      res
        .status(500)
        .json({ error: error.message || 'Failed to fetch subscription' });
    }
  })
);

// Public plan catalogue.
//
// CONSOLIDATION: previously returned `pricing-config`'s SUBSCRIPTION_PLANS /
// CREDIT_PACKAGES / ADDONS verbatim. Those tables disagreed with the canonical
// `config/plan-config.ts` on plan names, plan prices AND credit-pack prices, so
// this endpoint advertised numbers the checkout would never actually charge.
// It now projects the canonical config — the same tables the v2 checkout,
// renewal webhooks and entitlement engine price from.
router.get('/subscription/plans', async (_req: Request, res: Response) => {
  try {
    const { PLAN_CONFIG, ADDON_CONFIG } =
      await import('../../config/plan-config');

    const plans: Record<string, unknown> = {};
    for (const plan of Object.values(PLAN_CONFIG)) {
      // Enterprise pricing is negotiated off-platform (placeholder 0) — omit it
      // rather than advertising it as free.
      if (plan.id === 'enterprise') continue;
      plans[plan.id] = {
        id: plan.id,
        name: plan.name,
        price: plan.pricing.monthly / 100, // paise → rupees
        yearlyPrice: plan.pricing.yearly / 100,
        currency: 'INR',
        interval: 'month',
        credits: plan.limits.aiCreditsPerMonth,
      };
    }

    // One-time prepaid credit packs, in the shape the legacy clients expect.
    const creditPackages = Object.values(ADDON_CONFIG)
      .filter(a => a.priceOneTime !== null)
      .map(a => ({
        id: a.type,
        name: a.name,
        totalCredits: a.quantityIncrement,
        price: (a.priceOneTime as number) / 100,
        currency: 'INR',
      }));

    // Recurring add-ons.
    const addons = Object.values(ADDON_CONFIG)
      .filter(a => a.priceMonthly !== null)
      .map(a => ({
        id: a.type,
        type: a.type,
        name: a.name,
        price: (a.priceMonthly as number) / 100,
        currency: 'INR',
        interval: 'month',
        requiredMinPlan: a.requiredMinPlan ?? null,
      }));

    res.json({ plans, creditPackages, addons });
  } catch (error: any) {
    console.error('[SUBSCRIPTION PLANS] Error:', error);
    res
      .status(500)
      .json({ error: error.message || 'Failed to fetch subscription plans' });
  }
});

router.get(
  '/credit-transactions',
  requireAuth,
  authed(async (req: AuthenticatedRequest, res: Response) => {
    try {
      const transactions = await storage.getCreditTransactions(req.user.id);

      res.json(transactions);
    } catch (error: any) {
      console.error('[CREDIT TRANSACTIONS] Error:', error);
      res.status(500).json({
        error: error.message || 'Failed to fetch credit transactions',
      });
    }
  })
);

// DISABLED — credit-pack purchase is owned by the v2 flow.
//
// CONSOLIDATION: this priced credit packs from `pricing-config.CREDIT_PACKAGES`,
// which had drifted badly from the canonical `config/plan-config.ADDON_CONFIG`.
// It OVERCHARGED by roughly 3x — Rs.999 for 500 credits where canonical pricing
// is Rs.299, and Rs.5999 for 5,000 credits where canonical is Rs.1999 — and
// offered pack sizes (100 / 1,000 / 2,500) the entitlement system never defined.
//
// Superseded by POST /api/v2/subscription/credits/create-order, which derives the
// amount from ADDON_CONFIG and grants credits only from the verified
// `payment.captured` webhook.
router.post(
  '/razorpay/create-order',
  requireAuth,
  authed((_req: AuthenticatedRequest, res: Response) => {
    console.warn('[BILLING] Blocked call to disabled /razorpay/create-order');
    return res.status(410).json({
      error: 'Endpoint removed',
      message:
        'This endpoint priced credit packs from a stale table and has been disabled. ' +
        'Use POST /api/v2/subscription/credits/create-order instead.',
    });
  })
);

// DISABLED — subscription purchase is owned by the v2 flow.
//
// CONSOLIDATION: this created a ONE-OFF Razorpay order priced from
// `storage.getPricingData()` — a third plan-price source alongside
// `config/plan-config.ts` and `pricing-config.ts`. Two problems:
//
//  1. A one-off order registers no auto-renew mandate, so a "subscription"
//     bought here would silently never renew.
//  2. Its prices drift from the canonical PLAN_CONFIG that the entitlement
//     engine and renewal webhooks use, so the customer could be charged an
//     amount that does not correspond to the tier they were granted.
//
// POST /api/v2/subscription/create supersedes it: it prices from PLAN_CONFIG and
// creates a real Razorpay subscription mandate.
router.post(
  '/razorpay/create-subscription',
  requireAuth,
  authed((_req: AuthenticatedRequest, res: Response) => {
    console.warn(
      '[BILLING] Blocked call to disabled /razorpay/create-subscription'
    );
    return res.status(410).json({
      error: 'Endpoint removed',
      message:
        'This endpoint created a non-renewing order from a stale pricing table. ' +
        'Use POST /api/v2/subscription/create instead.',
    });
  })
);

// DISABLED — client-driven payment verification is replaced by webhooks.
//
// CONSOLIDATION + SECURITY: this applied entitlement from `type`, `planId` and
// `packageId` taken out of the REQUEST BODY after only checking the signature. A
// signature proves the order/payment pair is genuine; it says nothing about what
// was purchased. It was hardened with order binding, an amount check and a replay
// guard, but the pattern itself is now unnecessary: granting entitlement from a
// client callback is inherently weaker than granting it from a signed
// server-to-server webhook, which cannot be skipped, replayed, or abandoned
// mid-flow.
//
// Entitlement is now granted exclusively by the Razorpay webhook
// (`payment.captured` for one-time credit packs; `subscription.activated` /
// `subscription.charged` for plans), which re-reads the order/subscription from
// Razorpay and re-derives the expected amount from PLAN_CONFIG / ADDON_CONFIG.
router.post(
  '/razorpay/verify-payment',
  requireAuth,
  authed((_req: AuthenticatedRequest, res: Response) => {
    console.warn('[BILLING] Blocked call to disabled /razorpay/verify-payment');
    return res.status(410).json({
      error: 'Endpoint removed',
      message:
        'Entitlement is now granted by the Razorpay webhook, not by client-side ' +
        'verification. No action is needed after checkout completes.',
    });
  })
);

// DISABLED — add-on purchase is owned by the v2 flow.
//
// CONSOLIDATION: priced add-ons from `storage.getPricingData().addons` (yet
// another table) and mixed paise/rupee units inconsistently with the credit-pack
// route beside it. Recurring add-ons also require a real Razorpay mandate, which
// a one-off order cannot provide — anything bought here would never renew.
//
// Superseded by POST /api/v2/subscription/addon/add, which prices from
// ADDON_CONFIG, creates a proper subscription mandate for recurring add-ons, and
// only activates them once payment is confirmed by webhook.
router.post(
  '/razorpay/create-addon-order',
  requireAuth,
  authed((_req: AuthenticatedRequest, res: Response) => {
    console.warn(
      '[BILLING] Blocked call to disabled /razorpay/create-addon-order'
    );
    return res.status(410).json({
      error: 'Endpoint removed',
      message:
        'This endpoint priced add-ons from a stale table and created non-renewing ' +
        'orders. Use POST /api/v2/subscription/addon/add instead.',
    });
  })
);

export default router;
