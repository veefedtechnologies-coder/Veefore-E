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

import { z } from 'zod'
import crypto from 'crypto'
import { type Request, type Response } from 'express'
import { getEntitlementService, UsageCounterModel } from '../services/EntitlementService'
import { getSubscriptionService } from '../services/SubscriptionService'
import { getAddOnService } from '../services/AddOnService'
import { razorpaySubscriptionService } from '../services/RazorpaySubscriptionService'
import SubscriptionRepository from '../db/repositories/SubscriptionRepository'
import AICreditsModel from '../db/models/AICreditsModel'
import AICreditTransactionModel from '../db/models/AICreditTransactionModel'
import { getRedisClient } from '../../../lib/redis'
import logger from '../../../config/logger'

// ---------------------------------------------------------------------------
// Internal helpers — lazy singleton wiring
// ---------------------------------------------------------------------------

/**
 * Resolves the three service singletons at call time.
 * Avoids circular-init issues by deferring construction until first request.
 */
function getServices() {
  const redis = getRedisClient()
  const subscriptionRepo = new SubscriptionRepository()
  const entitlementService = getEntitlementService(redis, subscriptionRepo)
  const subscriptionService = getSubscriptionService(subscriptionRepo, entitlementService, redis)
  const addOnService = getAddOnService(entitlementService, redis)
  return { redis, subscriptionRepo, entitlementService, subscriptionService, addOnService }
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
})

const UpgradeSchema = z.object({
  newPlanId: z.string(),
})

const DowngradeSchema = z.object({
  newPlanId: z.string(),
})

const AddAddonSchema = z.object({
  addonType: z.string(),
  quantity: z.number().int().min(1).default(1),
})

const RemoveAddonSchema = z.object({
  addOnId: z.string().uuid(),
})

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SUB_ME_CACHE_TTL = 30 // seconds
const SUB_ME_CACHE_PREFIX = 'sub:me:'

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
  const authUserId = (req as Request & { user?: { id: string } }).user?.id

  if (!authUserId) {
    res.status(401).json({ error: 'Unauthorised' })
    return null
  }

  if (paramUserId !== undefined && paramUserId !== authUserId) {
    logger.warn('userId mismatch — possible IDOR attempt', {
      userId: authUserId,
      paramUserId,
      component: 'SubscriptionController',
    })
    res.status(403).json({ error: 'Forbidden: userId does not match authenticated user' })
    return null
  }

  return authUserId
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
export async function createSubscription(req: Request, res: Response): Promise<void> {
  const parseResult = CreateSubscriptionSchema.safeParse(req.body)
  if (!parseResult.success) {
    res.status(400).json({ error: 'Validation failed', details: parseResult.error.flatten() })
    return
  }

  const { planId, billingCycle, workspaceId, email, phone } = parseResult.data

  // Validate that the authenticated user is the one initiating the subscription.
  // If a userId field was passed in the body, check it matches.
  const bodyUserId = (req.body as Record<string, unknown>).userId as string | undefined
  const userId = resolveUserId(req, res, bodyUserId)
  if (!userId) return

  try {
    const { subscriptionService } = getServices()
    const result = await subscriptionService.create(
      userId,
      workspaceId,
      planId,
      billingCycle,
      email,
      phone
    )

    res.status(200).json({ subscriptionId: result.subscriptionId, checkoutUrl: result.checkoutUrl })
  } catch (err) {
    const error = err as Error & { statusCode?: number }
    logger.error('createSubscription failed', error, {
      userId,
      component: 'SubscriptionController',
    })
    res.status(error.statusCode ?? 500).json({ error: error.message })
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
export async function checkoutCallback(req: Request, res: Response): Promise<void> {
  const appBaseUrl = process.env.APP_BASE_URL || process.env.FRONTEND_URL || 'http://localhost:5173'
  const billingUrl = (query: string) => res.redirect(302, `${appBaseUrl}/settings/billing${query}`)

  try {
    const body = (req.body ?? {}) as Record<string, unknown>
    const paymentId = typeof body.razorpay_payment_id === 'string' ? body.razorpay_payment_id : ''
    const subscriptionId = typeof body.razorpay_subscription_id === 'string' ? body.razorpay_subscription_id : ''
    const signature = typeof body.razorpay_signature === 'string' ? body.razorpay_signature : ''
    const errorCode = typeof body['error[code]'] === 'string' ? (body['error[code]'] as string) : ''

    if (errorCode) {
      logger.info('Razorpay checkout redirect reported a payment error', {
        errorCode,
        subscriptionId,
        component: 'SubscriptionController.checkoutCallback',
      })
      billingUrl('?checkout=failed')
      return
    }

    if (!paymentId || !subscriptionId || !signature) {
      // Customer closed/cancelled checkout before completing payment —
      // Razorpay does not POST back in this case, but guard anyway for any
      // malformed/incomplete redirect.
      billingUrl('?checkout=cancelled')
      return
    }

    const keySecret = process.env.RAZORPAY_KEY_SECRET
    if (!keySecret) {
      logger.error('checkoutCallback: RAZORPAY_KEY_SECRET missing', new Error('Missing secret'), {
        component: 'SubscriptionController.checkoutCallback',
      })
      billingUrl('?checkout=failed')
      return
    }

    // Razorpay's documented subscription payment-verification scheme:
    // signature = HMAC-SHA256( key_secret, `${payment_id}|${subscription_id}` )
    const expectedSignature = crypto
      .createHmac('sha256', keySecret)
      .update(`${paymentId}|${subscriptionId}`)
      .digest('hex')

    const validSignature =
      expectedSignature.length === signature.length &&
      crypto.timingSafeEqual(Buffer.from(expectedSignature), Buffer.from(signature))

    if (!validSignature) {
      logger.warn('checkoutCallback: signature verification failed', {
        subscriptionId,
        component: 'SubscriptionController.checkoutCallback',
      })
      billingUrl('?checkout=failed')
      return
    }

    // Signature is valid — the authentication payment was genuinely
    // completed. Actual plan activation still happens via the
    // subscription.activated / subscription.charged webhook, which may
    // arrive slightly before or after this redirect. We just send the user
    // back to a success state; BillingPage re-fetches /me on mount.
    billingUrl('?checkout=success')
  } catch (err) {
    logger.error('checkoutCallback failed', err instanceof Error ? err : new Error(String(err)), {
      component: 'SubscriptionController.checkoutCallback',
    })
    billingUrl('?checkout=failed')
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
export async function upgradeSubscription(req: Request, res: Response): Promise<void> {
  const parseResult = UpgradeSchema.safeParse(req.body)
  if (!parseResult.success) {
    res.status(400).json({ error: 'Validation failed', details: parseResult.error.flatten() })
    return
  }

  const { newPlanId } = parseResult.data
  const userId = resolveUserId(req, res)
  if (!userId) return

  try {
    const { subscriptionService } = getServices()
    await subscriptionService.upgrade(userId, newPlanId)
    res.status(200).json({ success: true })
  } catch (err) {
    const error = err as Error & { statusCode?: number }
    logger.error('upgradeSubscription failed', error, {
      userId,
      component: 'SubscriptionController',
    })
    res.status(error.statusCode ?? 500).json({ error: error.message })
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
export async function downgradeSubscription(req: Request, res: Response): Promise<void> {
  const parseResult = DowngradeSchema.safeParse(req.body)
  if (!parseResult.success) {
    res.status(400).json({ error: 'Validation failed', details: parseResult.error.flatten() })
    return
  }

  const { newPlanId } = parseResult.data
  const userId = resolveUserId(req, res)
  if (!userId) return

  try {
    const { subscriptionService } = getServices()
    await subscriptionService.downgrade(userId, newPlanId)
    res.status(200).json({ success: true })
  } catch (err) {
    const error = err as Error & { statusCode?: number }
    logger.error('downgradeSubscription failed', error, {
      userId,
      component: 'SubscriptionController',
    })
    res.status(error.statusCode ?? 500).json({ error: error.message })
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
export async function cancelSubscription(req: Request, res: Response): Promise<void> {
  const userId = resolveUserId(req, res)
  if (!userId) return

  try {
    const { subscriptionService } = getServices()
    await subscriptionService.cancel(userId)
    res.status(200).json({ success: true })
  } catch (err) {
    const error = err as Error & { statusCode?: number }
    logger.error('cancelSubscription failed', error, {
      userId,
      component: 'SubscriptionController',
    })
    res.status(error.statusCode ?? 500).json({ error: error.message })
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
export async function resumeSubscription(req: Request, res: Response): Promise<void> {
  const userId = resolveUserId(req, res)
  if (!userId) return

  try {
    const { subscriptionService } = getServices()
    await subscriptionService.resume(userId)
    res.status(200).json({ success: true })
  } catch (err) {
    const error = err as Error & { statusCode?: number }
    logger.error('resumeSubscription failed', error, {
      userId,
      component: 'SubscriptionController',
    })
    res.status(error.statusCode ?? 500).json({ error: error.message })
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
export async function getSubscriptionMe(req: Request, res: Response): Promise<void> {
  const userId = resolveUserId(req, res)
  if (!userId) return

  const redis = getRedisClient()
  const cacheKey = `${SUB_ME_CACHE_PREFIX}${userId}`

  // ── Cache check ──────────────────────────────────────────────────────────
  try {
    const cached = await redis.get(cacheKey)
    if (cached) {
      logger.debug('/me cache hit', { userId, component: 'SubscriptionController' })
      res.status(200).json(JSON.parse(cached))
      return
    }
  } catch (cacheErr) {
    // Non-fatal: proceed to DB fetch on Redis failure
    logger.warn('/me Redis cache read failed, falling back to DB', {
      userId,
      component: 'SubscriptionController',
    })
  }

  try {
    const { subscriptionRepo, entitlementService, addOnService } = getServices()

    // Lazily initialize the canonical balance from the effective plan. This
    // guarantees a Free user sees exactly 50 credits even before their first
    // AI action.
    await entitlementService.ensureCreditAccount(userId)

    // ── Parallel data fetch ───────────────────────────────────────────────
    const [subscription, effectiveLimits, aiCreditsDoc, addOns] = await Promise.all([
      subscriptionRepo.findByUserId(userId),
      entitlementService.getEffectiveLimits(userId),
      AICreditsModel.findOne({ userId }).lean(),
      addOnService.listActiveAddOns(userId),
    ])

    // ── Usage counters (parallel) ─────────────────────────────────────────
    // workspacesUsed / profilesUsed / teamMembersUsed / scheduledPostsThisCycle
    // are resolved via EntitlementService.getUsageCounts(), which counts against
    // the user's REAL workspace IDs (same resolution path as the workspace
    // switcher UI) rather than a raw userId match — SocialAccount and Content
    // documents only carry workspaceId, not userId, so a direct userId filter
    // always returned 0/wrong-collection results here previously.
    const [
      { workspacesUsed, profilesUsed, teamMembersUsed, scheduledPostsThisCycle },
      keywordCounter,
      aiConversationsCounter,
      followCampaignCounter,
    ] = await Promise.all([
      entitlementService.getUsageCounts(userId),

      // keywordConversationsThisCycle
      UsageCounterModel.findOne({ userId, type: 'keywordConversations' }).lean(),

      // aiConversationsThisCycle
      UsageCounterModel.findOne({ userId, type: 'aiConversations' }).lean(),

      // followCampaignConversationsThisCycle
      UsageCounterModel.findOne({ userId, type: 'followCampaignConversations' }).lean(),
    ])

    // ── Assemble response ─────────────────────────────────────────────────
    // SECURITY: The effective plan is derived from entitlements (status-gated),
    // not directly from subscription.plan. Only 'active'/'trial' subscriptions
    // grant paid plan access. For 'started' (pending payment) → show 'free'.
    const paidStatuses = ['active', 'trial']
    const isPaymentFailed =
      ['payment_failed', 'past_due'].includes(subscription?.status ?? '') &&
      subscription?.gracePeriodEndsAt != null &&
      subscription.gracePeriodEndsAt >= new Date()
    const effectivePlan =
      subscription && (paidStatuses.includes(subscription.status) || isPaymentFailed)
        ? (subscription.plan ?? 'free')
        : 'free'

    // 'started'            → checkout initiated, mandate not yet authorized
    // 'mandate_authorized' → mandate authorized (refundable ₹1 charge only),
    //                        real first charge has been raised but has not
    //                        yet succeeded — still no paid access.
    const pendingStatuses = ['started', 'mandate_authorized']

    const response = {
      plan: effectivePlan,
      // pendingPlan shows the plan being purchased/authorized (no paid access yet) for UI display only
      pendingPlan:
        subscription && pendingStatuses.includes(subscription.status)
          ? (subscription.plan ?? null)
          : null,
      billingCycle: subscription?.billingCycle ?? 'monthly',
      status: subscription?.status ?? 'inactive',
      currentPeriodEnd: subscription?.currentPeriodEnd?.toISOString() ?? null,
      nextBillingDate: subscription?.nextBillingDate?.toISOString() ?? null,
      cancelAtPeriodEnd: subscription?.cancelAtPeriodEnd ?? false,
      limits: effectiveLimits,
      usage: {
        workspacesUsed,
        profilesUsed,
        teamMembersUsed,
        scheduledPostsThisCycle,
        keywordConversationsThisCycle: keywordCounter?.countThisCycle ?? 0,
        aiConversationsThisCycle: aiConversationsCounter?.countThisCycle ?? 0,
        followCampaignConversationsThisCycle: followCampaignCounter?.countThisCycle ?? 0,
      },
      aiCredits: {
        remaining: Math.max(0, aiCreditsDoc?.remainingCredits ?? 0),
        monthly: aiCreditsDoc?.monthlyCredits ?? 0,
        purchased: aiCreditsDoc?.purchasedCredits ?? 0,
        usedThisCycle: aiCreditsDoc?.usedThisCycle ?? 0,
        nextResetAt: aiCreditsDoc?.nextResetAt?.toISOString() ?? null,
      },
      addOns: addOns.map((a) => ({
        addOnId: a.addOnId,
        type: a.type,
        quantity: a.quantity,
        status: a.status,
        currentPeriodEnd: a.currentPeriodEnd?.toISOString() ?? null,
      })),
    }

    // ── Cache the response ────────────────────────────────────────────────
    try {
      await redis.set(cacheKey, JSON.stringify(response), 'EX', SUB_ME_CACHE_TTL)
    } catch (cacheWriteErr) {
      // Non-fatal: still return the response even if caching fails
      logger.warn('/me Redis cache write failed', {
        userId,
        component: 'SubscriptionController',
      })
    }

    res.status(200).json(response)
  } catch (err) {
    const error = err as Error
    logger.error('getSubscriptionMe failed', error, {
      userId,
      component: 'SubscriptionController',
    })
    res.status(500).json({ error: error.message })
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
export async function getCreditHistory(req: Request, res: Response): Promise<void> {
  const userId = resolveUserId(req, res)
  if (!userId) return

  // ── Parse & clamp query params ─────────────────────────────────────────
  const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1)
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? '20'), 10) || 20))
  const typeFilter = String(req.query.type ?? 'all')
  const featureFilter = req.query.feature ? String(req.query.feature) : undefined

  // Map the requested user-facing `type` to the underlying ledger statuses.
  const STATUS_BY_TYPE: Record<string, string[]> = {
    deduction: ['settled', 'pending'],
    refund: ['refunded', 'refunding', 'refund_pending'],
    adjustment: ['adjusting'],
    skipped: ['skipped'],
    failed: ['failed'],
  }

  const query: Record<string, unknown> = { userId }
  if (featureFilter) query.feature = featureFilter
  if (typeFilter !== 'all' && STATUS_BY_TYPE[typeFilter]) {
    query.status = { $in: STATUS_BY_TYPE[typeFilter] }
  }

  try {
    const { entitlementService } = getServices()
    // Ensure the balance doc exists so a brand-new user sees their allowance.
    await entitlementService.ensureCreditAccount(userId)

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
    ])

    const spentStatuses = new Set(['settled', 'pending'])
    let lifetimeSpent = 0
    let lifetimeRefunded = 0
    for (const row of lifetimeAgg as Array<{ _id: string; credits: number }>) {
      if (row._id === 'refunded') lifetimeRefunded += row.credits
      else if (spentStatuses.has(row._id)) lifetimeSpent += row.credits
    }

    const kindForStatus = (status: string): string => {
      if (status === 'refunded' || status === 'refunding' || status === 'refund_pending') return 'refund'
      if (status === 'adjusting') return 'adjustment'
      if (status === 'skipped') return 'skipped'
      if (status === 'failed') return 'failed'
      return 'deduction'
    }

    const items = (rawItems as Array<Record<string, any>>).map((tx) => {
      const metadata = (tx.metadata ?? {}) as Record<string, unknown>
      const credits = Number(tx.credits ?? 0)

      // Reserve-then-adjust bookkeeping. A caption reserves its ceiling (e.g. 2)
      // before the AI call, then the unused portion is refunded once real usage
      // is measured — leaving `credits` at the final charge. Surfacing the
      // original hold + refunded portion explains why the balance briefly dips
      // then recovers (otherwise it looks like credits appeared from nowhere).
      const refundedPortion = metadata.adjustmentRefund != null ? Number(metadata.adjustmentRefund) : 0
      const overageCredits = metadata.overageCredits != null ? Number(metadata.overageCredits) : 0
      const reservedCredits =
        refundedPortion > 0
          ? Math.round((credits + refundedPortion) * 100) / 100
          : overageCredits > 0 && metadata.overageBaseCredits != null
          ? Number(metadata.overageBaseCredits)
          : null

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
        refundedPortion: refundedPortion > 0 ? Math.round(refundedPortion * 100) / 100 : null,
        adjustmentCredits: metadata.adjustmentCredits != null ? Number(metadata.adjustmentCredits) : null,
        overageCredits: overageCredits > 0 ? overageCredits : null,
        createdAt: tx.createdAt instanceof Date ? tx.createdAt.toISOString() : tx.createdAt,
        updatedAt: tx.updatedAt instanceof Date ? tx.updatedAt.toISOString() : tx.updatedAt,
      }
    })

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
    })
  } catch (err) {
    const error = err as Error
    logger.error('getCreditHistory failed', error, {
      userId,
      component: 'SubscriptionController',
    })
    res.status(500).json({ error: error.message })
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
  const parseResult = AddAddonSchema.safeParse(req.body)
  if (!parseResult.success) {
    res.status(400).json({ error: 'Validation failed', details: parseResult.error.flatten() })
    return
  }

  const { addonType, quantity } = parseResult.data
  const userId = resolveUserId(req, res)
  if (!userId) return

  try {
    const { addOnService } = getServices()
    // addonType string is validated against ADDON_CONFIG inside AddOnService.addAddOn
    await addOnService.addAddOn(
      userId,
      addonType as Parameters<typeof addOnService.addAddOn>[1],
      quantity
    )
    res.status(200).json({ success: true })
  } catch (err) {
    const error = err as Error & { statusCode?: number }
    logger.error('addAddon failed', error, {
      userId,
      component: 'SubscriptionController',
    })
    res.status(error.statusCode ?? 500).json({ error: error.message })
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
  const parseResult = RemoveAddonSchema.safeParse(req.body)
  if (!parseResult.success) {
    res.status(400).json({ error: 'Validation failed', details: parseResult.error.flatten() })
    return
  }

  const { addOnId } = parseResult.data
  const userId = resolveUserId(req, res)
  if (!userId) return

  try {
    const { addOnService } = getServices()
    await addOnService.removeAddOn(userId, addOnId)
    res.status(200).json({ success: true })
  } catch (err) {
    const error = err as Error & { statusCode?: number }
    logger.error('removeAddon failed', error, {
      userId,
      component: 'SubscriptionController',
    })
    res.status(error.statusCode ?? 500).json({ error: error.message })
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
export async function downgradeToFree(req: Request, res: Response): Promise<void> {
  const userId = resolveUserId(req, res)
  if (!userId) return

  try {
    const { subscriptionRepo, entitlementService } = getServices()

    const subscription = await subscriptionRepo.findByUserId(userId)

    // Cancel on Razorpay if there's an active remote subscription
    if (subscription?.razorpaySubscriptionId) {
      try {
        await razorpaySubscriptionService.cancelSubscription(subscription.razorpaySubscriptionId, false)
      } catch {
        // Non-fatal — local state is authoritative
      }
    }

    // Immediately reset to free plan
    await subscriptionRepo.upsert({
      userId,
      plan: 'free' as any,
      status: 'active' as any,
      cancelAtPeriodEnd: false,
      razorpaySubscriptionId: null,
      razorpayCustomerId: null,
    } as any)

    // Invalidate entitlement cache so limits take effect immediately
    await entitlementService.invalidateCache(userId)

    // Invalidate Redis subscription cache
    const redis = getRedisClient()
    await redis.del(`${SUB_ME_CACHE_PREFIX}${userId}`)

    logger.info('downgradeToFree: user reset to free plan', {
      userId,
      component: 'SubscriptionController',
    })

    res.status(200).json({ success: true })
  } catch (err) {
    const error = err as Error
    logger.error('downgradeToFree failed', error, {
      userId,
      component: 'SubscriptionController',
    })
    res.status(500).json({ error: error.message })
  }
}

/**
 * GET /api/subscription/addon/list
 *
 * Response: { addOns: ActiveAddOnView[] }
 */
export async function listAddons(req: Request, res: Response): Promise<void> {
  const userId = resolveUserId(req, res)
  if (!userId) return

  try {
    const { addOnService } = getServices()
    const addOns = await addOnService.listActiveAddOns(userId)

    res.status(200).json({
      addOns: addOns.map((a) => ({
        addOnId: a.addOnId,
        type: a.type,
        quantity: a.quantity,
        status: a.status,
        currentPeriodEnd: a.currentPeriodEnd?.toISOString() ?? null,
      })),
    })
  } catch (err) {
    const error = err as Error
    logger.error('listAddons failed', error, {
      userId,
      component: 'SubscriptionController',
    })
    res.status(500).json({ error: error.message })
  }
}
