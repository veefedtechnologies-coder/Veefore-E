/**
 * KpiCardGrid — responsive grid wrapper for the KPI strip that sits near the top
 * of every dashboard (06-dashboard-specifications.md Ch 1 & Ch 2 "KPI Strip").
 * Mobile: 1 column · tablet: 2 · desktop: 4 (Rule 15 responsive).
 */

import { cn } from '@/lib/utils'

interface KpiCardGridProps {
  children: React.ReactNode
  className?: string
}

export function KpiCardGrid({ children, className }: KpiCardGridProps) {
  return (
    <div className={cn('grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4', className)}>
      {children}
    </div>
  )
}
