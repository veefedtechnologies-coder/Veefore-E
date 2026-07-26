/**
 * Subscription Routes
 *
 * Mounts all subscription-related endpoints under /api/subscription.
 * Every route is protected by the requireAuth middleware.
 *
 * Satisfies Requirements: 7.1 – 7.8 (REST API surface)
 */

import { Router } from 'express'
import { requireAuth } from '../../../middleware/require-auth'
import {
  createSubscription,
  checkoutCallback,
  upgradeSubscription,
  downgradeSubscription,
  cancelSubscription,
  resumeSubscription,
  getSubscriptionMe,
  getCreditHistory,
  addAddon,
  removeAddon,
  listAddons,
  downgradeToFree,
} from '../controllers/subscription.controller'

const subscriptionRouter = Router()

// ── Subscription lifecycle ───────────────────────────────────────────────────
subscriptionRouter.post('/create', requireAuth, createSubscription)

// Razorpay's redirect-based Checkout.js callback (see checkoutCallback for
// why this is intentionally NOT behind requireAuth — Razorpay's browser
// redirect carries no auth cookie for this app, and the handler verifies
// Razorpay's own HMAC payment signature instead).
subscriptionRouter.post('/checkout-callback', checkoutCallback)
subscriptionRouter.post('/upgrade', requireAuth, upgradeSubscription)
subscriptionRouter.post('/downgrade', requireAuth, downgradeSubscription)
subscriptionRouter.post('/downgrade-to-free', requireAuth, downgradeToFree)
subscriptionRouter.post('/cancel', requireAuth, cancelSubscription)
subscriptionRouter.post('/resume', requireAuth, resumeSubscription)

// ── Current user subscription ────────────────────────────────────────────────
subscriptionRouter.get('/me', requireAuth, getSubscriptionMe)

// ── AI credit ledger (deductions, refunds, adjustments) ──────────────────────
subscriptionRouter.get('/credits/history', requireAuth, getCreditHistory)

// ── Add-ons ──────────────────────────────────────────────────────────────────
subscriptionRouter.post('/addon/add', requireAuth, addAddon)
subscriptionRouter.post('/addon/remove', requireAuth, removeAddon)
subscriptionRouter.get('/addon/list', requireAuth, listAddons)

export { subscriptionRouter }
export default subscriptionRouter
