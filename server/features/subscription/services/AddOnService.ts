/**
 * AddOnService
 *
 * Manages the full lifecycle of subscription add-ons:
 *  - addAddOn:          Purchase a new add-on (one-time credit packs or recurring)
 *  - removeAddOn:       Cancel an active add-on and optionally cancel its Razorpay subscription
 *  - listActiveAddOns:  Query all active add-ons for a user
 *
 * Plan gate: add-ons with `requiredMinPlan` set in ADDON_CONFIG are validated
 * against the user's current plan via EntitlementService before purchase.
 *
 * Cache: entitlement cache is invalidated after every mutation so the next
 * request picks up the updated limits immediately.
 *
 * Recurring add-ons use the Razorpay Subscriptions API via
 * `razorpaySubscriptionService`, mirroring the pattern in
 * SubscriptionService.ts: Razorpay plans are immutable price points, so the
 * resulting plan_id for each (addon type, monthly, price) combination is
 * cached in `RazorpayPlanModel` — the same model used for base plan
 * subscriptions, since its `planType` field is a plain string key and is not
 * restricted to base PlanId values.
 *
 * Satisfies Requirements: 8.1, 8.2, 8.3, 8.4
 */

import { type Redis } from 'ioredis';
import {
  ADDON_CONFIG,
  type AddOnType,
  type BillingCycle,
  getPlanOrder,
  getPlanConfig,
} from '../../../config/plan-config';
import { AddOnModel, type IAddOn } from '../db/models/AddOnModel';
import { AICreditsRepository } from '../db/repositories/AICreditsRepository';
import SubscriptionRepository from '../db/repositories/SubscriptionRepository';
import RazorpayPlanModel from '../db/models/RazorpayPlanModel';
process.env.RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || 'rzp_test_id';
process.env.RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || 'rzp_test_secret';
import { razorpaySubscriptionService } from './RazorpaySubscriptionService';
import { quotaNotifier } from './QuotaNotifier';
import logger from '../../../config/logger';
import type EntitlementService from './EntitlementService';

// ---------------------------------------------------------------------------
// Internal constants
// ---------------------------------------------------------------------------

/**
 * Add-on subscriptions are always billed monthly (see addAddOn below —
 * billingCycle was hardcoded to 'monthly' under the previous Cashfree
 * integration as well). Razorpay requires a finite `total_count`; 120
 * monthly cycles (~10 years) approximates "until cancelled", matching
 * TOTAL_BILLING_CYCLES.monthly in SubscriptionService.ts.
 */
const ADDON_BILLING_CYCLE: BillingCycle = 'monthly';
const ADDON_TOTAL_BILLING_CYCLES = 120;

// ---------------------------------------------------------------------------
// AddOnService
// ---------------------------------------------------------------------------

export class AddOnService {
  private readonly aiCreditsRepo: AICreditsRepository;
  private readonly subscriptionRepo: SubscriptionRepository;

  constructor(
    private readonly entitlementService: EntitlementService,
    private readonly redis: Redis
  ) {
    this.aiCreditsRepo = new AICreditsRepository();
    this.subscriptionRepo = new SubscriptionRepository();
  }

  // -------------------------------------------------------------------------
  // Internal — resolve or create the Razorpay plan_id for a given add-on
  // -------------------------------------------------------------------------

  /**
   * Returns the cached Razorpay plan_id for (addonType, monthly, amountPaise),
   * creating it at Razorpay on first use. Mirrors
   * SubscriptionService.getOrCreateRazorpayPlanId — reuses the same
   * RazorpayPlanModel collection since add-on types and base PlanIds never
   * collide (they are drawn from disjoint string unions) and the schema's
   * `planType` field is untyped beyond `string`.
   */
  private async getOrCreateRazorpayAddOnPlanId(
    addonType: AddOnType,
    amountPaise: number
  ): Promise<string> {
    const existing = await RazorpayPlanModel.findOne({
      planType: addonType,
      billingCycle: ADDON_BILLING_CYCLE,
      amountPaise,
    }).lean();

    if (existing) {
      return existing.razorpayPlanId;
    }

    const razorpayPlanId = await razorpaySubscriptionService.createPlan({
      planType: addonType,
      billingCycle: ADDON_BILLING_CYCLE,
      amountRupees: amountPaise / 100,
    });

    await RazorpayPlanModel.create({
      planType: addonType,
      billingCycle: ADDON_BILLING_CYCLE,
      amountPaise,
      razorpayPlanId,
    });

    logger.info('Created new Razorpay plan for add-on', {
      addonType,
      amountPaise,
      razorpayPlanId,
      module: 'AddOnService',
    });

    return razorpayPlanId;
  }

  // -------------------------------------------------------------------------
  // addAddOn
  // -------------------------------------------------------------------------

  /**
   * Purchase an add-on for a user.
   *
   * Steps:
   *  1. Look up the add-on definition from ADDON_CONFIG.
   *  2. If `requiredMinPlan` is set, verify the user's current plan meets
   *     the minimum tier. Throws HTTP 403 if insufficient.
   *  3a. One-time AI credit packs (priceOneTime != null):
   *      - Atomically add credits via AICreditsRepository.addPurchasedCredits.
   *      - Send a credit purchase confirmation notification.
   *  3b. Recurring add-ons (priceOneTime == null):
   *      - Resolve/create the Razorpay plan_id for this add-on's price point.
   *      - Create a Razorpay subscription for the add-on plan, billed to the
   *        user's existing Razorpay customer record.
   *      - Persist an AddOn document with status 'active',
   *        razorpaySubscriptionId, and currentPeriodEnd = 30 days from now.
   *  4. Invalidate the entitlement cache so limits are recomputed immediately.
   *
   * @param userId    - The user purchasing the add-on.
   * @param addonType - Which add-on to purchase (from AddOnType union).
   * @param quantity  - How many units to purchase (must be >= 1).
   * @param options   - Internal trust context. `paymentVerified` MUST only be
   *                    set by a caller that has already confirmed money was
   *                    captured for this exact purchase (a verified Razorpay
   *                    webhook or an authenticated admin grant). See the
   *                    security note on the one-time branch below.
   */
  /**
   * Marker placed on Razorpay order notes so the webhook can recognise a
   * credit-pack purchase. Must stay in sync with the webhook handler.
   */
  static readonly CREDIT_PACK_PURPOSE = 'ai_credit_pack';

  /**
   * Begin the purchase of a one-time prepaid AI credit pack.
   *
   * Creates a Razorpay ORDER (not a subscription — these packs must not register
   * a recurring mandate) and returns the checkout parameters. No credits are
   * granted here: the `payment.captured` webhook is the single place that grants
   * them, once Razorpay confirms the money was actually captured.
   *
   * The amount is derived entirely from ADDON_CONFIG server-side. The client
   * supplies only which pack and how many, so it can never influence the price.
   */
  async createCreditPackOrder(
    userId: string,
    addonType: AddOnType,
    quantity: number
  ): Promise<{
    orderId: string;
    amountPaise: number;
    currency: string;
    credits: number;
    addonType: AddOnType;
    keyId: string;
  }> {
    const addonDef = ADDON_CONFIG[addonType];
    if (!addonDef) {
      const error = new Error(`Unknown add-on type: ${addonType}`) as Error & {
        statusCode?: number;
      };
      error.statusCode = 400;
      throw error;
    }

    // Only one-time packs go through the Orders API. Recurring add-ons must use
    // addAddOn() so they get a real auto-renew mandate.
    if (addonDef.priceOneTime === null) {
      const error = new Error(
        `'${addonDef.name}' is a recurring add-on and cannot be bought as a one-time order.`
      ) as Error & { statusCode?: number };
      error.statusCode = 400;
      throw error;
    }

    if (!Number.isInteger(quantity) || quantity < 1) {
      const error = new Error(
        'Quantity must be a positive integer'
      ) as Error & {
        statusCode?: number;
      };
      error.statusCode = 400;
      throw error;
    }

    // Cap quantity: without a bound, a single request could create an
    // arbitrarily large order (and, on capture, an arbitrarily large credit
    // grant). Buying more than this is an enterprise conversation.
    const MAX_PACKS_PER_ORDER = 20;
    if (quantity > MAX_PACKS_PER_ORDER) {
      const error = new Error(
        `You can buy at most ${MAX_PACKS_PER_ORDER} packs in a single order. Please contact sales for larger volumes.`
      ) as Error & { statusCode?: number };
      error.statusCode = 400;
      throw error;
    }

    const amountPaise = addonDef.priceOneTime * quantity;
    const credits = addonDef.quantityIncrement * quantity;

    const keyId = process.env.RAZORPAY_KEY_ID;
    if (!keyId) {
      throw new Error('Missing required environment variable: RAZORPAY_KEY_ID');
    }

    const order = await razorpaySubscriptionService.createOrder(
      amountPaise,
      `cr_${addonType}_${Date.now()}`,
      {
        veefore_purpose: AddOnService.CREDIT_PACK_PURPOSE,
        veefore_user_id: userId,
        veefore_addon_type: addonType,
        veefore_quantity: String(quantity),
        veefore_credits: String(credits),
      }
    );

    logger.info('Created AI credit pack order — awaiting payment capture', {
      userId,
      addonType,
      quantity,
      credits,
      amountPaise,
      orderId: order.orderId,
      module: 'AddOnService',
    });

    return {
      orderId: order.orderId,
      amountPaise: order.amountPaise,
      currency: order.currency,
      credits,
      addonType,
      keyId,
    };
  }

  async addAddOn(
    userId: string,
    addonType: AddOnType,
    quantity: number,
    options?: {
      /** Set only when a captured payment for this purchase has been verified. */
      paymentVerified?: boolean;
      /** Razorpay payment id backing this grant, for audit/logging. */
      razorpayPaymentId?: string;
    }
  ): Promise<void> {
    // 1. Look up add-on definition
    const addonDef = ADDON_CONFIG[addonType];
    if (!addonDef) {
      throw new Error(`Unknown add-on type: ${addonType}`);
    }

    logger.info('Adding add-on for user', {
      userId,
      addonType,
      quantity,
      module: 'AddOnService',
    });

    // 2. Check requiredMinPlan if set
    if (addonDef.requiredMinPlan !== undefined) {
      const userPlan = await this.entitlementService.getPlan(userId);
      const userPlanOrder = getPlanOrder(userPlan);
      const requiredPlanOrder = getPlanOrder(addonDef.requiredMinPlan);

      if (userPlanOrder < requiredPlanOrder) {
        const requiredPlanConfig = getPlanConfig(addonDef.requiredMinPlan);
        const requiredPlanName =
          requiredPlanConfig?.name ?? addonDef.requiredMinPlan;

        logger.warn('Add-on purchase denied — insufficient plan', {
          userId,
          addonType,
          userPlan,
          requiredMinPlan: addonDef.requiredMinPlan,
          module: 'AddOnService',
        });

        const error = new Error(
          `The '${addonDef.name}' add-on requires the ${requiredPlanName} plan or higher. ` +
            `Your current plan is '${userPlan}'. Please upgrade to purchase this add-on.`
        );
        (error as NodeJS.ErrnoException & { statusCode?: number }).statusCode =
          403;
        throw error;
      }
    }

    // 3a. One-time AI credit pack
    if (addonDef.priceOneTime !== null) {
      // SECURITY GATE — one-time packs are PREPAID goods. Granting them without
      // a confirmed payment let any authenticated user mint unlimited credits
      // by POSTing {addonType:'ai_credits_5000', quantity:N} to
      // /api/v2/subscription/addon/add (quantity is client-supplied), which is
      // a direct revenue-loss hole. Credits may only be issued once a captured
      // payment has been verified (Razorpay webhook) or by an authenticated
      // admin grant. Callers without that context are rejected with HTTP 402.
      if (!options?.paymentVerified) {
        logger.warn('Blocked unpaid one-time add-on grant attempt', {
          userId,
          addonType,
          quantity,
          priceOneTimePaise: addonDef.priceOneTime,
          module: 'AddOnService',
        });
        const error = new Error(
          `The '${addonDef.name}' add-on must be paid for before it can be applied. ` +
            'Please complete checkout to purchase this pack.'
        );
        (error as NodeJS.ErrnoException & { statusCode?: number }).statusCode =
          402;
        throw error;
      }

      const creditsToAdd = addonDef.quantityIncrement * quantity;

      logger.info('Adding purchased AI credits', {
        userId,
        addonType,
        quantity,
        creditsToAdd,
        module: 'AddOnService',
      });

      const updatedDoc = await this.aiCreditsRepo.addPurchasedCredits(
        userId,
        creditsToAdd
      );

      if (!updatedDoc) {
        // No credits doc exists yet — this shouldn't happen in the normal flow
        // (credits doc is created on subscription activation), but handle gracefully
        logger.warn(
          'No AICredits document found for user when adding purchased credits',
          { userId, addonType, module: 'AddOnService' }
        );
        throw new Error(
          'Unable to add credits: no credits account found for this user. ' +
            'Please ensure the user has an active subscription first.'
        );
      }

      // Send purchase confirmation (newBalance is the total remainingCredits)
      await quotaNotifier.sendCreditPurchaseConfirmation(
        userId,
        creditsToAdd,
        updatedDoc.remainingCredits
      );

      logger.info('AI credits added successfully', {
        userId,
        addonType,
        creditsToAdd,
        newBalance: updatedDoc.remainingCredits,
        module: 'AddOnService',
      });
    } else {
      // 3b. Recurring add-on — create Razorpay subscription and AddOn document
      //
      // The user must already have a Razorpay customer record from their
      // base plan subscription (created in SubscriptionService.create).
      // Add-ons are billed to that same customer rather than creating a
      // second, duplicate Razorpay customer for the same user.
      const subscription = await this.subscriptionRepo.findByUserId(userId);
      const razorpayCustomerId = subscription?.razorpayCustomerId;

      if (!razorpayCustomerId) {
        logger.warn(
          'Cannot create recurring add-on subscription — user has no Razorpay customer on file',
          { userId, addonType, module: 'AddOnService' }
        );
        throw new Error(
          'Unable to purchase this add-on: no billing account found for this user. ' +
            'Please ensure the user has an active subscription first.'
        );
      }

      const amountPaise = addonDef.priceMonthly;
      if (amountPaise === null) {
        // Should be unreachable given the priceOneTime check above, but
        // guards against a malformed ADDON_CONFIG entry.
        throw new Error(
          `Add-on '${addonType}' has no recurring price configured`
        );
      }

      const razorpayPlanId = await this.getOrCreateRazorpayAddOnPlanId(
        addonType,
        amountPaise
      );

      const razorpaySub = await razorpaySubscriptionService.createSubscription({
        customerId: razorpayCustomerId,
        planId: razorpayPlanId,
        totalCount: ADDON_TOTAL_BILLING_CYCLES,
        notes: {
          veefore_user_id: userId,
          veefore_addon_type: addonType,
        },
      });

      const currentPeriodEnd = new Date();
      currentPeriodEnd.setDate(currentPeriodEnd.getDate() + 30);

      // Created as 'pending', NOT 'active'. A freshly created Razorpay
      // subscription is in state 'created' — the customer still has to
      // authorize the mandate and the first charge has not been captured.
      // Marking it active here handed out paid add-on limits to anyone who
      // started a checkout and abandoned it. The subscription.activated /
      // subscription.charged webhook promotes it to 'active' once money is
      // actually captured. Admin grants bypass this path entirely.
      await AddOnModel.create({
        userId,
        type: addonType,
        quantity,
        status: options?.paymentVerified ? 'active' : 'pending',
        razorpaySubscriptionId: razorpaySub.subscriptionId,
        currentPeriodEnd,
      });

      logger.info('Recurring add-on created — awaiting payment confirmation', {
        userId,
        addonType,
        quantity,
        razorpaySubscriptionId: razorpaySub.subscriptionId,
        currentPeriodEnd,
        module: 'AddOnService',
      });
    }

    // 4. Invalidate entitlement cache so updated limits are reflected immediately
    await this.entitlementService.invalidateCache(userId);
  }

  // -------------------------------------------------------------------------
  // removeAddOn
  // -------------------------------------------------------------------------

  /**
   * Cancel an active add-on.
   *
   * Steps:
   *  1. Find the AddOn document by addOnId and userId.
   *  2. If a razorpaySubscriptionId exists, cancel it via razorpaySubscriptionService.
   *  3. Mark the document status = 'cancelled' (soft delete — document is kept).
   *  4. Invalidate the entitlement cache.
   *
   * @param userId  - The user who owns the add-on.
   * @param addOnId - The UUID of the AddOn document to cancel.
   */
  async removeAddOn(userId: string, addOnId: string): Promise<void> {
    // 1. Find the AddOn document
    const addOn = await AddOnModel.findOne({ addOnId, userId });

    if (!addOn) {
      logger.warn('Add-on not found or does not belong to user', {
        userId,
        addOnId,
        module: 'AddOnService',
      });
      const error = new Error(
        `Add-on '${addOnId}' was not found or does not belong to this user.`
      );
      (error as NodeJS.ErrnoException & { statusCode?: number }).statusCode =
        404;
      throw error;
    }

    logger.info('Removing add-on for user', {
      userId,
      addOnId,
      type: addOn.type,
      module: 'AddOnService',
    });

    // 2. Cancel Razorpay subscription if present.
    // cancelAtCycleEnd=true: the add-on remains active (and won't be charged
    // again) until the current billing cycle completes, matching the same
    // "cancel = disable auto-renew, keep access until period end" behaviour
    // used for base plan cancellation in SubscriptionService.cancel.
    if (addOn.razorpaySubscriptionId) {
      try {
        await razorpaySubscriptionService.cancelSubscription(
          addOn.razorpaySubscriptionId,
          true
        );

        logger.info('Razorpay subscription cancelled for add-on', {
          userId,
          addOnId,
          razorpaySubscriptionId: addOn.razorpaySubscriptionId,
          module: 'AddOnService',
        });
      } catch (err) {
        // Log and re-throw — never mark the add-on as cancelled if Razorpay
        // cancellation fails, to avoid billing drift between local state and Razorpay
        logger.error('Failed to cancel Razorpay subscription for add-on', err, {
          userId,
          addOnId,
          razorpaySubscriptionId: addOn.razorpaySubscriptionId,
          module: 'AddOnService',
        });
        throw err;
      }
    }

    // 3. Soft-delete: mark status as cancelled (keep document for audit trail)
    addOn.status = 'cancelled';
    await addOn.save();

    logger.info('Add-on marked as cancelled', {
      userId,
      addOnId,
      type: addOn.type,
      module: 'AddOnService',
    });

    // 4. Invalidate entitlement cache so removed limits are reflected immediately
    await this.entitlementService.invalidateCache(userId);
  }

  // -------------------------------------------------------------------------
  // listActiveAddOns
  // -------------------------------------------------------------------------

  /**
   * Returns all active add-ons for a user.
   *
   * @param userId - The user whose active add-ons to retrieve.
   * @returns Array of IAddOn documents (may be empty if none active).
   */
  async listActiveAddOns(userId: string): Promise<IAddOn[]> {
    const addOns = await AddOnModel.find({ userId, status: 'active' }).lean<
      IAddOn[]
    >();

    logger.debug('Listed active add-ons', {
      userId,
      count: addOns.length,
      module: 'AddOnService',
    });

    return addOns;
  }
}

// ---------------------------------------------------------------------------
// Factory / singleton helper
// ---------------------------------------------------------------------------

let _instance: AddOnService | null = null;

/**
 * Returns a shared AddOnService singleton.
 * Must be called after EntitlementService and Redis are initialised.
 */
export function getAddOnService(
  entitlementService: EntitlementService,
  redis: Redis
): AddOnService {
  if (!_instance) {
    _instance = new AddOnService(entitlementService, redis);
  }
  return _instance;
}

export default AddOnService;
