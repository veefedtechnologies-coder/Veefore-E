/**
 * AnalyticsPageContainer — the standard wrapper every analytics page renders
 * inside. Provides the page header band and a content region that follows the
 * documented vertical section order (06-dashboard-specifications.md Ch 1:
 * Breadcrumb+Title → Filters → AI Summary → KPIs → Charts → Tables →
 * Recommendations → Alerts → Export).
 *
 * Phase 1 supplies the header + content shell and state handling; the ordered
 * data bands are filled in by later phases.
 */

import { cn } from '@/lib/utils'

import { AnalyticsPageHeader } from './AnalyticsPageHeader'
import type { AnalyticsBreadcrumbEntry } from '../types'

interface AnalyticsPageContainerProps {
  title: string
  description?: string
  breadcrumbs: AnalyticsBreadcrumbEntry[]
  workspaceName?: string
  actions?: React.ReactNode
  children: React.ReactNode
  className?: string
}

export function AnalyticsPageContainer({
  title,
  description,
  breadcrumbs,
  workspaceName,
  actions,
  children,
  className,
}: AnalyticsPageContainerProps) {
  return (
    <div className={cn('mx-auto w-full max-w-[1600px] space-y-6', className)}>
      <AnalyticsPageHeader
        title={title}
        description={description}
        breadcrumbs={breadcrumbs}
        workspaceName={workspaceName}
        actions={actions}
      />
      <div className="space-y-6">{children}</div>
    </div>
  )
}
