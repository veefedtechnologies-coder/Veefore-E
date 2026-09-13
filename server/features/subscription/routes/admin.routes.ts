/**
 * Admin Subscription Routes
 *
 * Mounts all admin subscription management endpoints under /:userId.
 *
 * SECURITY — these endpoints can change a user's paid plan, mint AI credits,
 * issue refunds, extend billing periods and override feature flags. They are
 * therefore gated by the ADMIN authentication stack (`requireAdminAuth`, which
 * verifies a signed admin JWT against the Admin collection and checks
 * `isActive`) plus an explicit role allow-list (`requireRole`).
 *
 * Previously this router used the ordinary end-user `requireAuth` middleware
 * with a comment claiming "admin role enforcement is handled inside each
 * controller function" — no such check existed in admin.controller.ts. That
 * meant ANY authenticated end user could call
 * `POST /api/admin/subscription/<their-own-id>/plan` to grant themselves the
 * Business plan, or `/credits` to mint unlimited AI credits. Enforcing admin
 * auth at the router level closes that privilege-escalation hole.
 *
 * Expected mount point: /api/admin/subscription
 *
 * Satisfies Requirements: 14.2
 */

import { Router, type RequestHandler } from 'express';
import {
  requireAdminAuth as requireAdminAuthRaw,
  requireRole as requireRoleRaw,
} from '../../../admin-auth';
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
} from '../controllers/admin.controller';

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const adminSubscriptionRouter = Router();

/**
 * `requireAdminAuth` / `requireRole` are declared against the `AdminRequest`
 * subtype (it carries `req.admin`), which is not assignable to Express's
 * `RequestHandler` signature. Narrowing the type here keeps the router
 * strongly typed without weakening the middleware itself.
 */
const requireAdminAuth = requireAdminAuthRaw as unknown as RequestHandler;
const requireRole = (roles: string[]): RequestHandler =>
  requireRoleRaw(roles) as unknown as RequestHandler;

/**
 * Roles permitted to administer billing.
 * `billing` is included so finance staff can issue refunds/credits without
 * needing full platform admin rights.
 */
const BILLING_ADMIN_ROLES = ['superadmin', 'admin', 'billing'];

/** Roles permitted to perform read-only billing lookups. */
const BILLING_READ_ROLES = [...BILLING_ADMIN_ROLES, 'support'];

// Every route requires a valid, active admin account (signed admin JWT).
adminSubscriptionRouter.use(requireAdminAuth);

// ---------------------------------------------------------------------------
// Routes — all parameterised with :userId
// ---------------------------------------------------------------------------

/** GET /:userId/subscription — retrieve full subscription state for a user */
adminSubscriptionRouter.get(
  '/:userId/subscription',
  requireRole(BILLING_READ_ROLES),
  getUserSubscription
);

/** GET /:userId/history — retrieve the last 100 subscription events */
adminSubscriptionRouter.get(
  '/:userId/history',
  requireRole(BILLING_READ_ROLES),
  getSubscriptionHistory
);

/** POST /:userId/plan — manually override a user's plan */
adminSubscriptionRouter.post(
  '/:userId/plan',
  requireRole(BILLING_ADMIN_ROLES),
  setUserPlan
);

/** POST /:userId/credits — add or subtract AI credits */
adminSubscriptionRouter.post(
  '/:userId/credits',
  requireRole(BILLING_ADMIN_ROLES),
  adjustCredits
);

/** POST /:userId/addon — grant or revoke an add-on */
adminSubscriptionRouter.post(
  '/:userId/addon',
  requireRole(BILLING_ADMIN_ROLES),
  grantRevokeAddon
);

/** POST /:userId/cancel — force-cancel a subscription immediately */
adminSubscriptionRouter.post(
  '/:userId/cancel',
  requireRole(BILLING_ADMIN_ROLES),
  forceCancelSubscription
);

/** POST /:userId/extend — extend the current billing period by N days */
adminSubscriptionRouter.post(
  '/:userId/extend',
  requireRole(BILLING_ADMIN_ROLES),
  extendBillingPeriod
);

/** POST /:userId/coupon — apply a coupon and record in audit log */
adminSubscriptionRouter.post(
  '/:userId/coupon',
  requireRole(BILLING_ADMIN_ROLES),
  applyCoupon
);

/** POST /:userId/refund — process a refund via Razorpay (money movement) */
adminSubscriptionRouter.post(
  '/:userId/refund',
  requireRole(['superadmin', 'admin', 'billing']),
  processRefund
);

/** POST /:userId/override — set a per-user feature override flag */
adminSubscriptionRouter.post(
  '/:userId/override',
  requireRole(BILLING_ADMIN_ROLES),
  setFeatureOverride
);

export default adminSubscriptionRouter;
