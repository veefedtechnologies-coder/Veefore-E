/**
 * apply-route-guards.ts
 *
 * Infrastructure helper for applying entitlement middleware guards to routes.
 *
 * This file:
 *  1. Documents every place in the codebase where guards SHOULD be applied
 *     (see inline comments + ROUTE_GUARDS.md for the full table).
 *  2. Exports composable guard-chain helpers so route files can import a
 *     single named array rather than spelling out every middleware every time.
 *
 * Usage example in a route file:
 *
 *   import { schedulingGuards, analyticsHistoryGuards } from
 *     '../middleware/apply-route-guards';
 *
 *   router.post('/create', requireAuth, ...schedulingGuards, controller.create);
 *
 * Requirements: 7.1, 7.3, 7.4, 7.10, 16.1, 16.2, 16.3, 16.4, 16.5, 16.6, 16.7
 */

import { type RequestHandler, type Request, type Response, type NextFunction } from 'express'
import {
  requireSubscription,
  requireFeature,
  requireProfileLimit,
  requireAnalyticsLimit,
  requirePostQuota,
} from './entitlement.middleware'
import { type PlanFeatures } from '../config/plan-config'

// ─────────────────────────────────────────────────────────────────────────────
// 1. Scheduling guards
// ─────────────────────────────────────────────────────────────────────────────
//
// Target routes (server/routes/v1/content.routes.ts):
//   POST /:contentId/schedule          — schedule a single content item
//   POST /:contentId/reschedule (PUT)  — reschedule a content item
//
// Target routes (server/routes/v1/scheduler.routes.ts):
//   POST /create                       — create new scheduled content
//
// Guard chain:
//   requireSubscription()   → reject cancelled/expired/payment-failed users
//   requireProfileLimit()   → reject if social profile quota is exhausted
//
// Note: there is no separate "scheduling" feature flag in plan-config.ts.
// Basic scheduling (one at a time) is available on all active plans.
// Bulk scheduling is feature-gated — see bulkSchedulingGuards below.

export const schedulingGuards: RequestHandler[] = [
  requireSubscription(),
  requireProfileLimit(),
]

// ─────────────────────────────────────────────────────────────────────────────
// 1b. Schedule-with-quota guards
// ─────────────────────────────────────────────────────────────────────────────
//
// Apply to the endpoint that CREATES a new scheduled post (POST
// /:contentId/schedule). Adds the monthly scheduled-post cap on top of the base
// scheduling guards. NOT applied to reschedule — moving an already-scheduled
// post within the same month must not be blocked by the cap it already counts
// against.
//
// Guard chain:
//   requireSubscription()
//   requireProfileLimit()
//   requirePostQuota()   → Free = 30/month; Creator/Pro = 80/month;
//                          Business/Enterprise = unlimited

export const scheduleWithQuotaGuards: RequestHandler[] = [
  requireSubscription(),
  requireProfileLimit(),
  requirePostQuota(),
]

// ─────────────────────────────────────────────────────────────────────────────
// 2. Bulk scheduling guards
// ─────────────────────────────────────────────────────────────────────────────
//
// Applied to POST /api/content/bulk-schedule, which schedules multiple existing
// posts in one request.
//
// Guard chain:
//   requireSubscription()
//   requireProfileLimit()
//   requireFeature('bulkScheduling')  → Creator plan and above
//   requirePostQuota()                → batch-aware monthly cap (counts items)

export const bulkSchedulingGuards: RequestHandler[] = [
  requireSubscription(),
  requireProfileLimit(),
  requireFeature('bulkScheduling'),
  requirePostQuota(),
]

// ─────────────────────────────────────────────────────────────────────────────
// 3. Analytics date-range guards (dynamic)
// ─────────────────────────────────────────────────────────────────────────────
//
// Target routes (server/routes/v1/analytics.routes.ts):
//   GET /workspace/:workspaceId/date-range      — generic date-range query
//   GET /historical                             — historical data by days param
//
// The number of requested days is not known at route-definition time; it must
// be read from the incoming request (req.query.startDate / req.query.endDate
// or req.query.days).  Use analyticsHistoryGuard() — a factory that builds a
// one-off RequestHandler reading from the live request — instead of the static
// array pattern used by the other helpers.
//
// Usage:
//   router.get('/historical', requireAuth, analyticsHistoryGuard(), handler);

/**
 * Dynamically read the requested date range from the incoming Express request
 * and enforce the plan's analyticsHistoryDays limit.
 *
 * Resolution order for "how many days":
 *   1. req.query.days          — numeric shorthand (e.g. ?days=180)
 *   2. req.query.startDate     — ISO date string; days = today - startDate
 *   3. req.query.from          — ISO date string; days = today - from
 *   Defaults to 30 days if none of the above are present.
 */
export function analyticsHistoryGuard(): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    let requestedDays = 30

    const daysParam = req.query.days
    const startDateParam = req.query.startDate ?? req.query.from

    if (typeof daysParam === 'string' && daysParam.trim() !== '') {
      const parsed = parseInt(daysParam, 10)
      if (!isNaN(parsed) && parsed > 0) requestedDays = parsed
    } else if (typeof startDateParam === 'string' && startDateParam.trim() !== '') {
      const startMs = Date.parse(startDateParam)
      if (!isNaN(startMs)) {
        const diffMs = Date.now() - startMs
        const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))
        if (diffDays > 0) requestedDays = diffDays
      }
    }

    // Delegate to the named middleware so enterprise bypass + logging both work.
    const guard = requireAnalyticsLimit(requestedDays)
    guard(req, res, next)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Social listening guards
// ─────────────────────────────────────────────────────────────────────────────
//
// Target file: server/routes/social-listening.ts
//
// The entire router already applies requireAuth at the top level.
// Add socialListeningGuards to all endpoints below:
//
//   GET  /sources/:workspaceId
//   POST /sources
//   GET  /trends/:workspaceId
//   GET  /dashboard/overview/:workspaceId
//   GET  /dashboard/sentiment-timeline/:workspaceId
//   GET  /dashboard/topic-clusters/:workspaceId
//   GET  /dashboard/trending/:workspaceId
//   GET  /dashboard/summary/:workspaceId
//   GET  /dashboard/audience/:workspaceId
//   GET  /dashboard/viral-hooks/:workspaceId
//   GET  /alerts/:workspaceId
//   GET  /search/:workspaceId
//
// Guard chain:
//   requireFeature('socialListening')   → Creator plan and above

export const socialListeningGuards: RequestHandler[] = [
  requireFeature('socialListening'),
]

// ─────────────────────────────────────────────────────────────────────────────
// 5. Advanced social listening guards
// ─────────────────────────────────────────────────────────────────────────────
//
// Target routes (server/routes/social-listening.ts):
//   GET /dashboard/sentiment-timeline/:workspaceId  — sentiment analysis
//   GET /dashboard/topic-clusters/:workspaceId      — competitor/trend radar
//   GET /dashboard/trending/:workspaceId            — trend data
//   GET /dashboard/audience/:workspaceId            — audience intelligence
//
// Guard chain:
//   requireFeature('socialListening')          — base gate (Creator+)
//   requireFeature('advancedSocialListening')  — Pro plan and above

export const advancedSocialListeningGuards: RequestHandler[] = [
  requireFeature('socialListening'),
  requireFeature('advancedSocialListening'),
]

// ─────────────────────────────────────────────────────────────────────────────
// 6. Custom dashboards guards
// ─────────────────────────────────────────────────────────────────────────────
//
// Target routes (server/features/analytics/api/routes.ts — dashboard router):
//   GET  /dashboards/:dashboardId     — served by createDashboardRouter()
//
// "Custom dashboards" are dashboards beyond the built-in overview. The
// dashboard router is mounted in server/routes/v1/analytics.routes.ts under
// router.use('/dashboards', createDashboardRouter(...)).
//
// Guard chain:
//   requireFeature('customDashboards')  → Pro plan and above

export const customDashboardGuards: RequestHandler[] = [
  requireFeature('customDashboards'),
]

// ─────────────────────────────────────────────────────────────────────────────
// 7. Analytics export guards
// ─────────────────────────────────────────────────────────────────────────────
//
// Target routes (server/routes/v1/analytics-reports.routes.ts):
//   GET /export-data    — assembles full analytics payload for PDF/Excel export
//
// Free-tier users may export with a Veefore watermark (analyticsExport:
// 'watermarked_pdf'). The watermark injection is a server-side concern
// handled downstream by the PDF renderer; the middleware here only checks
// that the requesting user has an active subscription.
//
// The `analyticsExport` field on PlanFeatures is NOT a simple boolean, so
// `requireFeature` cannot gate it directly.  Instead, the export handler
// itself should read `plan.features.analyticsExport` and set a
// `req.analyticsExportMode` flag ('full' | 'watermarked_pdf') for the
// renderer.  A helper is provided below.
//
// Guard chain for the endpoint:
//   requireSubscription()    → reject lapsed accounts entirely
//
// The watermark flag is set via injectAnalyticsExportMode() inside the handler
// or as an additional middleware in the route chain.

export const analyticsExportGuards: RequestHandler[] = [
  requireSubscription(),
]

/**
 * Middleware that resolves the user's analytics export mode from their plan and
 * attaches it to `req` so the export renderer can add a watermark for free users.
 *
 * Sets `(req as any).analyticsExportMode` to `'full'` or `'watermarked_pdf'`.
 *
 * Usage:
 *   router.get('/export-data',
 *     requireAuth,
 *     ...analyticsExportGuards,
 *     injectAnalyticsExportMode(),
 *     handler
 *   );
 */
export function injectAnalyticsExportMode(): RequestHandler {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const { getEntitlementService } = await import('../features/subscription/services/EntitlementService')
      const { getRedisClient } = await import('../lib/redis')
      const SubscriptionRepository = (await import('../features/subscription/db/repositories/SubscriptionRepository')).default

      const userId = String((req as any).user?.id ?? (req as any).user?._id ?? '')
      if (!userId) {
        // No authenticated user — let downstream auth middleware handle the 401
        return next()
      }

      const service = getEntitlementService(getRedisClient(), new SubscriptionRepository())
      const plan = await service.getPlan(userId)
      const { PLAN_CONFIG } = await import('../config/plan-config')
      const features = PLAN_CONFIG[plan]?.features
      const exportMode = features?.analyticsExport ?? 'watermarked_pdf'

      ;(req as any).analyticsExportMode = exportMode
      // White-label export (no Veefore branding) is a Business+ capability.
      ;(req as any).analyticsWhiteLabel = features?.whiteLabelReports === true
      // Advanced reports are a Pro+ capability; surfaced so the client can
      // enable the richer report sections.
      ;(req as any).analyticsAdvancedReports = features?.advancedReports === true
      // Full export formats (PDF/Excel/CSV/PowerPoint) require a paid plan;
      // Free is limited to a watermarked PDF.
      ;(req as any).analyticsExportFormats = exportMode === 'full'
        ? ['pdf', 'excel', 'csv', 'pptx']
        : ['pdf']
    } catch {
      // Non-fatal: default to watermarked so free users are never accidentally
      // granted full exports due to a transient service error
      ;(req as any).analyticsExportMode = 'watermarked_pdf'
      ;(req as any).analyticsWhiteLabel = false
      ;(req as any).analyticsAdvancedReports = false
      ;(req as any).analyticsExportFormats = ['pdf']
    }
    next()
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. Analytics history window clamp (non-breaking) + custom-dashboard gate
// ─────────────────────────────────────────────────────────────────────────────
//
// The built-in analytics dashboards (overview, executive, audience, reach,
// engagement, content, publishing, insights) are available on ALL plans — Free
// gets the "Basic Analytics Dashboard", Creator adds cross-platform analytics,
// etc. Only the user-built "custom" dashboard (Dashboard Builder) is a Pro+
// feature. dashboardEntitlementGuard() enforces exactly that: it inspects the
// requested dashboard id and only gates the `custom` dashboard behind
// requireFeature('customDashboards').

/**
 * Per-dashboard entitlement map. Built-in dashboards not listed here (overview,
 * publishing, best-time) are available on ALL plans (Free = "Basic Analytics
 * Dashboard"). The rest require the plan feature per Veefore_Subscription_Plans_v1.md:
 *   - executive / reach / engagement → crossPlatformAnalytics (Creator+)
 *   - audience                        → audienceInsights       (Creator+)
 *   - content                         → contentPerformance     (Creator+)
 *   - insights                        → aiAnalyticsInsights    (Pro+)
 *   - custom                          → customDashboards       (Pro+)
 */
const DASHBOARD_REQUIRED_FEATURE: Record<string, keyof PlanFeatures> = {
  // Reach & Engagement are deeper views of the cross-platform metrics the free
  // Overview already shows (combined FB + Instagram under the "All" filter), so
  // they stay available on all plans. Executive remains the gated cross-platform
  // roll-up.
  executive: 'crossPlatformAnalytics',
  audience: 'audienceInsights',
  content: 'contentPerformance',
  insights: 'aiAnalyticsInsights',
  custom: 'customDashboards',
}

export function dashboardEntitlementGuard(): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    // The dashboard id is the segment after `/dashboards/` in the URL. Read from
    // originalUrl so it works regardless of Express mount-path stripping.
    const match = req.originalUrl.match(/\/dashboards\/([^/?]+)/)
    const dashboardId = match ? decodeURIComponent(match[1]) : ''

    const requiredFeature = DASHBOARD_REQUIRED_FEATURE[dashboardId]
    if (requiredFeature) {
      return void requireFeature(requiredFeature)(req, res, next)
    }
    return next()
  }
}

/**
 * Clamp the requested analytics window (`req.query.from`) to the plan's
 * analyticsHistoryDays limit instead of rejecting the request. This keeps
 * dashboards/reports usable while still enforcing the plan: a user can never
 * read data older than their plan allows, but selecting an over-long range
 * simply narrows the window rather than blanking the page.
 *
 * Unlimited plans (analyticsHistoryDays === -1) are left untouched.
 */
export function clampAnalyticsHistoryWindow(): RequestHandler {
  const DAY_MS = 24 * 60 * 60 * 1000
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = String((req as any).user?.id ?? (req as any).user?._id ?? '')
      if (!userId) return next()

      const { getEntitlementService } = await import('../features/subscription/services/EntitlementService')
      const { getRedisClient } = await import('../lib/redis')
      const SubscriptionRepository = (await import('../features/subscription/db/repositories/SubscriptionRepository')).default
      const { PLAN_CONFIG } = await import('../config/plan-config')

      const service = getEntitlementService(getRedisClient(), new SubscriptionRepository())
      const plan = await service.getPlan(userId)
      const allowedDays = PLAN_CONFIG[plan]?.limits?.analyticsHistoryDays ?? 30

      if (allowedDays === -1) return next() // unlimited

      // Allow a small grace so exact-boundary selections (e.g. "last 30 days")
      // never get clamped by sub-day rounding.
      const minFrom = new Date(Date.now() - (allowedDays + 1) * DAY_MS)
      const fromParam = req.query.from
      if (typeof fromParam === 'string' && fromParam.trim() !== '') {
        const from = new Date(fromParam)
        if (!isNaN(from.getTime()) && from < minFrom) {
          req.query.from = minFrom.toISOString()
        }
      }
    } catch {
      // Non-fatal — fall through without clamping.
    }
    next()
  }
}

/**
 * Enforce single-platform analytics for plans WITHOUT cross-platform analytics
 * (Free). The combined "All Platforms" view (empty or multi-platform filter) is
 * a Creator+ feature. This coerces `req.query.platforms` to exactly one
 * connected platform so a crafted request can't merge Facebook + Instagram.
 *
 * Plans that include crossPlatformAnalytics pass through untouched.
 */
export function enforceSinglePlatformForBasicPlans(): RequestHandler {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = String((req as any).user?.id ?? (req as any).user?._id ?? '')
      if (!userId) return next()

      const { getEntitlementService } = await import('../features/subscription/services/EntitlementService')
      const { getRedisClient } = await import('../lib/redis')
      const SubscriptionRepository = (await import('../features/subscription/db/repositories/SubscriptionRepository')).default
      const { PLAN_CONFIG } = await import('../config/plan-config')

      const service = getEntitlementService(getRedisClient(), new SubscriptionRepository())
      const plan = await service.getPlan(userId)
      if (PLAN_CONFIG[plan]?.features?.crossPlatformAnalytics === true) {
        return next() // combined view allowed
      }

      // Determine the requested platforms (comma-separated string).
      const raw = req.query.platforms
      const requested = typeof raw === 'string'
        ? raw.split(',').map((s) => s.trim()).filter(Boolean)
        : []

      // A single explicit platform is fine — keep it as-is.
      if (requested.length === 1) return next()

      // Empty (merged) or multiple → collapse to a single connected platform.
      const workspaceId = String((req as any).workspaceId ?? req.query.workspaceId ?? '')
      let chosen = requested[0]
      if (workspaceId) {
        try {
          const { socialAccountRepository } = await import('../repositories/SocialAccountRepository')
          const accounts = await socialAccountRepository.findActiveByWorkspace(workspaceId)
          const platforms = Array.from(new Set((accounts as any[]).map((a) => a.platform ?? 'instagram')))
          chosen = platforms.includes('instagram')
            ? 'instagram'
            : (platforms[0] ?? requested[0] ?? 'instagram')
        } catch {
          chosen = requested[0] ?? 'instagram'
        }
      }
      req.query.platforms = chosen ?? 'instagram'
    } catch {
      // Non-fatal — do not block analytics on an enforcement error.
    }
    next()
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// WHERE TO APPLY — quick reference (see ROUTE_GUARDS.md for the full table)
// ─────────────────────────────────────────────────────────────────────────────
//
//  server/routes/v1/content.routes.ts
//    POST /:contentId/schedule         → ...schedulingGuards
//    PUT  /:contentId/reschedule       → ...schedulingGuards
//
//  server/routes/v1/scheduler.routes.ts
//    POST /create                      → ...schedulingGuards
//
//  server/routes/v1/analytics.routes.ts
//    GET  /workspace/:id/date-range    → analyticsHistoryGuard()
//    GET  /historical                  → analyticsHistoryGuard()
//    router.use('/dashboards', ...)    → clampAnalyticsHistoryWindow() +
//                                        dashboardEntitlementGuard() (built-in
//                                        dashboards open to all plans; only the
//                                        `custom` builder is gated to Pro+)
//
//  server/routes/v1/analytics-reports.routes.ts
//    GET  /export-data                 → ...analyticsExportGuards,
//                                        injectAnalyticsExportMode()
//
//  server/routes/social-listening.ts  (basic endpoints)
//    GET|POST  /sources, /trends,      → ...socialListeningGuards
//    /dashboard/overview, /dashboard/summary,
//    /dashboard/viral-hooks,
//    /alerts, /search
//
//  server/routes/social-listening.ts  (advanced endpoints)
//    GET /dashboard/sentiment-timeline → ...advancedSocialListeningGuards
//    GET /dashboard/topic-clusters     → ...advancedSocialListeningGuards
//    GET /dashboard/trending           → ...advancedSocialListeningGuards
//    GET /dashboard/audience           → ...advancedSocialListeningGuards
