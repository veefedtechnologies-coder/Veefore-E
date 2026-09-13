import { Request, Response, Router } from 'express';
// The legacy feature/limit reads below (/current, /validate-feature, /usage) used
// to call `getPlanById` from `../subscription-config`, whose plan table had
// drifted from canonical config — it reported a 20-credit free allowance (vs 50),
// omitted the 'creator' tier entirely, and emitted `upgrade: 'starter'` hints
// pointing at a plan that no longer exists.
//
// They now read `getLegacyPlanView`, which projects the CANONICAL PLAN_CONFIG
// into the same legacy response shape, so these endpoints can no longer disagree
// with the entitlement engine. See legacyPlanView.ts for the feature mapping.
import { getLegacyPlanView } from '../features/subscription/lib/legacyPlanView';
// Canonical pricing source of truth — the same table the v2 checkout, renewal
// webhooks and entitlement engine price from. The legacy `pricing-config.ts`
// SUBSCRIPTION_PLANS table is deliberately NOT imported here any more: it had
// drifted to a different plan set and lower prices (see /plans below).
import { PLAN_CONFIG, ADDON_CONFIG } from '../config/plan-config';

// ---------------------------------------------------------------------------
// Canonical catalogue projections
//
// The legacy `subscription-config.ts` CREDIT_PACKAGES / ADDONS tables define
// pack sizes and prices that the entitlement system does not recognise (e.g. a
// 'credits-50' pack), so serving them advertised products that cannot actually
// be purchased. These helpers project the canonical ADDON_CONFIG into the same
// response shape legacy clients expect.
// ---------------------------------------------------------------------------

/** One-time prepaid AI credit packs, from canonical config. */
function canonicalCreditPackages() {
  return Object.values(ADDON_CONFIG)
    .filter(a => a.priceOneTime !== null)
    .map(a => ({
      id: a.type,
      name: a.name,
      totalCredits: a.quantityIncrement,
      baseCredits: a.quantityIncrement,
      bonusCredits: 0,
      price: (a.priceOneTime as number) / 100, // paise -> rupees
      currency: 'INR',
    }));
}

/** Recurring add-ons, from canonical config. */
function canonicalAddons() {
  return Object.values(ADDON_CONFIG)
    .filter(a => a.priceMonthly !== null)
    .map(a => ({
      id: a.type,
      type: a.type,
      name: a.name,
      price: (a.priceMonthly as number) / 100, // paise -> rupees
      currency: 'INR',
      interval: 'month',
      requiredMinPlan: a.requiredMinPlan ?? null,
    }));
}
import { z } from 'zod';
import { storage } from '../storage';
import Razorpay from 'razorpay';
import { requireAuth } from '../middleware/require-auth';

const router = Router();

// Initialize Razorpay only when needed and credentials are available
let razorpay: Razorpay | null = null;
const getRazorpayInstance = () => {
  if (!razorpay) {
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      throw new Error('Razorpay credentials not configured');
    }
    razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });
    console.log('[SUBSCRIPTION] Razorpay initialized successfully');
  }
  return razorpay;
};

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------
//
// SECURITY (P0): this router previously defined its OWN `requireAuth` that
// base64-decoded the JWT payload and trusted `payload.user_id || payload.sub`
// WITHOUT verifying the token signature. Any caller could mint an unsigned JWT
// with an arbitrary uid and act as ANY user against every endpoint below —
// including the paid `/upgrade` and add-on routes.
//
// We now delegate to the canonical, hardened middleware in
// `server/middleware/require-auth.ts`, which authenticates strictly from a
// cryptographically verified Firebase ID token (or a verified `__session`
// cookie) and fails CLOSED when Firebase Admin is unavailable. It attaches the
// same `req.user` document this router already expects, so behaviour is
// otherwise unchanged.

// Get all subscription plans
//
// CONSOLIDATION: this used to serve `pricing-config.SUBSCRIPTION_PLANS`, which
// drifted from the canonical `config/plan-config.PLAN_CONFIG` — it advertised a
// non-existent 'starter' tier and understated Pro/Business prices. Showing one
// set of prices while charging another is both a support burden and a
// chargeback risk, so this endpoint now projects PLAN_CONFIG (the same table the
// checkout and webhook code price from) into the legacy response shape.
//
// Prices in PLAN_CONFIG are stored in paise; the legacy shape expects rupees.
router.get('/plans', async (_req: Request, res: Response) => {
  try {
    const plansObject: Record<string, unknown> = {};

    for (const plan of Object.values(PLAN_CONFIG)) {
      // Enterprise is negotiated off-platform (placeholder price 0) — omit it
      // from the self-serve plan list rather than advertising it as free.
      if (plan.id === 'enterprise') continue;

      plansObject[plan.id] = {
        id: plan.id,
        name: plan.name,
        price: plan.pricing.monthly / 100,
        yearlyPrice: plan.pricing.yearly / 100,
        currency: 'INR',
        interval: 'month',
        credits: plan.limits.aiCreditsPerMonth,
      };
    }

    res.json({
      plans: plansObject,
      creditPackages: canonicalCreditPackages(),
      addons: canonicalAddons(),
    });
  } catch (error) {
    console.error('[SUBSCRIPTION] Error fetching plans:', error);
    res.status(500).json({ error: 'Failed to fetch subscription plans' });
  }
});

// Get credit packages
router.get('/credit-packages', async (req: Request, res: Response) => {
  try {
    res.json({ packages: canonicalCreditPackages() });
  } catch (error) {
    console.error('[SUBSCRIPTION] Error fetching credit packages:', error);
    res.status(500).json({ error: 'Failed to fetch credit packages' });
  }
});

// Get available addons
router.get('/addons', async (req: Request, res: Response) => {
  try {
    res.json({ addons: canonicalAddons() });
  } catch (error) {
    console.error('[SUBSCRIPTION] Error fetching addons:', error);
    res.status(500).json({ error: 'Failed to fetch addons' });
  }
});

// Get current user subscription
router.get('/current', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const currentPlan = getLegacyPlanView(user.plan);

    // Calculate total credits
    const totalCredits = user.credits || 0;
    const monthlyCredits = currentPlan?.credits || 0;

    // Format subscription data for frontend
    const subscriptionData = {
      id: user.id,
      userId: user.id,
      plan: user.plan || 'free',
      planStatus: user.planStatus || 'active',
      credits: totalCredits,
      nextBillingDate: null, // Will be set when payment system is integrated
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    res.json({
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        plan: user.plan || 'free',
        planStatus: user.planStatus || 'active',
        credits: totalCredits,
      },
      subscription: subscriptionData,
      plan: currentPlan,
      addons: [],
      billing: {
        monthlyCredits,
        totalCredits,
        nextBillingDate: subscriptionData.nextBillingDate,
      },
    });

    console.log('[SUBSCRIPTION] Returned subscription data:', {
      plan: user.plan || 'free',
      credits: totalCredits,
      planStatus: user.planStatus || 'active',
    });
  } catch (error) {
    console.error('[SUBSCRIPTION] Error fetching current subscription:', error);
    res.status(500).json({ error: 'Failed to fetch subscription details' });
  }
});

// Validate feature access
router.post(
  '/validate-feature',
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const user = req.user;
      if (!user?.id) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const userId = user.id;

      const { featureId, creditsRequired = 0 } = req.body;
      if (!featureId) {
        return res.status(400).json({ error: 'Feature ID is required' });
      }

      const userPlan = user.plan || 'free';
      const currentPlan = getLegacyPlanView(userPlan);
      const userCredits = user.credits || 0;

      // Check if feature is allowed on current plan
      const featureConfig = currentPlan?.features?.[featureId];
      const isFeatureAllowed = featureConfig?.allowed || false;

      // Check if user has enough credits
      const hasEnoughCredits = userCredits >= creditsRequired;

      // Final access decision
      const hasAccess = isFeatureAllowed && hasEnoughCredits;

      // Track feature usage if access is granted
      if (hasAccess && creditsRequired > 0) {
        try {
          await storage.trackFeatureUsage(userId, featureId, creditsRequired);
        } catch (error) {
          console.error('[FEATURE ACCESS] Error tracking usage:', error);
        }
      }

      res.json({
        hasAccess,
        isFeatureAllowed,
        hasEnoughCredits,
        userCredits,
        creditsRequired,
        currentPlan: userPlan,
        requiredPlan: featureConfig?.upgrade || null,
        reason: !hasAccess
          ? !isFeatureAllowed
            ? `Feature requires ${featureConfig?.upgrade || 'pro'} plan`
            : 'Insufficient credits'
          : 'Access granted',
      });

      console.log('[FEATURE ACCESS] Validation result:', {
        featureId,
        userId: user.id,
        hasAccess,
        isFeatureAllowed,
        hasEnoughCredits,
        userCredits,
        creditsRequired,
        currentPlan: userPlan,
      });
    } catch (error) {
      console.error('[SUBSCRIPTION] Error validating feature access:', error);
      res.status(500).json({ error: 'Failed to validate feature access' });
    }
  }
);

// Update subscription plan
router.post(
  '/update-plan',
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { planId, interval = 'month' } = req.body;
      if (!planId) {
        return res.status(400).json({ error: 'Plan ID is required' });
      }

      // SECURITY: this endpoint previously granted ANY plan for FREE — it called
      // storage.updateUserPlan() directly with no payment step, so any
      // authenticated user could POST { planId: 'enterprise' } and be upgraded
      // without paying. It is now disabled. All plan changes MUST go through the
      // payment-gated flow:
      //   • New subscription / upgrade → POST /api/v2/subscription/create|upgrade
      //     (returns a Razorpay checkout; the plan is applied only after the
      //     subscription.activated / subscription.charged webhook confirms the
      //     charge).
      // No plan mutation happens here.
      console.warn('[SUBSCRIPTION] Blocked deprecated free /update-plan call', {
        userId: user.id,
        planId,
      });
      return res.status(410).json({
        error:
          'This endpoint has been removed. Please use the checkout flow to change your plan.',
        code: 'ENDPOINT_REMOVED',
        redirect: '/billing',
      });
    } catch (error) {
      console.error('[SUBSCRIPTION] Error updating plan:', error);
      res.status(500).json({ error: 'Failed to update subscription plan' });
    }
  }
);

// REMOVED: Direct credit purchase endpoint - all credit purchases must go through Razorpay payment verification
// Use /api/razorpay/create-order and /api/razorpay/verify-payment instead

// Purchase addon — DISABLED
//
// SECURITY (P0): this endpoint used to call `storage.createUserAddon(...)` with
// `isActive: true` immediately, with an inline comment reading "For now, just
// add addon (payment integration would go here)". There was NO payment step, so
// any authenticated user could grant themselves any paid add-on for free simply
// by POSTing an addonId.
//
// It is disabled rather than deleted so existing clients receive an explicit,
// actionable 410 instead of a confusing 404. Paid add-ons must be purchased via
// the v2 flow (POST /api/v2/subscription/addon/add), which creates a real
// Razorpay subscription and only grants entitlement once a captured payment is
// confirmed by webhook.
router.post('/purchase-addon', requireAuth, (_req: Request, res: Response) => {
  console.warn(
    '[SUBSCRIPTION] Blocked call to disabled /purchase-addon endpoint'
  );
  res.status(410).json({
    error: 'Endpoint removed',
    message:
      'This endpoint granted add-ons without payment and has been disabled. ' +
      'Use POST /api/v2/subscription/addon/add instead.',
  });
});

// Get subscription usage analytics
router.get('/usage', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user;
    if (!user?.id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const userId = user.id;

    // Get feature usage for current month
    const featureUsage = await storage.getFeatureUsage(userId);

    // Get recent credit transactions
    const creditTransactions = await storage.getCreditTransactions(userId, 10);

    // Calculate usage statistics
    const currentPlan = getLegacyPlanView(user.plan);
    const planLimits = currentPlan?.features || {};

    res.json({
      currentPlan: user.plan || 'free',
      credits: user.credits || 0,
      featureUsage,
      planLimits,
      recentTransactions: creditTransactions,
    });
  } catch (error) {
    console.error('[SUBSCRIPTION] Error fetching usage:', error);
    res.status(500).json({ error: 'Failed to fetch usage data' });
  }
});

// Create Razorpay order for subscription upgrade — DISABLED
//
// CONSOLIDATION: this endpoint priced orders from `server/pricing-config.ts`
// (SUBSCRIPTION_PLANS), a stale table that disagrees with the canonical
// `server/config/plan-config.ts` on BOTH the plan set and the prices — it
// offers a 'starter' tier that no longer exists and prices Pro at Rs.1499 where
// canonical pricing is Rs.1999. Any purchase completed here therefore
// undercharged the customer and granted a plan the entitlement system does not
// price the same way.
//
// All purchases now go through the v2 Razorpay Subscriptions flow
// (POST /api/v2/subscription/create), which derives every amount from
// PLAN_CONFIG and registers a real auto-renew mandate.
router.post('/create-order', requireAuth, (_req: Request, res: Response) => {
  console.warn(
    '[SUBSCRIPTION] Blocked call to disabled /create-order endpoint'
  );
  res.status(410).json({
    error: 'Endpoint removed',
    message:
      'This endpoint priced orders from a stale pricing table and has been disabled. ' +
      'Use POST /api/v2/subscription/create instead.',
  });
});

// Upgrade subscription — DISABLED
//
// CONSOLIDATION: paired with the retired /create-order above and read the same
// stale `pricing-config.ts` table, so it could grant a plan whose price and
// credit allocation disagree with the canonical PLAN_CONFIG. It also set credits
// directly via `storage.updateUserCredits`, bypassing the AICredits ledger that
// the v2 entitlement system treats as authoritative.
//
// Upgrades now go through POST /api/v2/subscription/upgrade, which prices from
// PLAN_CONFIG, keeps the Razorpay mandate in sync, and only grants the new tier
// once a captured payment is confirmed by webhook.
router.post('/upgrade', requireAuth, (_req: Request, res: Response) => {
  console.warn('[SUBSCRIPTION] Blocked call to disabled /upgrade endpoint');
  res.status(410).json({
    error: 'Endpoint removed',
    message:
      'This endpoint used a stale pricing table and has been disabled. ' +
      'Use POST /api/v2/subscription/upgrade instead.',
  });
});

export default router;
