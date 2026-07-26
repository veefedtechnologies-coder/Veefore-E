/**
 * Veefore Analytics — Dashboards public API (Phase 6 & 9).
 *
 * Concrete analytics dashboards assembled from the dashboard framework (Phase 4)
 * and widget library (Phase 5), reading live data from the backend via the
 * data seam (Phase 9), per 06-dashboard-specifications.md / 09-data-contracts.md.
 */

export {
  useDashboardData,
  type DashboardDataResult,
  type DashboardDataStatus,
  type DashboardQueryParams,
} from './useDashboardData'
export type {
  DashboardResponse,
  DashboardMeta,
  KpiContract,
  WidgetContract,
  AlertContract,
  RecommendationContract,
} from './contracts'
export { OverviewDashboard } from './OverviewDashboard'
export { DashboardPage } from './DashboardPage'
export { DashboardBuilderPage } from './DashboardBuilderPage'
export {
  DASHBOARD_CONFIGS,
  DASHBOARD_CONFIG_BY_PATH,
  type DashboardPageConfig,
  type DashboardKpi,
} from './configs'
