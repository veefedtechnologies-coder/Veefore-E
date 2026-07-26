/**
 * AlertWidget — a single alert card with severity, cause, and suggested action
 * (05-widget-library.md Ch 15; 09-data-contracts.md Ch 8). Colour is paired with
 * an icon + text so severity is not conveyed by colour alone (WCAG; Rule 14).
 */

import { AlertTriangle, CheckCircle2, Info, XCircle, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

import { FOCUS_RING_CLASS } from '../design-system/tokens'
import { DrillDownLink } from '../dashboard'
import type { AlertItem, AlertSeverity } from './types'

const SEVERITY_META: Record<AlertSeverity, { icon: LucideIcon; className: string; label: string }> = {
  info: { icon: Info, className: 'text-blue-600 dark:text-blue-400', label: 'Info' },
  success: { icon: CheckCircle2, className: 'text-emerald-600 dark:text-emerald-400', label: 'Success' },
  warning: { icon: AlertTriangle, className: 'text-amber-600 dark:text-amber-400', label: 'Warning' },
  critical: { icon: XCircle, className: 'text-red-600 dark:text-red-400', label: 'Critical' },
}

interface AlertWidgetProps {
  alert: AlertItem
  onDismiss?: (id: string) => void
  className?: string
}

export function AlertWidget({ alert, onDismiss, className }: AlertWidgetProps) {
  const meta = SEVERITY_META[alert.severity]
  const Icon = meta.icon

  return (
    <div
      role="alert"
      className={cn(
        'flex items-start gap-3 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800',
        className
      )}
    >
      <Icon className={cn('mt-0.5 h-5 w-5 flex-shrink-0', meta.className)} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={cn('text-xs font-semibold uppercase tracking-wide', meta.className)}>
            {meta.label}
          </span>
          <span className="text-xs text-gray-400 dark:text-gray-500">{alert.category}</span>
        </div>
        <p className="mt-0.5 text-sm font-medium text-gray-900 dark:text-gray-100">{alert.title}</p>
        {alert.cause && (
          <p className="mt-0.5 text-sm text-gray-600 dark:text-gray-400">{alert.cause}</p>
        )}
        {alert.suggestedAction && (
          <p className="mt-1 text-sm text-gray-700 dark:text-gray-300">
            <span className="font-medium">Suggested:</span> {alert.suggestedAction}
          </p>
        )}
        {alert.drillDown && (
          <DrillDownLink target={alert.drillDown} showArrow className="mt-2 text-xs">
            {alert.drillDown.label ?? 'Investigate'}
          </DrillDownLink>
        )}
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={() => onDismiss(alert.id)}
          aria-label="Dismiss alert"
          className={cn(
            'flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700',
            FOCUS_RING_CLASS
          )}
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
    </div>
  )
}
