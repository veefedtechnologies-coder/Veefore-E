/**
 * DashboardSection — a labeled region within a dashboard. Used by the dashboard
 * framework to wrap each ordered slot with consistent spacing and accessible
 * landmarks (06-dashboard-specifications.md Ch 1).
 */

import { cn } from '@/lib/utils'

interface DashboardSectionProps {
  /** Accessible label for the region landmark. */
  ariaLabel: string
  /** Optional visible heading. */
  title?: string
  children: React.ReactNode
  className?: string
}

export function DashboardSection({ ariaLabel, title, children, className }: DashboardSectionProps) {
  return (
    <section aria-label={ariaLabel} className={cn('scroll-mt-24', className)}>
      {title && (
        <h2 className="mb-3 text-lg font-semibold text-gray-900 dark:text-gray-100">{title}</h2>
      )}
      {children}
    </section>
  )
}
