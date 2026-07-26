/**
 * ChartContainer — the standard wrapper every analytics chart lives inside
 * (04-dashboard-architecture.md Ch 4). Provides the title, description, an
 * actions slot (metric/time selectors, export, fullscreen — added in later
 * phases), last-updated stamp, and loading/empty/error states. A chart is never
 * rendered without this wrapper.
 */

import { AlertTriangle, BarChart3 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import { formatLastUpdated } from '../format'
import { SURFACE_CLASS } from '../tokens'
import { ChartSkeleton } from '../skeletons/ChartSkeleton'

type ChartState = 'ready' | 'loading' | 'empty' | 'error'

interface ChartContainerProps {
  title: string
  description?: string
  /** Right-aligned actions (selectors, export, etc.). */
  actions?: React.ReactNode
  state?: ChartState
  /** ISO timestamp of last refresh. */
  lastUpdated?: string
  /** Body height in px (used by the skeleton and empty/error states). */
  height?: number
  onRetry?: () => void
  emptyMessage?: string
  children?: React.ReactNode
  className?: string
}

export function ChartContainer({
  title,
  description,
  actions,
  state = 'ready',
  lastUpdated,
  height = 288,
  onRetry,
  emptyMessage,
  children,
  className,
}: ChartContainerProps) {
  const updatedLabel = formatLastUpdated(lastUpdated)

  return (
    <section className={cn(SURFACE_CLASS, 'flex flex-col p-5', className)} aria-busy={state === 'loading'}>
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
          {description && (
            <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">{description}</p>
          )}
        </div>
        {actions && <div className="flex flex-shrink-0 items-center gap-2">{actions}</div>}
      </header>

      <div className="flex-1">
        {state === 'loading' && <ChartSkeleton height={height} />}

        {state === 'error' && (
          <div
            role="alert"
            className="flex flex-col items-center justify-center text-center"
            style={{ height }}
          >
            <AlertTriangle className="mb-2 h-8 w-8 text-red-500" aria-hidden="true" />
            <p className="text-sm text-gray-600 dark:text-gray-400">Failed to load this chart.</p>
            {onRetry && (
              <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}>
                Try again
              </Button>
            )}
          </div>
        )}

        {state === 'empty' && (
          <div
            className="flex flex-col items-center justify-center text-center"
            style={{ height }}
          >
            <BarChart3 className="mb-2 h-8 w-8 text-gray-300 dark:text-gray-600" aria-hidden="true" />
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {emptyMessage ?? 'No data available for the selected filters.'}
            </p>
          </div>
        )}

        {state === 'ready' && children}
      </div>

      {updatedLabel && state === 'ready' && (
        <p className="mt-3 text-[11px] text-gray-400 dark:text-gray-500">Updated {updatedLabel}</p>
      )}
    </section>
  )
}
