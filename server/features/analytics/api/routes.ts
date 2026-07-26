/**
 * Veefore Analytics — Dashboard API Routes (Phase 8).
 *
 * Dashboard-oriented, versioned, authenticated, and authorized endpoints
 * (08-backend-api-architecture.md Ch 3, 4, 9). One optimized response per
 * dashboard page. Mounted under `/api/v1/analytics/dashboards`.
 *
 * Reuses the shared `requireAuth` + `validateWorkspaceAccess` middleware so
 * authorization is enforced on the server, never only in the UI (Ch 9).
 */

import { Router, type Request, type Response } from 'express'
import { ZodError } from 'zod'

import { requireAuth } from '../../../middleware/require-auth'
import { validateWorkspaceAccess } from '../../../middleware/workspace-validation'

import { InMemoryTtlCache, dashboardCacheKey, queryFingerprint, type AnalyticsCache } from './cache'
import { DashboardService, UnknownDashboardError, dashboardService as defaultService } from './dashboard.service'
import { parseAnalyticsQuery } from './query'

/** Dashboard response cache TTL (08-backend-api-architecture.md Ch 6). */
const DASHBOARD_CACHE_TTL_MS = 10_000  // 10s — enough to deduplicate rapid concurrent requests

export interface DashboardRouterDeps {
  service?: DashboardService
  cache?: AnalyticsCache
}

/**
 * Build the dashboard API router. Dependencies are injectable for testing; the
 * defaults use the shared service (empty read store until Phase 10) and an
 * in-memory cache.
 */
export function createDashboardRouter(deps: DashboardRouterDeps = {}): Router {
  const router = Router()
  const service = deps.service ?? defaultService
  const cache = deps.cache ?? new InMemoryTtlCache()

  router.get(
    '/:dashboardId',
    requireAuth,
    validateWorkspaceAccess({ source: 'query' }),
    async (req: Request, res: Response) => {
      const requestId = (req as { id?: string }).id
      try {
        const workspaceId = (req as unknown as { workspaceId?: string }).workspaceId ?? req.query.workspaceId
        const query = parseAnalyticsQuery({ ...req.query, workspaceId })
        const { dashboardId } = req.params

        const fingerprint = queryFingerprint({
          from: query.from,
          to: query.to,
          compareFrom: query.compareFrom,
          compareTo: query.compareTo,
          granularity: query.granularity,
          platforms: query.platforms,
          accounts: query.accounts,
        })
        const cacheKey = dashboardCacheKey(query.workspaceId, dashboardId, fingerprint)

        const cached = await cache.get(cacheKey)
        if (cached) return res.json(cached)

        const response = await service.buildDashboard(dashboardId, query)
        await cache.set(cacheKey, response, DASHBOARD_CACHE_TTL_MS)
        return res.json(response)
      } catch (err) {
        if (err instanceof UnknownDashboardError) {
          return res.status(404).json({
            error: { code: 'DASHBOARD_NOT_FOUND', message: err.message, correlationId: requestId },
          })
        }
        if (err instanceof ZodError) {
          return res.status(400).json({
            error: {
              code: 'INVALID_QUERY',
              message: 'Invalid analytics query parameters',
              details: err.issues,
              correlationId: requestId,
            },
          })
        }
        return res.status(500).json({
          error: {
            code: 'ANALYTICS_DASHBOARD_ERROR',
            message: 'Failed to build the dashboard',
            correlationId: requestId,
          },
        })
      }
    }
  )

  return router
}

/** Default dashboard router used by the app. */
export const dashboardApiRouter = createDashboardRouter()
