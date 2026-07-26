/**
 * Admin Subscription Routes
 *
 * Mounts all admin subscription management endpoints under /:userId.
 * All routes require authentication via the `requireAuth` middleware.
 * Admin role enforcement is handled inside each controller function.
 *
 * Expected mount point: /api/admin/subscriptions
 *
 * Satisfies Requirements: 14.2
 */

import { Router } from 'express'
import { requireAuth } from '../../../middleware/require-auth'
import {
  getUserSubscription,
  setUserPlan,
  adjustCredits,
  grantRevokeAddon,
  forceCancelSubscription,
  extendBillingPeriod,
  applyCoupon,
  getSubscriptionHistory,
  processRefund,
  setFeatureOverride,
} from '../controllers/admin.controller'

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const adminSubscriptionRouter = Router()

// All routes require authentication
adminSubscriptionRouter.use(requireAuth)

// ---------------------------------------------------------------------------
// Routes — all parameterised with :userId
// ---------------------------------------------------------------------------

/** GET /:userId/subscription — retrieve full subscription state for a user */
adminSubscriptionRouter.get('/:userId/subscription', getUserSubscription)

/** POST /:userId/plan — manually override a user's plan */
adminSubscriptionRouter.post('/:userId/plan', setUserPlan)

/** POST /:userId/credits — add or subtract AI credits */
adminSubscriptionRouter.post('/:userId/credits', adjustCredits)

/** POST /:userId/addon — grant or revoke an add-on */
adminSubscriptionRouter.post('/:userId/addon', grantRevokeAddon)

/** POST /:userId/cancel — force-cancel a subscription immediately */
adminSubscriptionRouter.post('/:userId/cancel', forceCancelSubscription)

/** POST /:userId/extend — extend the current billing period by N days */
adminSubscriptionRouter.post('/:userId/extend', extendBillingPeriod)

/** POST /:userId/coupon — apply a coupon and record in audit log */
adminSubscriptionRouter.post('/:userId/coupon', applyCoupon)

/** GET /:userId/history — retrieve the last 100 subscription events */
adminSubscriptionRouter.get('/:userId/history', getSubscriptionHistory)

/** POST /:userId/refund — process a refund via Razorpay */
adminSubscriptionRouter.post('/:userId/refund', processRefund)

/** POST /:userId/override — set a per-user feature override flag */
adminSubscriptionRouter.post('/:userId/override', setFeatureOverride)

export default adminSubscriptionRouter
