/**
 * Veefore Analytics Feature Module — public entry point.
 *
 * The enterprise Analytics workspace (Phase 1: Product Foundation). This module
 * is self-contained and built alongside the legacy analytics dashboard
 * (`components/analytics/analytics-dashboard.tsx`), which it supersedes at the
 * `/analytics` route. See docs.analytics/analytics for the full specification.
 */

export { AnalyticsApp, default } from './AnalyticsApp'
export { ANALYTICS_BASE_PATH } from './config/navigation'
