/**
 * DashboardGrid / DashboardGridItem — the responsive 12-column layout system for
 * arranging widgets within a dashboard section (03-design-system.md Ch 2;
 * 06-dashboard-specifications.md Ch 14 responsive adaptation).
 *
 * Everything collapses to a single column on small screens and uses the 12-col
 * track from `lg` upward (CODING_RULES Rule 15). Column spans use a static class
 * map so Tailwind's compiler always includes them.
 */

import { cn } from '@/lib/utils'
import type { GridSpan } from '../types'

/** Static `lg:col-span-N` classes (literal strings so Tailwind keeps them). */
const LG_COL_SPAN: Record<GridSpan, string> = {
  1: 'lg:col-span-1',
  2: 'lg:col-span-2',
  3: 'lg:col-span-3',
  4: 'lg:col-span-4',
  5: 'lg:col-span-5',
  6: 'lg:col-span-6',
  7: 'lg:col-span-7',
  8: 'lg:col-span-8',
  9: 'lg:col-span-9',
  10: 'lg:col-span-10',
  11: 'lg:col-span-11',
  12: 'lg:col-span-12',
}

interface DashboardGridProps {
  children: React.ReactNode
  /** Gap size. Defaults to 'md' (1.5rem). */
  gap?: 'sm' | 'md'
  className?: string
}

export function DashboardGrid({ children, gap = 'md', className }: DashboardGridProps) {
  return (
    <div
      className={cn(
        'grid grid-cols-1 lg:grid-cols-12',
        gap === 'sm' ? 'gap-4' : 'gap-6',
        className
      )}
    >
      {children}
    </div>
  )
}

interface DashboardGridItemProps {
  children: React.ReactNode
  /** Columns to span from `lg` upward (1–12). Full width below `lg`. */
  span?: GridSpan
  className?: string
}

export function DashboardGridItem({ children, span = 12, className }: DashboardGridItemProps) {
  return <div className={cn('min-w-0', LG_COL_SPAN[span], className)}>{children}</div>
}
