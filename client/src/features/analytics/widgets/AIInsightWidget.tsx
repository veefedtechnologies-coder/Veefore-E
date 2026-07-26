/**
 * AIInsightWidget — a single AI insight/recommendation card with actionable
 * navigation buttons that route users to the relevant analytics section.
 * Every insight shows its confidence — never an unsupported claim (Rule 16).
 */

import { useLocation } from 'wouter'
import { TrendingUp, TrendingDown, ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'

import { SURFACE_CLASS } from '../design-system/tokens'
import { ConfidenceBadge } from './ConfidenceBadge'
import type { AIInsight } from './types'

interface AIInsightWidgetProps {
  insight: AIInsight
  className?: string
}

export function AIInsightWidget({ insight, className }: AIInsightWidgetProps) {
  const [, setLocation] = useLocation()

  const navigateTo = (path: string) => {
    setLocation(path)
  }

  const isPositive = insight.title.toLowerCase().includes('great') ||
    insight.title.toLowerCase().includes('strong') ||
    insight.title.toLowerCase().includes('up ') ||
    insight.title.toLowerCase().includes('momentum') ||
    insight.title.toLowerCase().includes('growth') ||
    insight.title.includes('🎉')
  const isNegative = insight.title.toLowerCase().includes('declined') ||
    insight.title.toLowerCase().includes('dropped') ||
    insight.title.toLowerCase().includes('slipping') ||
    insight.title.toLowerCase().includes('slowing') ||
    insight.title.toLowerCase().includes('address')

  const accentClass = isPositive
    ? 'bg-emerald-50 dark:bg-emerald-900/20'
    : isNegative
      ? 'bg-red-50 dark:bg-red-900/20'
      : 'bg-blue-50 dark:bg-blue-900/20'

  const iconClass = isPositive
    ? 'text-emerald-600 dark:text-emerald-400'
    : isNegative
      ? 'text-red-500 dark:text-red-400'
      : 'text-blue-500 dark:text-blue-400'

  const btnClass = isPositive
    ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-900/20 dark:text-emerald-400 dark:hover:bg-emerald-900/30'
    : isNegative
      ? 'bg-red-50 text-red-700 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/30'
      : 'bg-blue-50 text-blue-700 hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-400 dark:hover:bg-blue-900/30'

  return (
    <article aria-label={insight.title} className={cn(SURFACE_CLASS, 'p-4', className)}>
      <div className="flex items-start gap-3">
        <div className={cn('mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg', accentClass)}>
          {isNegative
            ? <TrendingDown className={cn('h-4 w-4', iconClass)} />
            : <TrendingUp className={cn('h-4 w-4', iconClass)} />
          }
        </div>

        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-start justify-between gap-3">
            <h4 className="text-sm font-semibold leading-snug text-gray-900 dark:text-gray-100">
              {insight.title}
            </h4>
            <ConfidenceBadge confidence={insight.confidence} />
          </div>

          <p className="text-sm leading-relaxed text-gray-600 dark:text-gray-400">
            {insight.explanation}
          </p>

          {insight.actions && insight.actions.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {insight.actions.map((action) => (
                <button
                  key={action.path}
                  type="button"
                  onClick={() => navigateTo(action.path)}
                  className={cn(
                    'flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                    btnClass
                  )}
                >
                  {action.label}
                  <ArrowRight className="h-3 w-3" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </article>
  )
}
