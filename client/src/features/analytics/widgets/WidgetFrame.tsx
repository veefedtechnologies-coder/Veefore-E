/**
 * WidgetFrame — the canonical shell every widget renders inside
 * (05-widget-library.md Ch 2 Universal Widget Specification, Ch 16 Interactions).
 * Provides a consistent header (title, subtitle, data-quality badge, actions
 * menu), body with all documented states, a partial-data banner, and a footer
 * (last updated). This guarantees consistent interaction patterns across every
 * widget type (CODING_RULES Rule 13, Rule 24).
 */

import { AlertTriangle, Inbox, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import { DataQualityBadge } from '../design-system/components/DataQualityBadge'
import { formatLastUpdated } from '../design-system/format'
import { SURFACE_CLASS } from '../design-system/tokens'
import { WidgetActionsMenu } from './WidgetActionsMenu'
import type { WidgetBaseProps } from './types'

interface WidgetFrameProps extends WidgetBaseProps {
  children?: React.ReactNode
  /** Min body height (px) used by loading/empty/error states. */
  bodyMinHeight?: number
  /** Optional loading placeholder; a spinner is shown if omitted. */
  loadingFallback?: React.ReactNode
}

export function WidgetFrame({
  title,
  subtitle,
  state = 'ready',
  lastUpdated,
  dataQuality,
  drillDown,
  onExport,
  onExplain,
  onFullscreen,
  onRefresh,
  onRetry,
  emptyMessage,
  bodyMinHeight = 160,
  loadingFallback,
  children,
  className,
}: WidgetFrameProps) {
  const updatedLabel = formatLastUpdated(lastUpdated)
  const showContent = state === 'ready' || state === 'partial' || state === 'refreshing'

  return (
    <section
      className={cn(SURFACE_CLASS, 'flex flex-col p-5', className)}
      aria-busy={state === 'loading' || state === 'refreshing'}
    >
      <header className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-base font-semibold text-gray-900 dark:text-gray-100">
              {title}
            </h3>
            {dataQuality && <DataQualityBadge quality={dataQuality} />}
          </div>
          {subtitle && (
            <p className="mt-0.5 truncate text-sm text-gray-500 dark:text-gray-400">{subtitle}</p>
          )}
        </div>
        <div className="flex flex-shrink-0 items-center gap-1">
          {state === 'refreshing' && (
            <Loader2 className="h-4 w-4 animate-spin text-gray-400 motion-reduce:hidden" aria-label="Refreshing" />
          )}
          <WidgetActionsMenu
            onRefresh={onRefresh}
            onExport={onExport}
            onExplain={onExplain}
            onFullscreen={onFullscreen}
            drillDown={drillDown}
          />
        </div>
      </header>

      {state === 'partial' && (
        <div
          role="status"
          className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-900/20 dark:text-amber-400"
        >
          Some data is still syncing — showing partial results.
        </div>
      )}

      <div className="flex-1">
        {state === 'loading' &&
          (loadingFallback ?? (
            <div className="flex items-center justify-center" style={{ minHeight: bodyMinHeight }}>
              <Loader2 className="h-6 w-6 animate-spin text-gray-300 dark:text-gray-600" aria-label="Loading" />
            </div>
          ))}

        {state === 'error' && (
          <div
            role="alert"
            className="flex flex-col items-center justify-center text-center"
            style={{ minHeight: bodyMinHeight }}
          >
            <AlertTriangle className="mb-2 h-7 w-7 text-red-500" aria-hidden="true" />
            <p className="text-sm text-gray-600 dark:text-gray-400">Failed to load this widget.</p>
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
            style={{ minHeight: bodyMinHeight }}
          >
            <Inbox className="mb-2 h-7 w-7 text-gray-300 dark:text-gray-600" aria-hidden="true" />
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {emptyMessage ?? 'No data available for the selected filters.'}
            </p>
          </div>
        )}

        {showContent && children}
      </div>

      {updatedLabel && showContent && (
        <p className="mt-3 text-[11px] text-gray-400 dark:text-gray-500">Updated {updatedLabel}</p>
      )}
    </section>
  )
}
