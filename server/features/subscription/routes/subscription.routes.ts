/**
 * Subscription Routes
 *
 * Mounts all subscription-related endpoints under /api/subscription.
 * Every route is protected by the requireAuth middleware.
 *
 * Satisfies Requirements: 7.1 – 7.8 (REST API surface)
 */

import { Router } from 'express';
import { requireAuth } from '../../../middleware/require-auth';
import {
  createSubscription,
  checkoutCallback,
  upgradeSubscription,
  downgradeSubscription,
  cancelSubscription,
  resumeSubscription,
  getSubscriptionMe,
  getCreditHistory,
  createCreditPackOrder,
  getBillingHistory,
  addAddon,
  removeAddon,
  listAddons,
  downgradeToFree,
  claimNextSubscriptionModalEvent,
  ackSubscriptionModalEvent,
  getPaymentUpdateLink,
} from '../controllers/subscription.controller';

const subscriptionRouter = Router();

// ── Subscription lifecycle ───────────────────────────────────────────────────
subscriptionRouter.post('/create', requireAuth, createSubscription);

// Razorpay's redirect-based Checkout.js callback (see checkoutCallback for
// why this is intentionally NOT behind requireAuth — Razorpay's browser
// redirect carries no auth cookie for this app, and the handler verifies
// Razorpay's own HMAC payment signature instead).
subscriptionRouter.post('/checkout-callback', checkoutCallback);
subscriptionRouter.post('/upgrade', requireAuth, upgradeSubscription);
subscriptionRouter.post('/downgrade', requireAuth, downgradeSubscription);
subscriptionRouter.post('/downgrade-to-free', requireAuth, downgradeToFree);
subscriptionRouter.post('/cancel', requireAuth, cancelSubscription);
subscriptionRouter.post('/resume', requireAuth, resumeSubscription);

// Atomically claims one future-only completed lifecycle event for the premium
// modal host. Historical audit rows and recurring renewals are never eligible.
subscriptionRouter.post(
  '/events/claim-next',
  requireAuth,
  claimNextSubscriptionModalEvent
);

// Completes the lease-and-ack protocol: permanently acknowledges a shown modal
// event (or, with { renew: true }, heartbeats its lease while it stays open).
subscriptionRouter.post(
  '/events/:id/ack',
  requireAuth,
  ackSubscriptionModalEvent
);

// Returns Razorpay's hosted page URL to update/re-authorize payment during a
// renewal-failure grace period. Only valid while past_due / payment_failed.
subscriptionRouter.post(
  '/payment-update-link',
  requireAuth,
  getPaymentUpdateLink
);

// ── Current user subscription ────────────────────────────────────────────────
subscriptionRouter.get('/me', requireAuth, getSubscriptionMe);

// ── Unified billing, payments, refunds, credits, and AI usage ────────────────
subscriptionRouter.get('/billing/history', requireAuth, getBillingHistory);

// ── AI credit ledger (deductions, refunds, adjustments) ──────────────────────
subscriptionRouter.get('/credits/history', requireAuth, getCreditHistory);

// Start a one-time AI credit pack purchase. Returns Razorpay Checkout params;
// credits are granted only by the payment.captured webhook.
subscriptionRouter.post(
  '/credits/create-order',
  requireAuth,
  createCreditPackOrder
);

// ── Add-ons ──────────────────────────────────────────────────────────────────
subscriptionRouter.post('/addon/add', requireAuth, addAddon);
subscriptionRouter.post('/addon/remove', requireAuth, removeAddon);
subscriptionRouter.get('/addon/list', requireAuth, listAddons);

export { subscriptionRouter };
export default subscriptionRouter;
