/**
 * Dashboard — the standardized dashboard framework. Composes the page header
 * (via AnalyticsPageContainer) and renders the ordered content slots in the
 * documented, fixed order (CODING_RULES Rule 6; 06-dashboard-specifications.md
 * Ch 1):
 *
 *   Header → Filters → AI Summary → KPIs → Primary Charts → Secondary Charts →
 *   Tables → Recommendations → Alerts → Export/Actions.
 *
 * Every analytics dashboard renders through this framework so users never
 * relearn the layout. Omitted slots render nothing; each slot manages its own
 * loading/empty/error states (Rule 13).
 */

import { AnalyticsPageContainer } from '../../components/AnalyticsPageContainer'
import type { AnalyticsBreadcrumbEntry } from '../../types'
import { DashboardSection } from './DashboardSection'
import type { DashboardSlots } from '../types'

interface DashboardProps extends DashboardSlots {
  title: string
  description?: string
  breadcrumbs: AnalyticsBreadcrumbEntry[]
  workspaceName?: string
  /** Header-level actions (e.g. refresh, compare) rendered in the page header. */
  headerActions?: React.ReactNode
  className?: string
}

export function Dashboard({
  title,
  description,
  breadcrumbs,
  workspaceName,
  headerActions,
  filters,
  aiSummary,
  kpis,
  primaryCharts,
  secondaryCharts,
  tables,
  recommendations,
  alerts,
  actions,
  className,
}: DashboardProps) {
  return (
    <AnalyticsPageContainer
      title={title}
      description={description}
      breadcrumbs={breadcrumbs}
      workspaceName={workspaceName}
      actions={headerActions}
      className={className}
    >
      {filters && (
        <DashboardSection ariaLabel="Filters">{filters}</DashboardSection>
      )}
      {aiSummary && (
        <DashboardSection ariaLabel="AI executive summary">{aiSummary}</DashboardSection>
      )}
      {kpis && (
        <DashboardSection ariaLabel="Key performance indicators">{kpis}</DashboardSection>
      )}
      {primaryCharts && (
        <DashboardSection ariaLabel="Primary charts">{primaryCharts}</DashboardSection>
      )}
      {secondaryCharts && (
        <DashboardSection ariaLabel="Supporting insights">{secondaryCharts}</DashboardSection>
      )}
      {tables && (
        <DashboardSection ariaLabel="Detailed tables">{tables}</DashboardSection>
      )}
      {recommendations && (
        <DashboardSection ariaLabel="Recommendations">{recommendations}</DashboardSection>
      )}
      {alerts && (
        <DashboardSection ariaLabel="Alerts">{alerts}</DashboardSection>
      )}
      {actions && (
        <DashboardSection ariaLabel="Export and sharing">{actions}</DashboardSection>
      )}
    </AnalyticsPageContainer>
  )
}
