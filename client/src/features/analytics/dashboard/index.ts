/**
 * Veefore Analytics — Dashboard Framework public API (Phase 4).
 *
 * The standardized dashboard composition (fixed section order), responsive grid,
 * and drill-down navigation that every analytics dashboard is built with
 * (docs.analytics/analytics/03-design-system.md, 06-dashboard-specifications.md).
 */

export type { DashboardSlots, DrillDownTarget, GridSpan } from './types'

export { Dashboard } from './components/Dashboard'
export { DashboardSection } from './components/DashboardSection'
export { DashboardGrid, DashboardGridItem } from './components/DashboardGrid'
export { DrillDownLink } from './components/DrillDownLink'

export { useAnalyticsNavigation } from './hooks/useAnalyticsNavigation'
