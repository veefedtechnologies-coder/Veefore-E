/**
 * AISummaryWidget — the AI executive summary that opens most dashboards
 * (11-ai-intelligence-engine.md Ch 3; 06-dashboard-specifications.md Ch 2).
 * Shows a plain-language narrative with a confidence level and supporting
 * evidence. AI must never present claims without evidence and must show
 * confidence (CODING_RULES Rule 16).
 */

import { Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import { SURFACE_CLASS } from '../design-system/tokens'
import { DrillDownLink } from '../dashboard'
import { ConfidenceBadge } from './ConfidenceBadge'
import type { ConfidenceLevel } from './types'
import type { DrillDownTarget } from '../dashboard'

interface AISummaryWidgetProps {
  /** Plain-language narrative (backend/AI-generated). */
  summary: string
  confidence: ConfidenceLevel
  title?: string
  /** Supporting metric IDs shown as evidence chips. */
  supportingMetricIds?: string[]
  /** Links to supporting charts/pages. */
  evidence?: { label: string; target: DrillDownTarget }[]
  /** Quick actions (e.g. "Generate report", "Explain more"). */
  actions?: { label: string; onClick: () => void }[]
  className?: string
}

export function AISummaryWidget({
  summary,
  confidence,
  title = 'AI Executive Summary',
  supportingMetricIds = [],
  evidence = [],
  actions = [],
  className,
}: AISummaryWidgetProps) {
  return (
    <section
      aria-label={title}
      className={cn(
        SURFACE_CLASS,
        'p-5 ring-1 ring-inset ring-violet-100 dark:ring-violet-900/30',
        className
      )}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-50 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400">
            <Sparkles className="h-4 w-4" aria-hidden="true" />
          </span>
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
        </div>
        <ConfidenceBadge confidence={confidence} />
      </div>

      <p className="text-sm leading-relaxed text-gray-700 dark:text-gray-300">{summary}</p>

      {(supportingMetricIds.length > 0 || evidence.length > 0) && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Based on:</span>
          {supportingMetricIds.map((id) => (
            <span
              key={id}
              className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-300"
            >
              {id}
            </span>
          ))}
          {evidence.map((e) => (
            <DrillDownLink key={e.label} target={e.target} showArrow className="text-xs">
              {e.label}
            </DrillDownLink>
          ))}
        </div>
      )}

      {actions.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {actions.map((a) => (
            <Button key={a.label} variant="outline" size="sm" onClick={a.onClick}>
              {a.label}
            </Button>
          ))}
        </div>
      )}
    </section>
  )
}
