/**
 * AnalyticsPageHeader — the standard page header for every analytics page:
 * breadcrumb, title, description, and workspace context.
 *
 * This is the "Breadcrumb + Title" band that sits below the global header on
 * every dashboard (03-design-system.md Ch 2, 06-dashboard-specifications.md
 * Ch 1). The global filter / AI-summary / KPI bands are added in later phases.
 */

import { Building2 } from 'lucide-react'
import { cn } from '@/lib/utils'

import { AnalyticsBreadcrumb } from './AnalyticsBreadcrumb'
import type { AnalyticsBreadcrumbEntry } from '../types'

interface AnalyticsPageHeaderProps {
  title: string
  description?: string
  breadcrumbs: AnalyticsBreadcrumbEntry[]
  /** Current workspace name, shown as context on the right. */
  workspaceName?: string
  /** Optional actions rendered on the right (export, share, etc. — later phases). */
  actions?: React.ReactNode
  className?: string
}

export function AnalyticsPageHeader({
  title,
  description,
  breadcrumbs,
  workspaceName,
  actions,
  className,
}: AnalyticsPageHeaderProps) {
  return (
    <header className={cn('space-y-3', className)}>
      {breadcrumbs.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <AnalyticsBreadcrumb entries={breadcrumbs} />
          {workspaceName && (
            <div className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400">
              <Building2 className="h-4 w-4" aria-hidden="true" />
              <span className="max-w-[12rem] truncate" title={workspaceName}>
                {workspaceName}
              </span>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100 sm:text-4xl">
            {title}
          </h1>
          {description && (
            <p className="max-w-2xl text-sm text-gray-600 dark:text-gray-400">{description}</p>
          )}
        </div>
        {actions && <div className="flex flex-shrink-0 items-center gap-2">{actions}</div>}
      </div>
    </header>
  )
}
