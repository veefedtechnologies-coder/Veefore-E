/**
 * FilterBar — the global filter row that sits below the page title on every
 * dashboard (03-design-system.md Ch 2 & Ch 10; 06-dashboard-specifications.md
 * Ch 1). Lays out filter controls with a "Clear all" affordance and an optional
 * active-filter chip row.
 *
 * This is the presentational container; global-vs-local filter wiring and state
 * management arrive with the dashboard framework in a later phase.
 */

import { SlidersHorizontal, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import { SURFACE_CLASS } from '../tokens'
import { FilterChips, type FilterChip } from './FilterChips'

interface FilterBarProps {
  /** Filter controls (selects, date range, etc.). */
  children: React.ReactNode
  /** Active-filter chips shown beneath the controls. */
  chips?: FilterChip[]
  /** Number of active filters; when > 0 a "Clear all" button appears. */
  activeCount?: number
  onClearAll?: () => void
  className?: string
}

export function FilterBar({
  children,
  chips,
  activeCount = 0,
  onClearAll,
  className,
}: FilterBarProps) {
  return (
    <div className={cn(SURFACE_CLASS, 'p-4', className)} role="region" aria-label="Filters">
      <div className="flex flex-wrap items-end gap-3">
        <span className="mb-1.5 hidden items-center gap-1.5 text-sm font-medium text-gray-500 dark:text-gray-400 sm:inline-flex">
          <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
          Filters
        </span>

        <div className="flex flex-1 flex-wrap items-end gap-3">{children}</div>

        {activeCount > 0 && onClearAll && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClearAll}
            className="mb-0.5 gap-1 text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
          >
            <X className="h-4 w-4" />
            Clear all
          </Button>
        )}
      </div>

      {chips && chips.length > 0 && <FilterChips chips={chips} className="mt-3" />}
    </div>
  )
}
