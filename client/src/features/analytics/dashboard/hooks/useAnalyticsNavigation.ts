/**
 * useAnalyticsNavigation — client-side navigation + drill-down helpers for the
 * analytics workspace (03-design-system.md Ch 9 Drill-Down; 06-dashboard-
 * specifications.md Ch 13 Navigation Rules).
 *
 * All navigation is client-side (no reloads) via wouter. Drill-down targets are
 * documented route paths; the hook does not invent routes.
 */

import { useCallback } from 'react'
import { useLocation } from 'wouter'

import { ANALYTICS_BASE_PATH, buildPath } from '../../config/navigation'

export function useAnalyticsNavigation() {
  const [location, setLocation] = useLocation()

  /** Navigate to any absolute path (client-side). */
  const navigate = useCallback((path: string) => setLocation(path), [setLocation])

  /** Build an absolute analytics path from segments (rooted at /analytics). */
  const toPath = useCallback((...segments: string[]) => buildPath(...segments), [])

  /**
   * Drill into a specific published content item's analytics detail page
   * (existing route `/analytics/post/:contentId`).
   */
  const drillToContent = useCallback(
    (contentId: string) => setLocation(`${ANALYTICS_BASE_PATH}/post/${contentId}`),
    [setLocation]
  )

  return {
    /** Current absolute location. */
    location,
    navigate,
    toPath,
    drillToContent,
    basePath: ANALYTICS_BASE_PATH,
  }
}
