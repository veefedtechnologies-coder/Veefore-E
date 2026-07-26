/**
 * useAnalyticsActiveRoute — resolves the current analytics location into a
 * matched navigation item and a breadcrumb trail.
 *
 * Uses wouter's absolute location (the analytics shell is mounted via a RegExp
 * route, so location stays absolute and the primary app sidebar keeps working).
 */

import { useMemo } from 'react'
import { useLocation } from 'wouter'

import {
  ANALYTICS_BASE_PATH,
  ANALYTICS_HOME_ITEM,
  ANALYTICS_NAV_ITEMS,
} from '../config/navigation'
import type { AnalyticsBreadcrumbEntry, AnalyticsNavItem, AnalyticsRouteMatch } from '../types'

/** Normalize a path: strip a trailing slash (except the bare root). */
function normalizePath(path: string): string {
  if (path.length > 1 && path.endsWith('/')) return path.slice(0, -1)
  return path
}

/** Find the navigation item matching a given absolute path. */
function findItem(path: string): AnalyticsNavItem | null {
  const target = normalizePath(path)
  if (target === ANALYTICS_BASE_PATH) return ANALYTICS_HOME_ITEM
  return ANALYTICS_NAV_ITEMS.find((item) => normalizePath(item.path) === target) ?? null
}

/**
 * Resolve the active analytics route from the current browser location. Returns
 * the matched item plus a breadcrumb trail rooted at Analytics.
 */
export function useAnalyticsActiveRoute(): AnalyticsRouteMatch {
  const [location] = useLocation()

  return useMemo<AnalyticsRouteMatch>(() => {
    const item = findItem(location)

    const breadcrumbs: AnalyticsBreadcrumbEntry[] = [
      { label: 'Analytics', path: ANALYTICS_BASE_PATH },
    ]
    if (item && item.id !== ANALYTICS_HOME_ITEM.id) {
      breadcrumbs.push({ label: item.label })
    } else if (item) {
      breadcrumbs.push({ label: item.label })
    }

    // `section` is retained in the match shape for compatibility but is no longer
    // used by the flat navigation.
    return { item, section: null, breadcrumbs }
  }, [location])
}
